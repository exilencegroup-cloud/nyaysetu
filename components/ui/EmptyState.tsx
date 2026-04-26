import React from 'react';
import { FileSearch } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  onUpload: () => void;
}

export function EmptyState({ onUpload }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12">
      <FileSearch size={64} className="text-muted" />
      <h2 className="text-lg font-medium text-secondary">Upload a judgment to begin</h2>
      <p className="text-sm text-muted">PDF format, max 10MB</p>
      <Button onClick={onUpload} variant="primary">
        Upload PDF
      </Button>
    </div>
  );
}
