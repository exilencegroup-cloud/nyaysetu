import { PdfError } from '../types';

const pdf = require('pdf-parse');

export interface ExtractionResult {
  success: boolean;
  text?: string;
  pages?: number;
  error?: PdfError;
}

export async function extractPdfText(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const data = await pdf(buffer);
    
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
  } catch (error) {
    return {
      success: false,
      error: 'EXTRACTION_FAILED',
    };
  }
}
