import { BrowserWindow, app, screen, Menu } from "electron";
import { ProcessingHelper } from "./ProcessingHelper";
import { ScreenCaptureHelper } from "./ScreenCaptureHelper";
import { ScreenshotHelper } from "./ScreenshotHelper";
import { ShortcutsHelper } from "./shortcuts";
import { initializeIpcHandlers } from "./ipcHandlers";
import { incrementAppOpenCounter } from "./UsageCounter";
import path from "path";

let store: any = null;
let configWriteLock = false;
let configWriteQueue: Array<() => Promise<void>> = [];

let isUpdatingDimensions = false;
let lockedResponseWidth: number | null = null;
let lastUpdateTime = 0;
let lastDimensions = { width: 0, height: 0 };
let dimensionUpdateTimeout: NodeJS.Timeout | null = null;

function logDimensionUpdate(source: string, width: number | string, height: number) {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.log(`[FIXED-${timestamp}] Direct dimension update from ${source}: ${width} x ${height}`);
}

interface WindowState {
  bounds: Electron.Rectangle;
  visible: boolean;
  opacity: number;
  alwaysOnTop: boolean;
}

function captureWindowState(): WindowState | null {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return null;

  try {
    return {
      bounds: state.mainWindow.getBounds(),
      visible: state.mainWindow.isVisible(),
      opacity: state.mainWindow.getOpacity(),
      alwaysOnTop: state.mainWindow.isAlwaysOnTop()
    };
  } catch (error) {
    console.error("Error capturing window state:", error);
    return null;
  }
}

function showWindowWithoutFocus(): void {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
  
  try {
    const shouldBeInert = state.mode === "stealth" || 
                         state.view === "response" || 
                         state.view === "followup";
    
    if (shouldBeInert) {
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.setFocusable(false);
      state.mainWindow.setFocusable(false);
      state.mainWindow.setFocusable(false);
      state.mainWindow.setFocusable(false);
      state.mainWindow.setIgnoreMouseEvents(true);
    }
    
    if (process.platform === "darwin") {
      state.mainWindow.showInactive();
    } else {
      state.mainWindow.setFocusable(false);
      state.mainWindow.setFocusable(false);
      state.mainWindow.show();
      
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.setFocusable(false);
      state.mainWindow.setFocusable(false);
      
      if (state.mainWindow.isFocused()) {
        state.mainWindow.blur();
      }
      
      process.nextTick(() => {
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.setSkipTaskbar(true);
          state.mainWindow.setSkipTaskbar(true);
          state.mainWindow.setFocusable(false);
        }
      });
    }
    
    // Re-apply interactivity state after showing
    applyInteractivityState();
  } catch (error) {
    console.error("Error showing window without focus:", error);
  }
}

function restoreWindowState(windowState: WindowState): boolean {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return false;

  try {
    state.mainWindow.setBounds(windowState.bounds, false);
    if (windowState.visible && !state.mainWindow.isVisible()) {
      showWindowWithoutFocus();
    }
    state.mainWindow.setOpacity(windowState.opacity);
    state.mainWindow.setAlwaysOnTop(windowState.alwaysOnTop, "floating");
    return true;
  } catch (error) {
    console.error("Failed to restore window state:", error);
    return false;
  }
}

async function initializeStore() {
  try {
    const fs = await import("fs/promises");
    const userDataPath =
      process.env.APPDATA ||
      (process.platform === "darwin"
        ? path.join(process.env.HOME || "", "Library", "Application Support")
        : path.join(process.env.HOME || "", ".config"));

    const configPath = path.join(userDataPath, "phantomlens", "config.json");

    store = {
      _configPath: configPath,
      get: async (key: string) => {
        try {
          await fs.access(configPath);
        } catch (error) {
          await fs.mkdir(path.dirname(configPath), { recursive: true });
          await fs.writeFile(configPath, JSON.stringify({}), "utf8");
          return undefined;
        }
        try {
          const data = await fs.readFile(configPath, "utf8");
          const config = JSON.parse(data || "{}");
          return config[key];
        } catch (readError) {
          console.error(`Error reading config file at ${configPath}:`, readError);
          try {
            console.log("Attempting to reset corrupted config file...");
            await fs.writeFile(configPath, JSON.stringify({}), "utf8");
            console.log("Config file reset successfully");
            return undefined;
          } catch (writeError) {
            console.error(`Failed to reset corrupted config file at ${configPath}:`, writeError);
            try {
              await fs.unlink(configPath);
              console.log("Corrupted config file deleted");
            } catch (deleteError) {
              console.error("Failed to delete corrupted config file:", deleteError);
            }
            return undefined;
          }
        }
      },
      set: async (key: string, value: any) => {
        return new Promise<boolean>((resolve) => {
          const writeOperation = async () => {
            try {
              await fs.mkdir(path.dirname(configPath), { recursive: true });
              let config: any = {};
              try {
                const data = await fs.readFile(configPath, "utf8");
                config = JSON.parse(data || "{}");
              } catch (error) {
                console.warn(`Error reading config file, creating new one:`, error);
                config = {};
              }
              config = { ...config, [key]: value };
              const tempPath = configPath + '.tmp.' + Date.now();
              await fs.writeFile(tempPath, JSON.stringify(config, null, 2), "utf8");
              try {
                await fs.rename(tempPath, configPath);
              } catch (renameError) {
                await fs.copyFile(tempPath, configPath);
                await fs.unlink(tempPath).catch(() => {});
              }
              resolve(true);
            } catch (error) {
              console.error(`Error setting ${key} in config:`, error);
              resolve(false);
            } finally {
              configWriteLock = false;
              if (configWriteQueue.length > 0) {
                const nextOp = configWriteQueue.shift();
                if (nextOp) {
                  configWriteLock = true;
                  nextOp();
                }
              }
            }
          };

          if (configWriteLock) {
            configWriteQueue.push(writeOperation);
          } else {
            configWriteLock = true;
            writeOperation();
          }
        });
      },
    };
    console.log("Config store initialized successfully.");
    return true;
  } catch (error) {
    console.error("Error initializing config store:", error);
    store = null;
    return false;
  }
}

