import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { deflateSync } from 'zlib';
import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import type { Fields } from 'formidable';
import { openai } from '@/lib/ai/client';
import {
  buildTypeCopyDraftText,
  documentIdFor,
  extensionFor,
  supportedTypeCopyExtensions,
  type TypeCopyPage,
  type TypeCopyResult,
} from '@/lib/typeCopyDemo';

// @ts-ignore - pdf-parse has incomplete TypeScript coverage in this project.
const pdf = require('pdf-parse');
// @ts-ignore - using the pdf.js build bundled by pdf-parse.
const pdfjs = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
pdfjs.disableWorker = true;

const execFileAsync = promisify(execFile);
const maxUploadSizeMb = 500;
const maxUploadSizeBytes = maxUploadSizeMb * 1024 * 1024;
const typeCopyOcrModel = process.env.TYPE_COPY_OCR_MODEL || 'gpt-4o-mini';
const pdfRenderDpi = Number(process.env.TYPE_COPY_RENDER_DPI || 140);
const maxOcrImageBytes = 18 * 1024 * 1024;
const maxPdfPagesPerDocument = positiveNumber(process.env.TYPE_COPY_MAX_DOCUMENT_PAGES, 1000);
const maxSynchronousScannedPages = positiveNumber(process.env.TYPE_COPY_MAX_SYNC_OCR_PAGES, 10);
const maxSynchronousPdfPages = positiveNumber(process.env.TYPE_COPY_MAX_SYNC_PDF_PAGES, 120);
const ocrRateLimitRetryAfterSeconds = positiveNumber(process.env.TYPE_COPY_OCR_RATE_LIMIT_RETRY_SECONDS, 25);
const rateLimitedOcrChunkSize = positiveNumber(process.env.TYPE_COPY_RATE_LIMIT_OCR_CHUNK_PAGES, 3);
const minimumMeaningfulOcrChars = 4;
const textLayerSampleThreshold = 40;
const allowedLayoutHtmlTags = new Set(['div', 'p', 'span', 'br', 'strong', 'em', 'u', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
const allowedLayoutStyleProps = new Set([
  'text-align',
  'margin-left',
  'margin-right',
  'margin-top',
  'margin-bottom',
  'padding',
  'border',
  'border-bottom',
  'border-top',
  'border-left',
  'border-right',
  'border-collapse',
  'width',
  'font-weight',
  'white-space',
]);

interface OcrLayout {
  text: string;
  layoutHtml: string;
}

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

type ApiResponse =
  | { success: true; data: TypeCopyResult }
  | TypeCopyFailureResponse;

type TypeCopyFailureResponse = {
  success: false;
  message: string;
  code?: 'chunk_required' | 'page_limit_exceeded' | 'ocr_rate_limited' | 'ocr_quota_exceeded';
  pageCount?: number;
  chunkSize?: number;
  maxPageCount?: number;
  scanned?: boolean;
  retryAfterSeconds?: number;
};

interface PdfInfo {
  pageCount: number;
  hasSampledTextLayer: boolean;
}

interface PageRange {
  start: number;
  end: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  let uploadedPath = '';

  try {
    const form = formidable({
      maxFileSize: maxUploadSizeBytes,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    uploadedPath = file.filepath;
    const fileName = file.originalFilename || 'uploaded-document.pdf';
    const extension = extensionFor(fileName);

    if (!supportedTypeCopyExtensions.has(extension)) {
      return res.status(400).json({ success: false, message: 'Upload PDF, JPG, PNG, or TIFF.' });
    }

    if (file.size > maxUploadSizeBytes) {
      return res.status(400).json({ success: false, message: `File exceeds ${maxUploadSizeMb}MB limit.` });
    }

    const buffer = fs.readFileSync(file.filepath);
    const documentId = documentIdFor(fileName);
    const pdfInfo = extension === 'pdf'
      ? await inspectPdfBeforeExtraction(buffer)
      : null;
    const pageRange = pdfInfo
      ? parseRequestedPageRange(fields, pdfInfo.pageCount)
      : null;

    if (pdfInfo && !pageRange) {
      guardPdfDocumentPageLimit(pdfInfo);

      const chunkPlan = pdfChunkPlan(pdfInfo);
      if (pdfInfo.pageCount > chunkPlan.chunkSize) {
        return res.status(200).json(chunkRequiredResponse(pdfInfo, chunkPlan.chunkSize));
      }
    }

    const pages = extension === 'pdf'
      ? await extractPdfPages(buffer, file.filepath, fileName, pdfInfo, pageRange)
      : await extractImagePage(file.filepath, extension);
    const pageCount = pdfInfo?.pageCount || pages.length;
    const result: TypeCopyResult = {
      fileName,
      fileSize: file.size,
      extension,
      documentId,
      processedAt: new Date().toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      pageCount,
      pages,
      draftText: buildTypeCopyDraftText(fileName, documentId, pages, pageCount),
    };

    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    const { message, statusCode, body } = typeCopyErrorResponse(error);

    if (statusCode < 500) {
      console.warn('Type Copy validation error:', message);
    } else {
      console.error('Type Copy error:', error);
    }

    return res.status(statusCode).json({ success: false, message, ...body });
  } finally {
    if (uploadedPath && fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }
  }
}

async function extractPdfPages(
  buffer: Buffer,
  pdfPath: string,
  fileName: string,
  pdfInfo: PdfInfo | null,
  requestedRange: PageRange | null,
): Promise<TypeCopyPage[]> {
  if (buffer.length === 0 || buffer.toString('ascii', 0, 4) !== '%PDF') {
    throw new Error('Invalid PDF');
  }

  const info = pdfInfo || await inspectPdfBeforeExtraction(buffer);
  const pageRange = requestedRange || { start: 1, end: info.pageCount };
  guardPdfSizeForLiveProcessing(info, pageRange);

  const renderedPages = await renderPdfTextRange(buffer, pageRange);

  const pages = renderedPages.map(({ pageNumber, layout }) => {
    const text = normalizeExtractedText(layout?.text || '');

    return {
      pageNumber,
      text,
      layoutHtml: text ? layout?.layoutHtml || textToLayoutHtml(text) : '',
      status: text ? 'extracted' : 'not_readable',
    } satisfies TypeCopyPage;
  });

  if (pages.some((page) => page.status === 'not_readable')) {
    await ocrUnreadablePdfPages(buffer, pdfPath, fileName, pages, info.pageCount);
  }

  return pages;
}

async function renderPdfTextRange(buffer: Buffer, pageRange: PageRange) {
  const doc = await pdfjs.getDocument(new Uint8Array(buffer));

  try {
    const pages: Array<{ pageNumber: number; layout: OcrLayout }> = [];

    for (let pageNumber = pageRange.start; pageNumber <= pageRange.end; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      pages.push({
        pageNumber,
        layout: await renderPageLayout(page),
      });
    }

    return pages;
  } finally {
    await doc.destroy();
  }
}

async function inspectPdfBeforeExtraction(buffer: Buffer): Promise<PdfInfo> {
  const doc = await pdfjs.getDocument(new Uint8Array(buffer));

  try {
    const pageCount = Math.max(Number(doc.numPages || 0), 1);
    const samplePages = samplePageNumbers(pageCount);
    let sampledTextLength = 0;

    for (const pageNumber of samplePages) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });
      const sampleText = (textContent.items || [])
        .map((item: any) => String(item.str || '').trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      sampledTextLength += sampleText.length;
      if (sampledTextLength >= textLayerSampleThreshold) break;
    }

    return {
      pageCount,
      hasSampledTextLayer: sampledTextLength >= textLayerSampleThreshold,
    };
  } finally {
    await doc.destroy();
  }
}

function samplePageNumbers(pageCount: number) {
  const candidates = [
    1,
    2,
    Math.ceil(pageCount / 2),
    Math.max(1, pageCount - 1),
    pageCount,
  ];

  return Array.from(new Set(candidates.filter((pageNumber) => pageNumber >= 1 && pageNumber <= pageCount)));
}

function parseRequestedPageRange(fields: Fields, pageCount: number): PageRange | null {
  const rawStart = firstFieldValue(fields.pageStart);
  const rawEnd = firstFieldValue(fields.pageEnd);

  if (!rawStart && !rawEnd) return null;

  const start = Number(rawStart || 1);
  const end = Number(rawEnd || rawStart);

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > pageCount) {
    throw new TypeCopyUserError(
      `Invalid PDF page range. Choose pages between 1 and ${pageCount}.`,
      400,
    );
  }

  return { start, end };
}

function firstFieldValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function guardPdfDocumentPageLimit(pdfInfo: PdfInfo) {
  if (pdfInfo.pageCount > maxPdfPagesPerDocument) {
    throw new TypeCopyUserError(
      `This PDF has ${pdfInfo.pageCount} pages. Type Copy supports up to ${maxPdfPagesPerDocument} pages per document.`,
      413,
      { code: 'page_limit_exceeded', pageCount: pdfInfo.pageCount, maxPageCount: maxPdfPagesPerDocument },
    );
  }
}

function guardPdfSizeForLiveProcessing(pdfInfo: PdfInfo, pageRange: PageRange) {
  guardPdfDocumentPageLimit(pdfInfo);

  const requestPageCount = pageRange.end - pageRange.start + 1;
  const { chunkSize } = pdfChunkPlan(pdfInfo);

  if (requestPageCount > chunkSize) {
    throw new TypeCopyChunkRequiredError(pdfInfo, chunkSize);
  }
}

function pdfChunkPlan(pdfInfo: PdfInfo) {
  const chunkSize = pdfInfo.hasSampledTextLayer
    ? maxSynchronousPdfPages
    : maxSynchronousScannedPages;

  return {
    chunkSize,
    scanned: !pdfInfo.hasSampledTextLayer,
  };
}

function chunkRequiredResponse(pdfInfo: PdfInfo, chunkSize: number): TypeCopyFailureResponse {
  return {
    success: false,
    code: 'chunk_required',
    message: !pdfInfo.hasSampledTextLayer
      ? `This looks like a scanned PDF with ${pdfInfo.pageCount} pages. Type Copy will OCR it in ${chunkSize}-page batches.`
      : `This PDF has ${pdfInfo.pageCount} pages. Type Copy will process it in ${chunkSize}-page batches.`,
    pageCount: pdfInfo.pageCount,
    chunkSize,
    maxPageCount: maxPdfPagesPerDocument,
    scanned: !pdfInfo.hasSampledTextLayer,
  };
}

async function renderPageLayout(pageData: any): Promise<OcrLayout> {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  });

  const items = (textContent.items || [])
    .map((item: any) => {
      const transform = Array.isArray(item.transform) ? item.transform : [];
      return {
        text: String(item.str || '').trim(),
        x: Number(transform[4] || 0),
        y: Number(transform[5] || 0),
      };
    })
    .filter((item: { text: string }) => item.text);

  if (items.length === 0) return { text: '', layoutHtml: '' };

  const minX = Math.min(...items.map((item: { x: number }) => item.x));
  const maxX = Math.max(...items.map((item: { x: number }) => item.x));
  const span = Math.max(maxX - minX, 1);
  const columns = 110;
  const lineTolerance = 2.5;
  const lines: Array<{ y: number; items: typeof items }> = [];

  for (const item of items) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= lineTolerance);
    if (line) {
      line.items.push(item);
      line.y = (line.y + item.y) / 2;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  const text = lines
    .sort((a, b) => b.y - a.y)
    .map((line) => {
      let output = '';

      line.items
        .sort((a, b) => a.x - b.x)
        .forEach((item) => {
          const column = Math.max(0, Math.round(((item.x - minX) / span) * columns));
          const gap = Math.max(column - output.length, output ? 1 : 0);
          output += `${' '.repeat(gap)}${item.text}`;
        });

      return output.trimEnd();
    })
    .join('\n');

  return {
    text,
    layoutHtml: textToLayoutHtml(text),
  };
}

