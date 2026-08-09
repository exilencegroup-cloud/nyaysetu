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
  type TypeCopyLayoutBlock,
  type TypeCopyPage,
  type TypeCopyPageLayout,
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
const maxPreviewSourceImageBytes = positiveNumber(process.env.TYPE_COPY_MAX_PREVIEW_IMAGE_BYTES, 2 * 1024 * 1024);
const ocrRateLimitRetryAfterSeconds = positiveNumber(process.env.TYPE_COPY_OCR_RATE_LIMIT_RETRY_SECONDS, 25);
const rateLimitedOcrChunkSize = positiveNumber(process.env.TYPE_COPY_RATE_LIMIT_OCR_CHUNK_PAGES, 3);
const minimumMeaningfulOcrChars = 4;
const ocrLayoutPageWidth = 1000;
const ocrLayoutPageHeight = 1414;
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
  pageLayout?: TypeCopyPageLayout;
  sourceImageDataUrl?: string;
}

interface PageGeometry {
  pageWidth: number;
  pageHeight: number;
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
      pageLayout: layout?.pageLayout,
      sourceImageDataUrl: layout?.sourceImageDataUrl,
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
  const viewport = pageData.getViewport(1);
  const pageWidth = positiveFiniteNumber(viewport?.width, 612);
  const pageHeight = positiveFiniteNumber(viewport?.height, 792);

  const items = (textContent.items || [])
    .map((item: any) => {
      const transform = Array.isArray(item.transform) ? item.transform : [];
      const fontHeight = positiveFiniteNumber(Math.abs(Number(transform[3] || item.height || 0)), 10);
      const x = Number(transform[4] || 0);
      const baselineY = Number(transform[5] || 0);
      const width = positiveFiniteNumber(Number(item.width || 0), String(item.str || '').length * fontHeight * 0.48);

      return {
        text: String(item.str || '').trim(),
        x,
        y: baselineY,
        top: clamp(pageHeight - baselineY - fontHeight, 0, pageHeight),
        width,
        height: fontHeight,
      };
    })
    .filter((item: { text: string }) => item.text);

  if (items.length === 0) return { text: '', layoutHtml: '' };

  const lineTolerance = 3.5;
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

  const blocks = lines
    .sort((a, b) => b.y - a.y)
    .flatMap((line, lineIndex) => splitLineItemsIntoSegments(line.items, pageWidth).map((segment, segmentIndex) => {
      const x = Math.min(...segment.map((item) => item.x));
      const right = Math.max(...segment.map((item) => item.x + item.width));
      const top = Math.min(...segment.map((item) => item.top));
      const bottom = Math.max(...segment.map((item) => item.top + item.height));
      const text = buildPositionedLineText(segment);
      const width = Math.max(right - x, 1);
      const height = Math.max(bottom - top, 1);

      return {
        id: `line-${lineIndex + 1}-${segmentIndex + 1}`,
        text,
        x: roundLayoutNumber(x),
        y: roundLayoutNumber(top),
        width: roundLayoutNumber(width),
        height: roundLayoutNumber(height * 1.35),
        align: inferTextBlockAlign(x, width, pageWidth),
        kind: inferTextBlockKind(text, top, pageHeight, x, width, pageWidth),
      } satisfies TypeCopyLayoutBlock;
    }))
    .filter((block) => block.text);

  const pageLayout = normalizePageLayout({ pageWidth, pageHeight, blocks });
  const text = textFromLayoutBlocks(pageLayout.blocks);

