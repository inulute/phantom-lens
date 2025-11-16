import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";

import Commands from "@/components/Commands";
import { MarkdownSection } from "@/components/shared/MarkdownSection";
import { Screenshot } from "@/types/screenshots";
import { fetchScreenshots } from "@/utils/screenshots";
import phantomlensLogo from "../../../assets/icons/phantomlens_logo.svg";

interface TaskResponseData {
  response: string;
  isFollowUp?: boolean;
}

export interface ResponseProps {
  setView: (view: "initial" | "response" | "followup") => void;
}

const RESPONSE_WIDTH = 832;

const commandsVariants = {
  hidden: { 
    opacity: 0, 
    y: -10 
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.3,
      ease: "easeOut"
    }
  }
};

export default function Response({ setView }: ResponseProps) {
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);
  const [responseData, setResponseData] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [isFollowUpResponse, setIsFollowUpResponse] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedResponse, setStreamedResponse] = useState<string>("");

  const isStreamingRef = useRef(false);
  const streamedResponseRef = useRef("");

  useEffect(() => {
    isStreamingRef.current = isStreaming;
    streamedResponseRef.current = streamedResponse;
  }, [isStreaming, streamedResponse]);

  const chunkUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChunkRef = useRef<string | null>(null);

  const handleChunkUpdate = useCallback((data: { response: string } | string) => {
    const chunk = typeof data === "string" ? data : data?.response || "";
    pendingChunkRef.current = chunk;
    
    if (chunkUpdateTimeoutRef.current) {
      return;
    }

    chunkUpdateTimeoutRef.current = setTimeout(() => {
      if (pendingChunkRef.current !== null) {
        setStreamedResponse(pendingChunkRef.current);
        setIsStreaming(true);
        pendingChunkRef.current = null;
      }
      chunkUpdateTimeoutRef.current = null;
    }, 50);
  }, []);

  const updateResponseData = useCallback((responseText: string) => {
    setErrorMessage(null);
    setResponseData(responseText);
    setIsStreaming(false);
    setStreamedResponse("");
    if (chunkUpdateTimeoutRef.current) {
      clearTimeout(chunkUpdateTimeoutRef.current);
      chunkUpdateTimeoutRef.current = null;
    }
    pendingChunkRef.current = null;
  }, []);

  const handleCopy = async () => {
    if (copyState === 'copied' || !responseData) return;

    try {
      await navigator.clipboard.writeText(responseData);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleClose = () => {
    window.electronAPI.clearFixedResponseWidth?.().catch((error: any) => {
      console.warn("Failed to clear fixed response width:", error);
    });
    setView("initial");
  };

  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(async () => {
        try {
          await fetchScreenshots();
        } catch (error) {
          console.error("Error loading extra screenshots:", error);
        }
      }),
      window.electronAPI.onResetView(() => {
        setIsResetting(true);
        queryClient.removeQueries({ queryKey: ["task_response"] });
        queryClient.removeQueries({ queryKey: ["new_response"] });
        setResponseData(null);
        setErrorMessage(null);
        setIsFollowUpResponse(false);
        setIsStreaming(false);
        setStreamedResponse("");
        if (chunkUpdateTimeoutRef.current) {
          clearTimeout(chunkUpdateTimeoutRef.current);
          chunkUpdateTimeoutRef.current = null;
        }
        pendingChunkRef.current = null;
        setTimeout(() => setIsResetting(false), 0);
      }),
      window.electronAPI.onResponseStart(() => {
        setResponseData(null);
        setErrorMessage(null);
        setIsFollowUpResponse(false);
        setIsStreaming(false);
        setStreamedResponse("");
        if (chunkUpdateTimeoutRef.current) {
          clearTimeout(chunkUpdateTimeoutRef.current);
          chunkUpdateTimeoutRef.current = null;
        }
        pendingChunkRef.current = null;
      }),
      window.electronAPI.onResponseError((error: string) => {
        const cachedResponse = queryClient.getQueryData<TaskResponseData>([
          "task_response",
        ]);
        setErrorMessage(
          error ||
            "We ran into an issue while generating the response. Please try again."
        );
        if (cachedResponse?.response) {
          updateResponseData(cachedResponse.response);
        } else {
          setResponseData(null);
          queryClient.removeQueries({ queryKey: ["task_response"] });
        }
        console.error("Processing error:", error);
      }),
      window.electronAPI.onResponseChunk((chunk: string) => {
        handleChunkUpdate(chunk);
      }),
      window.electronAPI.onResponseSuccess((rawData: any) => {
        if (chunkUpdateTimeoutRef.current) {
          clearTimeout(chunkUpdateTimeoutRef.current);
          chunkUpdateTimeoutRef.current = null;
        }

        const responseText =
          typeof rawData === "string" ? rawData : rawData?.response || "";
        setErrorMessage(null);
        const cachedResponse = queryClient.getQueryData<TaskResponseData>(["task_response"]);
        const isFollowUp = cachedResponse?.isFollowUp || false;
        setIsFollowUpResponse(isFollowUp);
        
        const currentStreaming = isStreamingRef.current;
        const currentStreamed = streamedResponseRef.current;
        const finalResponse = currentStreaming && currentStreamed ? currentStreamed : responseText;
        queryClient.setQueryData(["task_response"], { response: finalResponse, isFollowUp });
        updateResponseData(finalResponse);
      }),
      window.electronAPI.onHistoryLoad(({ content }) => {
        updateResponseData(content || "");
      }),
      window.electronAPI.onResponseScroll(({ delta }) => {
        try {
          const container = document.getElementById('responseContainer');
          if (container) container.scrollBy({ top: delta, behavior: 'smooth' });
        } catch {}
      }),
      window.electronAPI.onCodeBlockScroll(({ delta }) => {
        try {
          const container = document.getElementById('responseContainer');
          if (!container) return;
          
          const allPreElements = Array.from(
            container.querySelectorAll('pre')
          ) as HTMLElement[];
          
          if (allPreElements.length === 0) return;
          
          let targetScrollableElement: HTMLElement | null = null;
          let maxVisibleArea = 0;
          const containerRect = container.getBoundingClientRect();
          
          allPreElements.forEach((preElement) => {
            const rect = preElement.getBoundingClientRect();
            
            if (rect.top < containerRect.bottom && rect.bottom > containerRect.top) {
              const visibleTop = Math.max(rect.top, containerRect.top);
              const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
              const visibleArea = visibleBottom - visibleTop;
              
              let scrollableElement: HTMLElement | null = null;
              
              const preStyle = window.getComputedStyle(preElement);
              if (preElement.scrollWidth > preElement.clientWidth && 
                  (preStyle.overflowX === 'auto' || preStyle.overflowX === 'scroll' || 
                   preElement.classList.contains('overflow-x-auto'))) {
                scrollableElement = preElement;
              } else {
                const children = Array.from(preElement.children) as HTMLElement[];
                for (const child of children) {
                  const childStyle = window.getComputedStyle(child);
                  if (child.scrollWidth > child.clientWidth && 
                      (childStyle.overflowX === 'auto' || childStyle.overflowX === 'scroll')) {
                    scrollableElement = child;
                    break;
                  }
                }
              }
              
              if (scrollableElement && visibleArea > maxVisibleArea) {
                maxVisibleArea = visibleArea;
                targetScrollableElement = scrollableElement;
              }
            }
          });
          
          if (targetScrollableElement) {
            const element = targetScrollableElement as HTMLElement;
            const currentScroll = element.scrollLeft;
            const maxScroll = element.scrollWidth - element.clientWidth;
            
            if ((delta < 0 && currentScroll > 0) || (delta > 0 && currentScroll < maxScroll)) {
              element.scrollBy({ left: delta, behavior: 'smooth' });
            }
          }
        } catch (error) {
          console.error('[CodeBlockScroll] Error:', error);
        }
      }),
      window.electronAPI.onFollowUpStart(() => {
        setIsStreaming(false);
        setStreamedResponse("");
        setResponseData(null);
        setErrorMessage(null);
        setIsFollowUpResponse(true);
        if (chunkUpdateTimeoutRef.current) {
          clearTimeout(chunkUpdateTimeoutRef.current);
          chunkUpdateTimeoutRef.current = null;
        }
        pendingChunkRef.current = null;
        queryClient.setQueryData(["followup_response"], null);
      }),
      window.electronAPI.onFollowUpChunk(handleChunkUpdate),
      window.electronAPI.onFollowUpSuccess((rawData: any) => {
        if (chunkUpdateTimeoutRef.current) {
          clearTimeout(chunkUpdateTimeoutRef.current);
          chunkUpdateTimeoutRef.current = null;
        }

        const responseText =
          typeof rawData === "string" ? rawData : rawData?.response || "";
        
        const currentStreaming = isStreamingRef.current;
        const currentStreamed = streamedResponseRef.current;
        const finalResponse = currentStreaming && currentStreamed ? currentStreamed : responseText;
        
        setErrorMessage(null);
        queryClient.setQueryData(["followup_response"], { response: finalResponse });
        queryClient.setQueryData(["task_response"], {
          response: finalResponse,
          isFollowUp: true,
        });
        setIsFollowUpResponse(true);
        updateResponseData(finalResponse);
      }),
      window.electronAPI.onFollowUpError((error: string) => {
        console.error("[Response] Follow up error:", error);
        setIsStreaming(false);
        setStreamedResponse("");
        if (chunkUpdateTimeoutRef.current) {
          clearTimeout(chunkUpdateTimeoutRef.current);
          chunkUpdateTimeoutRef.current = null;
        }
        pendingChunkRef.current = null;
      }),
    ];

    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup());
      if (chunkUpdateTimeoutRef.current) {
        clearTimeout(chunkUpdateTimeoutRef.current);
      }
    };
  }, [queryClient, updateResponseData, handleChunkUpdate]);

  useEffect(() => {
    const cachedResponse = queryClient.getQueryData<TaskResponseData>(["task_response"]);
    if (cachedResponse?.response) {
      setIsFollowUpResponse(cachedResponse.isFollowUp || false);
      updateResponseData(cachedResponse.response);
    }
  }, [queryClient, updateResponseData]);

  const displayContent = isStreaming ? streamedResponse : responseData;
  const isLoading = !displayContent && !errorMessage && !isStreaming;
  const hasResponse =
    Boolean(displayContent) || isLoading || Boolean(errorMessage);
  const normalizedError = errorMessage?.toLowerCase() ?? "";
  const isRateLimitError =
    normalizedError.includes("429") ||
    normalizedError.includes("resource exhausted") ||
    normalizedError.includes("too many requests");

  return (
    <div 
      ref={contentRef} 
      className="relative space-y-2 px-6 py-3 mx-auto flex flex-col items-center"
      style={{
        maxWidth: `${RESPONSE_WIDTH}px`,
        width: "100%"
      }}
    >
          <motion.div 
            className="commands-container flex-shrink-0 w-full"
            style={{ 
              background: hasResponse ? 'transparent' : 'rgba(0, 0, 0, 0.3)',
              backdropFilter: hasResponse ? 'none' : 'blur(5px)',
              borderRadius: '12px',
              border: hasResponse ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
              zIndex: 1000,
              position: 'relative',
              marginBottom: '6px',
              maxWidth: `${RESPONSE_WIDTH}px`,
              width: '100%',
              pointerEvents: 'none',
            }}
            variants={commandsVariants}
          >
            <Commands
              view="response"
              isLoading={isLoading}
              isMinimal={false}
            />
          </motion.div>

          <div 
            className={`flex flex-col w-full rounded-3xl overflow-hidden relative ${!hasResponse ? 'hidden' : ''}`}
            style={{
              background: 'rgba(10, 10, 12, 0.78)',
              backdropFilter: 'blur(10px)',
              borderRadius: '24px',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              maxWidth: `${RESPONSE_WIDTH}px`,
              width: '100%'
            }}
          >
            
            <div className="flex justify-between items-center px-4 py-3 flex-shrink-0"
                 style={{ 
                   background: 'transparent'
                 }}>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                  <img
                    src={phantomlensLogo}
                    alt="PhantomLens"
                    className="w-8 h-8"
                  />
                </div>
                <span className="text-sm font-medium whitespace-nowrap text-white" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                  {errorMessage
                    ? isRateLimitError
                      ? "Rate limit reached"
                      : "Response failed"
                    : isLoading
                    ? (isFollowUpResponse ? "Processing Follow-up..." : "Thinking...")
                    : (isFollowUpResponse ? "Follow-up Response" : "AI Response")}
                </span>
              </div>

              {!isLoading && !errorMessage && displayContent && (
              <div className="flex items-center gap-2 flex-shrink-0">
                  <span 
                    className="text-xs font-medium px-2 py-1 rounded-full"
                  style={{
                    background: isFollowUpResponse 
                      ? 'rgba(147, 51, 234, 0.2)' 
                      : 'rgba(59, 130, 246, 0.2)',
                    color: isFollowUpResponse 
                      ? 'rgba(196, 181, 253, 0.9)' 
                      : 'rgba(147, 197, 253, 0.9)',
                    border: `1px solid ${isFollowUpResponse 
                      ? 'rgba(147, 51, 234, 0.3)' 
                      : 'rgba(59, 130, 246, 0.3)'}`
                  }}
                  >
                    {isFollowUpResponse ? 'Follow-up' : 'Initial'}
                  </span>
              </div>
              )}
            </div>
            
            <div 
              id="responseContainer" 
              className="overflow-y-auto text-sm leading-relaxed max-h-96 select-text"
              style={{ 
                background: 'transparent',
                padding: '16px 16px 16px 48px',
                color: 'white'
              }}>
              
              {isLoading ? (
                <div className="flex items-center justify-center gap-1.5 py-10">
                  <div className="w-2 h-2 rounded-full animate-pulse" 
                       style={{ 
                         background: 'rgba(255, 255, 255, 0.6)',
                         animationDelay: '0s',
                         animationDuration: '1.5s'
                       }}></div>
                  <div className="w-2 h-2 rounded-full animate-pulse" 
                       style={{ 
                         background: 'rgba(255, 255, 255, 0.6)',
                         animationDelay: '0.2s',
                         animationDuration: '1.5s'
                       }}></div>
                  <div className="w-2 h-2 rounded-full animate-pulse" 
                       style={{ 
                         background: 'rgba(255, 255, 255, 0.6)',
                         animationDelay: '0.4s',
                         animationDuration: '1.5s'
                       }}></div>
                </div>
              ) : errorMessage ? (
                <div className="flex flex-col gap-4 py-6 pr-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {isRateLimitError
                        ? "We're hitting the Gemini rate limit"
                        : "We couldn't finish this response"}
                    </h3>
                    <p className="mt-2 text-sm text-white/70 max-w-2xl">
                      {isRateLimitError
                        ? "Gemini returned a 429 (Too Many Requests). Please wait a few seconds and try again. If this keeps happening, give the service a short break."
                        : "Something went wrong while generating the answer. Please try again in a moment."}
                    </p>
                  </div>
                  <div className="text-xs text-white/50 bg-white/5 border border-white/10 rounded-xl px-4 py-3 max-w-2xl leading-relaxed">
                    <span className="font-medium text-white/70">Details:</span>{" "}
                    <span>{errorMessage}</span>
                  </div>
                </div>
              ) : (
                <MarkdownSection
                  content={displayContent || ""}
                  isLoading={isLoading}
                />
              )}
            </div>
          </div>
    </div>
  );
}