import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

// Hook to track transparency mode
function useTransparencyMode() {
  const [isTransparent, setIsTransparent] = useState(false);

  useEffect(() => {
    const checkTransparency = () => {
      setIsTransparent(document.body.classList.contains('transparent-mode'));
    };

    // Initial check
    checkTransparency();

    // Watch for class changes
    const observer = new MutationObserver(checkTransparency);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  return isTransparent;
}

interface TooltipProps {
  trigger: React.ReactNode;
  onVisibilityChange?: (visible: boolean, height: number) => void;
}

// FIXED: Updated model options to match backend support
const MODEL_OPTIONS = [
  {
    id: "gemini-3-pro-preview",
    name: "Gemini 3 Pro (Preview)",
    description: "Latest Gemini 3 preview model for top-tier reasoning",
    default: true,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Advanced reasoning and capabilities (Google)",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Fast and efficient Gemini model (Google)",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    description: "Latest Gemini 2.0 model (Google)",
  },
];

export default function Tooltip({ trigger, onVisibilityChange }: TooltipProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const defaultModel = MODEL_OPTIONS.find(m => m.default)?.id || "gemini-2.5-flash";
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const modelSelectRef = useRef<HTMLSelectElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const [isInteractive, setIsInteractive] = useState(false);
  const isTransparent = useTransparencyMode();
  // Update state - persist once shown
  const [updateInfo, setUpdateInfo] = useState<{
    updateAvailable: boolean;
    latestVersion: string;
    releaseUrl?: string;
  } | null>(null);
  // Always in stealth mode - no mode variable needed
  const isVisibleRef = useRef(isVisible);
  const isInteractiveRef = useRef(isInteractive);
  
  // Keep refs in sync with state
  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  useEffect(() => {
    isInteractiveRef.current = isInteractive;
  }, [isInteractive]);

  const deactivateInteractiveMode = useCallback(() => {
    setIsInteractive(false);
    isInteractiveRef.current = false;
    try {
      window.electronAPI.enableSafeClickThrough?.();
    } catch (error) {
      console.warn("Failed to enable click-through mode:", error);
    }
  }, []);

  const activateInteractiveMode = useCallback(async () => {
    try {
      await window.electronAPI.setInteractiveMouseEvents?.();
      await window.electronAPI.restoreInteractiveMode?.();
      setIsInteractive(true);
      isInteractiveRef.current = true;
    } catch (error) {
      console.error("Failed to enable interactive mode:", error);
    }
  }, []);

  // Ensure interactive mode is disabled whenever settings are hidden
  useEffect(() => {
    if (!isVisible) {
      deactivateInteractiveMode();
    }
  }, [isVisible, deactivateInteractiveMode]);

  // FIXED: Use glass folder approach - fixed height with internal scrolling
  const TOOLTIP_HEIGHT = 420; // Fixed height for consistent window sizing
  const TOOLTIP_WIDTH = 340; // Increased width for better readability
  const BASE_WINDOW_HEIGHT = 260;

  // Load configuration function - defined before useEffect
  const loadCurrentConfig = useCallback(async () => {
    try {
      console.log("Loading API configuration...");
      // FIXED: Use real API call to get saved configuration
      const response = await window.electronAPI.getApiConfig();
      console.log("API config response:", response);
      if (response?.success) {
        const configData = response.data ?? response;
        if (configData?.apiKey) {
          console.log("Setting API key from config");
          setApiKey(configData.apiKey);
        }
        if (configData?.model) {
          console.log("Setting model from config:", response.data.model);
          setSelectedModel(configData.model);
        }
      } else {
        console.log("No API config found or response unsuccessful:", response);
      }
    } catch (error) {
      console.error("Failed to load API configuration:", error);
      setError("Failed to load configuration");
    }
  }, []);

  useEffect(() => {
    // Load initial configuration only on mount
    loadCurrentConfig();
  }, [loadCurrentConfig]);

  // Load config when settings open to ensure we have the latest saved values
  useEffect(() => {
    if (isVisible) {
      loadCurrentConfig();
    }
  }, [isVisible, loadCurrentConfig]);

  // Listen for open-settings event from main process - toggle visibility
  useEffect(() => {
    const cleanup = window.electronAPI.onOpenSettings(() => {
      console.log("Open settings event received, toggling visibility");
      // Toggle visibility: if visible, close it; if not visible, open it
      setIsVisible(prevVisible => {
        const newVisible = !prevVisible;
        deactivateInteractiveMode();
        
        // Use setTimeout to ensure state update happens and tooltip is rendered before calculating height
        setTimeout(() => {
          if (!newVisible) {
            // Closing settings
            if (onVisibilityChange) {
              window.electronAPI.updateContentDimensions({
                width: 'fixed',
                height: BASE_WINDOW_HEIGHT
              });
              onVisibilityChange(false, 0);
            }
          } else {
            // Opening settings - calculate actual height from rendered tooltip
            // Use longer timeout to ensure all content (including update banner) is rendered
            setTimeout(() => {
              if (onVisibilityChange && tooltipRef.current) {
                // Use actual measured height with more padding
                const measuredHeight = Math.max(
                  tooltipRef.current.offsetHeight,
                  tooltipRef.current.scrollHeight
                );
                const actualHeight = measuredHeight + 30; // Increased padding
                const position = getTooltipPosition();
                // Calculate required window height with more bottom padding
                const requiredHeight = Math.max(position.top + actualHeight + 40, BASE_WINDOW_HEIGHT);
                
                console.log('Settings opening - height calculation:', {
                  offsetHeight: tooltipRef.current.offsetHeight,
                  scrollHeight: tooltipRef.current.scrollHeight,
                  measuredHeight,
                  actualHeight,
                  tooltipTop: position.top,
                  requiredHeight
                });
                
                window.electronAPI.updateContentDimensions({ 
                  width: 'fixed',
                  height: requiredHeight 
                });
                onVisibilityChange(true, actualHeight);
              }
            }, 150); // Increased delay to ensure tooltip is fully rendered
          }
        }, 50); // Initial delay to ensure state update
        
        return newVisible;
      });
    });

    return () => {
      cleanup();
    };
  }, [onVisibilityChange, deactivateInteractiveMode]);

  // Check for updates when settings opens (cached on backend, so safe to check)
  useEffect(() => {
    if (isVisible) {
      // If we already have update info, don't check again (persist it)
      if (updateInfo?.updateAvailable) {
        console.log("[Tooltip] Update already shown, keeping it visible");
        return;
      }
      
      // Small delay to avoid checking during settings animation
      const timeout = setTimeout(() => {
        const checkUpdate = async () => {
          try {
            const result = await window.electronAPI?.checkGitHubUpdate();
            if (result?.success && result.data) {
              if (result.data.updateAvailable) {
                setUpdateInfo({
                  updateAvailable: true,
                  latestVersion: result.data.latestVersion,
                  releaseUrl: result.data.releaseUrl || 'https://ph.inulute.com/dl'
                });
                // Once set, it stays - never clear it
              }
              // Don't set to null if no update - just leave existing state
            }
          } catch (error) {
            console.error("Error checking for updates:", error);
          }
        };
        checkUpdate();
      }, 500);
      
      return () => clearTimeout(timeout);
    }
  }, [isVisible, updateInfo]);

  // Handle download update event
  useEffect(() => {
    const cleanup = window.electronAPI?.onDownloadUpdate?.(async (url) => {
      const downloadUrl = url || updateInfo?.releaseUrl || 'https://ph.inulute.com/dl';
      try {
        await window.electronAPI?.openUpdateDownload?.(downloadUrl);
      } catch (error) {
        console.error("Error opening update download:", error);
      }
    });
    return () => {
      cleanup?.();
    };
  }, [updateInfo]);

  // Save configuration handler
  const handleSaveConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log("Saving API configuration...");
      console.log("API Key length:", apiKey.length);
      console.log("Selected model:", selectedModel);
      
      // FIXED: Use real API call to save configuration
      const response = await window.electronAPI.setApiConfig({
        apiKey: apiKey.trim(),
        model: selectedModel
      });
      
      console.log("API config save response:", response);
      
      if (response?.success) {
        console.log("Configuration saved successfully");
        setError(null);
        // Reload configuration from backend to ensure UI reflects saved values
        await loadCurrentConfig();
      } else {
        console.error("Failed to save configuration:", response?.error);
        setError(response?.error || "Failed to save configuration");
      }
    } catch (err) {
      console.error("Error saving configuration:", err);
      setError("Failed to save configuration");
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, selectedModel, loadCurrentConfig]);

  // Reset scroll position when tooltip opens and auto-focus API key input
  useEffect(() => {
    if (isVisible) {
      // Reset scroll position to top when tooltip opens
      // Use multiple timeouts to ensure it happens after rendering
      const resetScroll = () => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }
      };
      
      // Reset immediately and after a delay to ensure it sticks
      resetScroll();
      setTimeout(resetScroll, 50);
      setTimeout(resetScroll, 150);
      
      // Auto-focus API key input after a small delay
      if (apiKeyInputRef.current) {
        setTimeout(() => {
          // Focus without scrolling (prevent default scroll behavior)
          apiKeyInputRef.current?.focus({ preventScroll: true });
          // Reset scroll again after focus in case it moved
          resetScroll();
        }, 100);
      }
    }
  }, [isVisible]);

  // Intercept scroll events when settings is open and scroll the settings container instead
  useEffect(() => {
    if (!isVisible) return;

    const handleScrollEvent = (data: { delta: number }) => {
      // Try to use the ref first, then fallback to querySelector
      const scrollContainer = scrollContainerRef.current || 
                              tooltipRef.current?.querySelector('.tooltip-scroll') as HTMLElement;

      if (scrollContainer) {
        scrollContainer.scrollBy({ top: data.delta * 1.8, behavior: 'smooth' });
      }
    };

    const cleanup = window.electronAPI.onResponseScroll(handleScrollEvent);

    return () => {
      cleanup();
    };
  }, [isVisible]);

  // App-specific keyboard navigation for settings window (via global shortcuts)
  // Set up listeners once on mount, they'll always be active
  useEffect(() => {
    const cleanupUnlock = window.electronAPI.onSettingsUnlock(async () => {
      console.log("Settings: Unlock shortcut pressed, isVisible:", isVisibleRef.current, "isInteractive:", isInteractiveRef.current);
      if (!isVisibleRef.current) {
        console.log("Settings not visible, ignoring unlock shortcut");
        return;
      }
      if (isInteractiveRef.current) {
        console.log("Settings already interactive, ignoring unlock shortcut");
        return;
      }
      await activateInteractiveMode();
    });

    return () => {
      cleanupUnlock();
    };
  }, [activateInteractiveMode]);

  const handleWrapperMouseEnter = () => {
    // Tooltip disabled in stealth-only mode
    return;
  };

  const handleWrapperMouseLeave = () => {
    // FIXED: Use the new visibility change handler
    handleTooltipVisibilityChange(false);
    setIsVisible(false);
  };

  const handleTooltipContentMouseEnter = () => {
    // Tooltip disabled in stealth-only mode
    return;
  };

  const handleTooltipContentMouseLeave = () => {
    // FIXED: Use the new visibility change handler
    handleTooltipVisibilityChange(false);
    setIsVisible(false);
  };

  // FIXED: Always position below command bar, never above, using portal for height freedom
  const getTooltipPosition = () => {
    if (!wrapperRef.current) return { top: 100, left: 100 };
    
    const wrapperRect = wrapperRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    console.log('Raw wrapper rect:', wrapperRect);
    console.log('Viewport dimensions:', { width: viewportWidth, height: viewportHeight });
    
    // FIXED: Find the command bar container to position tooltip relative to it
    // The settings icon is inside a command bar with height 47px
    const commandBarContainer = wrapperRef.current.closest('.commands-container');
    let referenceRect = wrapperRect;
    
    if (commandBarContainer) {
      const commandBarRect = commandBarContainer.getBoundingClientRect();
      console.log('Command bar rect:', commandBarRect);
      referenceRect = commandBarRect;
    }
    
    // FIXED: ALWAYS place below the command bar - never above
    // Use the bottom of the command bar container as the reference point
    let top = referenceRect.bottom + 20; // Increased spacing to ensure it's clearly below
    
    console.log('Reference rect:', referenceRect);
    console.log('Initial top position (below):', top);
    
    // FIXED: If tooltip would go below viewport, expand the main window instead of cropping
    if (top + TOOLTIP_HEIGHT > viewportHeight - 20) {
      console.log('Tooltip would go below viewport - window expansion will be handled by visibility change');
      // Window expansion is now handled by handleTooltipVisibilityChange
    }
    
    // Calculate left position - center on trigger, but keep within viewport
    let left = wrapperRect.left + (wrapperRect.width / 2) - (TOOLTIP_WIDTH / 2);
    
    // Ensure tooltip stays within viewport bounds
    if (left < 20) left = 20;
    if (left + TOOLTIP_WIDTH > viewportWidth - 20) {
      left = viewportWidth - TOOLTIP_WIDTH - 20;
    }
    
    // Debug positioning
    console.log('Tooltip positioning:', {
      wrapperRect: { top: wrapperRect.top, bottom: wrapperRect.bottom, left: wrapperRect.left, width: wrapperRect.width },
      referenceRect: { top: referenceRect.top, bottom: referenceRect.bottom, left: referenceRect.left, width: referenceRect.width },
      viewport: { width: viewportWidth, height: viewportHeight },
      tooltip: { width: TOOLTIP_WIDTH, height: TOOLTIP_HEIGHT },
      final: { top, left },
      strategy: 'below-only', // Always below
      spacing: top - referenceRect.bottom
    });
    
    return { top, left };
  };

  // FIXED: Use actual measured height like og version - this prevents cropping
  useEffect(() => {
    if (onVisibilityChange) {
      // Use setTimeout to ensure tooltip is fully rendered before measuring
      const timeout = setTimeout(() => {
        let height = 0;
        if (tooltipRef.current && isVisible) {
          // Keep tooltip height constrained to fixed value and rely on scrolling
          const measuredHeight = TOOLTIP_HEIGHT;
          height = measuredHeight + 30; // Padding for breathing room
          
          // Also update window dimensions when tooltip is visible
          const position = getTooltipPosition();
          // Increased bottom padding from 20 to 40 to ensure no cropping
          const requiredHeight = Math.max(position.top + height + 40, BASE_WINDOW_HEIGHT);
          
          console.log('Tooltip height calculation:', {
            offsetHeight: tooltipRef.current.offsetHeight,
            scrollHeight: tooltipRef.current.scrollHeight,
            measuredHeight,
            heightWithPadding: height,
            tooltipTop: position.top,
            requiredHeight,
            currentWindowHeight: window.innerHeight
          });
          
          // Always expand to ensure full visibility (removed the conditional check)
          window.electronAPI.updateContentDimensions({ 
            width: 'fixed',
            height: requiredHeight 
          }).catch(error => {
            console.error('Failed to expand window:', error);
          });
        } else if (!isVisible) {
          // When closing, reset to base height
          window.electronAPI.updateContentDimensions({
            width: 'fixed',
            height: BASE_WINDOW_HEIGHT
          });
        }
        
        onVisibilityChange(isVisible, height);
      }, isVisible ? 150 : 0); // Increased timeout from 100 to 150ms to ensure all content renders
      
      return () => clearTimeout(timeout);
    }
  }, [isVisible, onVisibilityChange]);

  const handleTooltipVisibilityChange = (visible: boolean) => {
    // This function is kept for backward compatibility but the actual height calculation
    // is now done in the useEffect above using actual measured height
    setIsVisible(visible);
  };

  const handleResetConfig = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // FIXED: Clear the configuration using the real API
      await window.electronAPI.setApiConfig({
        apiKey: "",
        model: defaultModel
      });
      
      setApiKey("");
      setSelectedModel(defaultModel);
      console.log("Configuration reset successfully");
    } catch (err) {
      console.error("Error resetting configuration:", err);
      setError("Failed to reset configuration");
    } finally {
      setIsLoading(false);
    }
  };

  // FIXED: Use portal to render tooltip outside of any height constraints
  const tooltipContent = isVisible ? (
          <motion.div
            ref={tooltipRef}
      className="fixed pointer-events-auto tooltip-container"
      style={{
        zIndex: 99999, // FIXED: Very high z-index to ensure it's above everything
        width: `${TOOLTIP_WIDTH}px`,
        height: `${TOOLTIP_HEIGHT}px`,
        maxHeight: `${TOOLTIP_HEIGHT}px`,
        overflow: 'hidden',
        top: `${getTooltipPosition().top}px`,
        left: `${getTooltipPosition().left}px`,
        // FIXED: Ensure tooltip is never constrained by parent containers
        transform: 'none',
        transformOrigin: 'top left',
        // FIXED: Force absolute positioning independent of any parent
        position: 'fixed',
        // FIXED: Ensure tooltip can extend beyond viewport boundaries
        clip: 'auto',
        clipPath: 'none',
      }}
            onMouseEnter={handleTooltipContentMouseEnter}
            onMouseLeave={handleTooltipContentMouseLeave}
            onClick={(e) => e.stopPropagation()}
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* FIXED: Glass folder clean UI - no shadows, minimal styling */}
      <div
        className="h-full text-xs text-white overflow-hidden"
        style={{
          background: isTransparent ? 'transparent' : 'rgba(20, 20, 20, 0.9)',
          borderRadius: '12px',
          outline: isTransparent ? 'none' : '0.5px rgba(255, 255, 255, 0.2) solid',
          outlineOffset: '-1px',
        }}
      >
        {/* FIXED: Scrollable content with fixed height and proper scrolling */}
        <div 
          ref={scrollContainerRef}
          className="tooltip-scroll"
              style={{
            height: `${TOOLTIP_HEIGHT - 60}px`, // Subtract header height
            maxHeight: `${TOOLTIP_HEIGHT - 60}px`,
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: isTransparent 
              ? 'rgba(255, 255, 255, 0.04) rgba(0, 0, 0, 0.02)'
              : 'rgba(255, 255, 255, 0.3) rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="space-y-4 px-4 py-3">
            {/* Header with donation link and made with love message */}
            <div 
              className={`flex items-center justify-center mb-4 pb-3 ${isTransparent ? '' : 'border-b border-white/10'}`}
              style={isTransparent ? { borderBottom: 'none' } : {}}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/70">Made with ❤️ by</span>
                <span className="text-xs text-white font-medium">inulute</span>
              </div>
            </div>

            {/* Support the Project Button */}
            <div className="mb-4">
              <a 
                href="https://support.inulute.com" 
                target="_blank" 
                rel="noopener noreferrer"
                tabIndex={isInteractive ? 0 : -1}
                onClick={async (e) => {
                  if (!isInteractive) {
                    e.preventDefault();
                    return;
                  }
                  e.preventDefault();
                  try {
                    // Use electron API to open external link
                    if (window.electronAPI?.openUpdateDownload) {
                      await window.electronAPI.openUpdateDownload('https://support.inulute.com');
                    } else {
                      // Fallback to default link behavior
                      window.open('https://support.inulute.com', '_blank', 'noopener,noreferrer');
                    }
                  } catch (error) {
                    console.error("Error opening support link:", error);
                    // Fallback to default link behavior
                    window.open('https://support.inulute.com', '_blank', 'noopener,noreferrer');
                  }
                }}
                className={`w-full px-4 py-3 bg-transparent text-white text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${isTransparent ? '' : 'border border-white/30'} ${
                  isInteractive 
                    ? isTransparent ? 'hover:bg-transparent hover:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/20' : 'hover:bg-white/10 hover:border-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20'
                    : 'cursor-default'
                }`}
                style={isTransparent ? { border: 'none' } : {}}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                Support the Project
              </a>
              <div className="mt-2 text-center">
                <a 
                  href="https://support.inulute.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  tabIndex={isInteractive ? 0 : -1}
                  onClick={async (e) => {
                    if (!isInteractive) {
                      e.preventDefault();
                      return;
                    }
                    e.preventDefault();
                    try {
                      if (window.electronAPI?.openUpdateDownload) {
                        await window.electronAPI.openUpdateDownload('https://support.inulute.com');
                      } else {
                        window.open('https://support.inulute.com', '_blank', 'noopener,noreferrer');
                      }
                    } catch (error) {
                      console.error("Error opening support link:", error);
                      window.open('https://support.inulute.com', '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className={`text-xs text-white/60 underline transition-colors ${
                    isInteractive ? 'hover:text-white/80' : 'cursor-default'
                  }`}
                >
                  support.inulute.com
                </a>
              </div>
            </div>

            {/* Dual verification notice */}
            <div
              className={`mb-4 px-4 py-2 rounded-lg text-xs transition-all duration-200 ${
                isTransparent 
                  ? '' 
                  : `border ${isInteractive
                      ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-100"
                      : "bg-blue-500/10 border-blue-500/25 text-blue-100"}`
              }`}
              style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
            >
              {isInteractive ? (
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-300">●</span>
                  <div>
                    <div className="font-medium text-emerald-200 text-[11px] uppercase tracking-wide mb-1">Interactive Mode Active</div>
                    <div className="text-[11px] leading-relaxed text-emerald-100/90">
                      You can now interact with settings using your mouse. Click to adjust values, then press <kbd className={`px-1 py-0.5 rounded text-emerald-50 font-mono ${isTransparent ? '' : 'bg-emerald-500/30 border border-emerald-400/40'}`} style={isTransparent ? { background: 'transparent', border: 'none' } : {}}>Ctrl + ,</kbd> to close settings and return to stealth mode.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-blue-300">●</span>
                  <div>
                    <div className="font-medium text-blue-200 text-[11px] uppercase tracking-wide mb-1">Click Protection Active</div>
                    <div className="text-[11px] leading-relaxed text-blue-100/90">
                      Mouse clicks are disabled to prevent accidental interactions. Use keyboard shortcuts to navigate, or press <kbd className={`px-1 py-0.5 rounded text-blue-50 font-mono ${isTransparent ? '' : 'bg-blue-500/30 border border-blue-400/40'}`} style={isTransparent ? { background: 'transparent', border: 'none' } : {}}>Ctrl + Shift + ,</kbd> to enable mouse input temporarily.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Update Available Notification */}
            {updateInfo?.updateAvailable && (
              <div className="mb-4">
                <div 
                  className={`rounded-lg px-4 py-3 ${isTransparent ? '' : 'bg-blue-500/15 border border-blue-400/30'}`}
                  style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-blue-300">●</span>
                    <div className="flex-1">
                      <div className="font-medium text-blue-200 text-[11px] uppercase tracking-wide mb-1">Update Available</div>
                      <div className="text-xs leading-relaxed text-blue-100/90 mb-2">
                        Version <span className="font-semibold">{updateInfo.latestVersion}</span> is now available. Download from{' '}
                        <span className="underline font-semibold text-sm">ph.inulute.com/dl</span>
                      </div>
                      <button
                        onClick={async () => {
                          if (!isInteractive) return;
                          const downloadUrl = updateInfo.releaseUrl || 'https://ph.inulute.com/dl';
                          try {
                            await window.electronAPI?.openUpdateDownload?.(downloadUrl);
                          } catch (error) {
                            console.error("Error opening update download:", error);
                          }
                        }}
                        disabled={!isInteractive}
                        tabIndex={isInteractive ? 0 : -1}
                        className={`w-full px-4 py-2 text-blue-100 text-xs font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${isTransparent ? '' : 'bg-blue-500/20 border border-blue-400/40'} ${
                          isInteractive 
                            ? isTransparent ? 'hover:bg-transparent hover:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/20' : 'hover:bg-blue-500/30 hover:border-blue-400/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20'
                            : 'cursor-default'
                        }`}
                        style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Update (Ctrl/Cmd + Shift + U)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* API Configuration */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-white mb-2 text-center">API Configuration</h3>
              <div className="space-y-3">
                  <div>
                  <label className="block text-xs text-white/70 mb-1 text-center">Gemini API Key</label>
                  <input
                      ref={apiKeyInputRef}
                      type="password"
                      value={apiKey}
                    onChange={(e) => {
                      if (!isInteractive) return;
                      setApiKey(e.target.value);
                    }}
                    disabled={!isInteractive}
                    tabIndex={isInteractive ? 0 : -1}
                    placeholder="AIza..."
                    className={`w-full px-4 py-2 rounded-lg text-white text-sm placeholder-white/50 transition-all duration-200 ${isTransparent ? '' : 'bg-white/10 border border-white/20'} ${
                      isInteractive 
                        ? 'focus:outline-none focus:ring-2 focus:ring-blue-500/20' 
                        : 'cursor-default'
                    }`}
                    style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                    />
                  </div>
                  <div>
                  <label className="block text-xs text-white/70 mb-1 text-center">Model</label>
                  <select
                      ref={modelSelectRef}
                      value={selectedModel}
                    onChange={(e) => {
                      if (!isInteractive) return;
                      setSelectedModel(e.target.value);
                    }}
                    disabled={!isInteractive}
                    tabIndex={isInteractive ? 0 : -1}
                    className={`w-full px-4 py-2 rounded-lg text-white text-sm transition-all duration-200 ${isTransparent ? '' : 'bg-white/10 border border-white/20'} ${
                      isInteractive 
                        ? 'focus:outline-none focus:ring-2 focus:ring-blue-500/20' 
                        : 'cursor-default'
                    }`}
                    style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                    >
                          {MODEL_OPTIONS.map((model, index) => (
                      <option key={model.id} value={model.id} className="bg-gray-800 text-white">
                                  {index + 1}. {model.name}
                      </option>
                    ))}
                  </select>
                        </div>
                <button
                  ref={saveButtonRef}
                  onClick={handleSaveConfig}
                  disabled={isLoading || !isInteractive}
                  tabIndex={isInteractive ? 0 : -1}
                  className={`w-full px-4 py-2 bg-transparent text-white text-sm font-medium rounded-lg transition-all duration-200 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isTransparent ? '' : 'border border-white/30 disabled:bg-white/5 disabled:border-white/20'} ${
                    isInteractive 
                      ? isTransparent ? 'hover:bg-transparent hover:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/20' : 'hover:bg-white/10 hover:border-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20'
                      : 'cursor-default'
                  }`}
                  style={isTransparent ? { border: 'none' } : {}}
                    >
                      {isLoading ? (
                        <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                          Saving...
                        </>
                      ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save Configuration
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Comprehensive Shortcuts Section */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-white mb-3 text-center">Keyboard Shortcuts</h3>
              <div 
                className={`space-y-2 text-xs rounded-lg px-4 py-3 ${isTransparent ? '' : 'bg-white/5 border border-white/10'}`}
                style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
              >
                <div className="flex justify-between items-center py-1">
                  <span className="text-white/80">Show/Hide Window</span>
                  <kbd 
                    className={`px-2 py-1 rounded-md text-white/90 font-mono text-xs ${isTransparent ? '' : 'bg-white/20 border border-white/30'}`}
                    style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                  >Ctrl + \</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-white/80">Toggle Settings</span>
                  <kbd 
                    className={`px-2 py-1 rounded-md text-white/90 font-mono text-xs ${isTransparent ? '' : 'bg-white/20 border border-white/30'}`}
                    style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                  >Ctrl + ,</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-white/80">Ask AI / Send Query</span>
                  <kbd 
                    className={`px-2 py-1 rounded-md text-white/90 font-mono text-xs ${isTransparent ? '' : 'bg-white/20 border border-white/30'}`}
                    style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                  >Ctrl + Enter</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-white/80">Move Window</span>
                  <kbd 
                    className={`px-2 py-1 rounded-md text-white/90 font-mono text-xs ${isTransparent ? '' : 'bg-white/20 border border-white/30'}`}
                    style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                  >Ctrl + Shift + ←→↑↓</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-white/80">Scroll Response</span>
                  <kbd 
                    className={`px-2 py-1 rounded-md text-white/90 font-mono text-xs ${isTransparent ? '' : 'bg-white/20 border border-white/30'}`}
                    style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                  >Ctrl + ↑↓</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-white/80">Reset / Cancel</span>
                  <kbd 
                    className={`px-2 py-1 rounded-md text-white/90 font-mono text-xs ${isTransparent ? '' : 'bg-white/20 border border-white/30'}`}
                    style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                  >Ctrl + R</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-white/80">Toggle Mode</span>
                  <kbd 
                    className={`px-2 py-1 rounded-md text-white/90 font-mono text-xs ${isTransparent ? '' : 'bg-white/20 border border-white/30'}`}
                    style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                  >Ctrl + Shift + M</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-white/80">History Navigation</span>
                  <kbd 
                    className={`px-2 py-1 rounded-md text-white/90 font-mono text-xs ${isTransparent ? '' : 'bg-white/20 border border-white/30'}`}
                    style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                  >Alt + ↑↓</kbd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-white/80">Quit Application</span>
                  <kbd 
                    className={`px-2 py-1 rounded-md text-white/90 font-mono text-xs ${isTransparent ? '' : 'bg-white/20 border border-white/30'}`}
                    style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                  >Ctrl + Q</kbd>
                </div>
              </div>
            </div>

            {/* Settings Shortcut */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-white mb-3 text-center">Settings Shortcut</h3>
              <div 
                className={`space-y-2 text-xs rounded-lg px-4 py-3 ${isTransparent ? '' : 'bg-blue-500/10 border border-blue-500/20'}`}
                style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
              >
                <div className="flex justify-between items-center py-1">
                  <span className="text-white/80">Scroll Settings</span>
                  <kbd 
                    className={`px-2 py-1 rounded-md text-white/90 font-mono text-xs ${isTransparent ? '' : 'bg-blue-500/20 border border-blue-500/30'}`}
                    style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                  >Ctrl + ↑↓</kbd>
                </div>
              </div>
            </div>

            {/* Emergency Recovery Section */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-white mb-3 text-center">Emergency Recovery</h3>
              <div 
                className={`rounded-lg px-4 py-3 ${isTransparent ? '' : 'bg-orange-500/10 border border-orange-500/20'}`}
                style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
              >
                <div className="text-xs text-orange-300 mb-2 leading-relaxed">
                  If the window becomes unresponsive, invisible, or stuck:
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/80 text-xs">Force Show Window</span>
                  <kbd 
                    className={`px-2 py-1 rounded-md text-orange-200 font-mono text-xs ${isTransparent ? '' : 'bg-orange-500/20 border border-orange-500/30'}`}
                    style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                  >Ctrl + Shift + R</kbd>
                </div>
                <div className="mt-2 text-[11px] text-orange-200/80 leading-relaxed">
                  This will restore the window to a visible and usable state.
                </div>
              </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
  ) : null;

  return (
    <div
      ref={wrapperRef}
      data-tooltip="true"
      className="relative inline-block"
      style={{ pointerEvents: 'none' }}
    >
      <div 
        className={`w-4 h-4 flex items-center justify-center transition-all duration-200 ${
          isVisible ? 'text-white bg-white/20 rounded' : 'text-white/60'
        }`}
        style={{ pointerEvents: 'none', cursor: 'default' }}
      >
        {trigger}
      </div>

      {/* FIXED: Use portal to render tooltip outside of any height constraints */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {tooltipContent}
        </AnimatePresence>,
        document.body
      )}
      
      {/* FIXED: Click-through overlay to make background non-interactive when tooltip is open */}
      {isVisible && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 99998, // Just below tooltip
            pointerEvents: 'none', // Click-through by default
          }}
        >
          {/* FIXED: Interactive zones for essential elements */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '47px', // Command bar height
              pointerEvents: 'auto', // Keep command bar interactive
              zIndex: 1,
            }}
          />
          
          {/* FIXED: Interactive zone for tooltip area */}
          <div
            style={{
              position: 'absolute',
              top: getTooltipPosition().top - 10,
              left: getTooltipPosition().left - 10,
              width: TOOLTIP_WIDTH + 20,
              height: TOOLTIP_HEIGHT + 20,
              pointerEvents: 'auto', // Keep tooltip interactive
              zIndex: 1,
            }}
          />
          
          {/* FIXED: Clickable background to close tooltip */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'auto', // Make background clickable
              zIndex: 0,
            }}
            onClick={() => handleTooltipVisibilityChange(false)}
          />
        </div>,
        document.body
      )}
    </div>
  );
}