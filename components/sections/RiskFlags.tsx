import React from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { RiskFlag } from '@/lib/types';
import { cn } from '@/lib/utils';

interface RiskFlagsProps {
  data?: RiskFlag[];
}

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'high':
      return AlertTriangle;
    case 'medium':
      return AlertCircle;
    case 'low':
      return Info;
    default:
      return Info;
  }
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'high':
      return {
        bg: 'bg-red-50',
        border: 'border-red-200',
        icon: 'text-red-600',
        badge: 'bg-red-100 text-red-800',
      };
    case 'medium':
      return {
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        icon: 'text-yellow-600',
        badge: 'bg-yellow-100 text-yellow-800',
      };
    case 'low':
      return {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        icon: 'text-blue-600',
        badge: 'bg-blue-100 text-blue-800',
      };
    default:
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        icon: 'text-gray-600',
        badge: 'bg-gray-100 text-gray-800',
      };
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'evidence':
      return 'Evidence';
    case 'procedural':
      return 'Procedural';
    case 'logical':
      return 'Logical';
    case 'documentation':
      return 'Documentation';
    default:
      return type;
  }
};

export function RiskFlags({ data }: RiskFlagsProps) {
  if (!data || data.length === 0) return null;

  const sortedRisks = [...data].sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return (
    <Card padding="lg">
      <SectionHeader icon={AlertTriangle} title="Risk Flags" />
      <div className="space-y-3">
        {sortedRisks.map((risk, index) => {
          const colors = getSeverityColor(risk.severity);
          const Icon = getSeverityIcon(risk.severity);
          
          return (
            <div
              key={index}
              className={cn(
                'p-4 rounded-lg border',
                colors.bg,
                colors.border
              )}
            >
              <div className="flex items-start gap-3">
                <Icon size={20} className={cn('flex-shrink-0 mt-0.5', colors.icon)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={cn(
                      'px-2 py-0.5 text-xs font-medium rounded-full',
                      colors.badge
                    )}>
                      {risk.severity.toUpperCase()} RISK
                    </span>
                    <span className="text-xs text-muted">
                      {getTypeLabel(risk.type)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-primary mb-1">
                    {risk.risk}
                  </p>
                  <p className="text-xs text-secondary leading-relaxed">
                    {risk.explanation}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
