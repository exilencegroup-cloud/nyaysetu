import { PdfError } from '../types';

export function validatePdf(buffer: Buffer): { valid: boolean; error?: PdfError } {
  if (buffer.length === 0) {
    return { valid: false, error: 'EMPTY_FILE' };
  }

  const header = buffer.toString('ascii', 0, 4);
  if (header !== '%PDF') {
    return { valid: false, error: 'INVALID_PDF' };
  }

  return { valid: true };
}

export function validateFileSize(size: number, maxSize: number): { valid: boolean; error?: PdfError } {
  if (size > maxSize) {
    return { valid: false, error: 'FILE_TOO_LARGE' };
  }
  return { valid: true };
}

export function validateFileType(type: string): { valid: boolean; error?: PdfError } {
  if (type !== 'application/pdf') {
    return { valid: false, error: 'INVALID_PDF' };
  }
  return { valid: true };
}
