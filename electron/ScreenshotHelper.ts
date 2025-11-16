import { app } from "electron";
import { execFile } from "child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";

const execFileAsync = promisify(execFile);

export class ScreenshotHelper {
  private screenshotQueue: string[] = [];
  private extraScreenshotQueue: string[] = [];
  private readonly MAX_SCREENSHOTS = 1;

  private readonly screenshotDir: string;
  private readonly extraScreenshotDir: string;

  private view: "initial" | "response" | "followup" = "initial";

  // ============================================================================
  // BUG FIX: Operation Locking to Prevent Race Conditions
  // ============================================================================
  private isProcessingQueue = false;
  private isCapturingScreenshot = false;
  private pendingOperations = new Set<Promise<any>>();

  constructor(view: "initial" | "response" | "followup" = "initial") {
    this.view = view;

    // Initialize directories
    this.screenshotDir = path.join(app.getPath("userData"), "screenshots");
    this.extraScreenshotDir = path.join(
      app.getPath("userData"),
      "extra_screenshots"
    );

    // Create directories if they don't exist
    this.ensureDirectoriesExist();
  }

  // ============================================================================
  // BUG FIX: Safe Directory Creation with Error Handling
  // ============================================================================
  private ensureDirectoriesExist(): void {
    try {
      if (!fs.existsSync(this.screenshotDir)) {
        fs.mkdirSync(this.screenshotDir, { recursive: true });
        console.log("Created screenshot directory:", this.screenshotDir);
      }
      if (!fs.existsSync(this.extraScreenshotDir)) {
        fs.mkdirSync(this.extraScreenshotDir, { recursive: true });
        console.log("Created extra screenshot directory:", this.extraScreenshotDir);
      }
    } catch (error) {
      console.error("Error creating screenshot directories:", error);
    }
  }

  // ============================================================================
  // BUG FIX: Safe File Operations with Proper Error Handling
  // ============================================================================
  private async safeFileOperation<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const operationPromise = operation();
    this.pendingOperations.add(operationPromise);

