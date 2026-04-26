import { PdfError } from '../types';

// @ts-ignore - pdf-parse doesn't have TypeScript definitions
const pdf = require('pdf-parse');

export interface ExtractionResult {
  success: boolean;
  text?: string;
  pages?: number;
  error?: PdfError;
}

export async function extractPdfText(buffer: Buffer): Promise<ExtractionResult> {
  try {
    console.log('Starting PDF extraction, buffer size:', buffer.length);
    
    const data = await pdf(buffer);
    console.log('PDF loaded, numPages:', data.numpages);
    
    if (!data.text || data.text.trim().length === 0) {
      return {
        success: false,
        error: 'SCANNED_PDF',
      };
    }
    
    return {
      success: true,
      text: data.text,
      pages: data.numpages,
    };
  } catch (error: any) {
    console.error('PDF extraction error:', error.message, error.stack);
    return {
      success: false,
      error: 'EXTRACTION_FAILED',
    };
  }
}
