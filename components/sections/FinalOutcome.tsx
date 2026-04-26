import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Gavel } from 'lucide-react';

interface FinalOutcomeProps {
  data: string;
}

export function FinalOutcome({ data }: FinalOutcomeProps) {
  return (
    <Card variant="highlight" padding="lg">
      <SectionHeader icon={Gavel} title="Final Outcome" />
      <div className="p-6 bg-primary/5 border border-border rounded-lg">
        <p className="text-secondary leading-relaxed">{data}</p>
      </div>
    </Card>
  );
}
