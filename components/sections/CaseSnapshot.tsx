import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Scale, Calendar, MapPin, Users, FileText } from 'lucide-react';

interface CaseSnapshotProps {
  data: {
    case_name: string;
    court: string;
    date: string;
    judges: string;
    case_type: string;
  };
}

export function CaseSnapshot({ data }: CaseSnapshotProps) {
  const items = [
    { icon: FileText, label: 'Case Name', value: data.case_name },
    { icon: Scale, label: 'Court', value: data.court },
    { icon: Calendar, label: 'Date', value: data.date },
    { icon: Users, label: 'Judges', value: data.judges },
    { icon: FileText, label: 'Case Type', value: data.case_type },
  ];

  return (
    <Card variant="highlight" padding="lg">
      <SectionHeader icon={Scale} title="Case Snapshot" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <div key={index} className="flex items-start gap-3">
              <div className="p-2 bg-accent/10 rounded-lg">
                <Icon size={18} className="text-accent" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-muted uppercase tracking-wide mb-1">{item.label}</div>
                <div className="text-sm text-primary font-medium">{item.value}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