  return {
    text,
    layoutHtml: layoutHtmlFromPageLayout(pageLayout),
    pageLayout,
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
      pageLayout: layout.pageLayout,
      sourceImageDataUrl: layout.sourceImageDataUrl,
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

        applyOcrLayoutToPage(page, layout);
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

        applyOcrLayoutToPage(page, layout);
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
        applyOcrLayoutToPage(page, layout);
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

function applyOcrLayoutToPage(page: TypeCopyPage, layout?: OcrLayout) {
  if (!layout) return;
  if (layout.sourceImageDataUrl) page.sourceImageDataUrl = layout.sourceImageDataUrl;

  const text = normalizeExtractedText(layout.text || '');
  if (!isUsableOcrText(text)) return;

  page.text = text;
  page.layoutHtml = layout.layoutHtml || textToLayoutHtml(text);
  page.pageLayout = layout.pageLayout;
  page.status = 'ocr';
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
      'Detect visual regions first, then transcribe the text inside each region.',
      'For every requested page, return layout.pageWidth 1000 and layout.pageHeight 1414, with block x, y, width, and height in that top-left-origin coordinate system.',
      'Every heading, line, paragraph, list item, table region, footer, signature, stamp, and unreadable gap must be represented as a layout block at its approximate source position.',
      'Centered titles must be header blocks with align center. Right-side dates, page numbers, advocate names, signature blocks, and verification blocks must be align right.',
      'When the source has left and right content on the same visual row, return separate blocks with their own x positions instead of joining them into one left-aligned line.',
      'Use kind table for table regions, preserving row order with line breaks and tabs in the block text.',
      'For plainText, preserve human reading order, indentation, numbering, and practical line breaks.',
      'Set layoutHtml to an empty string; the application reconstructs visual layout from layout blocks.',
      'Do not flatten everything into left-aligned paragraphs.',
      'Do not return body, html, style, script, markdown, or code fences.',
      'Mark unreadable words or characters as (Unreadable) at the exact location in the surrounding text.',
      'If one table cell is unreadable, mark only that cell as (Unreadable).',
      'Represent stamps, seals, and signatures as short markers such as (Seal) or (Signature).',
      'If you cannot confidently transcribe meaningful visible text for a page, set that page to (Unreadable) instead of guessing.',
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
              `{"pages":[{"pageNumber":1,"plainText":"...","layoutHtml":"","layout":{"pageWidth":${ocrLayoutPageWidth},"pageHeight":${ocrLayoutPageHeight},"blocks":[{"id":"b1","text":"...","x":72,"y":90,"width":400,"height":24,"align":"left","kind":"paragraph"}]}}]}`,
              'Return the requested pages in order.',
              'If a requested page has no readable text, set plainText to "(Unreadable)" and include one unreadable layout block at the visual unreadable area.',
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
  return ocrImageBuffer(imageBuffer, pageNumber, mimeType, readImageGeometry(imageBuffer));
}

async function ocrImageBuffer(
  imageBuffer: Buffer,
  pageNumber: number,
  mimeType: string,
  geometry = readImageGeometry(imageBuffer),
): Promise<OcrLayout> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for scanned-page OCR.');
  }

  if (imageBuffer.length > maxOcrImageBytes) {
    throw new Error('Image is too large for OCR.');
  }