async function extractImagePage(filePath: string, extension: string): Promise<TypeCopyPage[]> {
  const mimeType = mimeTypeForExtension(extension);

  if (!mimeType) {
    return [
      {
        pageNumber: 1,
        text: '',
        status: 'not_readable',
      },
    ];
  }

  const layout = await ocrImageFile(filePath, 1, mimeType);

  return [
    {
      pageNumber: 1,
      text: layout.text,
      layoutHtml: layout.layoutHtml,
      status: layout.text ? 'ocr' : 'not_readable',
    },
  ];
}

async function ocrUnreadablePdfPages(
  buffer: Buffer,
  pdfPath: string,
  fileName: string,
  pages: TypeCopyPage[],
  totalPageCount: number,
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for scanned-page OCR.');
  }

  const unreadablePages = pages.filter((page) => page.status === 'not_readable');
  if (unreadablePages.length > maxSynchronousScannedPages) {
    throw new TypeCopyUserError(
      `This PDF has ${unreadablePages.length} pages in the current batch that need OCR. Type Copy will OCR it in ${maxSynchronousScannedPages}-page batches.`,
      413,
      {
        code: 'chunk_required',
        pageCount: totalPageCount,
        chunkSize: maxSynchronousScannedPages,
        maxPageCount: maxPdfPagesPerDocument,
        scanned: true,
      },
    );
  }

  await ocrUnreadablePdfPageImages(buffer, pages);
  if (!pages.some((page) => page.status === 'not_readable')) return;

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nyaysetu-type-copy-'));
  let renderUnavailable = false;

  try {
    for (const page of pages) {
      if (page.status !== 'not_readable') continue;

      try {
        const imagePath = await renderPdfPageToPng(pdfPath, page.pageNumber, tempDir);
        const layout = await ocrImageFile(imagePath, page.pageNumber, 'image/png');

        if (layout.text) {
          page.text = layout.text;
          page.layoutHtml = layout.layoutHtml;
          page.status = 'ocr';
        }
      } catch (error) {
        if (isOpenAiQuotaError(error) || isOpenAiRateLimitError(error)) throw error;
        if (isPdfRenderUnavailable(error)) {
          renderUnavailable = true;
          break;
        }

        console.error(`OCR failed for page ${page.pageNumber}:`, error);
      }
    }
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }

  if (renderUnavailable && pages.some((page) => page.status === 'not_readable')) {
    await ocrPdfViaFileInput(pdfPath, fileName, pages);
  }
}

