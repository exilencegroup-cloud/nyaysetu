import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { HelpCircle, ExternalLink } from 'lucide-react';
import { SourcePoint } from '@/lib/types';

interface LegalIssuesProps {
  data?: SourcePoint[];
  onViewSource?: (snippet: string, highlightText: string, hint?: string, pageNumber?: number, paragraphNumber?: number) => void;
}

export function LegalIssues({ data, onViewSource }: LegalIssuesProps) {
  if (!data || data.length === 0) return null;
  
  return (
    <Card padding="lg">
      <SectionHeader icon={HelpCircle} title="Legal Issues" />
      <div className="space-y-3 sm:space-y-4">
        {data.map((issue, index) => (
          <div
            key={index}
            className="p-3 sm:p-4 bg-primary/5 border-l-4 border-accent rounded-r-lg"
          >
            <p className="text-secondary leading-relaxed text-sm mb-2">{issue.text}</p>
            {onViewSource && issue.source_snippet && (
              <button
                onClick={() => onViewSource(issue.source_snippet, issue.text, issue.source_hint, issue.page_number, issue.paragraph_number)}
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
