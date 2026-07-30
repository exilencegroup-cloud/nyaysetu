import React, { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { AlertTriangle, ArrowLeft, FileText, ScanText, UploadCloud, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/Loader';
import {
  buildTypeCopyDraftText,
  documentIdFor,
  extensionFor,
  formatBytes,
  supportedTypeCopyExtensions,
} from '@/lib/typeCopyDemo';
import { clearTypeCopyJob, saveTypeCopyJob, saveTypeCopyResult } from '@/lib/typeCopyStorage';
import {
  isChunkRequired,
  normalizeChunkSize,
  postTypeCopyFileWithRateLimitRetry,
} from '@/lib/typeCopyClient';
import { cn } from '@/lib/utils';

const maxUploadSizeMb = 500;
const maxUploadSizeBytes = maxUploadSizeMb * 1024 * 1024;
const maxPdfPagesPerDocument = 1000;
const maxScannedPagesPerBatch = 10;
const preferredScannedPagesPerBatch = 3;

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
        setProcessingMessage('Opening Type Copy preview...');
        await createBackgroundTypeCopyJob(file, payload);
        router.push('/type-copy-results');
        return;
      }

      if (!ok || !payload.success) {
        throw new Error(payload.message || 'Unable to generate Type Copy.');
      }

      setProcessingMessage('Saving Type Copy preview...');
      await saveTypeCopyResult(payload.data);
      await clearTypeCopyJob();
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

async function createBackgroundTypeCopyJob(
  file: File,
  initialPayload: {
    success: false;
    message: string;
    pageCount?: number;
    chunkSize?: number;
    scanned?: boolean;
  },
) {
  const pageCount = Number(initialPayload.pageCount || 0);
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    throw new Error(initialPayload.message || 'Unable to read PDF page count.');
  }

  if (pageCount > maxPdfPagesPerDocument) {
    throw new Error(`This PDF has ${pageCount} pages. Type Copy supports up to ${maxPdfPagesPerDocument} pages per document.`);
  }

  const scanned = initialPayload.scanned === true;
  const fallbackChunkSize = scanned ? preferredScannedPagesPerBatch : maxScannedPagesPerBatch;
  const serverChunkSize = normalizeChunkSize(initialPayload.chunkSize || fallbackChunkSize, pageCount, fallbackChunkSize);
  const chunkSize = scanned
    ? Math.min(serverChunkSize, preferredScannedPagesPerBatch)
    : serverChunkSize;
  const now = new Date().toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const updatedAt = new Date().toISOString();
  const documentId = documentIdFor(file.name);
  const extension = extensionFor(file.name);
  const jobId = `typecopy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const message = scanned
    ? `OCR started. First ${chunkSize} pages will appear shortly.`
    : `Processing started. First ${chunkSize} pages will appear shortly.`;

  await saveTypeCopyResult({
    fileName: file.name,
    fileSize: file.size,
    extension,
    documentId,
    processedAt: now,
    pageCount,
    pages: [],
    draftText: buildTypeCopyDraftText(file.name, documentId, [], pageCount),
    processing: {
      jobId,
      status: 'queued',
      processedPages: 0,
      totalPages: pageCount,
      nextPage: 1,
      chunkSize,
      scanned,
      message,
      updatedAt,
    },
  });

  await saveTypeCopyJob({
    jobId,
    file,
    fileName: file.name,
    fileSize: file.size,
    extension,
    documentId,
    pageCount,
    chunkSize,
    scanned,
    nextPage: 1,
    status: 'queued',
    retryCount: 0,
    message,
    createdAt: updatedAt,
    updatedAt,
  });
}
