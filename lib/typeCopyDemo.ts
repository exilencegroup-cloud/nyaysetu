export type TypeCopyBlockAlign = 'left' | 'center' | 'right';

export type TypeCopyBlockKind =
  | 'header'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'footer'
  | 'signature'
  | 'stamp'
  | 'unreadable'
  | 'other';

export interface TypeCopyLayoutBlock {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  align: TypeCopyBlockAlign;
  kind: TypeCopyBlockKind;
}

export interface TypeCopyPageLayout {
  pageWidth: number;
  pageHeight: number;
  blocks: TypeCopyLayoutBlock[];
}

export interface TypeCopyPage {
  pageNumber: number;
  text: string;
  layoutHtml?: string;
  pageLayout?: TypeCopyPageLayout;
  sourceImageDataUrl?: string;
  status: 'extracted' | 'ocr' | 'not_readable';
}

export interface TypeCopyProcessingState {
  jobId: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  processedPages: number;
  totalPages: number;
  nextPage: number;
  chunkSize: number;
  scanned: boolean;
  message?: string;
  error?: string;
  updatedAt: string;
}

export interface TypeCopyResult {
  fileName: string;
  fileSize: number;
  extension: string;
  documentId: string;
  processedAt: string;
  pageCount: number;
  pages: TypeCopyPage[];
  draftText: string;
  processing?: TypeCopyProcessingState;
}

export const typeCopyStorageKey = 'nyaysetu_type_copy';

export const supportedTypeCopyExtensions = new Set(['pdf', 'jpg', 'jpeg', 'png', 'tif', 'tiff']);

export const demoTypeCopyText = `IN THE COURT OF THE CIVIL JUDGE AT DELHI

Civil Suit No. 124 of 2026

Between:
M/s Aster Legal Services                         Applicant

And
Raman Property Holdings                          Respondent

TYPE COPY

1. The Applicant submits that the original agreement was executed on (Unreadable) and possession was delivered thereafter.

2. The Respondent acknowledged receipt of the consideration amount in the presence of witnesses whose names appear at paragraph 4 below.

3. The certified scanned copy contains a faint court seal near the lower right margin. (Court Seal)

4. Witness Name: (Unreadable)
   Address: 21, Park Road, New Delhi

5. The document bears one handwritten signature at the end of page 1. (Signature)

Verified and approved after comparison with the original scanned document.`;

export function extensionFor(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

export function documentIdFor(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'scan';
  return `NYS-${base.slice(0, 18).toUpperCase()}-001`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildTypeCopyDraftText(
  fileName: string,
  documentId: string,
  pages: TypeCopyPage[],
  pageCount = pages.length,
) {
  const pageBlocks = pages.map((page) => {
    const body = page.status === 'extracted' || page.status === 'ocr'
      ? page.text
      : '(Unreadable - OCR could not confidently read this page.)';

    return `--- Page ${page.pageNumber} of ${pageCount} ---\n${body}`;
  });

  return [
    'TYPE COPY',
    '',
    `Source Document: ${fileName}`,
    `Document ID: ${documentId}`,
    `Total Pages: ${pageCount}`,
    '',
    ...pageBlocks,
  ].join('\n');
}
