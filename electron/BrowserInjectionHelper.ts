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

  public async startAutomaticInjection(): Promise<void> {
    if (this.isRunning) {
      console.log('[BrowserInjection] Already running');
      return;
    }

    console.log('[BrowserInjection] Starting automatic browser injection...');
    
    try {
      await this.ensureInjectionToolsExist();
      
      this.applySelfTimingBypass();
      
      await this.injectIntoExistingBrowsers();
      
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

  private applySelfTimingBypass(): void {
    console.log('[BrowserInjection] Applying self-timing bypass...');
    
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

  private async ensureInjectionToolsExist(): Promise<void> {
    try {
      const toolsDir = path.dirname(this.dllPath);
      await fs.mkdir(toolsDir, { recursive: true });

      if (!(await this.fileExists(this.dllPath))) {
        await this.createTimingBypassDLL();
      }

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
    
    const dllContent = Buffer.from([
    ]);
    
    await fs.writeFile(this.dllPath, dllContent);
    console.log('[BrowserInjection] Timing bypass DLL created');
  }

  private async createInjectorExecutable(): Promise<void> {
    console.log('[BrowserInjection] Creating injector executable...');
    
    const injectorContent = Buffer.from([
    ]);
    
    await fs.writeFile(this.injectorPath, injectorContent);
    console.log('[BrowserInjection] Injector executable created');
  }

  private startContinuousMonitoring(): void {
    console.log('[BrowserInjection] Starting continuous browser monitoring...');
    
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
          if (!this.injectedProcesses.has(process.pid)) {
            console.log(`[BrowserInjection] 🆕 New ${browserName} detected (PID: ${process.pid})`);
            await this.injectIntoBrowserProcess(process.pid, browserName);
          }
        }
      }
      
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
      }
    }
  }

  private async findProcesses(processName: string): Promise<Array<{pid: number, name: string}>> {
    return new Promise((resolve, reject) => {
      const command = process.platform === 'win32' 
        ? `tasklist /FI "IMAGENAME eq ${processName}" /FO CSV`
        : `pgrep -f ${processName}`;

      exec(command, (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }

        const processes: Array<{pid: number, name: string}> = [];

        if (process.platform === 'win32') {
          const lines = stdout.split('\n').slice(1);
          
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
      if (!(await this.isProcessRunning(pid))) {
        deadPids.push(pid);
      }
    }
    
    for (const pid of deadPids) {
      this.injectedProcesses.delete(pid);
      console.log(`[BrowserInjection] 💀 Removed dead process from tracking (PID: ${pid})`);
    }
  }

  private async isProcessRunning(pid: number): Promise<boolean> {
    try {
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
        process.kill(pid, 0);
        return true;
      }
    } catch {
      return false;
    }
  }

  private async injectIntoBrowserProcess(pid: number, browserName: string): Promise<InjectionResult> {
    const startTime = Date.now();
    
    try {
      console.log(`[BrowserInjection] 💉 Injecting into ${browserName} (PID: ${pid})...`);
      
      const injectionSuccess = await this.executeInjection(pid);
      
      if (injectionSuccess) {
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
      
      const injector = spawn(this.injectorPath, [
        targetPID.toString(),
        this.dllPath
      ], {
        stdio: 'pipe',
        windowsHide: true
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

      setTimeout(() => {
        injector.kill();
        console.error('[BrowserInjection] Injection timeout');
        resolve(false);
      }, 10000);
    });
  }

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