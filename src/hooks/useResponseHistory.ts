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
      if (newHistory.length > 10) {
        return newHistory.slice(-10);
      }
      return newHistory;
    });

    setCurrentIndex(prev => {
      const newHistory = history.length < 10 ? history.length : 9;
      return newHistory;
    });
  }, [history.length]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => Math.min(history.length - 1, prev + 1));
  }, [history.length]);

  const goToLatest = useCallback(() => {
    setCurrentIndex(history.length - 1);
  }, [history.length]);

  const currentResponse = history[currentIndex] || null;
  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < history.length - 1;
  const isLatest = currentIndex === history.length - 1;

  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (history.length === 0) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowLeft' && canGoBack) {
        e.preventDefault();
        goToPrevious();
      }
      
      if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowRight' && canGoForward) {
        e.preventDefault();
        goToNext();
      }

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