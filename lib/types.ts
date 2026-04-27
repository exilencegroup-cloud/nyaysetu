export interface SourcePoint {
  text: string;
  source_snippet: string;
  source_hint?: string;
  page_number?: number;
  paragraph_number?: number;
}

export interface LegalAnalysis {
  snapshot: {
    case_name: string;
    court: string;
    date: string;
    judges: string;
    case_type: string;
  };
  facts?: SourcePoint[];
  legal_issues?: SourcePoint[];
  arguments?: {
    petitioner?: SourcePoint[];
    respondent?: SourcePoint[];
  };
  court_reasoning?: SourcePoint[];
  outcome?: string;
  key_takeaways?: SourcePoint[];
  reusable_arguments?: SourcePoint[];
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
