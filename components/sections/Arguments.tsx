import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MessageSquare, ExternalLink } from 'lucide-react';
import { SourcePoint } from '@/lib/types';

interface ArgumentsProps {
  data?: {
    petitioner?: SourcePoint[];
    respondent?: SourcePoint[];
  };
  onViewSource?: (snippet: string, highlightText: string, hint?: string, pageNumber?: number, paragraphNumber?: number) => void;
}

export function Arguments({ data, onViewSource }: ArgumentsProps) {
  if (!data) return null;
  
  return (
    <Card padding="lg">
      <SectionHeader icon={MessageSquare} title="Arguments" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {data.petitioner && data.petitioner.length > 0 && (
          <div>
            <h4 className="text-xs sm:text-sm font-semibold text-petitioner uppercase tracking-wide mb-3 sm:mb-4">
              Petitioner
            </h4>
            <ul className="space-y-3">
              {data.petitioner.map((arg, index) => (
              <li key={index} className="flex items-start gap-2 sm:gap-3 text-secondary leading-relaxed text-sm">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-petitioner/10 text-petitioner text-xs font-medium flex items-center justify-center mt-0.5">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="break-words mb-1">{arg.text}</p>
                  {onViewSource && arg.source_snippet && (
                    <button
                      onClick={() => onViewSource(arg.source_snippet, arg.text, arg.source_hint, arg.page_number, arg.paragraph_number)}
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
        </div>
        )}
        {data.respondent && data.respondent.length > 0 && (
          <div>
            <h4 className="text-xs sm:text-sm font-semibold text-respondent uppercase tracking-wide mb-3 sm:mb-4">
              Respondent
            </h4>
            <ul className="space-y-3">
              {data.respondent.map((arg, index) => (
              <li key={index} className="flex items-start gap-2 sm:gap-3 text-secondary leading-relaxed text-sm">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-respondent/10 text-respondent text-xs font-medium flex items-center justify-center mt-0.5">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="break-words mb-1">{arg.text}</p>
                  {onViewSource && arg.source_snippet && (
                    <button
                      onClick={() => onViewSource(arg.source_snippet, arg.text, arg.source_hint, arg.page_number, arg.paragraph_number)}
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
        </div>
        )}
      </div>
    </Card>
  );
}
