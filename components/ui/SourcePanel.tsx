import React, { useEffect } from 'react';
import { X, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SourcePanelProps {
  isOpen: boolean;
  onClose: () => void;
  sourceSnippet: string;
  highlightText?: string;
  sourceHint?: string;
}

export function SourcePanel({ isOpen, onClose, sourceSnippet, highlightText, sourceHint }: SourcePanelProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(sourceSnippet);
  };

  // Highlight the relevant text in the snippet
  const getHighlightedContent = () => {
    if (!highlightText || !sourceSnippet) return sourceSnippet;
    
    // Escape special regex characters in highlightText
    const escapedHighlight = highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedHighlight})`, 'gi');
    
    const parts = sourceSnippet.split(regex);
    return parts.map((part, index) => {
      if (part.toLowerCase() === highlightText.toLowerCase()) {
        return (
          <mark key={index} className="bg-accent/20 px-1 rounded border-b-2 border-accent">
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-40 transition-opacity duration-200"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className={cn(
        'fixed right-0 top-0 h-full w-full sm:w-[35%] md:w-[40%] bg-card shadow-modal z-50',
        'transform transition-transform duration-300 ease-in-out',
        'flex flex-col'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border bg-card">
          <h3 className="text-lg sm:text-xl font-serif font-semibold text-primary">Source Evidence</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-primary/5 rounded-button transition-colors duration-base"
            aria-label="Close"
          >
            <X size={20} className="text-muted hover:text-primary transition-colors" />
          </button>
        </div>

        {/* Source Hint */}
        {sourceHint && (
          <div className="px-4 sm:px-6 py-2 bg-accent/5 border-b border-border">
            <p className="text-xs sm:text-sm text-muted font-medium">{sourceHint}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background">
          <div className="prose prose-sm sm:prose-base max-w-none">
            <p className="text-secondary leading-relaxed whitespace-pre-wrap font-sans">
              {getHighlightedContent()}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-border bg-card">
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 sm:py-3 bg-primary text-white rounded-button font-medium hover:bg-primary-hover transition-colors duration-base shadow-card"
          >
            <Copy size={18} />
            <span className="text-sm sm:text-base">Copy Source</span>
          </button>
        </div>
      </div>
    </>
  );
}