export async function getStoreValue(key: string): Promise<any> {
  if (!store) {
    const initialized = await initializeStore();
    if (!initialized || !store) {
      console.error("Store access failed: Could not initialize store.");
      return undefined;
    }
  }
  return store.get(key);
}

export async function setStoreValue(key: string, value: any): Promise<boolean> {
  if (!store) {
    const initialized = await initializeStore();
    if (!initialized || !store) {
      console.error("Store access failed: Could not initialize store.");
      return false;
    }
  }
  return store.set(key, value);
}

interface ProcessingEvents {
  FOLLOW_UP_SUCCESS: string;
  FOLLOW_UP_ERROR: string;
  FOLLOW_UP_CHUNK: string;
  API_KEY_INVALID: string;
  INITIAL_START: string;
  RESPONSE_SUCCESS: string;
  INITIAL_RESPONSE_ERROR: string;
  FOLLOW_UP_START: string;
  RESPONSE_CHUNK: string;
  RESET: string;
}

interface WindowAnimation {
  isAnimating: boolean;
  startPosition: { x: number; y: number };
  targetPosition: { x: number; y: number };
  startTime: number;
  duration: number;
  animationId?: NodeJS.Timeout;
}

interface State {
  mainWindow: BrowserWindow | null;
  isWindowVisible: boolean;
  windowPosition: { x: number; y: number; width: number; height: number; } | null;
  windowSize: { width: number; height: number } | null;
  screenWidth: number;
  screenHeight: number;
  currentX: number;
  currentY: number;
  shortcutsHelper: any;
  hasFollowedUp: boolean;
  PROCESSING_EVENTS: ProcessingEvents;
  screenshotHelper: any;
  processingHelper: any;
  screenCaptureHelper: ScreenCaptureHelper | null;
  view: "initial" | "response" | "followup";
  step: number;
  windowAnimation: WindowAnimation | null;
  lastSuccessfulDimensions: { width: number; height: number } | null;
  mode: "normal" | "stealth";
  currentPrompt: string | null;
  history: string[];
  historyIndex: number;
}

const state: State = {
  mainWindow: null,
  isWindowVisible: false,
  windowPosition: null,
  windowSize: null,
  screenWidth: 0,
  screenHeight: 0,
  currentX: 0,
  currentY: 0,
  shortcutsHelper: null,
  hasFollowedUp: false,
  screenshotHelper: null,
  processingHelper: null,
  screenCaptureHelper: null,
  view: "initial",
  step: 0,
  windowAnimation: null,
  lastSuccessfulDimensions: null,
  mode: "normal",
  currentPrompt: null,
  history: [],
  historyIndex: -1,
  PROCESSING_EVENTS: {
    API_KEY_INVALID: "processing-api-key-invalid",
    INITIAL_START: "initial-start",
    RESPONSE_SUCCESS: "response-success",
    INITIAL_RESPONSE_ERROR: "response-error",
    FOLLOW_UP_START: "follow-up-start",
    FOLLOW_UP_SUCCESS: "follow-up-success",
    FOLLOW_UP_ERROR: "follow-up-error",
    FOLLOW_UP_CHUNK: "follow-up-chunk",
    RESPONSE_CHUNK: "response-chunk",
    RESET: "reset",
  },
};

export interface IProcessingHelperDeps {
  getScreenshotHelper: () => ScreenshotHelper;
  getMainWindow: () => BrowserWindow | null;
  getView: () => "initial" | "response" | "followup";
  setView: (view: "initial" | "response" | "followup") => void;
  getConfiguredModel: () => Promise<string>;
  setHasFollowedUp: (hasFollowedUp: boolean) => void;
  clearQueues: () => void;
  PROCESSING_EVENTS: typeof state.PROCESSING_EVENTS;
  getUserPrompt: () => string | null;
  clearUserPrompt: () => void;
  getPreviousResponse: () => string | null;
}

export interface IShortcutsHelperDeps {
  getMainWindow: () => BrowserWindow | null;
  takeScreenshot: () => Promise<string>;
  getImagePreview: (filepath: string) => Promise<string>;
  processingHelper: ProcessingHelper | null;
  clearQueues: () => void;
  setView: (view: "initial" | "response" | "followup") => void;
  isWindowUsable: () => boolean;
  toggleMainWindow: () => void;
  moveWindowLeft: () => void;
  moveWindowRight: () => void;
  moveWindowUp: () => void;
  moveWindowDown: () => void;
  quitApplication: () => void;
  PROCESSING_EVENTS: typeof state.PROCESSING_EVENTS;
  setHasFollowedUp: (value: boolean) => void;
  getHasFollowedUp: () => boolean;
  getConfiguredModel: () => Promise<string>;
  getMode: () => "normal"|"stealth";
  setMode: (mode: "normal"|"stealth") => Promise<void>;
  navigateHistoryPrev: () => void;
  navigateHistoryNext: () => void;
  scrollResponseBy: (delta: number) => void;
  scrollCodeBlockBy: (delta: number) => void;
  getUserPromptValue: () => string | null;
}

