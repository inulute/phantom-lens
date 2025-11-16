import { app, shell } from "electron";
import { secureConfig } from "./config";

interface ReleaseInfo {
  version: string;
  releaseNotes: string;
  releaseUrl: string;
  publishedAt: string;
}

interface UpdateCheckResult {
  hasUpdate: boolean;
  releaseInfo?: ReleaseInfo;
  error?: string;
  currentVersion: string;
  latestVersion: string;
}

class UpdateService {
  private readonly CHECK_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes cache
  private checkTimer: NodeJS.Timeout | null = null;
  private cachedResult: UpdateCheckResult | null = null;
  private lastCheckTime: number = 0;
  private isChecking: boolean = false;
  private pendingCheckPromise: Promise<UpdateCheckResult> | null = null;

  constructor() {
  }

  private getGitHubConfig() {
    const githubConfig = secureConfig.getGitHubConfig();
    return {
      owner: githubConfig.owner,
      repo: githubConfig.repo,
      private: githubConfig.private,
      token: githubConfig.token,
      apiUrl: `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/releases/latest`,
      releasesUrl: `https://github.com/${githubConfig.owner}/${githubConfig.repo}/releases`,
      rawBaseUrl: `https://raw.githubusercontent.com/${githubConfig.owner}/${githubConfig.repo}/main/release_notes`
    };
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    const now = Date.now();
    if (this.cachedResult && (now - this.lastCheckTime) < this.CACHE_DURATION) {
      console.log("[UpdateService] Returning cached update check result");
      return this.cachedResult;
    }

    if (this.isChecking && this.pendingCheckPromise) {
      console.log("[UpdateService] Update check already in progress, returning pending promise");
      return this.pendingCheckPromise;
    }

    this.isChecking = true;
    this.pendingCheckPromise = this.performUpdateCheck();
    
    try {
      const result = await this.pendingCheckPromise;
      this.cachedResult = result;
      this.lastCheckTime = now;
      return result;
    } finally {
      this.isChecking = false;
      this.pendingCheckPromise = null;
    }
  }

  private async performUpdateCheck(): Promise<UpdateCheckResult> {
    try {
      const currentVersion = this.getCurrentVersion();
      
      const latestRelease = await this.fetchLatestRelease();
      
      if (!latestRelease) {
        return { 
          hasUpdate: false, 
          currentVersion,
          latestVersion: currentVersion,
          error: 'Failed to fetch release information' 
        };
      }

      const latestVersion = latestRelease.tag_name?.replace(/^v/, '') || latestRelease.name?.replace(/^v/, '') || '';
      const hasUpdate = this.compareVersions(currentVersion, latestVersion);
      
      if (hasUpdate) {
        const version = latestVersion;
        const releaseNotes = await this.fetchReleaseNotes(version, latestRelease.body || '');
        const githubConfig = this.getGitHubConfig();
        
        return {
          hasUpdate: true,
          currentVersion,
          latestVersion: version,
          releaseInfo: {
            version: version,
            releaseNotes: releaseNotes,
            releaseUrl: "https://ph.inulute.com/dl",
            publishedAt: latestRelease.published_at || new Date().toISOString()
          }
        };
      }

      return { 
        hasUpdate: false,
        currentVersion,
        latestVersion: latestVersion || currentVersion
      };
    } catch (error: any) {
      console.error('Error checking for updates:', error);
      
      if (error.message?.includes('403') || error.message?.includes('rate limit')) {
        console.warn('[UpdateService] GitHub API rate limit exceeded. Consider adding a token or waiting.');
        return {
          hasUpdate: false,
          currentVersion: this.getCurrentVersion(),
          latestVersion: this.getCurrentVersion(),
          error: 'Rate limit exceeded'
        };
      }
      
      return { 
        hasUpdate: false,
        currentVersion: this.getCurrentVersion(),
        latestVersion: this.getCurrentVersion(),
        error: error.message || 'Failed to check for updates' 
      };
    }
  }

  private getCurrentVersion(): string {
    const version = app.getVersion();
    console.log('[UpdateService] Current app version:', version);
    return version || '0.1.0';
  }

