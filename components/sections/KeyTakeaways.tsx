import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Lightbulb } from 'lucide-react';

interface KeyTakeawaysProps {
  data?: string[];
}

export function KeyTakeaways({ data }: KeyTakeawaysProps) {
  if (!data || data.length === 0) return null;
  
  return (
    <Card padding="lg">
      <SectionHeader icon={Lightbulb} title="Key Takeaways" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {data.map((takeaway, index) => (
          <div
            key={index}
            className="p-3 sm:p-4 bg-accent/5 border border-accent/20 rounded-lg"
          >
            <p className="text-secondary leading-relaxed text-sm">{takeaway}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
