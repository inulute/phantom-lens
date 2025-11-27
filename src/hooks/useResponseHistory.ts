import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface ResponseHistoryItem {
  id: string;
  response: string;
  timestamp: number;
  type: 'initial' | 'followup';
  screenshots?: string[];
}

export function useResponseHistory() {
  const queryClient = useQueryClient();
  const [history, setHistory] = useState<ResponseHistoryItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Add a response to history
  const addResponse = useCallback((response: string, type: 'initial' | 'followup', screenshots?: string[]) => {
    const newItem: ResponseHistoryItem = {
      id: `${Date.now()}-${Math.random()}`,
      response,
      timestamp: Date.now(),
      type,
      screenshots,
    };

    setHistory(prev => {
      const newHistory = [...prev, newItem];
      // Keep only last 10 responses to prevent memory issues
      if (newHistory.length > 10) {
        return newHistory.slice(-10);
      }
      return newHistory;
    });

    // Set current index to the new item
    setCurrentIndex(prev => {
      const newHistory = history.length < 10 ? history.length : 9;
      return newHistory;
    });
  }, [history.length]);

  // Navigate through history
  const goToPrevious = useCallback(() => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => Math.min(history.length - 1, prev + 1));
  }, [history.length]);

  const goToLatest = useCallback(() => {
    setCurrentIndex(history.length - 1);
  }, [history.length]);

  // Get current response
  const currentResponse = history[currentIndex] || null;
  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < history.length - 1;
  const isLatest = currentIndex === history.length - 1;

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  // Setup keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when the window is focused and we have history
      if (history.length === 0) return;

      // Cmd/Ctrl + Left Arrow: Go to previous response
      if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowLeft' && canGoBack) {
        e.preventDefault();
        goToPrevious();
      }
      
      // Cmd/Ctrl + Right Arrow: Go to next response  
      if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowRight' && canGoForward) {
        e.preventDefault();
        goToNext();
      }

      // Cmd/Ctrl + End: Go to latest response
      if ((e.metaKey || e.ctrlKey) && e.key === 'End' && !isLatest) {
        e.preventDefault();
        goToLatest();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history.length, canGoBack, canGoForward, isLatest, goToPrevious, goToNext, goToLatest]);

  return {
    history,
    currentResponse,
    currentIndex,
    canGoBack,
    canGoForward,
    isLatest,
    addResponse,
    goToPrevious,
    goToNext,
    goToLatest,
    clearHistory,
  };
}