  private async fetchLatestRelease(): Promise<any> {
    const githubConfig = this.getGitHubConfig();
    
    try {
      const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'PhantomLens-Updater'
      };
      
      if (githubConfig.token) {
        headers['Authorization'] = `token ${githubConfig.token}`;
      }
      
      const response = await fetch(githubConfig.apiUrl, { headers });

      if (!response.ok) {
        if (response.status === 403) {
          const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
          const rateLimitReset = response.headers.get('x-ratelimit-reset');
          
          console.warn('[UpdateService] GitHub API rate limit exceeded.');
          console.warn(`[UpdateService] Remaining: ${rateLimitRemaining}, Reset: ${rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000).toISOString() : 'unknown'}`);
          
          if (!githubConfig.token) {
            console.warn('[UpdateService] Consider adding a GitHub token to increase rate limits.');
          }
          
          throw new Error('GitHub API rate limit exceeded');
        }
        
        if (response.status === 404) {
          console.warn('[UpdateService] Repository or release not found');
          return null;
        }
        
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('[UpdateService] Error fetching latest release:', error);
      
      if (error.message?.includes('rate limit')) {
        throw error;
      }
      
      throw error;
    }
  }

  private async fetchReleaseNotes(version: string, fallbackNotes: string): Promise<string> {
    try {
      const githubConfig = this.getGitHubConfig();
      const releaseNotesUrl = `${githubConfig.rawBaseUrl}/${version}.md`;
      
      const response = await fetch(releaseNotesUrl, {
        headers: {
          'Accept': 'text/plain',
          'User-Agent': 'PhantomLens-Updater'
        }
      });

      if (response.ok) {
        const releaseNotes = await response.text();
        console.log(`[UpdateService] Successfully fetched release notes from ${releaseNotesUrl}`);
        return releaseNotes;
      } else {
        console.log(`[UpdateService] Release notes file not found at ${releaseNotesUrl}, using GitHub release body as fallback`);
        return fallbackNotes || 'No release notes available';
      }
    } catch (error) {
      console.error('[UpdateService] Error fetching release notes from file:', error);
      console.log('[UpdateService] Using GitHub release body as fallback');
      return fallbackNotes || 'No release notes available';
    }
  }

  private compareVersions(current: string, latest: string): boolean {
    if (!current || !latest) {
      console.warn('[UpdateService] Invalid version strings for comparison:', { current, latest });
      return false;
    }
    
    const currentClean = current.replace(/^v/, '').trim();
    const latestClean = latest.replace(/^v/, '').trim();
    
    const currentParts = currentClean.split('.').map(Number);
    const latestParts = latestClean.split('.').map(Number);
    
    console.log('[UpdateService] Comparing versions:', {
      current: currentClean,
      latest: latestClean,
      currentParts: currentParts,
      latestParts: latestParts
    });
    
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;
      
      if (latestPart > currentPart) {
        console.log(`[UpdateService] Latest version is newer: ${latestPart} > ${currentPart} at position ${i}`);
        return true;
      } else if (latestPart < currentPart) {
        console.log(`[UpdateService] Current version is newer: ${currentPart} > ${latestPart} at position ${i}`);
        return false;
      }
    }
    
    console.log('[UpdateService] Versions are equal');
    return false;
  }

  public startPeriodicCheck(callback?: (result: UpdateCheckResult) => void): void {
    this.checkForUpdates().then(result => {
      if (callback) callback(result);
    });
    
    this.checkTimer = setInterval(() => {
      this.checkForUpdates().then(result => {
        if (callback) callback(result);
      });
    }, this.CHECK_INTERVAL);
    
    console.log(`[UpdateService] Periodic update checks started (every ${this.CHECK_INTERVAL / 1000 / 60 / 60} hours)`);
  }

  public stopPeriodicCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      console.log('[UpdateService] Periodic update checks stopped');
    }
  }

  public async openReleasesPage(url?: string): Promise<void> {
    const releasesUrl = url || 'https://ph.inulute.com/dl';
    
    console.log('[UpdateService] Opening releases page:', releasesUrl);
    
    try {
      await shell.openExternal(releasesUrl);
    } catch (error) {
      console.error('[UpdateService] Error opening releases page:', error);
      throw error;
    }
  }
}

export const updateService = new UpdateService();
export type { ReleaseInfo, UpdateCheckResult };

