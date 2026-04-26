import { PdfError } from '../types';

const ERROR_MESSAGES: Record<PdfError, string> = {
  EMPTY_FILE: 'The PDF file appears to be empty.',
  CORRUPTED_FILE: 'The PDF file is corrupted and cannot be read.',
  SCANNED_PDF: 'This appears to be a scanned document without extractable text. Please use a PDF with selectable text.',
  EXTRACTION_FAILED: 'Unable to extract text from this PDF. The file may be encrypted or damaged.',
  FILE_TOO_LARGE: 'File size exceeds the 10MB limit. Please upload a smaller file.',
  INVALID_PDF: 'The file you uploaded is not a valid PDF or is encrypted.',
};

export function getErrorMessage(error: PdfError): string {
  return ERROR_MESSAGES[error] || 'An unexpected error occurred while processing the PDF.';
}