  const pageWidth = ocrLayoutPageWidth;
  const pageHeight = ocrLayoutPageHeight;
  const encodedImage = imageBuffer.toString('base64');
  const sourceImageDataUrl = previewImageDataUrl(imageBuffer, mimeType, encodedImage);

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
          'Detect visual regions first, then transcribe the text inside each region.',
          `Return layout.pageWidth ${pageWidth} and layout.pageHeight ${pageHeight}, with block x, y, width, and height in that top-left-origin coordinate system.`,
          'Every heading, line, paragraph, list item, table region, footer, signature, stamp, and unreadable gap must be represented as a layout block at its approximate source position.',
          'Centered titles must be header blocks with align center. Right-side dates, page numbers, advocate names, signature blocks, and verification blocks must be align right.',
          'When the source has left and right content on the same visual row, return separate blocks with their own x positions instead of joining them into one left-aligned line.',
          'Use kind table for table regions, preserving row order with line breaks and tabs in the block text.',
          'For plainText, preserve human reading order, indentation, numbering, and practical line breaks.',
          'Set layoutHtml to an empty string; the application reconstructs visual layout from layout blocks.',
          'Do not flatten everything into left-aligned paragraphs.',
          'Do not return body, html, style, script, markdown, or code fences.',
          'Mark unreadable words or characters as (Unreadable) at the exact location in the surrounding text.',
          'If one table cell is unreadable, mark only that cell as (Unreadable).',
          'Represent stamps, seals, and signatures as short markers such as (Seal) or (Signature).',
          'If no text is visible, return plainText "(Unreadable)" and one unreadable layout block at the visual unreadable area.',
          'If you cannot confidently transcribe meaningful visible text, return plainText "(Unreadable)" instead of guessing.',
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
              `{"plainText":"...","layoutHtml":"","layout":{"pageWidth":${pageWidth},"pageHeight":${pageHeight},"blocks":[{"id":"b1","text":"...","x":72,"y":90,"width":400,"height":24,"align":"left","kind":"paragraph"}]}}`,
              'Never fill plainText or layoutHtml with repeated \\n characters or placeholder letters.',
            ].join(' '),
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${encodedImage}`,
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
    return { text: '', layoutHtml: '', sourceImageDataUrl };
  }

  return {
    ...parsed,
    sourceImageDataUrl,
  };
}

function previewImageDataUrl(imageBuffer: Buffer, mimeType: string, encodedImage = imageBuffer.toString('base64')) {
  if (imageBuffer.length <= 0 || imageBuffer.length > maxPreviewSourceImageBytes) return undefined;
  const safeMimeType = /^image\/(?:png|jpe?g|webp)$/i.test(mimeType) ? mimeType : 'image/png';
  return `data:${safeMimeType};base64,${encodedImage}`;
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

function readImageGeometry(buffer: Buffer): PageGeometry {
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return {
      pageWidth: positiveFiniteNumber(buffer.readUInt32BE(16), 1000),
      pageHeight: positiveFiniteNumber(buffer.readUInt32BE(20), 1414),
    };
  }

  const jpeg = readJpegGeometry(buffer);
  if (jpeg) return jpeg;

  return { pageWidth: 1000, pageHeight: 1414 };
}

function readJpegGeometry(buffer: Buffer): PageGeometry | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;

    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        pageWidth: positiveFiniteNumber(buffer.readUInt16BE(offset + 7), 1000),
        pageHeight: positiveFiniteNumber(buffer.readUInt16BE(offset + 5), 1414),
      };
    }

    offset += 2 + length;
  }

  return null;
}

function normalizeExtractedText(text: string) {
  const cleaned = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/\(\s*not\s+readable\s*\)/gi, '(Unreadable)')
    .replace(/\(\s*unreadable\s*\)/gi, '(Unreadable)')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');

  return cleaned.trim().length ? cleaned : '';
}

function normalizeBlockText(text: string) {
  return normalizeExtractedText(text)
    .replace(/[ \t]{3,}/g, '  ')
    .trim();
}

function textFromLayoutBlocks(blocks: TypeCopyLayoutBlock[]) {
  return blocks
    .slice()
    .sort((a, b) => Math.abs(a.y - b.y) < 6 ? a.x - b.x : a.y - b.y)
    .map((block) => block.text)
    .filter(Boolean)
    .join('\n');
}

function buildPositionedLineText(items: Array<{ text: string; x: number; width: number; height: number }>) {
  let output = '';
  let lastRight = items[0]?.x || 0;
  const averageHeight = items.reduce((sum, item) => sum + item.height, 0) / Math.max(items.length, 1);
  const spaceWidth = Math.max(averageHeight * 0.42, 3);

  for (const item of items) {
    if (output) {
      const gap = item.x - lastRight;
      output += ' '.repeat(gap > spaceWidth ? Math.min(16, Math.max(1, Math.round(gap / spaceWidth))) : 1);
    }

    output += item.text;
    lastRight = item.x + item.width;
  }

  return normalizeBlockText(output);
}

function splitLineItemsIntoSegments(
  items: Array<{ text: string; x: number; width: number; height: number; top: number; y: number }>,
  pageWidth: number,
) {
  const sortedItems = items.slice().sort((a, b) => a.x - b.x);
  const segments: typeof sortedItems[] = [];
  let current: typeof sortedItems = [];
  let lastRight = 0;
  const averageHeight = sortedItems.reduce((sum, item) => sum + item.height, 0) / Math.max(sortedItems.length, 1);
  const splitGap = Math.max(pageWidth * 0.08, averageHeight * 5);

  for (const item of sortedItems) {
    if (current.length && item.x - lastRight > splitGap) {
      segments.push(current);
      current = [];
    }

    current.push(item);
    lastRight = item.x + item.width;
  }

  if (current.length) segments.push(current);
  return segments;
}

function normalizePageLayout(raw: any): TypeCopyPageLayout {
  const rawBlocks = Array.isArray(raw?.blocks) ? raw.blocks : [];
  const metrics = layoutBlockMetrics(rawBlocks);
  const rawPageWidth = clamp(positiveFiniteNumber(Number(raw?.pageWidth), ocrLayoutPageWidth), 100, 10000);
  const rawPageHeight = clamp(positiveFiniteNumber(Number(raw?.pageHeight), ocrLayoutPageHeight), 100, 20000);
  const useCanonicalScale = shouldUseCanonicalLayoutScale(rawPageWidth, rawPageHeight, metrics);
  const pageWidth = useCanonicalScale ? ocrLayoutPageWidth : rawPageWidth;
  const pageHeight = useCanonicalScale ? ocrLayoutPageHeight : rawPageHeight;
  const blocks = rawBlocks
    .slice(0, 180)
    .map((block: any, index: number) => normalizeLayoutBlock(block, index, pageWidth, pageHeight))
    .filter((block: TypeCopyLayoutBlock | null): block is TypeCopyLayoutBlock => Boolean(block))
    .sort((a: TypeCopyLayoutBlock, b: TypeCopyLayoutBlock) => Math.abs(a.y - b.y) < 6 ? a.x - b.x : a.y - b.y);

  return { pageWidth, pageHeight, blocks };
}

function layoutBlockMetrics(blocks: any[]) {
  let maxRight = 0;
  let maxBottom = 0;

  for (const block of blocks) {
    const x = Number(block?.x || 0);
    const y = Number(block?.y || 0);
    const width = Number(block?.width || 0);
    const height = Number(block?.height || 0);

    if (Number.isFinite(x) && Number.isFinite(width)) maxRight = Math.max(maxRight, x + width);
    if (Number.isFinite(y) && Number.isFinite(height)) maxBottom = Math.max(maxBottom, y + height);
  }

  return { maxRight, maxBottom };
}

function shouldUseCanonicalLayoutScale(
  pageWidth: number,
  pageHeight: number,
  metrics: { maxRight: number; maxBottom: number },
) {
  return pageWidth > ocrLayoutPageWidth * 1.45
    && pageHeight > ocrLayoutPageHeight * 1.45
    && metrics.maxRight > 0
    && metrics.maxBottom > 0
    && metrics.maxRight <= ocrLayoutPageWidth * 1.15
    && metrics.maxBottom <= ocrLayoutPageHeight * 1.15;
}

function normalizeLayoutBlock(block: any, index: number, pageWidth: number, pageHeight: number): TypeCopyLayoutBlock | null {
  const text = normalizeBlockText(String(block?.text || ''));
  if (!text) return null;

  const x = clamp(positiveFiniteNumber(Number(block?.x), 0), 0, pageWidth);
  const y = clamp(positiveFiniteNumber(Number(block?.y), 0), 0, pageHeight);
  const width = clamp(positiveFiniteNumber(Number(block?.width), pageWidth - x), 1, Math.max(1, pageWidth - x));
  const height = clamp(positiveFiniteNumber(Number(block?.height), 18), 1, Math.max(1, pageHeight - y));
  const align = normalizeBlockAlign(block?.align);
  const kind = normalizeBlockKind(block?.kind, text);

  return {
    id: sanitizeBlockId(String(block?.id || `block-${index + 1}`), index),
    text,
    x: roundLayoutNumber(x),
    y: roundLayoutNumber(y),
    width: roundLayoutNumber(width),
    height: roundLayoutNumber(height),
    align,
    kind,
  };
}

function normalizeBlockAlign(value: any): TypeCopyLayoutBlock['align'] {
  return value === 'center' || value === 'right' ? value : 'left';
}

function normalizeBlockKind(value: any, text: string): TypeCopyLayoutBlock['kind'] {
  const raw = String(value || '').toLowerCase();
  if (raw === 'header' || raw === 'paragraph' || raw === 'list' || raw === 'table' || raw === 'footer' || raw === 'signature' || raw === 'stamp' || raw === 'unreadable' || raw === 'other') {
    return raw;
  }

  if (isNotReadableText(text)) return 'unreadable';
  if (/^\s*(?:\(?\d+\)|\d+[.)])\s+/.test(text)) return 'list';
  if (/signature|signed|verified/i.test(text)) return 'signature';
  if (/seal|stamp/i.test(text)) return 'stamp';
  return 'paragraph';
}

function inferTextBlockAlign(x: number, width: number, pageWidth: number): TypeCopyLayoutBlock['align'] {
  const center = x + width / 2;
  if (Math.abs(center - pageWidth / 2) <= pageWidth * 0.08 && width <= pageWidth * 0.75) return 'center';
  if (x >= pageWidth * 0.56) return 'right';
  return 'left';
}

function inferTextBlockKind(
  text: string,
  y: number,
  pageHeight: number,
  x: number,
  width: number,
  pageWidth: number,
): TypeCopyLayoutBlock['kind'] {
  if (isNotReadableText(text)) return 'unreadable';
  if (y <= pageHeight * 0.16 && inferTextBlockAlign(x, width, pageWidth) === 'center') return 'header';
  if (y >= pageHeight * 0.86) return 'footer';
  if (/^\s*(?:\(?\d+\)|\d+[.)])\s+/.test(text)) return 'list';
  if (/signature|signed|verified/i.test(text)) return 'signature';
  if (/seal|stamp/i.test(text)) return 'stamp';
  return 'paragraph';
}

function layoutHtmlFromPageLayout(layout: TypeCopyPageLayout) {
  if (!layout.blocks.length) return '';

  const ratio = `${roundLayoutNumber(layout.pageWidth)} / ${roundLayoutNumber(layout.pageHeight)}`;
  const blocks = layout.blocks.map((block) => {
    const left = percent(block.x, layout.pageWidth);
    const top = percent(block.y, layout.pageHeight);
    const width = percent(block.width, layout.pageWidth);
    const minHeight = percent(block.height, layout.pageHeight);
    const blockStyle = [
      'position:absolute',
      `left:${left}%`,
      `top:${top}%`,
      `width:${width}%`,
      `min-height:${minHeight}%`,
      `text-align:${block.align}`,
      'white-space:pre-wrap',
      'line-height:1.32',
      'overflow:visible',
      block.kind === 'header' ? 'font-weight:700' : '',
      block.kind === 'table' ? 'border:1px solid #4b4236;padding:0.35rem' : '',
      block.kind === 'unreadable' ? 'color:#92400e' : '',
    ].filter(Boolean).join(';');

    return `<div style="${blockStyle}">${renderBlockContent(block)}</div>`;
  }).join('');

  return `<div class="type-copy-page" style="position:relative;width:100%;aspect-ratio:${ratio};font-family:'Nirmala UI','Noto Serif Gujarati',Georgia,'Times New Roman',serif;font-size:13px;color:#211b14;background:#fff;">${blocks}</div>`;
}

function renderBlockText(text: string) {
  return escapeHtml(text)
    .replace(/\(Unreadable\)/g, '<span style="background:#fef3c7;color:#92400e;padding:0 0.18rem;border-radius:0.2rem;">(Unreadable)</span>');
}

function renderBlockContent(block: TypeCopyLayoutBlock) {
  if (block.kind === 'table') return tableTextToHtml(block.text);
  return renderBlockText(block.text);
}

function tableTextToHtml(text: string) {
  const rows = text
    .split(/\n+/)
    .map(splitTableCells)
    .filter((cells) => cells.length);

  if (!rows.length || !rows.some((cells) => cells.length > 1)) {
    return renderBlockText(text);
  }

  const cellCount = Math.max(...rows.map((cells) => cells.length));
  const htmlRows = rows.map((cells) => {
    const htmlCells = Array.from({ length: cellCount }, (_, index) => {
      const cell = cells[index] || '';
      return `<td style="border:1px solid #4b4236;padding:0.28rem 0.4rem;vertical-align:top;">${renderBlockText(cell)}</td>`;
    }).join('');

    return `<tr>${htmlCells}</tr>`;
  }).join('');

  return `<table style="width:100%;border-collapse:collapse;font-size:inherit;line-height:1.25;">${htmlRows}</table>`;
}

function splitTableCells(row: string) {
  const cells = row.split(/\t+|\s*\|\s*|\s{2,}/).map((cell) => cell.trim());

  while (cells.length && !cells[0]) cells.shift();
  while (cells.length && !cells[cells.length - 1]) cells.pop();

  return cells.some(Boolean) ? cells : [];
}

function sanitizeBlockId(value: string, index: number) {
  const cleaned = value.replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  return cleaned || `block-${index + 1}`;
}

function positiveFiniteNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function percent(value: number, total: number) {
  return roundLayoutNumber((value / Math.max(total, 1)) * 100);
}

function roundLayoutNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function looksLikeStructuredOcrJson(raw: string) {
  const text = stripCodeFences(raw).trim();
  return text.startsWith('{') && /["']?(?:plainText|layoutHtml|pages)["']?\s*:/i.test(text);
}

function isNotReadableText(text: string) {
  return /^\(?(?:not\s+readable|unreadable)\)?$/i.test(normalizeExtractedText(text));
}

function isUsableOcrText(text: string) {
  const normalized = normalizeExtractedText(text);
  if (!normalized || isNotReadableText(normalized)) return false;

  const readableText = normalized.replace(/\(Unreadable\)/gi, '').trim();
  if (!readableText) return false;

  const signalChars = readableText.match(/[\p{L}\p{N}]/gu) || [];
  if (signalChars.length < minimumMeaningfulOcrChars) return false;

  const uniqueSignalChars = new Set(signalChars.map((char) => char.toLocaleLowerCase()));
  return !(signalChars.length < 12 && uniqueSignalChars.size <= 1);
}

function parseOcrLayout(raw: string): OcrLayout {
  const stripped = stripCodeFences(raw);

  try {
    const parsed = JSON.parse(stripped);
    const pageLayout = normalizePageLayout(parsed.layout);
    const layoutText = textFromLayoutBlocks(pageLayout.blocks);
    const text = normalizeExtractedText(parsed.plainText || parsed.text || layoutText);
    if (!isUsableOcrText(text)) return { text: '', layoutHtml: '' };

    const layoutHtml = sanitizeLayoutHtml(parsed.layoutHtml || '');

    return {
      text,
      layoutHtml: pageLayout.blocks.length ? layoutHtmlFromPageLayout(pageLayout) : layoutHtml || textToLayoutHtml(text),
      pageLayout: pageLayout.blocks.length ? pageLayout : undefined,
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

      const pageLayout = normalizePageLayout(page.layout);
      const layoutText = textFromLayoutBlocks(pageLayout.blocks);
      const text = normalizeExtractedText(page.plainText || page.text || layoutText);
      if (!isUsableOcrText(text)) continue;

      const layoutHtml = sanitizeLayoutHtml(page.layoutHtml || '');
      pages.set(pageNumber, {
        text,
        layoutHtml: pageLayout.blocks.length ? layoutHtmlFromPageLayout(pageLayout) : layoutHtml || textToLayoutHtml(text),
        pageLayout: pageLayout.blocks.length ? pageLayout : undefined,
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
      layout: typeCopyPageLayoutSchema(),
    },
    required: ['plainText', 'layoutHtml', 'layout'],
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
            layout: typeCopyPageLayoutSchema(),
          },
          required: ['pageNumber', 'plainText', 'layoutHtml', 'layout'],
        },
      },
    },
    required: ['pages'],
  };
}

function typeCopyPageLayoutSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      pageWidth: { type: 'number' },
      pageHeight: { type: 'number' },
      blocks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            text: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            align: { type: 'string', enum: ['left', 'center', 'right'] },
            kind: { type: 'string', enum: ['header', 'paragraph', 'list', 'table', 'footer', 'signature', 'stamp', 'unreadable', 'other'] },
          },
          required: ['id', 'text', 'x', 'y', 'width', 'height', 'align', 'kind'],
        },
      },
    },
    required: ['pageWidth', 'pageHeight', 'blocks'],
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
