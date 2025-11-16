import { getStoreValue, setStoreValue } from "./main";
import { initializeIpcHandlerDeps } from "./main";
import { ipcMain, screen, shell } from "electron";
import { app } from "electron";
import * as fs from "fs";
import { secureConfig } from "./config";
import { updateService } from "./UpdateService";

interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

function createIpcHandler<T extends any[], R>(
  handler: (...args: T) => Promise<R> | R,
  handlerName: string
) {
  return async (...args: T): Promise<IpcResponse<R>> => {
    try {
      const result = await handler(...args);
      return { success: true, data: result };
    } catch (error: any) {
      console.error(`IPC Handler [${handlerName}] error:`, error);
      return { 
        success: false, 
        error: error.message || String(error) 
      };
    }
  };
}

function createSafeIpcHandler<T extends any[], R>(
  handler: (...args: T) => Promise<IpcResponse<R>> | IpcResponse<R>,
  handlerName: string
) {
  return async (...args: T): Promise<IpcResponse<R>> => {
    try {
      const result = await handler(...args);
      return result;
    } catch (error: any) {
      console.error(`Safe IPC Handler [${handlerName}] error:`, error);
      return { 
        success: false, 
        error: error.message || String(error) 
      };
    }
  };
}

export function initializeIpcHandlers(deps: initializeIpcHandlerDeps): void {
  console.log("FIXED: Initializing IPC handlers with DIRECT dimension updates (NO BATCHING)");

  ipcMain.handle("get-api-config", createSafeIpcHandler(async () => {
    try {
      const apiKey = await getStoreValue("api-key");
      const model = (await getStoreValue("api-model")) || "gemini-2.0-flash";

      if (!apiKey) {
        return { success: false, error: "API key not found" };
      }

      return { 
        success: true, 
        data: { apiKey, model, provider: "gemini" }
      };
    } catch (error: any) {
      console.error("Error getting API config:", error);
      return { success: false, error: "Failed to retrieve API config" };
    }
  }, "get-api-config"));

  ipcMain.handle("set-api-config", createSafeIpcHandler(async (
    _event: any,
    config: { apiKey: string; model: string }
  ) => {
    try {
      const { apiKey, model } = config;

      if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
        return { success: false, error: "Invalid API key provided" };
      }

      if (!model || typeof model !== "string" || !model.trim()) {
        return { success: false, error: "Invalid model selection" };
      }

      const validGeminiModels = [
        "gemini-1.5-pro",
        "gemini-1.5-flash", 
        "gemini-2.0-flash",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-pro",
        "gemini-pro-vision"
      ];

      if (!validGeminiModels.includes(model.trim())) {
        console.warn(`Unknown model selected: ${model}`);
      }

      const [successKey, successModel] = await Promise.all([
        setStoreValue("api-key", apiKey.trim()),
        setStoreValue("api-model", model.trim())
      ]);

      if (!successKey || !successModel) {
        console.error("Failed to save one or more API config values to store.");
        return { 
          success: false, 
          error: "Failed to save configuration to storage" 
        };
      }

      process.env.API_KEY = apiKey.trim();
      process.env.API_MODEL = model.trim();
      process.env.API_PROVIDER = "gemini";

      const mainWindow = deps.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("api-key-updated");
      }

      console.log(`API configuration saved: Model=${model.trim()}`);
      return { success: true, data: { apiKey: "***", model: model.trim() } };
      
    } catch (error: any) {
      console.error("Error setting API configuration:", error);
      return { success: false, error: "Failed to save configuration" };
    }
  }, "set-api-config"));

  ipcMain.handle("get-app-open-count", createSafeIpcHandler(async () => {
    try {
      const count = await getAppOpenCount();
      return { success: true, data: { count } };
    } catch (error: any) {
      console.error("Error getting app open count:", error);
      return { success: false, error: "Failed to get app open count" };
    }
  }, "get-app-open-count"));

  ipcMain.handle("set-stats-server-endpoint", createSafeIpcHandler(async (
    _event: any,
    endpoint: string
  ) => {
    try {
      if (!endpoint || typeof endpoint !== "string") {
        return { success: false, error: "Invalid endpoint provided" };
      }

      // Basic URL validation
      try {
        new URL(endpoint.trim());
      } catch {
        return { success: false, error: "Invalid URL format" };
      }

      await setStoreValue("stats-server-endpoint", endpoint.trim());
      console.log(`Stats server endpoint set to: ${endpoint.trim()}`);
      return { success: true };
    } catch (error: any) {
      console.error("Error setting stats server endpoint:", error);
      return { success: false, error: "Failed to set stats server endpoint" };
    }
  }, "set-stats-server-endpoint"));

  ipcMain.handle("get-stats-server-endpoint", createSafeIpcHandler(async () => {
    try {
      const endpoint = await getStoreValue("stats-server-endpoint");
      return { success: true, data: { endpoint: endpoint || null } };
    } catch (error: any) {
      console.error("Error getting stats server endpoint:", error);
      return { success: false, error: "Failed to get stats server endpoint" };
    }
  }, "get-stats-server-endpoint"));

  ipcMain.handle("reset-app-open-count", createSafeIpcHandler(async () => {
    try {
      const success = await resetAppOpenCount();
      return { success };
    } catch (error: any) {
      console.error("Error resetting app open count:", error);
      return { success: false, error: "Failed to reset app open count" };
    }
  }, "reset-app-open-count"));

  ipcMain.handle("check-github-update", createSafeIpcHandler(async () => {
    try {
      const result = await updateService.checkForUpdates();
      
      return {
        success: true,
        data: {
          updateAvailable: result.hasUpdate,
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
          releaseUrl: result.releaseInfo?.releaseUrl || 'https://ph.inulute.com/dl',
          releaseName: result.releaseInfo?.version || '',
          publishedAt: result.releaseInfo?.publishedAt || '',
          releaseNotes: result.releaseInfo?.releaseNotes || '',
          error: result.error || ''
        }
      };
    } catch (error: any) {
      console.error("Error checking GitHub update:", error);
      return { 
        success: true, 
        data: { 
          updateAvailable: false,
          currentVersion: app.getVersion(),
          latestVersion: app.getVersion(),
          releaseUrl: 'https://ph.inulute.com/dl',
          releaseName: '',
          publishedAt: '',
          releaseNotes: '',
          error: error.message || ''
        } 
      };
    }
  }, "check-github-update"));

  ipcMain.handle("open-update-download", createSafeIpcHandler(async (
    _event: any,
    url?: string
  ) => {
    try {
      await updateService.openReleasesPage(url);
      const downloadUrl = url || 'https://phantom.inulute.com';
      console.log(`[IPC] Opened update download URL: ${downloadUrl}`);
      return { success: true, data: `Opened ${downloadUrl}` };
    } catch (error: any) {
      console.error("Error opening update download URL:", error);
      return { 
        success: false, 
        error: `Failed to open download URL: ${error.message}` 
      };
    }
  }, "open-update-download"));

  ipcMain.handle("get-screenshot-queue", createIpcHandler(() => {
    const queue = deps.getScreenshotQueue();
    console.log(`Retrieved screenshot queue: ${queue.length} items`);
    return queue;
  }, "get-screenshot-queue"));

  ipcMain.handle("get-extra-screenshot-queue", createIpcHandler(() => {
    const queue = deps.getExtraScreenshotQueue();
    console.log(`Retrieved extra screenshot queue: ${queue.length} items`);
    return queue;
  }, "get-extra-screenshot-queue"));

  ipcMain.handle("get-screenshots", createSafeIpcHandler(async () => {
    try {
      const currentView = deps.getView();
      let queue: string[];

      if (currentView === "initial") {
        queue = deps.getScreenshotQueue();
      } else {
        queue = deps.getExtraScreenshotQueue();
      }

      const previews = queue.map(path => ({ path }));

      console.log(`Retrieved ${previews.length} screenshots for view: ${currentView}`);
      return { 
        success: true, 
        data: { previews, view: currentView } 
      };
    } catch (error: any) {
      console.error("Error getting screenshots:", error);
      return { 
        success: false, 
        error: "Failed to retrieve screenshots" 
      };
    }
  }, "get-screenshots"));

  ipcMain.handle("trigger-screenshot", createSafeIpcHandler(async () => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: "Main window not available" };
    }

    try {
      const screenshotPath = await deps.takeScreenshot();
      
      mainWindow.webContents.send("screenshot-taken", {
        path: screenshotPath,
      });

      console.log(`Screenshot captured and sent to UI: ${screenshotPath}`);
      return { success: true, data: { path: screenshotPath } };
    } catch (error: any) {
      console.error("Error triggering screenshot:", error);
      return { 
        success: false, 
        error: `Failed to capture screenshot: ${error.message}` 
      };
    }
  }, "trigger-screenshot"));

  ipcMain.handle("take-screenshot", createSafeIpcHandler(async () => {
    try {
      const screenshotPath = await deps.takeScreenshot();
      console.log(`Screenshot taken via direct call: ${screenshotPath}`);
      return { success: true, data: { path: screenshotPath } };
    } catch (error: any) {
      console.error("Error taking screenshot:", error);
      return { 
        success: false, 
        error: `Screenshot capture failed: ${error.message}` 
      };
    }
  }, "take-screenshot"));

  ipcMain.handle("process-screenshots", createSafeIpcHandler(async () => {
    if (!deps.processingHelper) {
      return { success: false, error: "Processing helper not available" };
    }

    try {
      await deps.processingHelper.processScreenshots();
      console.log("Screenshot processing initiated successfully");
      return { success: true, data: "Processing started" };
    } catch (error: any) {
      console.error("Error processing screenshots:", error);
      return { 
        success: false, 
        error: `Processing failed: ${error.message}` 
      };
    }
  }, "process-screenshots"));

  ipcMain.handle("trigger-process-screenshots", createSafeIpcHandler(async () => {
    if (!deps.processingHelper) {
      return { success: false, error: "Processing helper not available" };
    }

    try {
      await deps.processingHelper.processScreenshots();
      console.log("Screenshot processing triggered successfully");
      return { success: true, data: "Processing initiated" };
    } catch (error: any) {
      console.error("Error triggering screenshot processing:", error);
      return { 
        success: false, 
        error: `Failed to start processing: ${error.message}` 
      };
    }
  }, "trigger-process-screenshots"));

  ipcMain.handle("process-follow-up", createSafeIpcHandler(async () => {
    try {
      if (!deps.processingHelper) {
        return { success: false, error: "Processing helper not available" };
      }

      // Trigger follow-up processing
      await deps.processingHelper.processFollowUp();
      return { success: true };
    } catch (error: any) {
      console.error("Error processing follow-up:", error);
      return { success: false, error: error.message || String(error) };
    }
  }, "process-follow-up"));

  // ===================== Processing Control IPC =====================
  ipcMain.handle("cancel-processing", createSafeIpcHandler(() => {
    try {
      if (deps.processingHelper) {
        deps.processingHelper.cancelOngoingRequests();
        console.log("Processing cancellation requested");
        return { success: true, data: "Processing canceled" };
      } else {
        return { success: false, error: "Processing helper not available" };
      }
    } catch (error: any) {
      console.error("Error canceling processing:", error);
      return { 
        success: false, 
        error: `Failed to cancel processing: ${error.message}` 
      };
    }
  }, "cancel-processing"));

  // ============================================================================
  // FIXED: Direct Dimension Updates - NO MORE BATCHING!
  // ============================================================================
  
  // Handler to set fixed width for response mode
  ipcMain.handle("set-fixed-response-width", createSafeIpcHandler(async () => {
    try {
      const mainWindow = deps.getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: "Main window not available" };
      }

      // Get current window width and use it as the fixed width
      const currentBounds = mainWindow.getBounds();
      const fixedWidth = Math.max(currentBounds.width, 850);
      
      console.log(`[IPC-FIXED] Fixed response width would be: ${fixedWidth}px (current: ${currentBounds.width}px)`);
      // Don't actually store it here - let main process handle it
      return { success: true, data: { fixedWidth } };
    } catch (error: any) {
      console.error("Error setting fixed response width:", error);
      return { 
        success: false, 
        error: `Failed to set fixed width: ${error.message}` 
      };
    }
  }, "set-fixed-response-width"));

  // Handler to clear fixed width when returning to initial view
  ipcMain.handle("clear-fixed-response-width", createSafeIpcHandler(async () => {
    try {
      // Clear the locked width in main process
      deps.clearLockedResponseWidth();
      console.log("[IPC-FIXED] Fixed response width cleared");
      return { success: true };
    } catch (error: any) {
      console.error("Error clearing fixed response width:", error);
      return { 
        success: false, 
        error: `Failed to clear fixed width: ${error.message}` 
      };
    }
  }, "clear-fixed-response-width"));

  // FIXED: Direct dimension update handler - NO BATCHING
  ipcMain.handle("update-content-dimensions", createSafeIpcHandler(async (
    _event: any,
    dimensions: { width?: number | string; height: number }
  ) => {
    try {
      if (!dimensions || typeof dimensions.height !== 'number') {
        return { success: false, error: "Invalid dimensions provided" };
      }

      if (dimensions.height < 50) {
        console.warn("[IPC-FIXED] Suspiciously small dimensions received:", dimensions);
        return { success: false, error: "Dimensions too small" };
      }

      if (dimensions.height > 3000) {
        console.warn("[IPC-FIXED] Suspiciously large dimensions received:", dimensions);
        return { success: false, error: "Dimensions too large" };
      }

      const width = dimensions.width !== undefined ? dimensions.width : "fixed";
      const height = dimensions.height;

      console.log(`[IPC-FIXED] Direct dimension request: ${width} x ${height}`);
      
      // FIXED: Call the single dimension function directly - NO BATCHING
      deps.setWindowDimensions(width, height);

      return { success: true, data: { width, height } };
    } catch (error: any) {
      console.error("[IPC-FIXED] Dimension update error:", error);
      
      // EMERGENCY: Ensure safe state on error
      const mainWindow = deps.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setFocusable(false);
        mainWindow.setIgnoreMouseEvents(true);
      }
      
      return { 
        success: false, 
        error: `Failed to update dimensions: ${error.message}` 
      };
    }
  }, "update-content-dimensions"));

  ipcMain.handle("toggle-window", createSafeIpcHandler(() => {
    try {
      deps.toggleMainWindow();
      console.log("[IPC-FIXED] Window toggle requested");
      return { success: true, data: "Window toggled" };
    } catch (error: any) {
      console.error("Error toggling window:", error);
      return { 
        success: false, 
        error: `Failed to toggle window: ${error.message}` 
      };
    }
  }, "toggle-window"));

  // ============================================================================
  // Reset and Queue Management Handlers
  // ============================================================================
  ipcMain.handle("reset-queues", createSafeIpcHandler(async () => {
    try {
      await deps.clearQueues();
      console.log("[IPC-FIXED] Queues reset successfully");
      return { success: true, data: "Queues cleared" };
    } catch (error: any) {
      console.error("Error resetting queues:", error);
      return { 
        success: false, 
        error: `Failed to reset queues: ${error.message}` 
      };
    }
  }, "reset-queues"));

  ipcMain.handle("trigger-reset", createSafeIpcHandler(() => {
    try {
      // Cancel ongoing processing first
      if (deps.processingHelper) {
        deps.processingHelper.cancelOngoingRequests();
      }

      // Clear locked width
      deps.clearLockedResponseWidth();

      // Clear queues
      deps.clearQueues();
      
      // Reset view
      deps.setView("initial");

      const mainWindow = deps.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Send reset events in sequence
        mainWindow.webContents.send("reset-view");
        mainWindow.webContents.send("reset");
      }

      console.log("[IPC-FIXED] Application reset completed successfully");
      return { success: true, data: "Application reset" };
    } catch (error: any) {
      console.error("Error triggering reset:", error);
      return { 
        success: false, 
        error: `Failed to reset application: ${error.message}` 
      };
    }
  }, "trigger-reset"));

  // ============================================================================
  // Window Movement Handlers
  // ============================================================================
  const createMovementHandler = (direction: string, moveFn: () => void) => 
    createSafeIpcHandler(() => {
      try {
        moveFn();
        console.log(`[IPC-FIXED] Window moved ${direction}`);
        return { success: true, data: `Moved ${direction}` };
      } catch (error: any) {
        console.error(`Error moving window ${direction}:`, error);
        return { 
          success: false, 
          error: `Failed to move window ${direction}: ${error.message}` 
        };
      }
    }, `trigger-move-${direction}`);

  ipcMain.handle("trigger-move-left", createMovementHandler("left", deps.moveWindowLeft));
  ipcMain.handle("trigger-move-right", createMovementHandler("right", deps.moveWindowRight));
  ipcMain.handle("trigger-move-up", createMovementHandler("up", deps.moveWindowUp));
  ipcMain.handle("trigger-move-down", createMovementHandler("down", deps.moveWindowDown));

  // ===================== Mode & History IPC =====================
  ipcMain.handle("get-mode", createSafeIpcHandler(async () => {
    try {
      const main = require("./main");
      const mode = main.getCurrentMode?.() || "normal";
      return { success: true, data: { mode } };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  }, "get-mode"));

  ipcMain.handle("set-mode", createSafeIpcHandler(async (_e: any, mode: "normal" | "stealth") => {
    try {
      const main = require("./main");
      await main.setMode?.(mode);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  }, "set-mode"));

  // ===================== Prompt IPC =====================
  ipcMain.handle("set-user-prompt", createSafeIpcHandler(async (_e: any, prompt: string) => {
    try {
      const main = require("./main");
      const text = (prompt || "").toString();
      main.setUserPrompt?.(text.slice(0, 4000));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  }, "set-user-prompt"));

  ipcMain.handle("get-user-prompt", createSafeIpcHandler(async () => {
    try {
      const main = require("./main");
      const value = main.getUserPromptValue?.() || "";
      return { success: true, data: { prompt: value } };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  }, "get-user-prompt"));

  // ===================== Emergency Recovery Handler =====================
  ipcMain.handle("emergency-visibility-recovery", createSafeIpcHandler(async () => {
    try {
      console.log("[IPC-FIXED] Emergency visibility recovery requested via IPC");
      
      const mainWindow = deps.getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: "No main window available for recovery" };
      }

      // Force show window
      mainWindow.show();
      
      // Force opacity to full
      mainWindow.setOpacity(1);
      
      // Force always on top
      mainWindow.setAlwaysOnTop(true, "floating");
      
      // Check current bounds and fix if needed
      const bounds = mainWindow.getBounds();
      console.log("[IPC-FIXED] Current window bounds during recovery:", bounds);
      
      if (bounds.width < 100 || bounds.height < 100 || bounds.x < -1000 || bounds.y < -1000) {
        console.log("[IPC-FIXED] Window has invalid bounds, resetting");
        
        const primaryDisplay = screen.getPrimaryDisplay();
        const workArea = primaryDisplay.workAreaSize;
        
        const safeBounds = {
          x: Math.max(0, Math.floor(workArea.width * 0.1)),
          y: Math.max(0, Math.floor(workArea.height * 0.1)),
          width: Math.min(800, Math.floor(workArea.width * 0.6)),
          height: Math.min(600, Math.floor(workArea.height * 0.7))
        };
        
        mainWindow.setBounds(safeBounds, false);
        console.log("[IPC-FIXED] Window bounds reset to:", safeBounds);
      }
      
      // CRITICAL: Remove dangerous forward option
      mainWindow.setIgnoreMouseEvents(true);
      
      console.log("[IPC-FIXED] Emergency recovery completed successfully");
      return { 
        success: true, 
        data: "Emergency recovery completed" 
      };
      
    } catch (error: any) {
      console.error("Emergency recovery failed:", error);
      return { 
        success: false, 
        error: `Emergency recovery failed: ${error.message}` 
      };
    }
  }, "emergency-visibility-recovery"));

  ipcMain.handle("quit-application", createSafeIpcHandler(async () => {
    try {
      console.log("[IPC-FIXED] Quit application requested via IPC");
      
      setTimeout(() => {
        deps.quitApplication();
      }, 100);
      
      return { success: true, data: "Application quit initiated" };
    } catch (error: any) {
      console.error("Error quitting application:", error);
      return { 
        success: false, 
        error: `Failed to quit application: ${error.message}` 
      };
    }
  }, "quit-application"));

  ipcMain.handle("get-store-value", createSafeIpcHandler(async (
    _event: any,
    key: string
  ) => {
    try {
      if (!key || typeof key !== 'string') {
        return { success: false, error: "Invalid key provided" };
      }

      const value = await getStoreValue(key);
      console.log(`[IPC-FIXED] Retrieved store value for key: ${key}`);
      return { success: true, data: value };
    } catch (error: any) {
      console.error(`Error getting store value for key ${key}:`, error);
      return { 
        success: false, 
        error: `Failed to get store value: ${error.message}` 
      };
    }
  }, "get-store-value"));

  ipcMain.handle("set-store-value", createSafeIpcHandler(async (
    _event: any,
    key: string,
    value: any
  ) => {
    try {
      if (!key || typeof key !== 'string') {
        return { success: false, error: "Invalid key provided" };
      }

      const success = await setStoreValue(key, value);
      if (!success) {
        return { success: false, error: "Failed to set store value" };
      }

      console.log(`[IPC-FIXED] Set store value for key: ${key}`);
      return { success: true, data: value };
    } catch (error: any) {
      console.error(`Error setting store value for key ${key}:`, error);
      return { 
        success: false, 
        error: `Failed to set store value: ${error.message}` 
      };
    }
  }, "set-store-value"));

  ipcMain.handle("set-ignore-mouse-events", createSafeIpcHandler(() => {
    try {
      const mainWindow = deps.getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: "Main window not available" };
      }

      mainWindow.setIgnoreMouseEvents(true);
      console.log("[IPC-FIXED] Mouse events set to ignore (click-through) - NO FORWARDING");
      return { success: true, data: "Mouse events set to ignore" };
    } catch (error: any) {
      console.error("Error setting ignore mouse events:", error);
      return { 
        success: false, 
        error: `Failed to set ignore mouse events: ${error.message}` 
      };
    }
  }, "set-ignore-mouse-events"));

  ipcMain.handle("set-interactive-mouse-events", createSafeIpcHandler(() => {
    try {
      const mainWindow = deps.getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: "Main window not available" };
      }

      mainWindow.setIgnoreMouseEvents(false);
      console.log("[IPC-FIXED] Mouse events set to interactive");
      return { success: true, data: "Mouse events set to interactive" };
    } catch (error: any) {
      console.error("Error setting interactive mouse events:", error);
      return { 
        success: false, 
        error: `Failed to set interactive mouse events: ${error.message}` 
      };
    }
  }, "set-interactive-mouse-events"));

  ipcMain.handle("enable-safe-click-through", createSafeIpcHandler(() => {
    try {
      const mainWindow = deps.getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: "Main window not available" };
      }
      mainWindow.setIgnoreMouseEvents(true);
      console.log("[IPC-FIXED] Safe click-through mode enabled");
      return { success: true, data: "Safe click-through enabled" };
    } catch (error: any) {
      console.error("Error enabling safe click-through:", error);
      return { 
        success: false, 
        error: `Failed to enable click-through: ${error.message}` 
      };
    }
  }, "enable-safe-click-through"));

  ipcMain.handle("restore-interactive-mode", createSafeIpcHandler(() => {
    try {
      const mainWindow = deps.getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: "Main window not available" };
      }
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.setFocusable(true);
      console.log("[IPC-FIXED] Interactive mode restored");
      return { success: true, data: "Interactive mode restored" };
    } catch (error: any) {
      console.error("Error restoring interactive mode:", error);
      return { 
        success: false, 
        error: `Failed to restore interactive mode: ${error.message}` 
      };
    }
  }, "restore-interactive-mode"));

  ipcMain.handle("emergency-mouse-recovery", createSafeIpcHandler(() => {
    try {
      const mainWindow = deps.getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: "Main window not available" };
      }

      // Force restore all mouse functionality
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.setFocusable(true);
      mainWindow.show();
      mainWindow.focus();
      
      console.log("[IPC-FIXED] Emergency mouse recovery completed");
      return { success: true, data: "Mouse events recovered" };
    } catch (error: any) {
      console.error("Emergency mouse recovery failed:", error);
      return { 
        success: false, 
        error: `Emergency recovery failed: ${error.message}`
      };
    }
  }, "emergency-mouse-recovery"));

  ipcMain.handle("open-settings", createSafeIpcHandler(async () => {
    try {
      const mainWindow = deps.getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: "Main window not available" };
      }
      
      // Send event to renderer to open settings
      mainWindow.webContents.send("open-settings");
      return { success: true };
    } catch (error: any) {
      console.error("Error opening settings:", error);
      return { success: false, error: error.message || String(error) };
    }
  }, "open-settings"));

  console.log("FIXED: All IPC handlers initialized successfully with DIRECT dimension updates (NO BATCHING)");
}