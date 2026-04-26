import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'highlight';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  clickable?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Card({ 
  children, 
  variant = 'default', 
  padding = 'md', 
  clickable = false, 
  onClick, 
  className 
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-card rounded-card',
        variant === 'default' && 'shadow-card',
        variant === 'elevated' && 'shadow-elevated',
        variant === 'highlight' && 'bg-primary/5 border border-border',
        padding === 'none' && 'p-0',
        padding === 'sm' && 'p-3 sm:p-4',
        padding === 'md' && 'p-4 sm:p-6',
        padding === 'lg' && 'p-6 sm:p-8',
        clickable && 'cursor-pointer hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-200',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
