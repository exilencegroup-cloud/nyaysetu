import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { BrainCircuit } from 'lucide-react';

interface CourtReasoningProps {
  data?: string[];
}

export function CourtReasoning({ data }: CourtReasoningProps) {
  if (!data || data.length === 0) return null;
  
  return (
    <Card padding="lg">
      <SectionHeader icon={BrainCircuit} title="Court Reasoning" />
      <ol className="space-y-4">
        {data.map((reasoning, index) => (
          <li key={index} className="flex items-start gap-4 text-secondary leading-relaxed">
            <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center">
              {index + 1}
            </span>
            <span>{reasoning}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
