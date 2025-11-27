import React, { useMemo } from 'react';
import type { TranscriptItem } from './TranscriptPanel';

interface SuggestionsPanelProps {
  transcript: TranscriptItem[];
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({ transcript }) => {
  const text = useMemo(() => transcript.map(t => t.text).join(' '), [transcript]);

  const suggestions = useMemo(() => {
    const s: string[] = [];
    if (text.length > 0) {
      // Heuristics similar to Glass-style prompts
      s.push('Summarize the last discussion');
      s.push('List action items');
      s.push('Extract key entities (people, dates, tasks)');
      s.push('Generate follow-up questions');
      s.push('Provide a concise TL;DR');
      if (text.toLowerCase().includes('error') || text.toLowerCase().includes('issue')) {
        s.push('Diagnose the issue and propose fixes');
      }
      if (text.length > 400) {
        s.push('Create a structured outline of the conversation');
      }
    }
    return dedupe(s).slice(0, 8);
  }, [text]);

  return (
    <div className="space-y-3">
      <div className="text-sm text-white/60 mb-2 font-medium">AI Suggestions</div>
      <div className="flex flex-wrap gap-2">
        {suggestions.length === 0 ? (
          <div className="text-sm text-white/40 italic">Suggestions will appear as we hear more...</div>
        ) : (
          suggestions.map((s, idx) => (
            <button
              key={idx}
              className="px-3 py-1.5 rounded-full text-xs bg-white/10 text-white/90 border border-white/20 hover:bg-white/20 hover:border-white/30 transition-all duration-200 cursor-pointer"
              onClick={() => {
                // Emit IPC/event hook here if needed
                console.log('[SuggestionsPanel] Selected:', s);
              }}
            >
              {s}
            </button>
          ))
        )}
      </div>
    </div>
  );
};