export interface initializeIpcHandlerDeps {
  getMainWindow: () => BrowserWindow | null;
  getScreenshotQueue: () => string[];
  getExtraScreenshotQueue: () => string[];
  processingHelper?: ProcessingHelper;
  setWindowDimensions: (width: number | string, height: number) => void;
  takeScreenshot: () => Promise<string>;
  toggleMainWindow: () => void;
  clearQueues: () => void;
  setView: (view: "initial" | "response" | "followup") => void;
  moveWindowLeft: () => void;
  moveWindowRight: () => void;
  moveWindowUp: () => void;
  moveWindowDown: () => void;
  quitApplication: () => void;
  getView: () => "initial" | "response" | "followup";
  createWindow: () => BrowserWindow;
  PROCESSING_EVENTS: typeof state.PROCESSING_EVENTS;
  setHasFollowedUp: (value: boolean) => void;
  clearLockedResponseWidth: () => void;
  getLockedResponseWidth: () => number | null;
}

// ============================================================================
// STABLE Interactivity Management
// ============================================================================
function applyInteractivityState(): void {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

  try {
    const shouldBeInert = state.mode === "stealth" || 
                         state.view === "response" || 
                         state.view === "followup";
    
    if (shouldBeInert) {
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.setFocusable(false);
      state.mainWindow.setFocusable(false);
      state.mainWindow.setIgnoreMouseEvents(true);
      // Blur immediately if window somehow got focus
      if (state.mainWindow.isFocused()) {
        state.mainWindow.blur();
      }
      state.mainWindow.setSkipTaskbar(true);
    } else {
      state.mainWindow.setIgnoreMouseEvents(false);
      state.mainWindow.setFocusable(true);
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.setAlwaysOnTop(true, "floating");
    }
  } catch (error) {
    console.error("[Interactivity] Failed to apply state:", error);
  }
}

// ============================================================================
// STABLE Animation System
// ============================================================================
function animateWindowToPosition(targetX: number, targetY: number, duration: number = 200) {
  if (!state.mainWindow) return;

  // If animation is ongoing, update target and use current position as new start
  if (state.windowAnimation?.isAnimating && state.windowAnimation.animationId) {
    // Cancel current animation
    clearTimeout(state.windowAnimation.animationId);
    // Use current position as new start position for smooth continuation
    state.windowAnimation.startPosition = { x: state.currentX, y: state.currentY };
    state.windowAnimation.targetPosition = { x: targetX, y: targetY };
    state.windowAnimation.startTime = Date.now();
    state.windowAnimation.duration = duration;
    // Restart animation with new target
    const frameRate = 60; // Higher frame rate for smoother animation
    const frameTime = 1000 / frameRate;
    const totalFrames = Math.ceil(duration / frameTime);
    let currentFrame = 0;

    const animate = () => {
      if (!state.windowAnimation || !state.mainWindow || state.mainWindow.isDestroyed()) {
        state.windowAnimation = null;
        return;
      }

      currentFrame++;
      const progress = Math.min(Math.max(currentFrame / totalFrames, 0), 1);
      // Smoother easing: ease-out-cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const currentX = Number(state.windowAnimation.startPosition.x) +
        (Number(state.windowAnimation.targetPosition.x) - Number(state.windowAnimation.startPosition.x)) * easeOut;
      const currentY = Number(state.windowAnimation.startPosition.y) +
        (Number(state.windowAnimation.targetPosition.y) - Number(state.windowAnimation.startPosition.y)) * easeOut;

      try {
        if (isFinite(currentX) && isFinite(currentY)) {
          state.mainWindow.setPosition(Math.round(currentX), Math.round(currentY));
          state.currentX = currentX;
          state.currentY = currentY;
        } else {
          console.error("Invalid position values:", currentX, currentY);
          state.windowAnimation = null;
          return;
        }
      } catch (error) {
        console.error("Error in animation:", error);
        state.windowAnimation = null;
        return;
      }

      if (progress < 1 && state.windowAnimation) {
        state.windowAnimation.animationId = setTimeout(animate, frameTime);
      } else {
        if (!state.windowAnimation) return;
        const finalX = Number(state.windowAnimation.targetPosition.x);
        const finalY = Number(state.windowAnimation.targetPosition.y);
        state.windowAnimation = null;
        
        if (isFinite(finalX) && isFinite(finalY)) {
          state.currentX = finalX;
          state.currentY = finalY;
          if (!state.mainWindow.isDestroyed()) {
            state.mainWindow.setPosition(Math.round(finalX), Math.round(finalY));
          }
        }
      }
    };

    state.windowAnimation.animationId = setTimeout(animate, frameTime);
    return;
  }

  if (state.windowAnimation?.animationId) {
    clearTimeout(state.windowAnimation.animationId);
  }

  // Use current tracked position instead of getBounds() to avoid jitter
  const startPosition = { x: state.currentX, y: state.currentY };
  const targetPosition = { x: targetX, y: targetY };

  const frameRate = 60; // Higher frame rate for smoother animation
  const frameTime = 1000 / frameRate;
  const totalFrames = Math.ceil(duration / frameTime);
  let currentFrame = 0;

  state.windowAnimation = {
    isAnimating: true,
    startPosition,
    targetPosition,
    startTime: Date.now(),
    duration,
  };

  const animate = () => {
    if (!state.windowAnimation || !state.mainWindow || state.mainWindow.isDestroyed()) {
      state.windowAnimation = null;
      return;
    }

    currentFrame++;
    const progress = Math.min(Math.max(currentFrame / totalFrames, 0), 1);
    // Smoother easing: ease-out-cubic
    const easeOut = 1 - Math.pow(1 - progress, 3);

    const currentX = Number(state.windowAnimation.startPosition.x) +
      (Number(state.windowAnimation.targetPosition.x) - Number(state.windowAnimation.startPosition.x)) * easeOut;
    const currentY = Number(state.windowAnimation.startPosition.y) +
      (Number(state.windowAnimation.targetPosition.y) - Number(state.windowAnimation.startPosition.y)) * easeOut;

    try {
      if (isFinite(currentX) && isFinite(currentY)) {
        state.mainWindow.setPosition(Math.round(currentX), Math.round(currentY));
        state.currentX = currentX;
        state.currentY = currentY;
      } else {
        console.error("Invalid position values:", currentX, currentY);
        state.windowAnimation = null;
        return;
      }
    } catch (error) {
      console.error("Error in animation:", error);
      state.windowAnimation = null;
      return;
    }

    if (progress < 1 && state.windowAnimation) {
      state.windowAnimation.animationId = setTimeout(animate, frameTime);
    } else {
      if (!state.windowAnimation) return;
      const finalX = Number(state.windowAnimation.targetPosition.x);
      const finalY = Number(state.windowAnimation.targetPosition.y);
      state.windowAnimation = null;
      
      if (isFinite(finalX) && isFinite(finalY)) {
        state.currentX = finalX;
        state.currentY = finalY;
        if (!state.mainWindow.isDestroyed()) {
          state.mainWindow.setPosition(Math.round(finalX), Math.round(finalY));
        }
      }
    }
  };

  state.windowAnimation.animationId = setTimeout(animate, frameTime);
}

