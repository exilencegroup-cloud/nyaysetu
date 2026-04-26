import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'accent' | 'muted';
  className?: string;
}

export function Loader({ size = 'md', color = 'primary', className }: LoaderProps) {
  const sizeMap = { sm: 16, md: 24, lg: 32 };
  const colorMap = {
    primary: 'text-primary',
    accent: 'text-accent',
    muted: 'text-muted',
  };

  return (
    <Loader2
      size={sizeMap[size]}
      className={cn('animate-spin', colorMap[color], className)}
    />
  );
}
