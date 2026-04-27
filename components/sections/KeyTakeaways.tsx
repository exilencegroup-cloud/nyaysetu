import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Lightbulb, ExternalLink } from 'lucide-react';
import { SourcePoint } from '@/lib/types';

interface KeyTakeawaysProps {
  data?: SourcePoint[];
  onViewSource?: (snippet: string, highlightText: string, hint?: string, pageNumber?: number, paragraphNumber?: number) => void;
}

export function KeyTakeaways({ data, onViewSource }: KeyTakeawaysProps) {
  if (!data || data.length === 0) return null;
  
  return (
    <Card padding="lg">
      <SectionHeader icon={Lightbulb} title="Key Takeaways" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {data.map((takeaway, index) => (
          <div
            key={index}
            className="p-3 sm:p-4 bg-accent/5 border border-accent/20 rounded-lg"
          >
            <p className="text-secondary leading-relaxed text-sm mb-2">{takeaway.text}</p>
            {onViewSource && takeaway.source_snippet && (
              <button
                onClick={() => onViewSource(takeaway.source_snippet, takeaway.text, takeaway.source_hint, takeaway.page_number, takeaway.paragraph_number)}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
              >
                <ExternalLink size={12} />
                View Source
              </button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
