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
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
        this.config.github.token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
      }

      if (fs.existsSync(this.configPath)) {
        try {
          const fileContent = fs.readFileSync(this.configPath, 'utf8');
          const fileConfig = JSON.parse(fileContent);
          
          this.config = {
            ...this.config,
            ...fileConfig,
            github: {
              ...this.config.github,
              ...fileConfig.github,
              token: this.config.github.token || fileConfig.github?.token
            }
          };
        } catch (error) {
          console.warn('Error parsing config file, using defaults:', error);
        }
      }

    } catch (error) {
      console.error('Error loading config:', error);
    }
  }

  private saveConfig(): void {
    try {
      let existingConfig: any = {};
      if (fs.existsSync(this.configPath)) {
        try {
          const fileContent = fs.readFileSync(this.configPath, 'utf8');
          existingConfig = JSON.parse(fileContent);
        } catch (error) {
          console.warn('Error reading existing config, will preserve structure:', error);
        }
      }
      
      const configToSave = {
        ...existingConfig,
        ...this.config,
        github: {
          ...this.config.github,
          token: undefined as string | undefined
        }
      };
      
      Object.keys(configToSave).forEach(key => {
        if (configToSave[key] === undefined) {
          delete configToSave[key];
        }
      });
      
      const tempPath = this.configPath + '.tmp.' + Date.now();
      try {
        fs.writeFileSync(tempPath, JSON.stringify(configToSave, null, 2), 'utf8');
        try {
          fs.renameSync(tempPath, this.configPath);
        } catch (renameError) {
          fs.copyFileSync(tempPath, this.configPath);
          try {
            fs.unlinkSync(tempPath);
          } catch (unlinkError) {
          }
        }
      } catch (writeError) {
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        } catch (cleanupError) {
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