async function ocrUnreadablePdfPageImages(buffer: Buffer, pages: TypeCopyPage[]) {
  let handledAnyPage = false;
  const doc = await pdfjs.getDocument(new Uint8Array(buffer));

  try {
    for (const page of pages) {
      if (page.status !== 'not_readable') continue;

      try {
        const image = await extractLargestPageImagePng(doc, page.pageNumber);
        if (!image) continue;

        handledAnyPage = true;
        const layout = await ocrImageBuffer(image, page.pageNumber, 'image/png');

        if (layout.text) {
          page.text = layout.text;
          page.layoutHtml = layout.layoutHtml;
          page.status = 'ocr';
        }
      } catch (error) {
        if (isOpenAiQuotaError(error) || isOpenAiRateLimitError(error)) throw error;
        console.error(`Embedded image OCR failed for page ${page.pageNumber}:`, error);
      }
    }
  } finally {
    await doc.destroy();
  }

  return handledAnyPage;
}

async function extractLargestPageImagePng(doc: any, pageNumber: number): Promise<Buffer | null> {
  const page = await doc.getPage(pageNumber);
  const ops = await page.getOperatorList();
  const imageNames = ops.fnArray
    .map((fn: number, index: number) => ({ fn, args: ops.argsArray[index] }))
    .filter(({ fn }: { fn: number }) => fn === pdfjs.OPS.paintImageXObject)
    .map(({ args }: { args: any[] }) => args?.[0])
    .filter(Boolean);

  let largestImage: any = null;
  let largestArea = 0;

  for (const imageName of imageNames) {
    const image = await getPdfJsObject(page.objs, imageName);
    const area = Number(image?.width || 0) * Number(image?.height || 0);

    if (image?.data && area > largestArea) {
      largestImage = image;
      largestArea = area;
    }
  }

  if (!largestImage) return null;
  return encodePdfJsImageAsPng(largestImage);
}

