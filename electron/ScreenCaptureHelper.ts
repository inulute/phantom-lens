import { BrowserWindow, app } from "electron";
import { ChildProcess, spawn } from "child_process";

import fs from "fs";
import path from "path";

export class ScreenCaptureHelper {
  private swiftHelperProcess: ChildProcess | null = null;
  private isHelperRunning: boolean = false;
  private helperPath: string;

  constructor() {
    // Path to the Swift helper binary
    this.helperPath = this.getSwiftHelperPath();
  }

  /**
   * Get the path to the Swift helper binary
   */
  private getSwiftHelperPath(): string {
    if (app.isPackaged) {
      // In packaged app, the helper should be in Resources
      return path.join(process.resourcesPath, "swift-helpers");
    } else {
      // In development, build and use from swift-helpers directory
      const devPath = path.join(
        __dirname,
        "..",
        "swift-helpers",
        "ScreenFilterCLI"
      );
      const fallbackPath = path.join(
        __dirname,
        "..",
        "swift-helpers",
        "ScreenFilterCLI"
      );

      if (fs.existsSync(devPath)) {
        return devPath;
      }
      return fallbackPath;
    }
  }

  /**
   * Start the Swift helper to exclude the main window from screen capture
   */
  public async startScreenCaptureProtection(
    mainWindow: BrowserWindow
  ): Promise<boolean> {
    if (process.platform !== "darwin") {
      console.log("ScreenCaptureKit protection only available on macOS");
      return false;
    }

    if (this.isHelperRunning) {
      console.log("Screen capture protection already running");
      return true;
    }

    try {
      // Get the process ID and window title
      const pid = process.pid;
      const windowTitle = mainWindow.getTitle() || "PhantomLens";

      console.log(
        `Starting ScreenCaptureKit protection for PID: ${pid}, Window: "${windowTitle}"`
      );

      // Check if helper binary exists
      if (!fs.existsSync(this.helperPath)) {
        console.error(`Swift helper binary not found at: ${this.helperPath}`);

        // Try to build the helper in development
        if (!app.isPackaged) {
          await this.buildSwiftHelper();
          if (!fs.existsSync(this.helperPath)) {
            throw new Error("Failed to build Swift helper");
          }
        } else {
          throw new Error("Swift helper binary not found in packaged app");
        }
      }

      // Make sure the binary is executable
      try {
        fs.chmodSync(this.helperPath, "755");
      } catch (error) {
        console.warn(
          "Failed to set executable permissions on Swift helper:",
          error
        );
      }

      // Spawn the Swift helper process
      this.swiftHelperProcess = spawn(
        this.helperPath,
        [pid.toString(), windowTitle],
        {
          stdio: ["ignore", "pipe", "pipe"],
          detached: false,
        }
      );

      // Set up event handlers
      this.setupHelperEventHandlers();

      // Wait for the helper to be ready
      const isReady = await this.waitForHelperReady();

      if (isReady) {
        this.isHelperRunning = true;
        console.log("ScreenCaptureKit protection started successfully");
        return true;
      } else {
        console.error("Swift helper failed to start properly");
        return false;
      }
    } catch (error) {
      console.error("Failed to start ScreenCaptureKit protection:", error);
      this.cleanup();
      return false;
    }
  }

