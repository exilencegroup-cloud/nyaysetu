export interface LegalAnalysis {
  snapshot: {
    case_name: string;
    court: string;
    date: string;
    judges: string;
    case_type: string;
  };
  facts: string[];
  legal_issues: string[];
  arguments: {
    petitioner: string[];
    respondent: string[];
  };
  court_reasoning: string[];
  outcome: string;
  key_takeaways: string[];
  reusable_arguments: string[];
}

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