function getPdfJsObject(objects: any, name: string) {
  return new Promise<any>((resolve, reject) => {
    try {
      objects.get(name, resolve);
    } catch (error) {
      reject(error);
    }
  });
}

async function renderPdfPageToPng(pdfPath: string, pageNumber: number, tempDir: string) {
  const renderAttempts = [pdfRenderDpi, 110].filter((dpi, index, values) => dpi > 0 && values.indexOf(dpi) === index);
  let lastError: unknown;

  for (const dpi of renderAttempts) {
    try {
      const outputPrefix = path.join(tempDir, `page-${pageNumber}-${dpi}`);
      const args = [
        '-f',
        String(pageNumber),
        '-l',
        String(pageNumber),
        '-r',
        String(dpi),
        '-png',
        pdfPath,
        outputPrefix,
      ];

      await runPdftoppm(args);
      const imagePath = await findRenderedPage(tempDir, `page-${pageNumber}-${dpi}`);
      const stats = await fs.promises.stat(imagePath);

      if (stats.size <= maxOcrImageBytes) return imagePath;

      lastError = new Error(`Rendered page image is too large at ${dpi} DPI.`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to render PDF page for OCR.');
}

async function runPdftoppm(args: string[]) {
  const candidates = process.env.PDFTOPPM_PATH
    ? [process.env.PDFTOPPM_PATH]
    : ['pdftoppm'];
  let lastError: unknown;

  for (const command of candidates) {
    try {
      await execFileAsync(command, args, {
        maxBuffer: 4 * 1024 * 1024,
        timeout: 90_000,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('pdftoppm is not available.');
}

function isPdfRenderUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /pdftoppm|blocked|Application Control|cannot find the path|not available|Rendered page image was not created/i.test(message);
}

async function ocrPdfViaFileInput(pdfPath: string, fileName: string, pages: TypeCopyPage[]) {
  const targetPages = pages.filter((page) => page.status === 'not_readable');
  if (targetPages.length === 0) return;

  const uploaded = await openai.files.create({
    file: fs.createReadStream(pdfPath),
    purpose: 'user_data',
  });

  try {
    for (const chunk of chunkPages(targetPages, 5)) {
      const pageNumbers = chunk.map((page) => page.pageNumber);
      const parsedPages = await transcribePdfPageRange(uploaded.id, fileName, pageNumbers, pages.length);

      for (const page of chunk) {
        const layout = parsedPages.get(page.pageNumber);
        const text = normalizeExtractedText(layout?.text || '');

        if (isUsableOcrText(text)) {
          page.text = text;
          page.layoutHtml = layout?.layoutHtml || textToLayoutHtml(text);
          page.status = 'ocr';
        }
      }
    }
  } finally {
    await openai.files.del(uploaded.id).catch((error) => {
      console.error('Unable to delete temporary OCR file:', error);
    });
  }
}

function chunkPages(pages: TypeCopyPage[], size: number) {
  const chunks: TypeCopyPage[][] = [];
  for (let index = 0; index < pages.length; index += size) {
    chunks.push(pages.slice(index, index + size));
  }
  return chunks;
}

async function transcribePdfPageRange(fileId: string, fileName: string, pageNumbers: number[], totalPages: number) {
  const pageLabel = pageNumbers.length === 1
    ? `page ${pageNumbers[0]}`
    : `pages ${pageNumbers[0]} through ${pageNumbers[pageNumbers.length - 1]}`;

  const response = await openai.responses.create({
    model: typeCopyOcrModel,
    instructions: [
      'You convert scanned legal PDF pages into Type Copy with a formatted layout preview.',
      'Transcribe only visible text. Do not summarize, translate, explain, or add commentary.',
      'Return JSON only.',
      'For plainText, preserve paragraph order, indentation, numbering, and practical line breaks.',
      'For layoutHtml, recreate the visual page layout using only these tags: div, p, span, br, strong, em, u, pre, table, thead, tbody, tr, th, td.',
      'Every div or p in layoutHtml must include a style with text-align:left, text-align:center, or text-align:right based on where that block appears in the source page.',
      'Centered titles must be separate blocks with style="text-align:center". Right-side dates, page numbers, advocate names, signature blocks, and verification blocks must be separate blocks with style="text-align:right".',
      'When the source has left and right content on the same visual row, split it into separate aligned blocks or a two-column table so it does not become left-aligned text.',
      'Use HTML tables for source tables, with rows, columns, cell order, borders, and blank cells preserved.',
      'Use text-align:center/right, margin-left, and table cell padding/borders to preserve headings, dates, signature blocks, and indentation.',
      'Do not flatten everything into left-aligned paragraphs. The layoutHtml must visually mimic the page.',
      'Do not return body, html, style, script, markdown, or code fences.',
      'Mark unreadable words as (Not Readable).',
      'If one table cell is unreadable, mark only that cell as (Not Readable).',
      'Represent stamps, seals, and signatures as short markers such as (Seal) or (Signature).',
      'If you cannot confidently transcribe meaningful visible text for a page, set that page to (Not Readable) instead of guessing.',
      'Do not return blank JSON, newline-only content, escape-sequence padding, or one-letter placeholders.',
      'Use only meaningful line breaks; do not use repeated escaped newlines to imitate vertical spacing.',
    ].join(' '),
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              `Attached PDF: ${fileName}.`,
              `Transcribe ${pageLabel} only.`,
              `Requested page numbers: ${pageNumbers.join(', ')}.`,
              'Return a JSON object with this exact shape:',
              '{"pages":[{"pageNumber":1,"plainText":"...","layoutHtml":"..."}]}',
              'Return the requested pages in order.',
              'If a requested page has no readable text, set plainText to "(Not Readable)" and layoutHtml to "<p>(Not Readable)</p>".',
              'Never fill plainText or layoutHtml with repeated \\n characters or placeholder letters.',
            ].join(' '),
          },
          {
            type: 'input_file',
            file_id: fileId,
          },
        ],
      },
    ],
    max_output_tokens: 12000,
    store: false,
    text: {
      format: {
        type: 'json_schema',
        name: 'type_copy_layout_pages',
        strict: true,
        schema: typeCopyLayoutSchema(),
      },
    },
  } as any, {
    maxRetries: 1,
    timeout: 180_000,
  });

  return parseOcrLayoutPages((response as any).output_text || '', pageNumbers);
}

async function findRenderedPage(tempDir: string, prefix: string) {
  const files = await fs.promises.readdir(tempDir);
  const fileName = files.find((file) => file.startsWith(`${prefix}-`) && file.endsWith('.png'));

  if (!fileName) {
    throw new Error('Rendered page image was not created.');
  }

  return path.join(tempDir, fileName);
}

async function ocrImageFile(imagePath: string, pageNumber: number, mimeType: string): Promise<OcrLayout> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for scanned-page OCR.');
  }

  const imageBuffer = await fs.promises.readFile(imagePath);
  return ocrImageBuffer(imageBuffer, pageNumber, mimeType);
}

