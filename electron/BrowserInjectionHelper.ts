// BrowserInjectionHelper.ts - Automatic Browser Bypass Injection
import { spawn, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';

interface BrowserProcess {
  name: string;
  pid: number;
  injected: boolean;
  timestamp: number;
}

interface InjectionResult {
  success: boolean;
  pid: number;
  browserName: string;
  error?: string;
  timestamp: number;
}

export class BrowserInjectionHelper {
  private monitorInterval: NodeJS.Timeout | null = null;
  private injectedProcesses: Map<number, BrowserProcess> = new Map();
  private isRunning: boolean = false;
  private dllPath: string = '';
  private injectorPath: string = '';

  // Target browsers to inject into
  private readonly targetBrowsers = [
    'chrome.exe',
    'firefox.exe', 
    'msedge.exe',
    'brave.exe',
    'opera.exe',
    'vivaldi.exe',
    'chromium.exe'
  ];

  constructor() {
    console.log('[BrowserInjection] Initializing browser injection helper...');
    this.setupPaths();
  }

  private setupPaths(): void {
    const resourcesPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'injection')
      : path.join(__dirname, '..', 'resources', 'injection');
    
    this.dllPath = path.join(resourcesPath, 'timing_hook.dll');
    this.injectorPath = path.join(resourcesPath, 'injector.exe');
  }

  // ============================================================================
  // AUTOMATIC STARTUP AND MONITORING
  // ============================================================================

  public async startAutomaticInjection(): Promise<void> {
    if (this.isRunning) {
      console.log('[BrowserInjection] Already running');
      return;
    }

    console.log('[BrowserInjection] Starting automatic browser injection...');
    
    try {
      // Ensure injection tools exist
      await this.ensureInjectionToolsExist();
      
      // Apply self-timing bypass immediately
      this.applySelfTimingBypass();
      
      // Inject into existing browsers
      await this.injectIntoExistingBrowsers();
      
      // Start continuous monitoring
      this.startContinuousMonitoring();
      
      this.isRunning = true;
      console.log('[BrowserInjection] ✅ Automatic browser injection started successfully');
      
    } catch (error) {
      console.error('[BrowserInjection] ❌ Failed to start automatic injection:', error);
    }
  }

  public stopAutomaticInjection(): void {
    console.log('[BrowserInjection] Stopping automatic browser injection...');
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    this.isRunning = false;
    console.log('[BrowserInjection] Automatic injection stopped');
  }

  // ============================================================================
  // SELF-TIMING BYPASS (PROTECT THE ELECTRON APP ITSELF)
  // ============================================================================

  private applySelfTimingBypass(): void {
    console.log('[BrowserInjection] Applying self-timing bypass...');
    
    // Hook Date.now() for this Electron app
    const originalDateNow = Date.now;
    let callCount = 0;
    const OFFSET = 20000; // 20 seconds

    (Date as any).now = function(): number {
      callCount++;
      if (callCount <= 3) {
        console.log(`[BrowserInjection] Self-bypass: Call #${callCount} - returning offset time`);
        return originalDateNow() - OFFSET;
      }
      return originalDateNow();
    };

    console.log('[BrowserInjection] ✅ Self-timing bypass active');
  }

  // ============================================================================
  // INJECTION TOOLS MANAGEMENT
  // ============================================================================

  private async ensureInjectionToolsExist(): Promise<void> {
    try {
      // Check if tools directory exists
      const toolsDir = path.dirname(this.dllPath);
      await fs.mkdir(toolsDir, { recursive: true });

      // Create timing bypass DLL if it doesn't exist
      if (!(await this.fileExists(this.dllPath))) {
        await this.createTimingBypassDLL();
      }

      // Create injector executable if it doesn't exist
      if (!(await this.fileExists(this.injectorPath))) {
        await this.createInjectorExecutable();
      }

      console.log('[BrowserInjection] ✅ Injection tools ready');
    } catch (error) {
      console.error('[BrowserInjection] Failed to setup injection tools:', error);
      throw error;
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async createTimingBypassDLL(): Promise<void> {
    console.log('[BrowserInjection] Creating timing bypass DLL...');
    
    // In production, this would contain the actual DLL binary
    // For now, we'll create a placeholder that indicates the DLL should be present
    const dllContent = Buffer.from([
      // This would be the actual compiled DLL bytes
      // For demo purposes, we're just creating a placeholder
    ]);
    
    await fs.writeFile(this.dllPath, dllContent);
    console.log('[BrowserInjection] Timing bypass DLL created');
  }

  private async createInjectorExecutable(): Promise<void> {
    console.log('[BrowserInjection] Creating injector executable...');
    
    // In production, this would contain the actual injector binary
    const injectorContent = Buffer.from([
      // This would be the actual compiled injector executable bytes
    ]);
    
    await fs.writeFile(this.injectorPath, injectorContent);
    console.log('[BrowserInjection] Injector executable created');
  }

  // ============================================================================
  // BROWSER PROCESS DETECTION AND MONITORING
  // ============================================================================

  private startContinuousMonitoring(): void {
    console.log('[BrowserInjection] Starting continuous browser monitoring...');
    
    // Monitor every 3 seconds for new browser processes
    this.monitorInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.scanAndInjectNewBrowsers();
      }
    }, 3000);
  }

  private async scanAndInjectNewBrowsers(): Promise<void> {
    try {
      for (const browserName of this.targetBrowsers) {
        const processes = await this.findProcesses(browserName);
        
        for (const process of processes) {
          // Check if we haven't already injected into this process
          if (!this.injectedProcesses.has(process.pid)) {
            console.log(`[BrowserInjection] 🆕 New ${browserName} detected (PID: ${process.pid})`);
            await this.injectIntoBrowserProcess(process.pid, browserName);
          }
        }
      }
      
      // Clean up dead processes from our tracking
      await this.cleanupDeadProcesses();
      
    } catch (error) {
      console.error('[BrowserInjection] Error during monitoring scan:', error);
    }
  }

  private async injectIntoExistingBrowsers(): Promise<void> {
    console.log('[BrowserInjection] Scanning for existing browser processes...');
    
    for (const browserName of this.targetBrowsers) {
      try {
        const processes = await this.findProcesses(browserName);
        
        if (processes.length > 0) {
          console.log(`[BrowserInjection] Found ${processes.length} existing ${browserName} processes`);
          
          for (const process of processes) {
            await this.injectIntoBrowserProcess(process.pid, browserName);
          }
        }
      } catch (error) {
        // Browser not running, continue to next
      }
    }
  }

  // ============================================================================
  // PROCESS DETECTION UTILITIES
  // ============================================================================

  private async findProcesses(processName: string): Promise<Array<{pid: number, name: string}>> {
    return new Promise((resolve, reject) => {
      const command = process.platform === 'win32' 
        ? `tasklist /FI "IMAGENAME eq ${processName}" /FO CSV`
        : `pgrep -f ${processName}`;

      exec(command, (error, stdout) => {
        if (error) {
          resolve([]); // No processes found
          return;
        }

        const processes: Array<{pid: number, name: string}> = [];

        if (process.platform === 'win32') {
          const lines = stdout.split('\n').slice(1); // Skip header
          
          for (const line of lines) {
            if (line.trim() && line.includes(processName)) {
              const parts = line.split(',');
              if (parts.length >= 2) {
                const pid = parseInt(parts[1].replace(/"/g, ''));
                if (!isNaN(pid)) {
                  processes.push({
                    pid: pid,
                    name: processName
                  });
                }
              }
            }
          }
        } else {
          // Linux/macOS
          const pids = stdout.trim().split('\n').filter(Boolean);
          for (const pidStr of pids) {
            const pid = parseInt(pidStr);
            if (!isNaN(pid)) {
              processes.push({
                pid: pid,
                name: processName
              });
            }
          }
        }

        resolve(processes);
      });
    });
  }

  private async cleanupDeadProcesses(): Promise<void> {
    const deadPids: number[] = [];
    
    for (const [pid, process] of this.injectedProcesses) {
      // Check if process is still running
      if (!(await this.isProcessRunning(pid))) {
        deadPids.push(pid);
      }
    }
    
    // Remove dead processes from tracking
    for (const pid of deadPids) {
      this.injectedProcesses.delete(pid);
      console.log(`[BrowserInjection] 💀 Removed dead process from tracking (PID: ${pid})`);
    }
  }

  private async isProcessRunning(pid: number): Promise<boolean> {
    try {
      // On Windows, use tasklist to check if process exists
      if (process.platform === 'win32') {
        return new Promise((resolve) => {
          exec(`tasklist /FI "PID eq ${pid}" /FO CSV`, (error, stdout) => {
            if (error) {
              resolve(false);
              return;
            }
            resolve(stdout.includes(pid.toString()));
          });
        });
      } else {
        // On Unix-like systems, try to send signal 0
        process.kill(pid, 0);
        return true;
      }
    } catch {
      return false;
    }
  }

  // ============================================================================
  // BROWSER INJECTION EXECUTION
  // ============================================================================

  private async injectIntoBrowserProcess(pid: number, browserName: string): Promise<InjectionResult> {
    const startTime = Date.now();
    
    try {
      console.log(`[BrowserInjection] 💉 Injecting into ${browserName} (PID: ${pid})...`);
      
      // Execute the injection
      const injectionSuccess = await this.executeInjection(pid);
      
      if (injectionSuccess) {
        // Track this process as injected
        this.injectedProcesses.set(pid, {
          name: browserName,
          pid: pid,
          injected: true,
          timestamp: Date.now()
        });
        
        console.log(`[BrowserInjection] ✅ Successfully injected into ${browserName} (PID: ${pid})`);
        console.log(`[BrowserInjection] 🕒 ${browserName} timing functions now bypassed`);
        
        return {
          success: true,
          pid: pid,
          browserName: browserName,
          timestamp: Date.now()
        };
      } else {
        console.log(`[BrowserInjection] ❌ Failed to inject into ${browserName} (PID: ${pid})`);
        
        return {
          success: false,
          pid: pid,
          browserName: browserName,
          error: 'Injection failed',
          timestamp: Date.now()
        };
      }
    } catch (error) {
      console.error(`[BrowserInjection] Error injecting into ${browserName} (PID: ${pid}):`, error);
      
      return {
        success: false,
        pid: pid,
        browserName: browserName,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  private async executeInjection(targetPID: number): Promise<boolean> {
    return new Promise((resolve) => {
      // In a real implementation, this would execute the actual DLL injection
      // For demo purposes, we'll simulate it
      
      const injector = spawn(this.injectorPath, [
        targetPID.toString(),
        this.dllPath
      ], {
        stdio: 'pipe',
        windowsHide: true // Hide on Windows
      });

      let output = '';
      
      injector.stdout?.on('data', (data) => {
        output += data.toString();
      });

      injector.stderr?.on('data', (data) => {
        console.error(`[BrowserInjection] Injector stderr: ${data}`);
      });

      injector.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          console.error(`[BrowserInjection] Injector exited with code ${code}`);
          resolve(false);
        }
      });

      injector.on('error', (error) => {
        console.error(`[BrowserInjection] Injector error:`, error);
        resolve(false);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        injector.kill();
        console.error('[BrowserInjection] Injection timeout');
        resolve(false);
      }, 10000);
    });
  }

  // ============================================================================
  // STATUS AND DEBUGGING
  // ============================================================================

  public getInjectionStatus(): {
    isRunning: boolean;
    injectedCount: number;
    targetBrowsers: string[];
    injectedProcesses: Array<{name: string; pid: number; timestamp: number}>;
  } {
    const injectedProcessArray = Array.from(this.injectedProcesses.values()).map(proc => ({
      name: proc.name,
      pid: proc.pid,
      timestamp: proc.timestamp
    }));

    return {
      isRunning: this.isRunning,
      injectedCount: this.injectedProcesses.size,
      targetBrowsers: this.targetBrowsers,
      injectedProcesses: injectedProcessArray
    };
  }

  public async performManualScan(): Promise<void> {
    console.log('[BrowserInjection] 🔍 Manual scan requested...');
    await this.scanAndInjectNewBrowsers();
  }
}