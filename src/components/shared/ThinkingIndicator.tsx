import React from 'react';

interface ThinkingIndicatorProps {
  size?: 'sm' | 'md' | 'lg';
}

export default function ThinkingIndicator({ size = 'md' }: ThinkingIndicatorProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-3 p-6">
      <div className={`${sizeClasses[size]} flex items-center justify-center`}>
        <div className="relative">
          <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
            <div className="w-3/4 h-3/4 bg-white/20 rounded-full flex items-center justify-center">
              <div className="w-1/2 h-1/2 bg-white/30 rounded-full"></div>
            </div>
          </div>
          
          <div className="absolute inset-0 animate-spin">
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white/60 rounded-full"></div>
            <div className="absolute top-1/4 right-0 transform translate-x-1/2 w-1 h-1 bg-white/40 rounded-full"></div>
            <div className="absolute bottom-1/4 right-0 transform translate-x-1/2 w-1 h-1 bg-white/40 rounded-full"></div>
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white/60 rounded-full"></div>
            <div className="absolute bottom-1/4 left-0 transform -translate-x-1/2 w-1 h-1 bg-white/40 rounded-full"></div>
            <div className="absolute top-1/4 left-0 transform -translate-x-1/2 w-1 h-1 bg-white/40 rounded-full"></div>
          </div>
        </div>
      </div>
      
      <div className={`${textSizes[size]} text-white/80 font-medium tracking-wide`}>
        thinking...
      </div>
      
      <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full animate-pulse"></div>
    </div>
  );
}
