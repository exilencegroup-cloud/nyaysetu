import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MessageSquare } from 'lucide-react';

interface ArgumentsProps {
  data: {
    petitioner: string[];
    respondent: string[];
  };
}

export function Arguments({ data }: ArgumentsProps) {
  return (
    <Card padding="lg">
      <SectionHeader icon={MessageSquare} title="Arguments" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h4 className="text-sm font-semibold text-petitioner uppercase tracking-wide mb-4">
            Petitioner
          </h4>
          <ul className="space-y-3">
            {data.petitioner.map((arg, index) => (
              <li key={index} className="flex items-start gap-3 text-secondary leading-relaxed">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-petitioner/10 text-petitioner text-xs font-medium flex items-center justify-center mt-0.5">
                  {index + 1}
                </span>
                <span>{arg}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-respondent uppercase tracking-wide mb-4">
            Respondent
          </h4>
          <ul className="space-y-3">
            {data.respondent.map((arg, index) => (
              <li key={index} className="flex items-start gap-3 text-secondary leading-relaxed">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-respondent/10 text-respondent text-xs font-medium flex items-center justify-center mt-0.5">
                  {index + 1}
                </span>
                <span>{arg}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
