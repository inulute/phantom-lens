import { useEffect, useRef, useState } from "react";

interface PromptInputProps {
  isVisible: boolean;
  onClose: () => void;
  onFollowUp?: boolean;
}

export default function PromptInput({ isVisible, onClose, onFollowUp = false }: PromptInputProps) {
  const [mode, setMode] = useState<"normal"|"stealth">("normal");
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    
    (async () => {
      try {
        const res = await window.electronAPI.getMode();
        if (res?.success && res.data?.mode) setMode(res.data.mode);
      } catch {}
      unsub = window.electronAPI.onModeChanged(({ mode }) => setMode(mode));
    })();
    
    return () => { 
      if (unsub) unsub(); 
    };
  }, []);

  // Focus input when component becomes visible
  useEffect(() => {
    if (isVisible && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isVisible]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // In follow-up mode, allow empty submissions
    if (!onFollowUp && !value.trim()) return;
    
    // Save the prompt (even if empty in follow-up mode)
    await window.electronAPI.setUserPrompt(value.trim());
    
    // In follow-up mode, trigger follow-up processing
    if (onFollowUp) {
      try {
        // Capture a screenshot then process follow-up
        await window.electronAPI.triggerScreenshot();
        await window.electronAPI.processFollowUp();
        // Don't close the input in follow-up mode - let the parent component handle it
        // onClose();
      } catch (error) {
        console.error("Error processing follow-up:", error);
      }
    } else {
      // In normal mode, trigger screenshot and process
      if (mode === "normal") {
        try {
          // Capture a screenshot then process
          await window.electronAPI.triggerScreenshot();
          await window.electronAPI.processScreenshots();
        } catch (error) {
          console.error("Error processing:", error);
        }
      }
      // Close the input only in normal mode
      onClose();
    }
    
    // Clear the value but don't close in follow-up mode
    setValue("");
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Escape key closes the input
    if (e.key === 'Escape') {
      onClose();
      setValue("");
      return;
    }
    
    // Plain Enter submits the form
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onSubmit(e as any);
    }
  };

  // Hide the prompt input completely if not visible
  if (!isVisible) {
    return null;
  }

  return (
    <form 
      onSubmit={onSubmit} 
      data-prompt-input="true"
      className="interactive-element flex items-center gap-3 rounded-xl px-4 py-3 w-[520px] text-white"
      style={{
        background: 'rgba(0, 0, 0, 0.6)',
        outline: '0.5px rgba(255, 255, 255, 0.3) solid',
        outlineOffset: '-1px',
        backdropFilter: 'blur(1px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        fontFamily: "'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}
    >
      {/* Input Icon */}
      <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
           style={{ background: 'rgba(255, 255, 255, 0.2)' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </div>

      {/* Mode Indicator */}
      <div className="flex-shrink-0 px-2 py-1 rounded-full text-xs font-medium"
           style={{
             background: mode === "stealth" ? 'rgba(168, 85, 247, 0.2)' : 'rgba(34, 197, 94, 0.2)',
             color: mode === "stealth" ? 'rgba(168, 85, 247, 1)' : 'rgba(34, 197, 94, 1)',
             border: `1px solid ${mode === "stealth" ? 'rgba(168, 85, 247, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`
           }}>
        {mode}
      </div>

      {/* Input Field */}
      <input
        ref={inputRef}
        type="text"
        className="flex-1 text-sm outline-none border-none"
        style={{
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '20px',
          padding: '10px 14px',
          color: 'white',
          fontFamily: "'Helvetica Neue', sans-serif",
          fontWeight: '400'
        }}
        placeholder={onFollowUp ? "Type a follow-up question (or press Enter to send without text)" : "Type a prompt and press Enter"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          e.target.style.outline = 'none';
        }}
      />

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!onFollowUp && !value.trim()}
        className="flex items-center gap-2 text-sm font-medium rounded transition-all duration-150 flex-shrink-0"
        style={{
          background: (!onFollowUp && !value.trim()) ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          color: (!onFollowUp && !value.trim()) ? 'rgba(255, 255, 255, 0.5)' : 'white',
          border: `1px solid ${(!onFollowUp && !value.trim()) ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.2)'}`,
          padding: '8px 12px',
          cursor: (!onFollowUp && !value.trim()) ? 'not-allowed' : 'pointer',
          fontFamily: "'Helvetica Neue', sans-serif",
          fontWeight: '500'
        }}
        onMouseEnter={(e) => {
          if (onFollowUp || value.trim()) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
          }
        }}
        onMouseLeave={(e) => {
          if (onFollowUp || value.trim()) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
        title={onFollowUp ? "Send follow-up (Enter)" : "Send"}
      >
        <span>{onFollowUp ? "Follow-up" : "Send"}</span>
        <div className="w-4 h-4 rounded flex items-center justify-center text-xs"
             style={{ background: 'rgba(255, 255, 255, 0.1)' }}>
          ↵
        </div>
      </button>

      {/* Close Button */}
      <button 
        type="button"
        onClick={() => {
          onClose();
          setValue("");
        }}
        className="flex items-center justify-center w-5 h-5 rounded-full transition-all duration-150 flex-shrink-0"
        style={{
          background: 'rgba(255, 255, 255, 0.07)',
          outline: '1px rgba(255, 255, 255, 0.3) solid',
          outlineOffset: '-1px',
          backdropFilter: 'blur(0.5px)',
          color: 'white'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.color = 'rgba(255, 255, 255, 1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)';
          e.currentTarget.style.color = 'white';
        }}
        title="Close (Esc)"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* CSS for placeholder styling */}
      <style>{`
        input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }
        input:focus {
          outline: none !important;
        }
      `}</style>
    </form>
  );
}