async function ocrImageBuffer(imageBuffer: Buffer, pageNumber: number, mimeType: string): Promise<OcrLayout> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for scanned-page OCR.');
  }

  if (imageBuffer.length > maxOcrImageBytes) {
    throw new Error('Image is too large for OCR.');
  }

  const completion = await openai.chat.completions.create({
    model: typeCopyOcrModel,
    temperature: 0,
    max_tokens: 3500,
    messages: [
      {
        role: 'system',
        content: [
          'You convert scanned legal document pages into Type Copy with a formatted layout preview.',
          'Transcribe only visible text. Do not summarize or add commentary.',
          'Return JSON only.',
          'For plainText, preserve paragraph order, indentation, numbering, and practical line breaks.',
          'For layoutHtml, recreate the visual page layout using only these tags: div, p, span, br, strong, em, u, pre, table, thead, tbody, tr, th, td.',
          'Every div or p in layoutHtml must include a style with text-align:left, text-align:center, or text-align:right based on where that block appears in the source page.',
          'Centered titles must be separate blocks with style="text-align:center". Right-side dates, page numbers, advocate names, signature blocks, and verification blocks must be separate blocks with style="text-align:right".',
          'When the source has left and right content on the same visual row, split it into separate aligned blocks or a two-column table so it does not become left-aligned text.',
          'Use HTML tables for source tables, with rows, columns, cell order, borders, and blank cells preserved.',
          'Use text-align:center/right, margin-left, and table cell padding/borders to preserve headings, dates, signature blocks, and indentation.',
          'Do not flatten everything into left-aligned paragraphs. The layoutHtml must visually mimic the page.',
          'Do not return body, html, style, script, markdown, or code fences.',
          'Mark unreadable words as (Not Readable).',
          'If one table cell is unreadable, mark only that cell as (Not Readable).',
          'Represent stamps, seals, and signatures as short markers such as (Seal) or (Signature).',
          'If no text is visible, return {"plainText":"(Not Readable)","layoutHtml":"<p>(Not Readable)</p>"}.',
          'If you cannot confidently transcribe meaningful visible text, return {"plainText":"(Not Readable)","layoutHtml":"<p>(Not Readable)</p>"} instead of guessing.',
          'Do not return blank JSON, newline-only content, escape-sequence padding, or one-letter placeholders.',
          'Use only meaningful line breaks; do not use repeated escaped newlines to imitate vertical spacing.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              `Transcribe page ${pageNumber} exactly for a legal Type Copy.`,
              'Return a JSON object with this exact shape:',
              '{"plainText":"...","layoutHtml":"..."}',
              'Never fill plainText or layoutHtml with repeated \\n characters or placeholder letters.',
            ].join(' '),
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`,
              detail: 'high',
            },
          },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'type_copy_layout_page',
        strict: true,
        schema: typeCopySinglePageLayoutSchema(),
      },
    },
  }, {
    maxRetries: 1,
    timeout: 120_000,
  });

  const content = completion.choices[0]?.message?.content || '';
  const parsed = parseOcrLayout(content);

  if (!isUsableOcrText(parsed.text)) {
    return { text: '', layoutHtml: '' };
  }

  return parsed;
}

function encodePdfJsImageAsPng(image: { width: number; height: number; kind?: number; data: Uint8Array }) {
  const width = Number(image.width);
  const height = Number(image.height);
  const kind = Number(image.kind || 1);
  const data = Buffer.from(image.data);
  let colorType = 0;
  let bitDepth = 1;
  let lineSize = (width + 7) >> 3;

  if (kind === 2) {
    colorType = 2;
    bitDepth = 8;
    lineSize = width * 3;
  } else if (kind === 3) {
    colorType = 6;
    bitDepth = 8;
    lineSize = width * 4;
  } else if (kind !== 1) {
    throw new Error(`Unsupported PDF image kind: ${kind}`);
  }

  const rows = Buffer.alloc((lineSize + 1) * height);

  for (let row = 0; row < height; row += 1) {
    const sourceStart = row * lineSize;
    const targetStart = row * (lineSize + 1);
    rows[targetStart] = 0;
    data.copy(rows, targetStart + 1, sourceStart, sourceStart + lineSize);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', Buffer.concat([
      u32be(width),
      u32be(height),
      Buffer.from([bitDepth, colorType, 0, 0, 0]),
    ])),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBytes, data]);

  return Buffer.concat([
    u32be(data.length),
    typeBytes,
    data,
    u32be(crc32(crcInput)),
  ]);
}

function u32be(value: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value >>> 0, 0);
  return bytes;
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
})();

function mimeTypeForExtension(extension: string) {
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  return '';
}

function normalizeExtractedText(text: string) {
  const cleaned = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');

  return cleaned.trim().length ? cleaned : '';
}

function looksLikeStructuredOcrJson(raw: string) {
  const text = stripCodeFences(raw).trim();
  return text.startsWith('{') && /["']?(?:plainText|layoutHtml|pages)["']?\s*:/i.test(text);
}

function isNotReadableText(text: string) {
  return /^\(?not\s+readable\)?$/i.test(normalizeExtractedText(text));
}

function isUsableOcrText(text: string) {
  const normalized = normalizeExtractedText(text);
  if (!normalized || isNotReadableText(normalized)) return false;

  const signalChars = normalized.match(/[\p{L}\p{N}]/gu) || [];
  if (signalChars.length < minimumMeaningfulOcrChars) return false;

  const uniqueSignalChars = new Set(signalChars.map((char) => char.toLocaleLowerCase()));
  return !(signalChars.length < 12 && uniqueSignalChars.size <= 1);
}

function parseOcrLayout(raw: string): OcrLayout {
  const stripped = stripCodeFences(raw);

  try {
    const parsed = JSON.parse(stripped);
    const text = normalizeExtractedText(parsed.plainText || parsed.text || '');
    if (!isUsableOcrText(text)) return { text: '', layoutHtml: '' };

    const layoutHtml = sanitizeLayoutHtml(parsed.layoutHtml || '');

    return {
      text,
      layoutHtml: layoutHtml || textToLayoutHtml(text),
    };
  } catch {
    if (looksLikeStructuredOcrJson(raw)) return { text: '', layoutHtml: '' };

    const text = normalizeExtractedText(stripped);
    if (!isUsableOcrText(text)) return { text: '', layoutHtml: '' };

    return {
      text,
      layoutHtml: textToLayoutHtml(text),
    };
  }
}

function parseOcrLayoutPages(raw: string, fallbackPageNumbers: number[]) {
  const pages = new Map<number, OcrLayout>();

  try {
    const parsed = JSON.parse(stripCodeFences(raw));
    const parsedPages = Array.isArray(parsed.pages) ? parsed.pages : [];

    for (const page of parsedPages) {
      const pageNumber = Number(page.pageNumber);
      if (!fallbackPageNumbers.includes(pageNumber)) continue;

      const text = normalizeExtractedText(page.plainText || page.text || '');
      if (!isUsableOcrText(text)) continue;

      const layoutHtml = sanitizeLayoutHtml(page.layoutHtml || '');
      pages.set(pageNumber, {
        text,
        layoutHtml: layoutHtml || textToLayoutHtml(text),
      });
    }
  } catch {
    if (fallbackPageNumbers.length === 1 && !looksLikeStructuredOcrJson(raw)) {
      const layout = parseOcrLayout(raw);
      if (isUsableOcrText(layout.text)) pages.set(fallbackPageNumbers[0], layout);
    }
  }

  return pages;
}

function typeCopySinglePageLayoutSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      plainText: { type: 'string' },
      layoutHtml: { type: 'string' },
    },
    required: ['plainText', 'layoutHtml'],
  };
}

function typeCopyLayoutSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      pages: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            pageNumber: { type: 'number' },
            plainText: { type: 'string' },
            layoutHtml: { type: 'string' },
          },
          required: ['pageNumber', 'plainText', 'layoutHtml'],
        },
      },
    },
    required: ['pages'],
  };
}

function stripCodeFences(text: string) {
  return text
    .trim()
    .replace(/^```(?:json|html|text|plaintext)?\s*/i, '')
    .replace(/\s*```$/i, '');
}

function textToLayoutHtml(text: string) {
  return text ? `<pre>${escapeHtml(text)}</pre>` : '';
}

function sanitizeLayoutHtml(html: string) {
  const withoutDangerousBlocks = stripCodeFences(html)
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(html|head|body)[^>]*>/gi, '');

  return withoutDangerousBlocks.replace(/<\s*(\/?)\s*([a-z0-9]+)([^>]*)>/gi, (match, closing, rawName, rawAttrs) => {
    const name = String(rawName).toLowerCase();
    if (!allowedLayoutHtmlTags.has(name)) return '';
    if (closing) return `</${name}>`;

    return `<${name}${sanitizeLayoutAttributes(String(rawAttrs || ''))}>`;
  });
}

function sanitizeLayoutAttributes(attrs: string) {
  const safeAttrs: string[] = [];

  attrs.replace(/\s+([a-z0-9:-]+)\s*=\s*("([^"]*)"|'([^']*)')/gi, (_match, rawName, _quoted, doubleValue, singleValue) => {
    const name = String(rawName).toLowerCase();
    const value = String(doubleValue ?? singleValue ?? '');

    if (name === 'style') {
      const style = sanitizeStyle(value);
      if (style) safeAttrs.push(`style="${escapeAttribute(style)}"`);
    } else if ((name === 'colspan' || name === 'rowspan') && /^\d{1,2}$/.test(value)) {
      safeAttrs.push(`${name}="${value}"`);
    }

    return '';
  });

  return safeAttrs.length ? ` ${safeAttrs.join(' ')}` : '';
}

function sanitizeStyle(style: string) {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [property, ...valueParts] = part.split(':');
      const prop = property.trim().toLowerCase();
      const value = valueParts.join(':').trim();

      if (!allowedLayoutStyleProps.has(prop)) return '';
      if (/url|expression|javascript|position\s*:|fixed|absolute/i.test(value)) return '';

      return `${prop}:${value}`;
    })
    .filter(Boolean)
    .join(';');
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

class TypeCopyUserError extends Error {
  statusCode: number;
  body: Omit<TypeCopyFailureResponse, 'success' | 'message'>;

  constructor(message: string, statusCode = 400, body: Omit<TypeCopyFailureResponse, 'success' | 'message'> = {}) {
    super(message);
    this.name = 'TypeCopyUserError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

class TypeCopyChunkRequiredError extends TypeCopyUserError {
  constructor(pdfInfo: PdfInfo, chunkSize: number) {
    const body = chunkRequiredResponse(pdfInfo, chunkSize);
    super(body.message, 413, {
      code: body.code,
      pageCount: body.pageCount,
      chunkSize: body.chunkSize,
      maxPageCount: body.maxPageCount,
      scanned: body.scanned,
    });
    this.name = 'TypeCopyChunkRequiredError';
  }
}

function typeCopyErrorResponse(error: any) {
  if (error instanceof TypeCopyUserError) {
    return { message: error.message, statusCode: error.statusCode, body: error.body };
  }

  const message = String(error?.message || '');
  const code = String(error?.code || error?.error?.code || '');
  const status = Number(error?.status || error?.statusCode || 0);

  if (/maxFileSize/i.test(message) || code === 'LIMIT_FILE_SIZE') {
    return { message: `File exceeds ${maxUploadSizeMb}MB limit.`, statusCode: 413, body: {} };
  }

  if (/OPENAI_API_KEY/i.test(message)) {
    return { message: 'OCR requires OPENAI_API_KEY to be configured.', statusCode: 500, body: {} };
  }

  if (status === 401 || code === 'invalid_api_key') {
    return { message: 'OpenAI OCR authentication failed. Check the production OPENAI_API_KEY.', statusCode: 500, body: {} };
  }

  if (isOpenAiQuotaError(error)) {
    return {
      message: 'OpenAI OCR credits are exhausted. Add API credits or adjust billing limits before trying again.',
      statusCode: 429,
      body: { code: 'ocr_quota_exceeded' as const },
    };
  }

  if (isOpenAiRateLimitError(error)) {
    const retryAfterSeconds = retryAfterSecondsFromError(error);
    return {
      message: 'OpenAI OCR is temporarily rate-limited. Type Copy will retry this batch automatically.',
      statusCode: 429,
      body: {
        code: 'ocr_rate_limited' as const,
        retryAfterSeconds,
        chunkSize: Math.max(1, Math.min(rateLimitedOcrChunkSize, maxSynchronousScannedPages)),
        scanned: true,
      },
    };
  }

  if (/timeout|timed out|ETIMEDOUT/i.test(message)) {
    return { message: 'OCR took too long for this document. Type Copy processes long scans in batches; try again or upload a smaller batch.', statusCode: 504, body: {} };
  }

  if (/Invalid PDF|bad XRef|FormatError|InvalidPDFException/i.test(`${message} ${String(error?.details || '')}`)) {
    return { message: 'The uploaded file is not a valid PDF.', statusCode: 400, body: {} };
  }

  return { message: 'Unable to generate Type Copy for this document.', statusCode: 500, body: {} };
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isOpenAiQuotaError(error: any) {
  const message = String(error?.message || error?.error?.message || '');
  const code = String(error?.code || error?.error?.code || '');
  const type = String(error?.type || error?.error?.type || '');

  return code === 'insufficient_quota'
    || code === 'credit_balance_exhausted'
    || type === 'insufficient_quota'
    || /insufficient_quota|credit_balance_exhausted|exceeded your current quota|billing quota|run out of credits|no credits remaining|add credits|no balance left/i.test(message);
}

function isOpenAiRateLimitError(error: any) {
  if (isOpenAiQuotaError(error)) return false;

  const message = String(error?.message || error?.error?.message || '');
  const code = String(error?.code || error?.error?.code || '');
  const status = Number(error?.status || error?.statusCode || 0);

  return status === 429 || code === 'rate_limit_exceeded' || /rate limit/i.test(message);
}

function retryAfterSecondsFromError(error: any) {
  const rawRetryAfter = headerValue(error?.headers, 'retry-after')
    || headerValue(error?.response?.headers, 'retry-after');

  if (rawRetryAfter) {
    const numeric = Number(rawRetryAfter);
    if (Number.isFinite(numeric) && numeric > 0) return Math.ceil(numeric);

    const retryDate = Date.parse(rawRetryAfter);
    if (Number.isFinite(retryDate)) {
      const seconds = Math.ceil((retryDate - Date.now()) / 1000);
      if (seconds > 0) return seconds;
    }
  }

  return ocrRateLimitRetryAfterSeconds;
}

function headerValue(headers: any, name: string) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';

  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }

  return '';
}