function getScreenBounds() {
  return {
    minX: -(state.windowSize?.width || 0) / 2,
    maxX: state.screenWidth - (state.windowSize?.width || 0) / 2,
    minY: (-(state.windowSize?.height || 0) * 2) / 3,
    maxY: state.screenHeight + ((state.windowSize?.height || 0) * 2) / 3,
  };
}

function moveWindowSmooth(deltaX: number, deltaY: number) {
  if (!state.mainWindow) return;

  // Cancel any ongoing animation to prevent jittery movement
  if (state.windowAnimation && state.windowAnimation.animationId) {
    clearTimeout(state.windowAnimation.animationId);
    state.windowAnimation = null;
  }

  const targetX = state.currentX + deltaX;
  const targetY = state.currentY + deltaY;

  const screenBounds = getScreenBounds();
  const constrainedX = Math.max(screenBounds.minX, Math.min(screenBounds.maxX, targetX));
  const constrainedY = Math.max(screenBounds.minY, Math.min(screenBounds.maxY, targetY));

  // Use shorter duration for smoother, more responsive movement
  animateWindowToPosition(constrainedX, constrainedY, 100);
}

// ============================================================================
// FIXED: TOOLTIP WIDTH FIX - Prevent Width Growth on Hover
// ============================================================================
function setWindowDimensions(width: number | string, height: number): void {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

  // Rate limiting to prevent excessive updates
  const now = Date.now();
  
  // FIXED: Smart rate limiting - allow tooltip height increases but prevent rapid shifts
  const minDelay = (typeof width === "string" && width === "fixed") ? 300 : 250;
  if (now - lastUpdateTime < minDelay) {
    console.log(`[FIXED] Rate limited - skipping update (delay: ${now - lastUpdateTime}ms, min: ${minDelay}ms)`);
    return;
  }

  if (isUpdatingDimensions) {
    console.log("[FIXED] Already updating - skipping");
    return;
  }

  logDimensionUpdate("setWindowDimensions", width, height);

  // Clear any pending updates
  if (dimensionUpdateTimeout) {
    clearTimeout(dimensionUpdateTimeout);
  }

  // Use immediate update with minimal delay for stability
  dimensionUpdateTimeout = setTimeout(() => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

    isUpdatingDimensions = true;
    lastUpdateTime = now;

    try {
      let numericWidth: number;
      
      // FIXED: Improved width logic to prevent tooltip-induced growth
      if (typeof width === "string" && width === "fixed") {
        // Use locked width if available, otherwise current width
        if (lockedResponseWidth !== null && (state.view === "response" || state.view === "followup")) {
          numericWidth = lockedResponseWidth;
          console.log(`[FIXED] Using locked width: ${numericWidth}px`);
        } else {
          // FIXED: Use actual current width WITHOUT adding padding
          const currentBounds = state.mainWindow.getBounds();
          numericWidth = currentBounds.width;
          console.log(`[FIXED] Using current window width: ${numericWidth}px (fixed)`);
        }
      } else {
        numericWidth = typeof width === "number" ? width : 800;
        
        // Handle view-specific width logic
        if (state.view === "initial") {
          console.log(`[FIXED] Initial view - setting width to ${numericWidth}px`);
          // Clear locked width when returning to initial
          if (lockedResponseWidth !== null) {
            console.log("[FIXED] Returning to initial - clearing locked width");
            lockedResponseWidth = null;
          }
        } else if (state.view === "response" || state.view === "followup") {
          // Always use the preset width (832px) for response/followup views to match thinking window
          if (lockedResponseWidth === null) {
            lockedResponseWidth = 832; // Match the thinking window width
            console.log(`[FIXED] Locking response width to ${lockedResponseWidth}px (matching thinking window)`);
          }
          // Always use locked width to ensure consistency
          numericWidth = lockedResponseWidth;
          console.log(`[FIXED] Using locked width for ${state.view}: ${numericWidth}px`);
        }
      }

      const safeWidth = Math.max(numericWidth, 300);
      const safeHeight = Math.max(height + 15, 120);

      const primaryDisplay = screen.getPrimaryDisplay();
      const workArea = primaryDisplay.workArea;
      const maxWidth = Math.floor(workArea.width * 0.9);
      const maxHeight = Math.floor(workArea.height * 0.98);

      const finalWidth = Math.min(safeWidth, maxWidth);
      const finalHeight = Math.min(safeHeight, maxHeight);

      // FIXED: More aggressive filtering to prevent micro-updates and tooltip-induced shifts
      const widthDiff = Math.abs(finalWidth - lastDimensions.width);
      const heightDiff = Math.abs(finalHeight - lastDimensions.height);
      
      // FIXED: Skip very small changes that could cause tooltip-induced shifts
      if (widthDiff < 25 && heightDiff < 30 && lastDimensions.width > 0) {
        console.log(`[FIXED] Skipping small change (width: ${widthDiff}px, height: ${heightDiff}px)`);
        isUpdatingDimensions = false;
        return;
      }
      
      // FIXED: Smart filtering for fixed-width requests - allow height increases for tooltips but prevent shifts
      if (typeof width === "string" && width === "fixed") {
        const currentBounds = state.mainWindow.getBounds();
        
        // Allow height INCREASES for tooltips (when new height > current height)
        if (finalHeight > currentBounds.height) {
          console.log(`[FIXED] Allowing height increase for tooltip: ${currentBounds.height}px -> ${finalHeight}px`);
          // This is allowed - continue with update
        } else if (heightDiff < 50) {
          // Block small height DECREASES that cause shifting
          console.log(`[FIXED] BLOCKING small height decrease (height diff: ${heightDiff}px) - preventing tooltip shift`);
          isUpdatingDimensions = false;
          return;
        } else if (currentBounds.height >= 400 && finalHeight < currentBounds.height) {
          // Block height decreases when current height is already sufficient
          console.log(`[FIXED] BLOCKING height decrease - current height (${currentBounds.height}px) already sufficient`);
          isUpdatingDimensions = false;
          return;
        }
      }
      
      const currentBounds = state.mainWindow.getBounds();
      const newBounds = {
        x: currentBounds.x,
        y: currentBounds.y,
        width: finalWidth,
        height: finalHeight,
      };

      // FIXED: Only center for very significant width changes (75px+) and only when explicitly changing width
      // Keep Y position very stable
      newBounds.y = currentBounds.y;
      
      // Ensure window stays on screen
      if (newBounds.x < workArea.x) newBounds.x = workArea.x;
      if (newBounds.y < workArea.y) newBounds.y = workArea.y;
      if (newBounds.x + newBounds.width > workArea.x + workArea.width) {
        newBounds.x = workArea.x + workArea.width - newBounds.width;
      }
      if (newBounds.y + newBounds.height > workArea.y + workArea.height) {
        newBounds.y = workArea.y + workArea.height - newBounds.height;
      }

      console.log(`[FIXED] Applying stable bounds: ${JSON.stringify(newBounds)} (view: ${state.view})`);
      
      const shouldBeInert = state.mode === "stealth" || 
                           state.view === "response" || 
                           state.view === "followup";
      if (shouldBeInert) {
        // Set skipTaskbar MANY times synchronously before bounds change
        state.mainWindow.setSkipTaskbar(true);
        state.mainWindow.setSkipTaskbar(true);
        state.mainWindow.setSkipTaskbar(true);
        state.mainWindow.setSkipTaskbar(true);
        state.mainWindow.setSkipTaskbar(true);
        state.mainWindow.setFocusable(false);
        state.mainWindow.setFocusable(false);
        state.mainWindow.setFocusable(false);
        state.mainWindow.setFocusable(false);
      }
      
      // Apply bounds with smooth animation
      state.mainWindow.setBounds(newBounds, true);
      
      if (shouldBeInert) {
        state.mainWindow.setSkipTaskbar(true);
        state.mainWindow.setSkipTaskbar(true);
        state.mainWindow.setSkipTaskbar(true);
        state.mainWindow.setFocusable(false);
        state.mainWindow.setFocusable(false);
      }
      
      applyInteractivityState();
      
      if (shouldBeInert) {
        setImmediate(() => {
          if (state.mainWindow && !state.mainWindow.isDestroyed()) {
            applyInteractivityState();
            state.mainWindow.setSkipTaskbar(true);
            state.mainWindow.setSkipTaskbar(true);
            state.mainWindow.setSkipTaskbar(true);
          }
        });
        
        setTimeout(() => {
          if (state.mainWindow && !state.mainWindow.isDestroyed()) {
            applyInteractivityState();
            state.mainWindow.setSkipTaskbar(true);
          }
        }, 1);
      }

      // Update tracking state
      state.windowSize = { width: finalWidth, height: finalHeight };
      state.lastSuccessfulDimensions = { width: finalWidth, height: finalHeight };
      lastDimensions = { width: finalWidth, height: finalHeight };

    } catch (error) {
      console.error("[FIXED] Error in dimension update:", error);
    } finally {
      // Reset flag with short delay
      setTimeout(() => {
        isUpdatingDimensions = false;
      }, 50);
    }
  }, 100); // Short, consistent delay
}

