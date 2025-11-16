import { BackslashIcon, EnterIcon } from "./icons";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings } from "lucide-react";
import phantomlensLogo from "../../assets/icons/phantomlens_logo.svg";

import { COMMAND_KEY } from "../utils/platform";
import Tooltip from "./shared/Tooltip";

interface CommandsProps {
  view: "initial" | "response" | "followup";
  isLoading?: boolean;
  isMinimal?: boolean;
}


const containerVariants = {
  initial: { opacity: 0, scale: 0.95, y: 8 },
  animate: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94]
    }
  }
};

const commandVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.3,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

export default function Commands({
  view,
  isLoading = false,
  isMinimal = false,
}: CommandsProps) {
  const [updateInfo, setUpdateInfo] = useState<{
    updateAvailable: boolean;
    latestVersion: string;
    releaseUrl?: string;
  } | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (isCheckingUpdate) return;
    
    if (updateInfo?.updateAvailable) {
      console.log("[Commands] Update already shown, keeping it visible");
      return;
    }
    
    setIsCheckingUpdate(true);
    try {
      const result = await window.electronAPI?.checkGitHubUpdate();
      if (result?.success && result.data) {
        if (result.data.updateAvailable) {
          setUpdateInfo({
            updateAvailable: true,
            latestVersion: result.data.latestVersion,
            releaseUrl: result.data.releaseUrl || 'https://ph.inulute.com/dl'
          });
        }
      }
    } catch (error) {
      console.error("Error checking for updates:", error);
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [isCheckingUpdate, updateInfo]);

  useEffect(() => {
    const initialTimeout = setTimeout(() => {
      checkForUpdate();
    }, 3000);

    return () => {
      clearTimeout(initialTimeout);
    };
  }, []);

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

  const commands = [
    {
      id: "show-hide",
      label: "Show/Hide",
      keys: [COMMAND_KEY, "\\"],
      show: true,
    },
    {
      id: "scroll",
      label: "Scroll",
      keys: ["Alt", "↑↓"],
      show: true,
    },
    {
      id: "move",
      label: "Move",
      keys: [COMMAND_KEY, "←→↑↓"],
      show: true,
    },
    {
      id: "history",
      label: "History",
      keys: [COMMAND_KEY, "⇧", "↑↓"],
      show: true,
    },
    {
      id: "reset",
      label: "Reset",
      keys: [COMMAND_KEY, "R"],
      show: true,
    },
    {
      id: "settings",
      label: "Settings",
      keys: [COMMAND_KEY, ","],
      show: true,
    },
  ];

  return (
    <div 
      className="select-none"
        style={{
          pointerEvents: 'none',
        }}
    >
      <motion.div
        className={`pt-1.5 commands-container ${isMinimal ? 'minimal-content' : ''}`}
        variants={containerVariants}
        initial="initial"
        animate="animate"
        style={{
          pointerEvents: 'none', // Always pass-through
          width: '100%',
          maxWidth: '100%',
        }}
      >
        <div 
          className={`
            text-xs text-white
            relative overflow-hidden h-[40px] px-[10px] py-[1px]
            flex items-center justify-start gap-[6px]
            transition-all duration-300 ease-out cursor-default select-none
          `}
          style={{
            width: '100%',
            maxWidth: '100%',
            borderRadius: '9000px',
            fontFamily: "'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            pointerEvents: 'none',
          }}
        >
          <div 
            className="absolute inset-0 w-full h-full -z-10"
            style={{
              background: 'rgba(0, 0, 0, 0.65)',
              borderRadius: '9000px',
              backdropFilter: 'blur(40px) saturate(150%)',
              WebkitBackdropFilter: 'blur(40px) saturate(150%)',
            }}
          />
          
          <motion.div 
            className="absolute inset-0 pointer-events-none -z-5"
            style={{
              borderRadius: '9000px',
              padding: '1px',
              background: 'linear-gradient(169deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.12) 50%, rgba(255, 255, 255, 0.25) 100%)',
              WebkitMask: `
                linear-gradient(#fff 0 0) content-box,
                linear-gradient(#fff 0 0)
              `,
              WebkitMaskComposite: 'destination-out',
              maskComposite: 'exclude',
            }}
            animate={{
              background: [
                'linear-gradient(169deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.12) 50%, rgba(255, 255, 255, 0.25) 100%)',
                'linear-gradient(169deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.18) 100%)',
                'linear-gradient(169deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.12) 50%, rgba(255, 255, 255, 0.25) 100%)'
              ]
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          <motion.div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background: `
                linear-gradient(110deg, 
                  transparent 30%, 
                  rgba(255, 255, 255, 0.15) 50%, 
                  transparent 70%
                )
              `,
              borderRadius: '9000px',
            }}
            animate={{
              x: ['-120%', '220%'],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: [0.25, 0.46, 0.45, 0.94],
              repeatDelay: 3,
            }}
          />

          <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
            <img 
              src={phantomlensLogo} 
              alt="PhantomLens" 
              className="w-full h-full object-contain"
            />
          </div>

          <AnimatePresence mode="wait">
            {commands.map((command, index) =>
              command.show ? (
                <motion.div
                  key={command.id}
                  className="
                    h-[24px] px-2 rounded-md flex items-center gap-2.5 cursor-pointer
                    transition-all duration-200 hover:bg-white/12
                  "
                  style={{
                    fontFamily: "'Helvetica Neue', sans-serif",
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                  variants={commandVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  custom={index}
                  whileTap={{ scale: 0.96 }}
                  whileHover={{ scale: 1.02, y: -0.5 }}
                >
                  <span className="text-white whitespace-nowrap">{command.label}</span>
                  <div className="flex gap-0.5">
                    {command.id === "move" ? (
                      <>
                        <motion.div
                          className="
                            w-[16px] h-[16px] rounded-[13%] bg-white/12
                            flex items-center justify-center text-white text-[10px] font-medium
                            transition-all duration-150
                          "
                          style={{
                            fontFamily: "'Helvetica Neue', sans-serif",
                            fontWeight: 500,
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                          }}
                        >
                          {COMMAND_KEY}
                        </motion.div>
                        <motion.div
                          className="
                            w-[14px] h-[14px] rounded-[13%] bg-white/12
                            flex items-center justify-center text-white
                            transition-all duration-150
                          "
                          style={{
                            fontFamily: "'Helvetica Neue', sans-serif",
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                          }}
                        >
                          <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5">
                            <path d="M3 6L9 6M3 6L6 3M3 6L6 9" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </motion.div>
                        <motion.div
                          className="
                            w-[14px] h-[14px] rounded-[13%] bg-white/12
                            flex items-center justify-center text-white
                            transition-all duration-150
                          "
                          style={{
                            fontFamily: "'Helvetica Neue', sans-serif",
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                          }}
                        >
                          <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5">
                            <path d="M9 6L3 6M9 6L6 3M9 6L6 9" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </motion.div>
                        <motion.div
                          className="
                            w-[14px] h-[14px] rounded-[13%] bg-white/12
                            flex items-center justify-center text-white
                            transition-all duration-150
                          "
                          style={{
                            fontFamily: "'Helvetica Neue', sans-serif",
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                          }}
                        >
                          <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5">
                            <path d="M6 3L6 9M6 3L3 6M6 3L9 6" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </motion.div>
                        <motion.div
                          className="
                            w-[14px] h-[14px] rounded-[13%] bg-white/12
                            flex items-center justify-center text-white
                            transition-all duration-150
                          "
                          style={{
                            fontFamily: "'Helvetica Neue', sans-serif",
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                          }}
                        >
                          <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5">
                            <path d="M6 9L6 3M6 9L3 6M6 9L9 6" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </motion.div>
                      </>
                    ) : (
                      command.keys.map((key, keyIndex) => (
                        <motion.div
                        key={keyIndex}
                        className="
                          w-[18px] h-[18px] rounded-[13%] bg-white/12
                          flex items-center justify-center text-white text-xs font-medium
                          transition-all duration-150
                        "
                        style={{
                          fontFamily: "'Helvetica Neue', sans-serif",
                          fontSize: '12px',
                          fontWeight: 500,
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                        }}
                        whileHover={{ 
                          scale: 1.05,
                          backgroundColor: 'rgba(255, 255, 255, 0.18)',
                          y: -1
                        }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {key === "\\" ? (
                          <svg viewBox="0 0 6 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-1.5 h-3">
                            <path d="M1.5 1.3L5.1 10.6" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : key === "⏎" ? (
                          <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3 h-3">
                            <path d="M3 6h6M6 3l3 3-3 3" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : key === "↑" ? (
                          <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3 h-3">
                            <path d="M6 3L6 9M6 3L3 6M6 3L9 6" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : key === "↓" ? (
                          <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3 h-3">
                            <path d="M6 9L6 3M6 9L3 6M6 9L9 6" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : key === "←" ? (
                          <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3 h-3">
                            <path d="M3 6L9 6M3 6L6 3M3 6L6 9" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : key === "→" ? (
                          <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3 h-3">
                            <path d="M9 6L3 6M9 6L6 3M9 6L6 9" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : key === "↑↓" ? (
                          <div className="flex flex-col gap-0.5">
                            <svg viewBox="0 0 12 6" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3 h-1.5">
                              <path d="M6 0L6 4M6 0L3 3M6 0L9 3" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <svg viewBox="0 0 12 6" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3 h-1.5">
                              <path d="M6 6L6 2M6 6L3 3M6 6L9 3" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        ) : key === "←→↑↓" ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex gap-0.5">
                              <svg viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-1.5 h-1.5">
                                <path d="M3 3L0 3M3 3L1.5 1.5M3 3L1.5 4.5" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <svg viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-1.5 h-1.5">
                                <path d="M3 3L6 3M3 3L4.5 1.5M3 3L4.5 4.5" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                            <div className="flex gap-0.5">
                              <svg viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-1.5 h-1.5">
                                <path d="M3 3L3 0M3 3L1.5 1.5M3 3L4.5 1.5" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <svg viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-1.5 h-1.5">
                                <path d="M3 3L3 6M3 3L1.5 4.5M3 3L4.5 4.5" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                          </div>
                        ) : (
                          key
                        )}
                        </motion.div>
                      ))
                    )}
                  </div>
                </motion.div>
              ) : null
            )}
          </AnimatePresence>

          <div 
            className="relative inline-block"
            style={{
              pointerEvents: 'none',
            }}
          >
            <Tooltip
              trigger={
                <Settings className="h-4 w-4 text-white/60 transition-colors" />
              }
              onVisibilityChange={(visible, height) => {
                if (visible && height > 0) {
                  console.log('[Commands] Settings opened, height:', height);
                } else {
                  console.log('[Commands] Settings closed');
                }
              }}
            />
          </div>
        </div>

        <AnimatePresence>
          {updateInfo?.updateAvailable && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="mt-2"
              style={{
                pointerEvents: 'none',
              }}
            >
              <div
                className="
                  text-xs text-white/90
                  relative overflow-hidden
                  px-[10px] py-[6px]
                  flex items-center justify-center gap-2
                  transition-all duration-300 ease-out cursor-default select-none
                "
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  borderRadius: '9000px',
                  fontFamily: "'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  pointerEvents: 'none',
                }}
              >
                <div
                  className="absolute inset-0 w-full h-full -z-10"
                  style={{
                    background: 'rgba(59, 130, 246, 0.4)',
                    borderRadius: '9000px',
                    backdropFilter: 'blur(20px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(150%)',
                  }}
                />
                
                <div
                  className="absolute inset-0 pointer-events-none -z-5"
                  style={{
                    borderRadius: '9000px',
                    padding: '1px',
                    background: 'linear-gradient(169deg, rgba(59, 130, 246, 0.5) 0%, rgba(59, 130, 246, 0.3) 50%, rgba(59, 130, 246, 0.5) 100%)',
                    WebkitMask: `
                      linear-gradient(#fff 0 0) content-box,
                      linear-gradient(#fff 0 0)
                    `,
                    WebkitMaskComposite: 'destination-out',
                    maskComposite: 'exclude',
                  }}
                />

                <span className="text-white/95 font-medium text-sm">
                  Update available: v{updateInfo.latestVersion}
                </span>
                <span className="text-white/80 text-xs font-medium">
                  Download from{' '}
                  <span className="underline font-semibold">ph.inulute.com/dl</span>
                  {' '}(<span className="text-white/70">Ctrl/Cmd + Shift + U</span>)
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </div>
  );
}