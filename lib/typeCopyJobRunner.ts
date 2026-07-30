import {
  buildTypeCopyDraftText,
  type TypeCopyPage,
  type TypeCopyProcessingState,
  type TypeCopyResult,
} from './typeCopyDemo';
import {
  clearTypeCopyJob,
  saveTypeCopyJob,
  saveTypeCopyResult,
  type TypeCopyJob,
} from './typeCopyStorage';
import {
  isChunkRequired,
  isOcrQuotaExceeded,
  isOcrRateLimited,
  isServerTimeout,
  maxRateLimitRetriesPerBatch,
  normalizeChunkSize,
  postTypeCopyFile,
  rateLimitDelaySeconds,
  sleep,
} from './typeCopyClient';

interface TypeCopyJobRunnerOptions {
  onUpdate: (result: TypeCopyResult, job: TypeCopyJob | null) => void;
  shouldStop?: () => boolean;
}

export async function runTypeCopyJob(
  initialJob: TypeCopyJob,
  initialResult: TypeCopyResult,
  options: TypeCopyJobRunnerOptions,
) {
  let job = { ...initialJob };
  let result = normalizeJobResult(initialResult, job);

  while (job.nextPage <= job.pageCount) {
    if (options.shouldStop?.()) return;

    const start = job.nextPage;
    const end = Math.min(job.pageCount, start + job.chunkSize - 1);
    const progressMessage = `Processing pages ${start}-${end} of ${job.pageCount}...`;

    job = await persistJobState(job, {
      status: 'processing',
      message: progressMessage,
    });
    result = await persistResultState(result, job, {
      message: progressMessage,
    });
    options.onUpdate(result, job);

    const { ok, status, payload } = await postTypeCopyFile(job.file, {
      pageStart: start,
      pageEnd: end,
    });

    if (options.shouldStop?.()) return;

    if (isOcrRateLimited(payload)) {
      const retryCount = job.retryCount + 1;
      if (retryCount > maxRateLimitRetriesPerBatch) {
        throw await markJobFailed(job, result, 'OpenAI OCR is still rate-limited. Please try again in a few minutes.', options);
      }

      const nextChunkSize = normalizeChunkSize(payload.chunkSize || Math.ceil(job.chunkSize / 2), job.pageCount, 1);
      const chunkSize = Math.min(job.chunkSize, nextChunkSize);
      const retryAfterSeconds = rateLimitDelaySeconds(payload, retryCount);
      const message = `OpenAI OCR is busy. Retrying pages ${start}-${Math.min(job.pageCount, start + chunkSize - 1)} in ${retryAfterSeconds}s...`;

      job = await persistJobState(job, {
        chunkSize,
        retryCount,
        message,
      });
      result = await persistResultState(result, job, { message });
      options.onUpdate(result, job);
      await sleep(retryAfterSeconds * 1000);
      continue;
    }

    if (isOcrQuotaExceeded(payload)) {
      throw await markJobFailed(
        job,
        result,
        payload.message || 'OpenAI OCR credits are exhausted. Add API credits or adjust billing limits before trying again.',
        options,
      );
    }

    if (isServerTimeout(payload, status)) {
      if (job.chunkSize > 1) {
        const message = 'This batch took too long. Switching to 1-page OCR batches...';
        job = await persistJobState(job, {
          chunkSize: 1,
          retryCount: 0,
          message,
        });
        result = await persistResultState(result, job, { message });
        options.onUpdate(result, job);
        continue;
      }

      throw await markJobFailed(job, result, payload.message || `Unable to process page ${start}.`, options);
    }

    if (isChunkRequired(payload)) {
      const nextChunkSize = normalizeChunkSize(payload.chunkSize || Math.ceil(job.chunkSize / 2), job.pageCount, 1);
      if (nextChunkSize < job.chunkSize) {
        const message = `Switching to ${nextChunkSize}-page OCR batches...`;
        job = await persistJobState(job, {
          chunkSize: nextChunkSize,
          retryCount: 0,
          message,
        });
        result = await persistResultState(result, job, { message });
        options.onUpdate(result, job);
        continue;
      }
    }

    if (!ok || !payload.success) {
      throw await markJobFailed(payload.success ? job : job, result, payload.message || `Unable to process pages ${start}-${end}.`, options);
    }

    const pages = mergePages(result.pages, payload.data.pages);
    const nextPage = end + 1;
    const complete = nextPage > job.pageCount;
    const message = complete
      ? 'Type Copy processing complete.'
      : `${pages.length} of ${job.pageCount} pages ready. Continuing in the background...`;

    job = await persistJobState(job, {
      status: complete ? 'complete' : 'processing',
      nextPage,
      retryCount: 0,
      message,
    });
    result = await persistCompletedPages(result, job, pages, complete, message);
    options.onUpdate(result, complete ? null : job);

    if (complete) {
      await clearTypeCopyJob();
      return result;
    }

    if (job.scanned) {
      await sleep(1500);
    }
  }

  await clearTypeCopyJob();
  return result;
}