// Helper functions for locked width management
function clearLockedResponseWidth(): void {
  console.log("[FIXED] Clearing locked response width");
  lockedResponseWidth = null;
}

function getLockedResponseWidth(): number | null {
  return lockedResponseWidth;
}

function setView(view: "initial" | "response" | "followup"): void {
  if (state.view === view) return;
  
  console.log(`[FIXED] View change: ${state.view} -> ${view}`);
  const previousView = state.view;
  
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const willBeInert = state.mode === "stealth" || 
                         view === "response" || 
                         view === "followup";
      
      if (willBeInert) {
        mainWindow.setSkipTaskbar(true);
        mainWindow.setSkipTaskbar(true);
        mainWindow.setSkipTaskbar(true);
        mainWindow.setFocusable(false);
        mainWindow.setFocusable(false);
        mainWindow.setFocusable(false);
        mainWindow.setIgnoreMouseEvents(true);
        if (mainWindow.isFocused()) {
          mainWindow.blur();
        }
        // One more synchronous call
        mainWindow.setSkipTaskbar(true);
      }
      
      // Now update state
      state.view = view;
      state.screenshotHelper?.setView(view);

      // Signal view change to frontend
      mainWindow.webContents.send("view-changed", { view });

      // Re-apply interactivity state to ensure consistency
      applyInteractivityState();
      
      // CRITICAL: For inert views, use setImmediate for faster execution (next event loop tick)
      // This is faster than setTimeout and catches Windows timing issues immediately
      if (willBeInert) {
        // Use setImmediate for near-instant execution (faster than setTimeout)
        setImmediate(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            applyInteractivityState();
            mainWindow.setSkipTaskbar(true);
            mainWindow.setSkipTaskbar(true);
            mainWindow.setSkipTaskbar(true);
            if (mainWindow.isFocused()) {
              mainWindow.blur();
            }
          }
        });
        
        // One more check with minimal delay (1ms - fastest possible)
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            applyInteractivityState();
            mainWindow.setSkipTaskbar(true);
            mainWindow.setSkipTaskbar(true);
          }
        }, 1); // 1ms - fastest possible
        
        // Final check after 10ms
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            applyInteractivityState();
            mainWindow.setSkipTaskbar(true);
          }
        }, 10);
      }
      
      if (state.mode === "normal" && view === "initial") {
        setTimeout(() => {
          if (state.mainWindow && !state.mainWindow.isDestroyed()) {
            try { state.mainWindow.focus(); } catch {}
          }
        }, 100);
      }
    } catch (error) {
      console.error("[FIXED] Error during view transition:", error);
      applyInteractivityState();
    }
  } else {
    // If window doesn't exist, just update state
    state.view = view;
    state.screenshotHelper?.setView(view);
  }
}