    try {
      const result = await operationPromise;
      return result;
    } catch (error) {
      console.error(`Error in ${operationName}:`, error);
      throw error;
    } finally {
      this.pendingOperations.delete(operationPromise);
    }
  }

  private async safeUnlinkFile(filePath: string): Promise<void> {
    return this.safeFileOperation(async () => {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        console.log("Successfully deleted file:", filePath);
      } else {
        console.log("File already deleted or doesn't exist:", filePath);
      }
    }, `unlink ${filePath}`);
  }

  // ============================================================================
  // BUG FIX: Atomic Queue Management with Locking
  // ============================================================================
  private async cleanupOldScreenshots(queue: string[], maxSize: number): Promise<string[]> {
    if (queue.length <= maxSize) {
      return queue;
    }

    console.log(`Cleaning up old screenshots. Queue size: ${queue.length}, Max: ${maxSize}`);
    
    const filesToRemove = queue.slice(0, queue.length - maxSize);
    const remainingFiles = queue.slice(queue.length - maxSize);

    // Delete old files in parallel but safely
    const deletePromises = filesToRemove.map(filePath => 
      this.safeUnlinkFile(filePath).catch(error => {
        console.error(`Failed to delete screenshot ${filePath}:`, error);
      })
    );

    await Promise.all(deletePromises);
    
    console.log(`Cleaned up ${filesToRemove.length} old screenshots`);
    return remainingFiles;
  }

  private async addToQueue(filePath: string, isExtraQueue: boolean): Promise<void> {
    if (this.isProcessingQueue) {
      console.warn("Queue processing in progress, waiting...");
      // Wait for current processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      if (this.isProcessingQueue) {
        throw new Error("Queue is busy, please try again");
      }
    }

    this.isProcessingQueue = true;

    try {
      if (isExtraQueue) {
        this.extraScreenshotQueue.push(filePath);
        this.extraScreenshotQueue = await this.cleanupOldScreenshots(
          this.extraScreenshotQueue, 
          this.MAX_SCREENSHOTS
        );
      } else {
        this.screenshotQueue.push(filePath);
        this.screenshotQueue = await this.cleanupOldScreenshots(
          this.screenshotQueue, 
          this.MAX_SCREENSHOTS
        );
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  public getView(): "initial" | "response" | "followup" {
    return this.view;
  }

  public setView(view: "initial" | "response" | "followup"): void {
    this.view = view;
  }

  public getScreenshotQueue(): string[] {
    return [...this.screenshotQueue]; // Return copy to prevent external mutation
  }

  public getExtraScreenshotQueue(): string[] {
    return [...this.extraScreenshotQueue]; // Return copy to prevent external mutation
  }

  public async clearQueues(): Promise<void> {
    if (this.isProcessingQueue) {
      console.warn("Queue processing in progress during clear, waiting...");
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    this.isProcessingQueue = true;

    try {
      const mainQueueFiles = [...this.screenshotQueue];
      this.screenshotQueue = [];

      const extraQueueFiles = [...this.extraScreenshotQueue];
      this.extraScreenshotQueue = [];

      const deletePromises = [
        ...mainQueueFiles.map(filePath => this.safeUnlinkFile(filePath)),
        ...extraQueueFiles.map(filePath => this.safeUnlinkFile(filePath))
      ];

      await Promise.allSettled(deletePromises);
      
      console.log(`Cleared queues: ${mainQueueFiles.length} main + ${extraQueueFiles.length} extra screenshots`);
    } catch (error) {
      console.error("Error clearing queues:", error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async captureScreenshotMac(): Promise<Buffer> {
    return this.safeFileOperation(async () => {
      const tmpPath = path.join(app.getPath("temp"), `${uuidv4()}.png`);
      await execFileAsync("screencapture", ["-x", "-o", tmpPath]);
      const buffer = await fs.promises.readFile(tmpPath);
      await fs.promises.unlink(tmpPath);
      return buffer;
    }, "Mac screenshot capture");
  }

  private async captureScreenshotWindows(): Promise<Buffer> {
    return this.safeFileOperation(async () => {
      const tmpPath = path.join(app.getPath("temp"), `${uuidv4()}.png`);
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen
        $bitmap = New-Object System.Drawing.Bitmap $screen.Bounds.Width, $screen.Bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $bitmap.Size)
        $bitmap.Save('${tmpPath.replace(/\\/g, "\\\\")}')
        $graphics.Dispose()
        $bitmap.Dispose()
      `;
      await execFileAsync("powershell", ["-command", script]);
      const buffer = await fs.promises.readFile(tmpPath);
      await fs.promises.unlink(tmpPath);
      return buffer;
    }, "Windows screenshot capture");
  }

  public async takeScreenshot(): Promise<string> {
    if (this.isCapturingScreenshot) {
      throw new Error("Screenshot capture already in progress");
    }

    this.isCapturingScreenshot = true;

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));

      console.log(`Taking screenshot for view: ${this.view}`);

      let screenshotBuffer: Buffer;
      
      try {
        screenshotBuffer = process.platform === "darwin"
          ? await this.captureScreenshotMac()
          : await this.captureScreenshotWindows();
      } catch (captureError) {
        console.error("Screenshot capture failed:", captureError);
        throw new Error(`Screenshot capture failed: ${captureError}`);
      }

      if (!screenshotBuffer || screenshotBuffer.length === 0) {
        throw new Error("Screenshot buffer is empty");
      }

      const isExtraQueue = this.view !== "initial";
      const targetDir = isExtraQueue ? this.extraScreenshotDir : this.screenshotDir;
      const screenshotPath = path.join(targetDir, `${uuidv4()}.png`);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      try {
        await fs.promises.writeFile(screenshotPath, screenshotBuffer);
        console.log(`Screenshot saved: ${screenshotPath} (${screenshotBuffer.length} bytes)`);
      } catch (writeError) {
        console.error("Failed to write screenshot file:", writeError);
        throw new Error(`Failed to save screenshot: ${writeError}`);
      }

      try {
        await this.addToQueue(screenshotPath, isExtraQueue);
        console.log(`Screenshot added to ${isExtraQueue ? 'extra' : 'main'} queue`);
      } catch (queueError) {
        try {
          await this.safeUnlinkFile(screenshotPath);
        } catch (cleanupError) {
          console.error("Failed to cleanup screenshot after queue error:", cleanupError);
        }
        throw queueError;
      }

      return screenshotPath;

    } catch (error) {
      console.error("Screenshot error:", error);
      throw error;
    } finally {
      this.isCapturingScreenshot = false;
    }
  }

  public async clearExtraScreenshotQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      console.warn("Queue processing in progress during extra clear, waiting...");
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessingQueue = true;

    try {
      const extraQueueFiles = [...this.extraScreenshotQueue];
      this.extraScreenshotQueue = [];

      const deletePromises = extraQueueFiles.map(filePath => 
        this.safeUnlinkFile(filePath).catch(error => {
          console.error(`Failed to delete extra screenshot ${filePath}:`, error);
        })
      );

      await Promise.all(deletePromises);
      console.log(`Cleared extra queue: ${extraQueueFiles.length} screenshots`);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  public async cleanupAllScreenshots(): Promise<void> {
    console.log("Starting comprehensive screenshot cleanup...");

    if (this.pendingOperations.size > 0) {
      console.log(`Waiting for ${this.pendingOperations.size} pending operations to complete...`);
      await Promise.allSettled(Array.from(this.pendingOperations));
    }

    if (this.isProcessingQueue || this.isCapturingScreenshot) {
      console.log("Waiting for screenshot operations to complete...");
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    try {
      await this.clearQueues();

      const cleanupPromises = [
        this.cleanupDirectory(this.screenshotDir, "main"),
        this.cleanupDirectory(this.extraScreenshotDir, "extra")
      ];

      await Promise.allSettled(cleanupPromises);
      
      console.log("Comprehensive screenshot cleanup completed");
    } catch (error) {
      console.error("Error during comprehensive cleanup:", error);
    }
  }

  private async cleanupDirectory(dirPath: string, dirType: string): Promise<void> {
    try {
      if (!fs.existsSync(dirPath)) {
        console.log(`${dirType} directory doesn't exist: ${dirPath}`);
        return;
      }

      const files = await fs.promises.readdir(dirPath);
      const screenshotFiles = files.filter(file => 
        file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')
      );

      if (screenshotFiles.length === 0) {
        console.log(`No screenshots found in ${dirType} directory`);
        return;
      }

      console.log(`Cleaning up ${screenshotFiles.length} files from ${dirType} directory`);

      const deletePromises = screenshotFiles.map(async (file) => {
        const filePath = path.join(dirPath, file);
        try {
          await fs.promises.unlink(filePath);
          console.log(`Deleted ${dirType} screenshot: ${file}`);
        } catch (error) {
          console.error(`Error deleting ${dirType} screenshot file ${filePath}:`, error);
        }
      });

      await Promise.allSettled(deletePromises);
      console.log(`Finished cleaning ${dirType} directory: ${dirPath}`);
      
    } catch (error) {
      console.error(`Error cleaning up ${dirType} directory ${dirPath}:`, error);
    }
  }

  public async destroy(): Promise<void> {
    console.log("ScreenshotHelper destroy called");
    
    this.isCapturingScreenshot = true;
    this.isProcessingQueue = true;

    try {
      if (this.pendingOperations.size > 0) {
        console.log("Waiting for pending operations during destroy...");
        await Promise.allSettled(Array.from(this.pendingOperations));
      }

      await this.cleanupAllScreenshots();
      
      console.log("ScreenshotHelper destroyed successfully");
    } catch (error) {
      console.error("Error during ScreenshotHelper destruction:", error);
    }
  }

  public getStatus(): {
    isCapturing: boolean;
    isProcessingQueue: boolean;
    pendingOperations: number;
    mainQueueSize: number;
    extraQueueSize: number;
    currentView: string;
  } {
    return {
      isCapturing: this.isCapturingScreenshot,
      isProcessingQueue: this.isProcessingQueue,
      pendingOperations: this.pendingOperations.size,
      mainQueueSize: this.screenshotQueue.length,
      extraQueueSize: this.extraScreenshotQueue.length,
      currentView: this.view
    };
  }
}