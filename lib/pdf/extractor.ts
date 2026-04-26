import { PdfError } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Set up worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ExtractionResult {
  success: boolean;
  text?: string;
  pages?: number;
  error?: PdfError;
}

export async function extractPdfText(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const arrayBuffer = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDocument = await loadingTask.promise;
    
    let fullText = '';
    const numPages = pdfDocument.numPages;
    
    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    if (!fullText || fullText.trim().length === 0) {
      return {
        success: false,
        error: 'SCANNED_PDF',
      };
    }
    
    return {
      success: true,
      text: fullText,
      pages: numPages,
    };
  } catch (error) {
    return {
      success: false,
      error: 'EXTRACTION_FAILED',
    };
  }
}
