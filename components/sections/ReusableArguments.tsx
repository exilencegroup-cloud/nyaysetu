import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Copy, Check } from 'lucide-react';

interface ReusableArgumentsProps {
  data?: string[];
}

export function ReusableArguments({ data }: ReusableArgumentsProps) {
  if (!data || data.length === 0) return null;
  
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <Card padding="lg">
      <SectionHeader icon={Copy} title="Reusable Arguments" />
      <div className="space-y-3 sm:space-y-4">
        {data.map((argument, index) => (
          <div
            key={index}
            className="p-3 sm:p-4 bg-card border border-border rounded-lg shadow-sm relative group"
          >
            <p className="text-secondary leading-relaxed pr-10 sm:pr-12 text-sm break-words">{argument}</p>
            <button
              onClick={() => handleCopy(argument, index)}
              className="absolute top-3 sm:top-4 right-3 sm:right-4 p-2 text-muted hover:text-accent transition-colors"
              title="Copy to clipboard"
            >
              {copiedIndex === index ? (
                <Check size={18} className="text-green-500" />
              ) : (
                <Copy size={18} />
              )}
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
