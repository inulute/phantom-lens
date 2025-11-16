console.log("Preload script starting...");

import { contextBridge, ipcRenderer } from "electron";

// Types for the exposed Electron API
interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width?: number | string;
    height: number;
  }) => Promise<void>;
  setFixedResponseWidth: () => Promise<{ success: boolean; data?: { fixedWidth: number }; error?: string }>;
  clearStore: () => Promise<{ success: boolean; error?: string }>;
  getScreenshots: () => Promise<{
    success: boolean;
    previews?: Array<{ path: string; preview: string }> | null;
    error?: string;
  }>;
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void;
  onResetView: (callback: () => void) => () => void;
  onResponseStart: (callback: () => void) => () => void;
  onFollowUpStart: (callback: () => void) => () => void;
  onFollowUpSuccess: (callback: (data: any) => void) => () => void;
  onResponseError: (callback: (error: string) => void) => () => void;
  onResponseSuccess: (callback: (data: any) => void) => () => void;
  onFollowUpError: (callback: (error: string) => void) => () => void;
  onResponseChunk: (callback: (chunk: string) => void) => () => void;
  onFollowUpChunk: (callback: (data: { response: string }) => void) => () => void;
  // shortcuts
  toggleMainWindow: () => Promise<{ success: boolean; error?: string }>;
  triggerScreenshot: () => Promise<{ success: boolean; error?: string }>;
  triggerReset: () => Promise<{ success: boolean; error?: string }>;
  // processing
  processScreenshots: () => Promise<{ success: boolean; error?: string }>;
  triggerProcessScreenshots: () => Promise<{ success: boolean; error?: string }>;
  processFollowUp: () => Promise<{ success: boolean; error?: string }>;
  // movement
  triggerMoveLeft: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveRight: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveUp: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveDown: () => Promise<{ success: boolean; error?: string }>;
  // helper
  getPlatform: () => string;
  getStoreValue: (key: string) => Promise<any>;
  setStoreValue: (key: string, value: any) => Promise<void>;
  setApiConfig: (config: {
    apiKey: string;
    model: string;
  }) => Promise<{ success: boolean; error?: string }>;
  getApiConfig: () => Promise<{
    success: boolean;
    data?: {
      apiKey: string;
      model: string;
      provider: string;
    };
    error?: string;
  }>;
  onApiKeyUpdated: (callback: () => void) => () => void;
  onApiKeyMissing: (callback: () => void) => () => void;
  onFocusPromptInput: (callback: () => void) => () => void;
  setIgnoreMouseEvents: () => Promise<{ success: boolean; error?: string }>;
  setInteractiveMouseEvents: () => Promise<{
    success: boolean;
    error?: string;
  }>;
  enableSafeClickThrough: () => Promise<{ success: boolean; error?: string }>;
  restoreInteractiveMode: () => Promise<{ success: boolean; error?: string }>;
  emergencyMouseRecovery: () => Promise<{ success: boolean; error?: string }>;

  checkGitHubUpdate: () => Promise<{
    success: boolean;
    data?: {
      updateAvailable: boolean;
      currentVersion: string;
      latestVersion: string;
      releaseUrl?: string;
      releaseName?: string;
      publishedAt?: string;
      error?: string;
    };
    error?: string;
  }>;
  onDownloadUpdate: (callback: (url?: string) => void) => () => void;
  quitApplication: () => Promise<{ success: boolean; error?: string }>;
  getMode: () => Promise<{ success: boolean; data?: { mode: "normal"|"stealth" }; error?: string }>;
  setMode: (mode: "normal"|"stealth") => Promise<{ success: boolean; error?: string }>;
  onModeChanged: (cb: (data: { mode: "normal"|"stealth" }) => void) => () => void;
  onHistoryLoad: (cb: (data: { content: string }) => void) => () => void;
  onResponseScroll: (cb: (data: { delta: number }) => void) => () => void;
  setUserPrompt: (prompt: string) => Promise<{ success: boolean; error?: string }>;
  getUserPrompt: () => Promise<{ success: boolean; data?: { prompt: string }; error?: string }>;
  onOpenSettings: (callback: () => void) => () => void;
  onSettingsUnlock: (callback: () => void) => () => void;
  // Usage Counter
  getAppOpenCount: () => Promise<{
    success: boolean;
    data?: { count: number };
    error?: string;
  }>;
  setStatsServerEndpoint: (endpoint: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  getStatsServerEndpoint: () => Promise<{
    success: boolean;
    data?: { endpoint: string | null };
    error?: string;
  }>;
  resetAppOpenCount: () => Promise<{
    success: boolean;
    error?: string;
  }>;
}

