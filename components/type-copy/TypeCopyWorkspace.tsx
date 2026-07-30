import React, { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { AlertTriangle, ArrowLeft, FileText, ScanText, UploadCloud, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/Loader';
import {
  buildTypeCopyDraftText,
  extensionFor,
  formatBytes,
  supportedTypeCopyExtensions,
  type TypeCopyPage,
  type TypeCopyResult,
} from '@/lib/typeCopyDemo';
import { saveTypeCopyResult } from '@/lib/typeCopyStorage';
import { cn } from '@/lib/utils';

const maxUploadSizeMb = 500;
const maxUploadSizeBytes = maxUploadSizeMb * 1024 * 1024;
const maxPdfPagesPerDocument = 1000;
const maxScannedPagesPerBatch = 10;
const maxRateLimitRetriesPerBatch = 12;
const scannedBatchPauseMs = 2500;

export function TypeCopyWorkspace() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [dragging, setDragging] = useState(false);

  function handleFile(selectedFile: File) {
    const extension = extensionFor(selectedFile.name);

    if (!supportedTypeCopyExtensions.has(extension)) {
      setFile(null);
      setError('Upload PDF, JPG, PNG, or TIFF.');
      return;
    }

    if (selectedFile.size > maxUploadSizeBytes) {
      setFile(null);
      setError(`File exceeds ${maxUploadSizeMb}MB limit.`);
      return;
    }

    setFile(selectedFile);
    setError('');
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) handleFile(selectedFile);
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const selectedFile = event.dataTransfer.files[0];
    if (selectedFile) handleFile(selectedFile);
  }

  function removeFile() {
    setFile(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function generateTypeCopy() {
    if (!file) {
      setError('Upload a scanned legal document first.');
      return;
    }

    setProcessing(true);
    setProcessingMessage('Reading the document...');
    setError('');

    try {
      const { ok, payload } = await postTypeCopyFileWithRateLimitRetry(
        file,
        {},
        setProcessingMessage,
        'this document',
      );

      if (isChunkRequired(payload)) {
        const result = await generateBatchedTypeCopy(file, payload, setProcessingMessage);
        setProcessingMessage('Saving Type Copy preview...');
        await saveTypeCopyResult(result);
        router.push('/type-copy-results');
        return;
      }

      if (!ok || !payload.success) {
        throw new Error(payload.message || 'Unable to generate Type Copy.');
      }

      setProcessingMessage('Saving Type Copy preview...');
      await saveTypeCopyResult(payload.data);
      router.push('/type-copy-results');
    } catch (err: any) {
      setError(err.message || 'Unable to generate Type Copy.');
      setProcessing(false);
      setProcessingMessage('');
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-12">
      <div className="w-full max-w-xs sm:max-w-md md:max-w-xl lg:max-w-2xl">
        <button
          onClick={() => router.push('/')}
          className="mb-5 inline-flex items-center gap-2 text-xs sm:text-sm text-muted hover:text-secondary transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Home
        </button>

        <div className="text-center mb-4 sm:mb-6 md:mb-8">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent/10">
            <ScanText size={30} className="text-accent" />
          </div>
          <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-serif font-bold text-primary mb-2">
            AI Type Copy
          </h1>
          <p className="text-xs sm:text-sm md:text-base text-secondary px-2">
            Upload a scanned legal document to create an editable review-ready Type Copy
          </p>
        </div>

        <Card padding="lg" className="border border-border">
          {!processing ? (
            <>
              <label
                className={cn(
                  'flex min-h-[15rem] cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed bg-background p-4 sm:p-8 text-center transition-all duration-200',
                  dragging ? 'border-primary bg-card' : 'border-border hover:border-accent hover:bg-card/50',
                  error && 'border-red-500',
                  file && 'border-accent bg-card',
                )}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragging(false);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  ref={inputRef}
                  aria-label="Upload scanned legal document"
                  className="hidden"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/jpeg,image/png,image/tiff"
                  onChange={handleInputChange}
                />

                {!file ? (
                  <>
                    <UploadCloud size={38} className="text-muted" />
                    <p className="mt-4 text-secondary text-xs sm:text-sm md:text-base">Drag and drop or click to upload</p>
                    <p className="mt-2 text-muted text-xs sm:text-sm">
                      PDF, JPG, PNG, TIFF. Max {maxUploadSizeMb}MB. PDFs up to {maxPdfPagesPerDocument} pages.
                    </p>
                  </>
                ) : (
                  <div className="flex w-full items-center justify-between gap-3 rounded-lg bg-background p-3 sm:p-4">
                    <div className="flex min-w-0 items-center gap-3 text-left">
                      <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-accent/10">
                        <FileText size={20} className="text-accent" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-primary" title={file.name}>{file.name}</p>
                        <p className="mt-1 text-xs text-muted">{formatBytes(file.size)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        removeFile();
                      }}
                      className="rounded-lg p-2 text-muted transition hover:bg-primary/5"
                      aria-label="Remove file"
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
              </label>

              {error ? (
                <p className="mt-4 flex items-center justify-center gap-2 text-sm text-red-600">
                  <AlertTriangle size={16} />
                  {error}
                </p>
              ) : null}

              {file ? (
                <div className="mt-6 flex justify-end">
                  <Button onClick={generateTypeCopy} variant="primary" size="lg" className="w-full sm:w-auto">
                    <Wand2 size={18} className="mr-2" />
                    Generate Type Copy
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12">
              <Loader size="lg" color="accent" />
              <h2 className="mt-5 text-lg font-serif font-semibold text-primary">Preparing Type Copy</h2>
              <p className="mt-2 max-w-sm text-center text-sm text-secondary">
                {processingMessage || 'Reading the document and preparing the editable Type Copy.'}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

type TypeCopyFailurePayload = {
  success: false;
  message: string;
  code?: 'chunk_required' | 'page_limit_exceeded' | 'ocr_rate_limited' | 'ocr_quota_exceeded';
  pageCount?: number;
  chunkSize?: number;
  maxPageCount?: number;
  scanned?: boolean;
  retryAfterSeconds?: number;
};

type TypeCopyApiPayload =
  | { success: true; data: TypeCopyResult; message?: string }
  | TypeCopyFailurePayload;

async function postTypeCopyFile(file: File, fields: Record<string, string | number> = {}) {
  const formData = new FormData();
  formData.append('file', file);

  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, String(value));
  }

  const response = await fetch('/api/type-copy', {
    method: 'POST',
    body: formData,
  });

  return {
    ok: response.ok,
    status: response.status,
    payload: await readTypeCopyResponse(response),
  };
}

async function generateBatchedTypeCopy(
  file: File,
  initialPayload: Extract<TypeCopyApiPayload, { success: false }>,
  setProgress: (message: string) => void,
) {
  const pageCount = Number(initialPayload.pageCount || 0);
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    throw new Error(initialPayload.message || 'Unable to read PDF page count.');
  }

  if (pageCount > maxPdfPagesPerDocument) {
    throw new Error(`This PDF has ${pageCount} pages. Type Copy supports up to ${maxPdfPagesPerDocument} pages per document.`);
  }

  let chunkSize = normalizeChunkSize(initialPayload.chunkSize || maxScannedPagesPerBatch, pageCount);
  const scanned = initialPayload.scanned === true;

  while (true) {
    const pages: TypeCopyPage[] = [];
    let baseResult: TypeCopyResult | null = null;
    let start = 1;
    let rateLimitRetriesForCurrentBatch = 0;

    while (start <= pageCount) {
      const end = Math.min(pageCount, start + chunkSize - 1);
      setProgress(`Processing pages ${start}-${end} of ${pageCount}...`);

      const { ok, payload } = await postTypeCopyFile(file, {
        pageStart: start,
        pageEnd: end,
      });

      if (isOcrRateLimited(payload)) {
        rateLimitRetriesForCurrentBatch += 1;
        if (rateLimitRetriesForCurrentBatch > maxRateLimitRetriesPerBatch) {
          throw new Error('OpenAI OCR is still rate-limited. Please try again in a few minutes.');
        }

        const nextChunkSize = normalizeChunkSize(payload.chunkSize || Math.ceil(chunkSize / 2), pageCount);
        if (nextChunkSize < chunkSize) chunkSize = nextChunkSize;

        await waitForOcrRateLimit(
          payload,
          setProgress,
          `pages ${start}-${Math.min(pageCount, start + chunkSize - 1)}`,
          rateLimitRetriesForCurrentBatch,
        );
        continue;
      }

      if (isOcrQuotaExceeded(payload)) {
        throw new Error(payload.message || 'OpenAI OCR credits are exhausted. Add API credits or adjust billing limits before trying again.');
      }

      if (isChunkRequired(payload)) {
        const nextChunkSize = normalizeChunkSize(payload.chunkSize || maxScannedPagesPerBatch, pageCount);

        if (nextChunkSize < chunkSize) {
          chunkSize = nextChunkSize;
          setProgress(`Switching to ${chunkSize}-page OCR batches...`);
          continue;
        }
      }

      if (!ok || !payload.success) {
        throw new Error(payload.message || `Unable to process pages ${start}-${end}.`);
      }

      baseResult = baseResult || payload.data;
      pages.push(...payload.data.pages);
      start = end + 1;
      rateLimitRetriesForCurrentBatch = 0;

      if (scanned && start <= pageCount) {
        setProgress('Preparing the next OCR batch...');
        await sleep(scannedBatchPauseMs);
      }
    }

    if (!baseResult || pages.length === 0) {
      throw new Error('Unable to generate Type Copy.');
    }

    const sortedPages = Array.from(
      new Map(pages.map((page) => [page.pageNumber, page])).values(),
    ).sort((a, b) => a.pageNumber - b.pageNumber);

    return {
      ...baseResult,
      pageCount,
      pages: sortedPages,
      draftText: buildTypeCopyDraftText(baseResult.fileName, baseResult.documentId, sortedPages, pageCount),
    };
  }
}

async function postTypeCopyFileWithRateLimitRetry(
  file: File,
  fields: Record<string, string | number>,
  setProgress: (message: string) => void,
  label: string,
) {
  for (let attempt = 1; attempt <= maxRateLimitRetriesPerBatch + 1; attempt += 1) {
    const result = await postTypeCopyFile(file, fields);

    if (!isOcrRateLimited(result.payload)) return result;

    if (attempt > maxRateLimitRetriesPerBatch) {
      throw new Error('OpenAI OCR is still rate-limited. Please try again in a few minutes.');
    }

    await waitForOcrRateLimit(result.payload, setProgress, label, attempt);
  }

  throw new Error('Unable to generate Type Copy.');
}

function normalizeChunkSize(chunkSize: number, pageCount: number) {
  const parsed = Number(chunkSize);
  if (!Number.isFinite(parsed) || parsed < 1) return Math.min(maxScannedPagesPerBatch, pageCount);
  return Math.max(1, Math.min(Math.floor(parsed), pageCount));
}

function isChunkRequired(payload: TypeCopyApiPayload): payload is Extract<TypeCopyApiPayload, { success: false }> {
  return payload.success === false && payload.code === 'chunk_required';
}

function isOcrRateLimited(payload: TypeCopyApiPayload): payload is TypeCopyFailurePayload & { code: 'ocr_rate_limited' } {
  return payload.success === false && payload.code === 'ocr_rate_limited';
}

function isOcrQuotaExceeded(payload: TypeCopyApiPayload): payload is TypeCopyFailurePayload & { code: 'ocr_quota_exceeded' } {
  return payload.success === false && payload.code === 'ocr_quota_exceeded';
}

async function waitForOcrRateLimit(
  payload: TypeCopyFailurePayload & { code: 'ocr_rate_limited' },
  setProgress: (message: string) => void,
  label: string,
  attempt = 1,
) {
  const retryAfterSeconds = rateLimitDelaySeconds(payload, attempt);
  setProgress(`OpenAI OCR is busy. Retrying ${label} in ${retryAfterSeconds}s...`);
  await sleep(retryAfterSeconds * 1000);
}

function rateLimitDelaySeconds(payload: TypeCopyFailurePayload & { code: 'ocr_rate_limited' }, attempt: number) {
  const requestedDelay = Number(payload.retryAfterSeconds || 0);
  const backoffDelay = 15 + Math.max(0, attempt - 1) * 10;
  const delay = Math.max(requestedDelay, backoffDelay);

  return Math.max(10, Math.min(Math.ceil(delay), 90));
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function readTypeCopyResponse(response: Response): Promise<TypeCopyApiPayload> {
  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(body) as TypeCopyApiPayload;
    } catch {
      return {
        success: false,
        message: 'The server returned an unreadable response. Please try again.',
      };
    }
  }

  const message = readableServerMessage(body);

  return {
    success: false,
    message: message || `Upload failed with server status ${response.status}.`,
  };
}

function readableServerMessage(body: string) {
  const cleaned = body
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (/FUNCTION_INVOCATION_TIMEOUT|timed out|timeout/i.test(cleaned)) {
    return 'Type Copy took too long on the live server. Try again; long scanned PDFs are processed in smaller batches automatically.';
  }

  if (/body exceeded|payload too large|request entity too large|content length/i.test(cleaned)) {
    return 'This file is too large for the live upload request. Upload a smaller file and try again.';
  }

  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}