// Initialize helpers
function initializeHelpers() {
  state.screenshotHelper = new ScreenshotHelper(state.view);
  state.screenCaptureHelper = new ScreenCaptureHelper();
  
  state.processingHelper = new ProcessingHelper({
    getScreenshotHelper,
    getMainWindow,
    getView,
    setView,
    clearQueues,
    setHasFollowedUp,
    PROCESSING_EVENTS: state.PROCESSING_EVENTS,
    getConfiguredModel,
    getUserPrompt: () => state.currentPrompt,
    clearUserPrompt: () => { state.currentPrompt = null; },
    getPreviousResponse: () => state.processingHelper?.getPreviousResponse() || null,
  } as IProcessingHelperDeps);

  state.shortcutsHelper = new ShortcutsHelper({
    getMainWindow,
    takeScreenshot,
    getImagePreview: async (_: string) => "",
    processingHelper: state.processingHelper,
    clearQueues,
    setView,
    isWindowUsable,
    toggleMainWindow,
    moveWindowLeft: () => moveWindowSmooth(-state.step, 0),
    moveWindowRight: () => moveWindowSmooth(state.step, 0),
    moveWindowUp: () => moveWindowSmooth(0, -state.step),
    moveWindowDown: () => moveWindowSmooth(0, state.step),
    quitApplication,
    PROCESSING_EVENTS: state.PROCESSING_EVENTS,
    setHasFollowedUp,
    getHasFollowedUp,
    getConfiguredModel,
    getMode: () => state.mode,
    setMode,
    navigateHistoryPrev,
    navigateHistoryNext,
    scrollResponseBy,
    scrollCodeBlockBy,
    getUserPromptValue: () => state.currentPrompt,
  } as unknown as IShortcutsHelperDeps);
}

function getMainWindow(): BrowserWindow | null {
  return state.mainWindow;
}

function getView(): "initial" | "response" | "followup" {
  return state.view;
}

