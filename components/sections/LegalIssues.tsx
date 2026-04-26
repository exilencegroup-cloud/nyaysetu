import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { HelpCircle } from 'lucide-react';

interface LegalIssuesProps {
  data: string[];
}

export function LegalIssues({ data }: LegalIssuesProps) {
  return (
    <Card padding="lg">
      <SectionHeader icon={HelpCircle} title="Legal Issues" />
      <div className="space-y-4">
        {data.map((issue, index) => (
          <div
            key={index}
            className="p-4 bg-primary/5 border-l-4 border-accent rounded-r-lg"
          >
            <p className="text-secondary leading-relaxed">{issue}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
