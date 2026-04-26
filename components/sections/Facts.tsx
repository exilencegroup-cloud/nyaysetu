import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { List } from 'lucide-react';

interface FactsProps {
  data?: string[];
}

export function Facts({ data }: FactsProps) {
  if (!data || data.length === 0) return null;
  
  return (
    <Card padding="lg">
      <SectionHeader icon={List} title="Facts" />
      <ul className="space-y-3">
        {data.map((fact, index) => (
          <li key={index} className="flex items-start gap-3 text-secondary leading-relaxed">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-sm font-medium flex items-center justify-center mt-0.5">
              {index + 1}
            </span>
            <span>{fact}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
