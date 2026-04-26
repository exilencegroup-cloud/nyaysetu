import { PdfError } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Set up worker for server-side
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ExtractionResult {
  success: boolean;
  text?: string;
  pages?: number;
  error?: PdfError;
}

export async function extractPdfText(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const arrayBuffer = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/standard_fonts/`
    });
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
    console.error('PDF extraction error:', error);
    return {
      success: false,
      error: 'EXTRACTION_FAILED',
    };
  }
}
