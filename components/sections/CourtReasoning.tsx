import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { BrainCircuit, ExternalLink } from 'lucide-react';
import { SourcePoint } from '@/lib/types';

interface CourtReasoningProps {
  data?: SourcePoint[];
  onViewSource?: (snippet: string, highlightText: string, hint?: string) => void;
}

export function CourtReasoning({ data, onViewSource }: CourtReasoningProps) {
  if (!data || data.length === 0) return null;
  
  return (
    <Card padding="lg">
      <SectionHeader icon={BrainCircuit} title="Court Reasoning" />
      <ol className="space-y-3 sm:space-y-4">
        {data.map((reasoning, index) => (
          <li key={index} className="flex items-start gap-3 sm:gap-4 text-secondary leading-relaxed text-sm">
            <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center">
              {index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="break-words mb-1">{reasoning.text}</p>
              {onViewSource && reasoning.source_snippet && (
                <button
                  onClick={() => onViewSource(reasoning.source_snippet, reasoning.text, reasoning.source_hint)}
                  className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  <ExternalLink size={12} />
                  View Source
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
