import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { List, ExternalLink } from 'lucide-react';
import { SourcePoint } from '@/lib/types';

interface FactsProps {
  data?: SourcePoint[];
  onViewSource?: (snippet: string, highlightText: string, hint?: string, pageNumber?: number, paragraphNumber?: number) => void;
}

export function Facts({ data, onViewSource }: FactsProps) {
  if (!data || data.length === 0) return null;
  
  return (
    <Card padding="lg">
      <SectionHeader icon={List} title="Facts" />
      <ul className="space-y-3">
        {data.map((fact, index) => (
          <li key={index} className="flex items-start gap-2 sm:gap-3 text-secondary leading-relaxed text-sm">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-sm font-medium flex items-center justify-center mt-0.5">
              {index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="break-words mb-1">{fact.text}</p>
              {onViewSource && fact.source_snippet && (
                <button
                  onClick={() => onViewSource(fact.source_snippet, fact.text, fact.source_hint, fact.page_number, fact.paragraph_number)}
                  className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  <ExternalLink size={12} />
                  View Source
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
