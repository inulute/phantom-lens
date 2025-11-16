/// <reference types="vite/client" />

// Extend the Window interface
interface Window {
  __IS_INITIALIZED__: boolean;
  electronAPI: {
    updateContentDimensions: (dimensions: {
      width?: number | string;  // Made optional to fix TypeScript error
      height: number;
    }) => Promise<void>;
    setFixedResponseWidth: () => Promise<{ success: boolean; data?: { fixedWidth: number }; error?: string }>;
    clearFixedResponseWidth: () => Promise<{ success: boolean; error?: string }>;
    clearStore: () => Promise<{ success: boolean; error?: string }>;
    // process
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
    setIgnoreMouseEvents: () => Promise<{ success: boolean; error?: string }>;
    setInteractiveMouseEvents: () => Promise<{
      success: boolean;
      error?: string;
    }>;
    // NEW: Safe mouse event alternatives
    enableSafeClickThrough: () => Promise<{ success: boolean; error?: string }>;
    restoreInteractiveMode: () => Promise<{ success: boolean; error?: string }>;
    emergencyMouseRecovery: () => Promise<{ success: boolean; error?: string }>;
    quitApplication: () => Promise<{ success: boolean; error?: string }>;
    // Mode & history
    getMode: () => Promise<{ success: boolean; data?: { mode: "normal"|"stealth" }; error?: string }>;
    setMode: (mode: "normal"|"stealth") => Promise<{ success: boolean; error?: string }>;
    onModeChanged: (cb: (data: { mode: "normal"|"stealth" }) => void) => () => void;
    onHistoryLoad: (cb: (data: { content: string }) => void) => () => void;
    onResponseScroll: (cb: (data: { delta: number }) => void) => () => void;
    onCodeBlockScroll: (cb: (data: { delta: number }) => void) => () => void;
    onFocusPromptInput: (cb: () => void) => () => void;
    // Prompt
    setUserPrompt: (prompt: string) => Promise<{ success: boolean; error?: string }>;
    getUserPrompt: () => Promise<{ success: boolean; data?: { prompt: string }; error?: string }>;
    // Settings
    onOpenSettings: (callback: () => void) => () => void;
    onSettingsUnlock: (callback: () => void) => () => void;
    // Update check
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
    openUpdateDownload: (url?: string) => Promise<{ success: boolean; error?: string }>;
    onDownloadUpdate: (callback: (url?: string) => void) => () => void;
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
  };

  electron?: {
    ipcRenderer: {
      on: (channel: string, func: (...args: any[]) => void) => void;
      removeListener: (channel: string, func: (...args: any[]) => void) => void;
    };
  };
}