function createWindow(): BrowserWindow {
  if (state.mainWindow) {
    return state.mainWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workAreaSize;
  state.screenWidth = workArea.width;
  state.screenHeight = workArea.height;
  state.step = 60;
  state.currentY = 0;
  state.currentX = (workArea.width - 800) / 2;

  const windowSettings: Electron.BrowserWindowConstructorOptions = {
    height: 120,
    width: 800,
    x: state.currentX,
    y: 0,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      scrollBounce: false,
      backgroundThrottling: false,
    },
    show: false,
    frame: false,
    transparent: true,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    focusable: false,
    skipTaskbar: true,
    type: process.platform === "darwin" ? "panel" : "toolbar",
    paintWhenInitiallyHidden: false,
    titleBarStyle: "hidden",
    enableLargerThanScreen: false,
    movable: true,
    resizable: true,
    minWidth: 300,
    minHeight: 80,
    maxWidth: Math.floor(workArea.width * 0.9),
    maxHeight: Math.floor(workArea.height * 0.98),
  };

  state.mainWindow = new BrowserWindow(windowSettings);

  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.setSkipTaskbar(true);
    state.mainWindow.setSkipTaskbar(true);
    state.mainWindow.setSkipTaskbar(true);
    state.mainWindow.setSkipTaskbar(true);
    state.mainWindow.setFocusable(false);
    state.mainWindow.setFocusable(false);
    state.mainWindow.setFocusable(false);
    
    process.nextTick(() => {
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.setSkipTaskbar(true);
        state.mainWindow.setSkipTaskbar(true);
        state.mainWindow.setFocusable(false);
        state.mainWindow.setFocusable(false);
      }
    });
    
    setImmediate(() => {
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.setSkipTaskbar(true);
        state.mainWindow.setSkipTaskbar(true);
        state.mainWindow.setFocusable(false);
      }
    });
  }

  applyInteractivityState();
  
  showWindowWithoutFocus();
  state.mainWindow.setOpacity(1);
  state.mainWindow.webContents.setFrameRate(30);

  state.mainWindow.webContents.on("did-finish-load", () => {
    console.log("Window finished loading");
    applyInteractivityState();
  });

  state.mainWindow.webContents.on("did-fail-load", (event: any, errorCode: number, errorDescription: string) => {
    console.error("Window failed to load:", errorCode, errorDescription);
    console.log("Attempting to load built files from dist...");
    setTimeout(() => {
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.loadFile(path.join(__dirname, "../dist/index.html"))
          .catch((error) => {
            console.error("Failed to load built files on retry:", error);
          });
      }
    }, 1000);
  });
  
  console.log("Loading application...");
  if (app.isPackaged) {
    state.mainWindow.loadFile(path.join(__dirname, "../index.html"));
  } else {
    state.mainWindow.loadURL("http://localhost:54321");
  }
  
  state.mainWindow.setContentProtection(true);
  state.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  
  applyInteractivityState();

  if (process.platform === "darwin") {
    app.dock.hide();
    state.mainWindow.setHiddenInMissionControl(true);
  }

  state.mainWindow.on("show", () => {
    applyInteractivityState();
  });

  state.mainWindow.on("focus", () => {
    const shouldBeInert = state.mode === "stealth" || 
                         state.view === "response" || 
                         state.view === "followup";
    if (shouldBeInert && state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.blur();
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.setFocusable(false);
      state.mainWindow.setFocusable(false);
      state.mainWindow.setIgnoreMouseEvents(true);
      applyInteractivityState();
    } else if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      if (state.view !== "initial" || state.mode !== "normal") {
        state.mainWindow.blur();
        applyInteractivityState();
      }
    }
  });
  
  state.mainWindow.once("ready-to-show", () => {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      const shouldBeInert = state.mode === "stealth" || 
                           state.view === "response" || 
                           state.view === "followup";
      if (shouldBeInert) {
        state.mainWindow.setFocusable(false);
        state.mainWindow.setFocusable(false);
        state.mainWindow.setSkipTaskbar(true);
        state.mainWindow.setSkipTaskbar(true);
        if (state.mainWindow.isFocused()) {
          state.mainWindow.blur();
        }
      }
    }
  });

  state.mainWindow.on("move", handleWindowMove);
  state.mainWindow.on("resize", handleWindowResize);
  state.mainWindow.on("closed", handleWindowClosed);

  const bounds = state.mainWindow.getBounds();
  state.windowPosition = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  state.windowSize = { width: bounds.width, height: bounds.height };
  state.isWindowVisible = true;

  console.log(`[FIXED] Window created: ${bounds.width}x${bounds.height}`);

  return state.mainWindow;
}

function handleWindowMove(): void {
  if (!state.mainWindow) return;
  if (!state.windowAnimation?.isAnimating) {
    const bounds = state.mainWindow.getBounds();
    state.windowPosition = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    state.currentX = bounds.x;
    state.currentY = bounds.y;
  }
}