function normalizeJobResult(result: TypeCopyResult, job: TypeCopyJob): TypeCopyResult {
  if (result.processing?.jobId === job.jobId) return result;

  return {
    ...result,
    processing: processingStateFor(job),
  };
}

async function persistCompletedPages(
  result: TypeCopyResult,
  job: TypeCopyJob,
  pages: TypeCopyPage[],
  complete: boolean,
  message: string,
) {
  const nextResult: TypeCopyResult = {
    ...result,
    fileName: result.fileName || job.fileName,
    fileSize: result.fileSize || job.fileSize,
    extension: result.extension || job.extension,
    documentId: result.documentId || job.documentId,
    pageCount: job.pageCount,
    pages,
    draftText: buildTypeCopyDraftText(job.fileName, job.documentId, pages, job.pageCount),
    processing: {
      ...processingStateFor(job),
      status: complete ? 'complete' : 'processing',
      processedPages: pages.length,
      message,
    },
  };

  await saveTypeCopyResult(nextResult);
  return nextResult;
}

async function persistResultState(
  result: TypeCopyResult,
  job: TypeCopyJob,
  overrides: Partial<TypeCopyProcessingState> = {},
) {
  const nextResult: TypeCopyResult = {
    ...result,
    processing: {
      ...processingStateFor(job),
      processedPages: result.pages.length,
      ...overrides,
    },
  };

  await saveTypeCopyResult(nextResult);
  return nextResult;
}

async function persistJobState(job: TypeCopyJob, updates: Partial<TypeCopyJob>) {
  const nextJob: TypeCopyJob = {
    ...job,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await saveTypeCopyJob(nextJob);
  return nextJob;
}

async function markJobFailed(
  job: TypeCopyJob,
  result: TypeCopyResult,
  message: string,
  options: TypeCopyJobRunnerOptions,
) {
  const failedJob = await persistJobState(job, {
    status: 'failed',
    error: message,
    message,
  });
  const failedResult = await persistResultState(result, failedJob, {
    status: 'failed',
    error: message,
    message,
  });

  options.onUpdate(failedResult, failedJob);
  return new Error(message);
}

function processingStateFor(job: TypeCopyJob): TypeCopyProcessingState {
  return {
    jobId: job.jobId,
    status: job.status,
    processedPages: Math.max(0, job.nextPage - 1),
    totalPages: job.pageCount,
    nextPage: job.nextPage,
    chunkSize: job.chunkSize,
    scanned: job.scanned,
    message: job.message,
    error: job.error,
    updatedAt: job.updatedAt,
  };
}

function mergePages(currentPages: TypeCopyPage[], nextPages: TypeCopyPage[]) {
  return Array.from(
    new Map([...currentPages, ...nextPages].map((page) => [page.pageNumber, page])).values(),
  ).sort((a, b) => a.pageNumber - b.pageNumber);
}
