import { get, put } from '@vercel/blob';
import { buildTypeCopyDraftText, type TypeCopyPage, type TypeCopyResult } from './typeCopyDemo';

export interface DurableTypeCopyJob extends TypeCopyResult {
  jobId: string;
  sourceUrl: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  workflowRunId?: string;
  error?: string;
  updatedAt: string;
}

const jobPath = (jobId: string) => `type-copy/jobs/${jobId}/status.json`;

export async function saveDurableTypeCopyJob(job: DurableTypeCopyJob) {
  return put(jobPath(job.jobId), JSON.stringify(job), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

export async function loadDurableTypeCopyJob(jobId: string) {
  const stored = await get(jobPath(jobId), { access: 'private', useCache: false });
  if (!stored?.stream) return null;
  return JSON.parse(await new Response(stored.stream).text()) as DurableTypeCopyJob;
}

export function createDurableTypeCopyJob(input: {
  jobId: string;
  sourceUrl: string;
  fileName: string;
  fileSize: number;
  extension: string;
  documentId: string;
}): DurableTypeCopyJob {
  const updatedAt = new Date().toISOString();
  return {
    ...input,
    processedAt: new Date().toLocaleString(),
    pageCount: 0,
    pages: [],
    draftText: buildTypeCopyDraftText(input.fileName, input.documentId, [], 0),
    jobId: input.jobId,
    sourceUrl: input.sourceUrl,
    status: 'queued',
    updatedAt,
    processing: {
      jobId: input.jobId,
      status: 'queued',
      processedPages: 0,
      totalPages: 0,
      nextPage: 1,
      chunkSize: 1,
      scanned: true,
      message: 'Upload complete. OCR is starting...',
      updatedAt,
    },
  };
}

export function updateDurableTypeCopyJob(job: DurableTypeCopyJob, pages: TypeCopyPage[], pageCount: number, status: DurableTypeCopyJob['status'], message: string, error?: string): DurableTypeCopyJob {
  const updatedAt = new Date().toISOString();
  const orderedPages = [...pages].sort((left, right) => left.pageNumber - right.pageNumber);
  return {
    ...job,
    pageCount,
    pages: orderedPages,
    draftText: buildTypeCopyDraftText(job.fileName, job.documentId, orderedPages, pageCount),
    status,
    error,
    updatedAt,
    processing: {
      jobId: job.jobId,
      status,
      processedPages: orderedPages.length,
      totalPages: pageCount,
      nextPage: Math.min(pageCount + 1, orderedPages.length + 1),
      chunkSize: 1,
      scanned: true,
      message,
      error,
      updatedAt,
    },
  };
}