function handleWindowResize(): void {
  if (!state.mainWindow) return;
  const bounds = state.mainWindow.getBounds();
  state.windowSize = { width: bounds.width, height: bounds.height };
  state.windowPosition = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

function handleWindowClosed(): void {
  if (state.windowAnimation?.animationId) {
    clearTimeout(state.windowAnimation.animationId);
  }
  if (dimensionUpdateTimeout) {
    clearTimeout(dimensionUpdateTimeout);
    dimensionUpdateTimeout = null;
  }
  
  isUpdatingDimensions = false;
  lockedResponseWidth = null;
  lastUpdateTime = 0;
  lastDimensions = { width: 0, height: 0 };
  
  state.mainWindow = null;
  state.isWindowVisible = false;
  state.windowPosition = null;
  state.windowSize = null;
  state.windowAnimation = null;
}

function isWindowUsable(): boolean {
  return (
    state.mainWindow &&
    !state.mainWindow.isDestroyed() &&
    state.mainWindow.isVisible()
  );
}

function toggleMainWindow(): void {
  if (isWindowUsable()) {
    console.log("Window is usable, hiding it.");
    if (state.mainWindow) {
      state.windowPosition = state.mainWindow.getBounds();
    }
    state.mainWindow?.hide();
    state.isWindowVisible = false;
  } else {
    console.log("Window not usable, showing it.");
    if (!state.mainWindow || state.mainWindow.isDestroyed()) {
      console.log("No main window, creating a new one.");
      createWindow();
    }
    
    if (state.mainWindow && state.windowPosition) {
      console.log("Restoring window position to:", state.windowPosition);
      state.mainWindow.setBounds(state.windowPosition);
    }
    
    showWindowWithoutFocus();
    state.isWindowVisible = true;
  }
}

function quitApplication(): void {
  console.log("Quit application requested via shortcut");
  app.quit();
}

async function loadEnvVariables() {
  try {
    const storedApiKey = await getStoreValue("api-key");
    const storedModel = (await getStoreValue("api-model")) || "gemini-2.0-flash";

    if (storedApiKey && storedModel) {
      process.env.API_PROVIDER = "gemini";
      process.env.API_KEY = storedApiKey;
      process.env.API_MODEL = storedModel;
      console.log(`API configuration loaded: Provider=gemini, Model=${storedModel}`);
    } else {
      console.log("No API key found in user preferences. User will be prompted to enter one.");
      setTimeout(() => {
          const mainWindow = getMainWindow();
          if (mainWindow) {
              mainWindow.webContents.send("api-key-missing");
          }
      }, 2000);
    }
  } catch (error) {
    console.error("Error loading environment variables:", error);
  }
}

async function initializeApp() {
  try {
    await initializeStore();
    state.mode = "stealth";
    try { Menu.setApplicationMenu(null); } catch {}
    await loadEnvVariables();
    
    const existingEndpoint = await getStoreValue("stats-server-endpoint");
    if (!existingEndpoint) {
      await setStoreValue("stats-server-endpoint", "https://phantom-counter.inulute.workers.dev/");
      console.log("[Main] Default counter endpoint configured");
    }
    
    incrementAppOpenCounter().catch((error) => {
      console.error("[Main] Failed to increment app open counter:", error);
    });
    
    initializeHelpers();
    
    initializeIpcHandlers({
      getMainWindow: () => state.mainWindow,
      setWindowDimensions,
      getScreenshotQueue: () => state.screenshotHelper?.getScreenshotQueue() || [],
      getExtraScreenshotQueue: () => state.screenshotHelper?.getExtraScreenshotQueue() || [],
      processingHelper: state.processingHelper,
      takeScreenshot: async () => {
        if (!state.screenshotHelper) return "";
        return await state.screenshotHelper.takeScreenshot();
      },
      toggleMainWindow,
      clearQueues,
      setView,
      moveWindowLeft: () => moveWindowSmooth(-state.step, 0),
      moveWindowRight: () => moveWindowSmooth(state.step, 0),
      moveWindowUp: () => moveWindowSmooth(0, -state.step),
      moveWindowDown: () => moveWindowSmooth(0, state.step),
      quitApplication,
      getView: () => state.view,
      createWindow,
      PROCESSING_EVENTS: state.PROCESSING_EVENTS,
      setHasFollowedUp: (value) => { state.hasFollowedUp = value; },
      clearLockedResponseWidth,
      getLockedResponseWidth,
    });
    
    createWindow();
    try {
      state.shortcutsHelper?.registerGlobalShortcuts();
    } catch (error) {
      console.error("Global shortcut registration failed:", error);
    }

  } catch (error) {
    console.error("Error initializing app:", error);
  }
}

async function setPersistedMode(mode: "normal"|"stealth"): Promise<void> {
  try { await setStoreValue("app-mode", mode); } catch {}
}

export function getCurrentMode(): "normal" | "stealth" {
  return "stealth";
}

async function setMode(mode: "normal"|"stealth"): Promise<void> {
  state.mode = "stealth";
  applyInteractivityState();
}

export function saveResponseToHistory(responseText: string) {
  if (!responseText || typeof responseText !== "string") return;
  state.history.push(responseText);
  state.historyIndex = state.history.length - 1;
}

export function setUserPrompt(prompt: string) {
  state.currentPrompt = (prompt || "").toString();
}

export function getUserPromptValue(): string | null {
  return state.currentPrompt;
}

function navigateHistoryPrev() {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
  if (state.history.length === 0) return;
  if (state.historyIndex > 0) state.historyIndex -= 1;
  const content = state.history[state.historyIndex];
  state.mainWindow.webContents.send("history-load", { content });
}

function navigateHistoryNext() {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
  if (state.history.length === 0) return;
  if (state.historyIndex < state.history.length - 1) state.historyIndex += 1;
  const content = state.history[state.historyIndex];
  state.mainWindow.webContents.send("history-load", { content });
}

function scrollResponseBy(delta: number) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
  state.mainWindow.webContents.send("response-scroll", { delta });
}

function scrollCodeBlockBy(delta: number) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
  state.mainWindow.webContents.send("code-block-scroll", { delta });
}

function getScreenshotHelper(): ScreenshotHelper | null {
  return state.screenshotHelper;
}

function getScreenshotQueue(): string[] {
  return state.screenshotHelper?.getScreenshotQueue() || [];
}

function getExtraScreenshotQueue(): string[] {
  return state.screenshotHelper?.getExtraScreenshotQueue() || [];
}

function clearQueues(): void {
  state.screenshotHelper?.clearQueues(); 
  lockedResponseWidth = null;
  setView("initial");
}

function cleanupAllFiles(): void {
  if (state.screenshotHelper) {
    state.screenshotHelper.cleanupAllScreenshots();
  }
}

async function takeScreenshot(): Promise<string> {
  if (!state.screenshotHelper) throw new Error("Screenshot helper not initialized");
  return state.screenshotHelper.takeScreenshot();
}

function setHasFollowedUp(value: boolean): void {
  state.hasFollowedUp = value;
}

function getHasFollowedUp(): boolean {
  return state.hasFollowedUp;
}

async function getConfiguredModel(): Promise<string> {
  try {
    return (await getStoreValue("api-model")) || "gemini-2.0-flash";
  } catch (error) {
    console.error("Error getting configured model from store:", error);
    return "gemini-2.0-flash";
  }
}


app.whenReady().then(initializeApp);

app.on("before-quit", () => {
  if (dimensionUpdateTimeout) {
    clearTimeout(dimensionUpdateTimeout);
    dimensionUpdateTimeout = null;
  }
  cleanupAllFiles();
  if (state.screenCaptureHelper) {
    state.screenCaptureHelper.stopScreenCaptureProtection();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});