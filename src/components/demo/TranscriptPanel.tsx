import React from 'react';

export interface TranscriptItem {
  id: string;
  speaker: 'Me' | 'Them' | 'System';
  text: string;
  timestamp: number;
}

interface TranscriptPanelProps {
  partial: string;
  items: TranscriptItem[];
}

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ partial, items }) => {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className={`flex ${item.speaker === 'Me' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
              item.speaker === 'Me'
                ? 'bg-blue-500 text-white rounded-br-md'
                : item.speaker === 'Them'
                ? 'bg-white/10 text-white rounded-bl-md'
                : 'bg-yellow-500/20 text-yellow-200 rounded-md'
            }`}
          >
            <div className="text-xs opacity-70 mb-1 font-medium">
              {item.speaker}
            </div>
            <div className="break-words">{item.text}</div>
          </div>
        </div>
      ))}
      
      {partial && (
        <div className="flex justify-end">
          <div className="max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed bg-blue-500/50 text-white rounded-br-md border border-blue-400/30">
            <div className="text-xs opacity-70 mb-1 font-medium">Me (typing...)</div>
            <div className="break-words">{partial}</div>
          </div>
        </div>
      )}
      
      {items.length === 0 && !partial && (
        <div className="text-center py-8 text-white/40 text-sm italic">
          Start speaking to see live transcription...
        </div>
      )}
    </div>
  );
};
