import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { HelpCircle } from 'lucide-react';

interface LegalIssuesProps {
  data?: string[];
}

export function LegalIssues({ data }: LegalIssuesProps) {
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
            <p className="text-secondary leading-relaxed text-sm">{issue}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
