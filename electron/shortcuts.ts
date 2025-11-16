import { app, globalShortcut, screen } from "electron";
import { IShortcutsHelperDeps } from "./main";
import process from "process";

export class ShortcutsHelper {
  private deps: IShortcutsHelperDeps;
  private shortcuts: { [key: string]: () => void } = {};

  constructor(deps: IShortcutsHelperDeps) {
    this.deps = deps;

    this.shortcuts = {
      "CommandOrControl+Enter": async () => {
        await this.deps.takeScreenshot();
        await this.deps.processingHelper?.processScreenshots();
      },
      "CommandOrControl+R": () => {
        console.log("Command + R pressed. Canceling requests and resetting queues...");
        this.deps.processingHelper?.cancelOngoingRequests();
        this.deps.clearQueues();
        console.log("Cleared queues.");
        this.deps.setView("initial");
        const mainWindow = this.deps.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("reset-view");
          mainWindow.webContents.send("reset");
        }
      },
      
      "CommandOrControl+Left": () => {
        console.log("Command/Ctrl + Left pressed. Moving window left.");
        this.deps.moveWindowLeft();
      },
      "CommandOrControl+Right": () => {
        console.log("Command/Ctrl + Right pressed. Moving window right.");
        this.deps.moveWindowRight();
      },
      "CommandOrControl+Down": () => {
        console.log("Command/Ctrl + Down pressed. Moving window down.");
        this.deps.moveWindowDown();
      },
      "CommandOrControl+Up": () => {
        console.log("Command/Ctrl + Up pressed. Moving window up.");
        this.deps.moveWindowUp();
      },
      
      "CommandOrControl+Shift+R": () => {
        console.log("EMERGENCY: Command/Ctrl + Shift + R pressed. Attempting visibility recovery...");
        
        const mainWindow = this.deps.getMainWindow();
        if (!mainWindow || mainWindow.isDestroyed()) {
          console.error("EMERGENCY: No main window available for recovery");
          return;
        }

        try {
          console.log("EMERGENCY: Forcing window to show");
          mainWindow.show();
          
          console.log("EMERGENCY: Setting opacity to 1");
          mainWindow.setOpacity(1);
          
          console.log("EMERGENCY: Setting always on top");
          mainWindow.setAlwaysOnTop(true, "floating");
          
          const bounds = mainWindow.getBounds();
          console.log("EMERGENCY: Current bounds:", bounds);
          
          if (bounds.width < 100 || bounds.height < 100) {
            console.log("EMERGENCY: Window too small, resetting size");
            const primaryDisplay = screen.getPrimaryDisplay();
            const workArea = primaryDisplay.workAreaSize;
            
            mainWindow.setBounds({
              x: Math.max(0, Math.floor(workArea.width * 0.1)),
              y: Math.max(0, Math.floor(workArea.height * 0.1)),
              width: 800,
              height: 600
            }, false);
            console.log("EMERGENCY: Window size reset");
          }
          
          mainWindow.setIgnoreMouseEvents(true);
          
          console.log("EMERGENCY: Recovery completed successfully");
          
        } catch (error) {
          console.error("EMERGENCY: Recovery failed:", error);
        }
      },
      
      "CommandOrControl+Q": () => {
        console.log("Command/Ctrl + Q pressed. Quitting application...");
        this.deps.quitApplication();
      },
      "Alt+Up": () => {
        this.deps.scrollResponseBy(-120);
      },
      "Alt+Down": () => {
        this.deps.scrollResponseBy(120);
      },
      "Alt+Left": () => {
        this.deps.scrollCodeBlockBy(-120);
      },
      "Alt+Right": () => {
        this.deps.scrollCodeBlockBy(120);
      },
      "CommandOrControl+Shift+Up": () => {
        this.deps.navigateHistoryPrev();
      },
      "CommandOrControl+Shift+Down": () => {
        this.deps.navigateHistoryNext();
      },
      "CommandOrControl+,": () => {
        console.log("Command/Ctrl + , pressed. Toggling settings...");
        const mainWindow = this.deps.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("open-settings");
        }
      },
      "CommandOrControl+Shift+U": () => {
        console.log("Command/Ctrl + Shift + U pressed. Opening update download...");
        const mainWindow = this.deps.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("download-update");
        }
      },
      "CommandOrControl+Shift+,": () => {
        console.log("Command/Ctrl + Shift + , pressed. Requesting interactive settings mode...");
        const mainWindow = this.deps.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("settings-unlock");
        }
      },
    };
  }

  private registerAppShortcuts(): void {
    Object.entries(this.shortcuts).forEach(([key, handler]) => {
      try {
        const isRegistered = globalShortcut.isRegistered(key);
        if (isRegistered) {
          globalShortcut.unregister(key);
        }
        const success = globalShortcut.register(key, handler);
        if (success) {
          console.log(`✓ Registered shortcut: ${key}`);
        } else {
          console.error(`✗ Failed to register shortcut: ${key} (may be in use by another app)`);
        }
      } catch (error) {
        console.error(`✗ Error registering shortcut ${key}:`, error);
      }
    });
  }

  private unregisterAppShortcuts(): void {
    Object.keys(this.shortcuts).forEach((key) => {
      try {
        globalShortcut.unregister(key);
        console.log(`Unregistered shortcut: ${key}`);
      } catch (error) {
        console.error(`Failed to unregister shortcut ${key}:`, error);
      }
    });
  }

  public registerGlobalShortcuts(): void {
    const toggleHandler = () => {
      console.log("[Shortcuts] Toggle shortcut (Ctrl/Cmd + \\) triggered");
      const wasVisible = this.deps.isWindowUsable();
      console.log(`[Shortcuts] Window was visible: ${wasVisible}`);
      this.deps.toggleMainWindow();

      if (wasVisible) {
        console.log("[Shortcuts] Window hidden, unregistering app shortcuts");
        this.unregisterAppShortcuts();
      } else {
        console.log("[Shortcuts] Window shown, registering app shortcuts");
        this.registerAppShortcuts();
      }
    };

    const shortcutKey = process.platform === "win32" 
      ? "Control+\\" 
      : "CommandOrControl+\\"; 

    try {
      if (globalShortcut.isRegistered(shortcutKey)) {
        console.log(`[Shortcuts] Unregistering existing shortcut: ${shortcutKey}`);
        globalShortcut.unregister(shortcutKey);
      }
      
      const success = globalShortcut.register(shortcutKey, toggleHandler);
      
      if (success) {
        console.log(`✓ Successfully registered toggle shortcut: ${shortcutKey}`);
      } else {
        console.error(`✗ Failed to register toggle shortcut: ${shortcutKey}`);
        console.error("[Shortcuts] This shortcut may be in use by another application.");
        console.error("[Shortcuts] Please check for conflicts or try restarting the app.");
        
        const fallbackKey = "CommandOrControl+Shift+H";
        try {
          if (globalShortcut.isRegistered(fallbackKey)) {
            globalShortcut.unregister(fallbackKey);
          }
          const fallbackSuccess = globalShortcut.register(fallbackKey, toggleHandler);
          if (fallbackSuccess) {
            console.log(`✓ Registered fallback toggle shortcut: ${fallbackKey}`);
          }
        } catch (fallbackError) {
          console.error(`✗ Failed to register fallback shortcut: ${fallbackKey}`, fallbackError);
        }
      }
    } catch (error) {
      console.error(`✗ Error registering toggle shortcut ${shortcutKey}:`, error);
    }

    if (this.deps.isWindowUsable()) {
      this.registerAppShortcuts();
    }

    app.on("will-quit", () => {
      try { globalShortcut.unregisterAll(); } catch {}
    });
  }
}