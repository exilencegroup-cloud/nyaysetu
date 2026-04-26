import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  badge?: string;
  className?: string;
}

export function SectionHeader({ icon: Icon, title, badge, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center gap-2 sm:gap-3 mb-4', className)}>
      <Icon size={22} className="text-accent" />
      <h3 className="text-lg sm:text-xl font-serif font-semibold text-primary">{title}</h3>
      {badge && (
        <span className="ml-auto px-3 py-1 bg-primary text-secondary text-xs rounded-full uppercase tracking-wide">
          {badge}
        </span>
      )}
    </div>
  );
}
