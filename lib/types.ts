export type { LegalAnalysis } from './ai/parser';

export type AppState = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

export interface StateData {
  state: AppState;
  progress?: number;
  processingStep?: number;
  error?: string;
  errorType?: string;
  retryable?: boolean;
}

export type PdfError = 'EMPTY_FILE' | 'CORRUPTED_FILE' | 'SCANNED_PDF' | 'EXTRACTION_FAILED' | 'FILE_TOO_LARGE' | 'INVALID_PDF';
