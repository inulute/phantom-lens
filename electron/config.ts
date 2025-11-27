import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface AppConfig {
  github: {
    owner: string;
    repo: string;
    private: boolean;
    token?: string;
  };
  app: {
    name: string;
    configDir: string;
  };
}

class SecureConfig {
  private configPath: string;
  private config: AppConfig;

  constructor() {
    // Use phantomlens instead of ikiag for config directory
    const userDataPath = process.env.APPDATA ||
      (process.platform === "darwin"
        ? path.join(process.env.HOME || "", "Library", "Application Support")
        : path.join(process.env.HOME || "", ".config"));

    this.configPath = path.join(userDataPath, "phantomlens", "config.json");
    this.config = this.getDefaultConfig();
    this.loadConfig();
  }

  private getDefaultConfig(): AppConfig {
    return {
      github: {
        owner: "inulute",
        repo: "phantom-lens",
        private: false
      },
      app: {
        name: "PhantomLens",
        configDir: path.dirname(this.configPath)
      }
    };
  }

  private loadConfig(): void {
    try {
      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Load from environment variables first (most secure)
      if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
        this.config.github.token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
      }

      // Load from config file if it exists
      if (fs.existsSync(this.configPath)) {
        try {
          const fileContent = fs.readFileSync(this.configPath, 'utf8');
          const fileConfig = JSON.parse(fileContent);
          
          // Merge with defaults, prioritizing environment variables
          this.config = {
            ...this.config,
            ...fileConfig,
            github: {
              ...this.config.github,
              ...fileConfig.github,
              // Don't override token if set via environment
              token: this.config.github.token || fileConfig.github?.token
            }
          };
        } catch (error) {
          // If file is corrupted, log but don't fail - use defaults
          console.warn('Error parsing config file, using defaults:', error);
        }
      }

      // Don't save automatically - let the store system handle writes to prevent race conditions
      // Only save when explicitly needed (which should be rare)
    } catch (error) {
      console.error('Error loading config:', error);
      // Use default config if loading fails
    }
  }

  private saveConfig(): void {
    try {
      // Load existing config to preserve store values (api-key, api-model, etc.)
      let existingConfig: any = {};
      if (fs.existsSync(this.configPath)) {
        try {
          const fileContent = fs.readFileSync(this.configPath, 'utf8');
          existingConfig = JSON.parse(fileContent);
        } catch (error) {
          // If file is corrupted, start fresh but preserve what we can
          console.warn('Error reading existing config, will preserve structure:', error);
        }
      }
      
      // Merge: preserve store values, update only github and app config
      const configToSave = {
        ...existingConfig, // Preserve all existing keys (api-key, api-model, etc.)
        ...this.config,    // Override with our config structure
        github: {
          ...this.config.github,
          // Don't save token to file for security
          token: undefined as string | undefined
        }
      };
      
      // Remove undefined values to keep JSON clean
      Object.keys(configToSave).forEach(key => {
        if (configToSave[key] === undefined) {
          delete configToSave[key];
        }
      });
      
      // Atomic write using temp file to prevent corruption
      const tempPath = this.configPath + '.tmp.' + Date.now();
      try {
        fs.writeFileSync(tempPath, JSON.stringify(configToSave, null, 2), 'utf8');
        // Try atomic rename first
        try {
          fs.renameSync(tempPath, this.configPath);
        } catch (renameError) {
          // If rename fails (Windows), use copy + delete
          fs.copyFileSync(tempPath, this.configPath);
          try {
            fs.unlinkSync(tempPath);
          } catch (unlinkError) {
            // Ignore cleanup errors
          }
        }
      } catch (writeError) {
        // Clean up temp file on error
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        throw writeError;
      }
    } catch (error) {
      console.error('Error saving config:', error);
    }
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public getGitHubToken(): string | undefined {
    return this.config.github.token;
  }

  public isPrivateRepo(): boolean {
    return this.config.github.private;
  }

  public getGitHubConfig() {
    return {
      owner: this.config.github.owner,
      repo: this.config.github.repo,
      private: this.config.github.private,
      token: this.config.github.token
    };
  }

  public getAppConfig() {
    return this.config.app;
  }
}

// Export singleton instance
export const secureConfig = new SecureConfig();