export const PROCESSING_EVENTS = {
  INITIAL_START: "initial-start",
  RESPONSE_SUCCESS: "response-success",
  INITIAL_RESPONSE_ERROR: "response-error",
  RESET: "reset",
  RESPONSE_CHUNK: "response-chunk",

  FOLLOW_UP_START: "follow-up-start",
  FOLLOW_UP_SUCCESS: "follow-up-success",
  FOLLOW_UP_ERROR: "follow-up-error",
  FOLLOW_UP_CHUNK: "follow-up-chunk",
} as const;

console.log("Preload script is running");

const electronAPI = {
  updateContentDimensions: (dimensions: { width?: number | string; height: number }) =>
    ipcRenderer.invoke("update-content-dimensions", dimensions),
  setFixedResponseWidth: () => ipcRenderer.invoke("set-fixed-response-width"),
  clearFixedResponseWidth: () => ipcRenderer.invoke("clear-fixed-response-width"),
  clearStore: () => ipcRenderer.invoke("clear-store"),
  getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
  toggleMainWindow: async () => {
    console.log("toggleMainWindow called from preload");
    try {
      const result = await ipcRenderer.invoke("toggle-window");
      console.log("toggle-window result:", result);
      return result;
    } catch (error) {
      console.error("Error in toggleMainWindow:", error);
      throw error;
    }
  },
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => {
    const subscription = (_: any, data: { path: string; preview: string }) =>
      callback(data);
    ipcRenderer.on("screenshot-taken", subscription);
    return () => {
      ipcRenderer.removeListener("screenshot-taken", subscription);
    };
  },
  onResetView: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on("reset-view", subscription);
    return () => {
      ipcRenderer.removeListener("reset-view", subscription);
    };
  },
  onResponseStart: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_START, subscription);
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_START, subscription);
    };
  },
  onFollowUpStart: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on(PROCESSING_EVENTS.FOLLOW_UP_START, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.FOLLOW_UP_START,
        subscription
      );
    };
  },
  onFollowUpSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data);
    ipcRenderer.on(PROCESSING_EVENTS.FOLLOW_UP_SUCCESS, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.FOLLOW_UP_SUCCESS,
        subscription
      );
    };
  },
  onFollowUpError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error);
    ipcRenderer.on(PROCESSING_EVENTS.FOLLOW_UP_ERROR, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.FOLLOW_UP_ERROR,
        subscription
      );
    };
  },
  onFollowUpChunk: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data);
    ipcRenderer.on(PROCESSING_EVENTS.FOLLOW_UP_CHUNK, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.FOLLOW_UP_CHUNK,
        subscription
      );
    };
  },
  onResponseError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error);
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_RESPONSE_ERROR, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.INITIAL_RESPONSE_ERROR,
        subscription
      );
    };
  },
  onResponseSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data);
    ipcRenderer.on(PROCESSING_EVENTS.RESPONSE_SUCCESS, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.RESPONSE_SUCCESS,
        subscription
      );
    };
  },
  triggerScreenshot: () => ipcRenderer.invoke("trigger-screenshot"),
  triggerReset: () => ipcRenderer.invoke("trigger-reset"),
  processScreenshots: () => ipcRenderer.invoke("process-screenshots"),
  triggerProcessScreenshots: () => ipcRenderer.invoke("trigger-process-screenshots"),
  processFollowUp: () => ipcRenderer.invoke("process-follow-up"),
  triggerMoveLeft: () => ipcRenderer.invoke("trigger-move-left"),
  triggerMoveRight: () => ipcRenderer.invoke("trigger-move-right"),
  triggerMoveUp: () => ipcRenderer.invoke("trigger-move-up"),
  triggerMoveDown: () => ipcRenderer.invoke("trigger-move-down"),
  getPlatform: () => process.platform,
  getStoreValue: (key: string) => ipcRenderer.invoke("get-store-value", key),
  setStoreValue: (key: string, value: any) =>
    ipcRenderer.invoke("set-store-value", key, value),
  setApiConfig: (config: { apiKey: string; model: string }) =>
    ipcRenderer.invoke("set-api-config", config),
  getApiConfig: () => ipcRenderer.invoke("get-api-config"),
  onApiKeyUpdated: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on("api-key-updated", subscription);
    return () => {
      ipcRenderer.removeListener("api-key-updated", subscription);
    };
  },
  onApiKeyMissing: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on("api-key-missing", subscription);
    return () => ipcRenderer.removeListener("api-key-missing", subscription);
  },
  onFocusPromptInput: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on("focus-prompt-input", subscription);
    return () => {
      ipcRenderer.removeListener("focus-prompt-input", subscription);
    };
  },
  setIgnoreMouseEvents: () => ipcRenderer.invoke("set-ignore-mouse-events"),
  setInteractiveMouseEvents: () =>
    ipcRenderer.invoke("set-interactive-mouse-events"),
  enableSafeClickThrough: () => ipcRenderer.invoke("enable-safe-click-through"),
  restoreInteractiveMode: () => ipcRenderer.invoke("restore-interactive-mode"),
  emergencyMouseRecovery: () => ipcRenderer.invoke("emergency-mouse-recovery"),

  checkGitHubUpdate: () => ipcRenderer.invoke("check-github-update"),
  openUpdateDownload: (url?: string) => ipcRenderer.invoke("open-update-download", url),
  onDownloadUpdate: (callback: (url?: string) => void) => {
    const subscription = (_: any, url?: string) => callback(url);
    ipcRenderer.on("download-update", subscription);
    return () => {
      ipcRenderer.removeListener("download-update", subscription);
    };
  },
  
  quitApplication: () => ipcRenderer.invoke("quit-application"),
  getMode: () => ipcRenderer.invoke("get-mode"),
  setMode: (mode: "normal"|"stealth") => ipcRenderer.invoke("set-mode", mode),
  onModeChanged: (callback: (data: { mode: "normal"|"stealth" }) => void) => {
    const sub = (_: any, data: { mode: "normal"|"stealth" }) => callback(data);
    ipcRenderer.on("mode-changed", sub);
    return () => ipcRenderer.removeListener("mode-changed", sub);
  },
  onResponseScroll: (callback: (data: { delta: number }) => void) => {
    const sub = (_: any, data: { delta: number }) => callback(data);
    ipcRenderer.on("response-scroll", sub);
    return () => ipcRenderer.removeListener("response-scroll", sub);
  },
  onCodeBlockScroll: (callback: (data: { delta: number }) => void) => {
    const sub = (_: any, data: { delta: number }) => callback(data);
    ipcRenderer.on("code-block-scroll", sub);
    return () => ipcRenderer.removeListener("code-block-scroll", sub);
  },
  onHistoryLoad: (callback: (data: { content: string }) => void) => {
    const sub = (_: any, data: { content: string }) => callback(data);
    ipcRenderer.on("history-load", sub);
    return () => ipcRenderer.removeListener("history-load", sub);
  },
  setUserPrompt: (prompt: string) => ipcRenderer.invoke("set-user-prompt", prompt),
  getUserPrompt: () => ipcRenderer.invoke("get-user-prompt"),
  onResponseChunk: (callback: (chunk: string) => void) => {
    const subscription = (_: any, chunk: string) => callback(chunk);
    ipcRenderer.on(PROCESSING_EVENTS.RESPONSE_CHUNK, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.RESPONSE_CHUNK,
        subscription
      );
    };
  },
  onOpenSettings: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on("open-settings", subscription);
    return () => {
      ipcRenderer.removeListener("open-settings", subscription);
    };
  },
  onSettingsUnlock: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on("settings-unlock", subscription);
    return () => {
      ipcRenderer.removeListener("settings-unlock", subscription);
    };
  },
    // Usage Counter
    getAppOpenCount: () => ipcRenderer.invoke("get-app-open-count"),
    setStatsServerEndpoint: (endpoint: string) =>
      ipcRenderer.invoke("set-stats-server-endpoint", endpoint),
    getStatsServerEndpoint: () => ipcRenderer.invoke("get-stats-server-endpoint"),
    resetAppOpenCount: () => ipcRenderer.invoke("reset-app-open-count"),
  } as ElectronAPI;

console.log(
  "About to expose electronAPI with methods:",
  Object.keys(electronAPI)
);

window.addEventListener("focus", () => {
  console.log("Window focused");
});

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

contextBridge.exposeInMainWorld("platform", process.platform);

console.log("Preload script completed");