  /**
   * Stop the Swift helper
   */
  public async stopScreenCaptureProtection(): Promise<void> {
    if (!this.isHelperRunning || !this.swiftHelperProcess) {
      return;
    }

    console.log("Stopping ScreenCaptureKit protection...");

    try {
      // Send SIGTERM to gracefully shutdown the helper
      this.swiftHelperProcess.kill("SIGTERM");

      // Wait for graceful shutdown or force kill after timeout
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.swiftHelperProcess && !this.swiftHelperProcess.killed) {
            console.log("Force killing Swift helper process");
            this.swiftHelperProcess.kill("SIGKILL");
          }
          resolve();
        }, 5000);

        if (this.swiftHelperProcess) {
          this.swiftHelperProcess.on("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });
    } catch (error) {
      console.error("Error stopping Swift helper:", error);
    } finally {
      this.cleanup();
      console.log("ScreenCaptureKit protection stopped");
    }
  }

  /**
   * Check if the helper is currently running
   */
  public isRunning(): boolean {
    return this.isHelperRunning;
  }

  /**
   * Build the Swift helper in development mode
   */
  private async buildSwiftHelper(): Promise<void> {
    console.log("Building Swift helper...");

    const swiftDir = path.join(__dirname, "..", "swift-helpers");

    return new Promise<void>((resolve, reject) => {
      const buildProcess = spawn("swift", ["build", "-c", "release"], {
        cwd: swiftDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      let errorOutput = "";

      buildProcess.stdout?.on("data", (data) => {
        output += data.toString();
      });

      buildProcess.stderr?.on("data", (data) => {
        errorOutput += data.toString();
      });

      buildProcess.on("exit", (code) => {
        if (code === 0) {
          console.log("Swift helper built successfully");

          // Copy the built binary to expected location
          const builtBinary = path.join(
            swiftDir,
            ".build",
            "release",
            "swift-helpers"
          );
          const targetBinary = path.join(swiftDir, "ScreenFilterCLI");

          try {
            if (fs.existsSync(builtBinary)) {
              fs.copyFileSync(builtBinary, targetBinary);
              fs.chmodSync(targetBinary, "755");
            }
          } catch (error) {
            console.warn("Failed to copy built binary:", error);
          }

          resolve();
        } else {
          console.error("Swift build failed:", errorOutput);
          reject(
            new Error(`Swift build failed with code ${code}: ${errorOutput}`)
          );
        }
      });

      buildProcess.on("error", (error) => {
        console.error("Failed to start Swift build:", error);
        reject(error);
      });
    });
  }

  /**
   * Set up event handlers for the Swift helper process
   */
  private setupHelperEventHandlers(): void {
    if (!this.swiftHelperProcess) return;

    this.swiftHelperProcess.on("exit", (code, signal) => {
      console.log(`Swift helper exited with code ${code}, signal ${signal}`);
      if (this.isHelperRunning) {
        console.warn(
          "Swift helper exited unexpectedly - ScreenCaptureKit protection may be lost"
        );
      }
      this.cleanup();
    });

    this.swiftHelperProcess.on("error", (error) => {
      console.error("Swift helper process error:", error);
      this.cleanup();
    });

    // Log output for debugging - but only log important messages to avoid spam
    this.swiftHelperProcess.stdout?.on("data", (data) => {
      const output = data.toString().trim();
      if (
        output &&
        (output.includes("INFO:") ||
          output.includes("ERROR:") ||
          output.includes("READY") ||
          output.includes("WARNING:"))
      ) {
        console.log("[Swift Helper]", output);
      }
    });

    this.swiftHelperProcess.stderr?.on("data", (data) => {
      const error = data.toString().trim();
      if (error) {
        console.error("[Swift Helper Error]", error);
      }
    });
  }

  /**
   * Wait for the Swift helper to signal it's ready
   */
  private async waitForHelperReady(
    timeoutMs: number = 15000
  ): Promise<boolean> {
    if (!this.swiftHelperProcess) return false;

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        console.error("Swift helper ready timeout");
        resolve(false);
      }, timeoutMs);

      let hasResolved = false;
      const resolveOnce = (value: boolean) => {
        if (!hasResolved) {
          hasResolved = true;
          clearTimeout(timeout);
          cleanup();
          resolve(value);
        }
      };

      // Listen for "READY" message from the helper
      const readyHandler = (data: Buffer) => {
        const output = data.toString();
        console.log("[Swift Helper Output]", output.trim());

        if (output.includes("READY")) {
          console.log(
            "Swift helper is ready and ScreenCaptureKit protection is active"
          );
          resolveOnce(true);
        } else if (output.includes("ERROR:")) {
          console.error("Swift helper reported error during startup");
          resolveOnce(false);
        }
      };

      // Handle process exit during startup (this should not happen if everything is working)
      const exitHandler = (code: number | null) => {
        console.error(`Swift helper exited during startup with code ${code}`);
        resolveOnce(false);
      };

      const cleanup = () => {
        this.swiftHelperProcess?.stdout?.off("data", readyHandler);
        this.swiftHelperProcess?.off("exit", exitHandler);
      };

      this.swiftHelperProcess.stdout?.on("data", readyHandler);
      this.swiftHelperProcess.on("exit", exitHandler);
    });
  }

  /**
   * Clean up process references
   */
  private cleanup(): void {
    this.isHelperRunning = false;
    this.swiftHelperProcess = null;
  }

  /**
   * Request Screen Recording permission if not already granted
   */
  public static async requestScreenRecordingPermission(): Promise<boolean> {
    if (process.platform !== "darwin") {
      return true; // Not needed on other platforms
    }

    // This is a basic check - the real permission request happens in the Swift helper
    console.log(
      "Screen Recording permission will be requested by Swift helper if needed"
    );
    return true;
  }
}
