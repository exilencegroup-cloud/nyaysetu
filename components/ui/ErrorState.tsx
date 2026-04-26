import React from 'react';
import { AlertTriangle, FileX, ScanText } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  errorType: 'INVALID_PDF' | 'EMPTY_EXTRACTION' | 'AI_FAILURE' | 'JSON_PARSE_ERROR';
  errorMessage?: string;
  onRetry?: () => void;
  onNewUpload: () => void;
}

const ERROR_CONFIG = {
  INVALID_PDF: {
    icon: FileX,
    title: 'Invalid PDF',
    message: 'The file you uploaded is not a valid PDF or is encrypted.',
    showRetry: false,
  },
  EMPTY_EXTRACTION: {
    icon: ScanText,
    title: 'No Text Found',
    message: 'This PDF appears to be a scanned document without extractable text.',
    showRetry: false,
  },
  AI_FAILURE: {
    icon: AlertTriangle,
    title: 'Analysis Failed',
    message: 'AI service error occurred.',
    showRetry: true,
  },
  JSON_PARSE_ERROR: {
    icon: AlertTriangle,
    title: 'Processing Error',
    message: 'Unable to process analysis results.',
    showRetry: true,
  },
};

export function ErrorState({ errorType, errorMessage, onRetry, onNewUpload }: ErrorStateProps) {
  const config = ERROR_CONFIG[errorType];
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <Icon size={48} className="text-red-500" />
      <h2 className="text-xl font-medium text-primary">{config.title}</h2>
      <p className="text-base text-secondary text-center max-w-md">
        {errorMessage || config.message}
      </p>
      <div className="flex gap-3">
        {config.showRetry && onRetry && (
          <Button onClick={onRetry} variant="primary">
            Retry
          </Button>
        )}
        <Button onClick={onNewUpload} variant="secondary">
          Upload New
        </Button>
      </div>
    </div>
  );
}
