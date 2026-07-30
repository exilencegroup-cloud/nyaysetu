import { type TypeCopyResult } from './typeCopyDemo';

export const maxRateLimitRetriesPerBatch = 12;

export type TypeCopyFailureCode =
  | 'chunk_required'
  | 'page_limit_exceeded'
  | 'ocr_rate_limited'
  | 'ocr_quota_exceeded'
  | 'server_timeout';

export type TypeCopyFailurePayload = {
  success: false;
  message: string;
  code?: TypeCopyFailureCode;
  pageCount?: number;
  chunkSize?: number;
  maxPageCount?: number;
  scanned?: boolean;
  retryAfterSeconds?: number;
};

export type TypeCopyApiPayload =
  | { success: true; data: TypeCopyResult; message?: string }
  | TypeCopyFailurePayload;

export async function postTypeCopyFile(file: File, fields: Record<string, string | number> = {}) {
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

export async function postTypeCopyFileWithRateLimitRetry(
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

export function normalizeChunkSize(chunkSize: number, pageCount: number, fallback: number) {
  const parsed = Number(chunkSize);
  if (!Number.isFinite(parsed) || parsed < 1) return Math.min(fallback, pageCount);
  return Math.max(1, Math.min(Math.floor(parsed), pageCount));
}

export function isChunkRequired(payload: TypeCopyApiPayload): payload is TypeCopyFailurePayload & { code: 'chunk_required' } {
  return payload.success === false && payload.code === 'chunk_required';
}

export function isOcrRateLimited(payload: TypeCopyApiPayload): payload is TypeCopyFailurePayload & { code: 'ocr_rate_limited' } {
  return payload.success === false && payload.code === 'ocr_rate_limited';
}

export function isOcrQuotaExceeded(payload: TypeCopyApiPayload): payload is TypeCopyFailurePayload & { code: 'ocr_quota_exceeded' } {
  return payload.success === false && payload.code === 'ocr_quota_exceeded';
}

export function isServerTimeout(payload: TypeCopyApiPayload, status = 0) {
  return payload.success === false
    && (payload.code === 'server_timeout' || status === 504 || /took too long|timeout/i.test(payload.message));
}

export async function waitForOcrRateLimit(
  payload: TypeCopyFailurePayload & { code: 'ocr_rate_limited' },
  setProgress: (message: string) => void,
  label: string,
  attempt = 1,
) {
  const retryAfterSeconds = rateLimitDelaySeconds(payload, attempt);
  setProgress(`OpenAI OCR is busy. Retrying ${label} in ${retryAfterSeconds}s...`);
  await sleep(retryAfterSeconds * 1000);
}

export function rateLimitDelaySeconds(payload: TypeCopyFailurePayload & { code: 'ocr_rate_limited' }, attempt: number) {
  const requestedDelay = Number(payload.retryAfterSeconds || 0);
  const backoffDelay = 15 + Math.max(0, attempt - 1) * 10;
  const delay = Math.max(requestedDelay, backoffDelay);

  return Math.max(10, Math.min(Math.ceil(delay), 90));
}

export function sleep(ms: number) {
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

  const { message, code } = readableServerMessage(body);

  return {
    success: false,
    message: message || `Upload failed with server status ${response.status}.`,
    code,
  };
}

function readableServerMessage(body: string): { message: string; code?: TypeCopyFailureCode } {
  const cleaned = body
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return { message: '' };
  if (/FUNCTION_INVOCATION_TIMEOUT|timed out|timeout/i.test(cleaned)) {
    return {
      code: 'server_timeout',
      message: 'Type Copy took too long on the live server. Retrying with a smaller OCR batch.',
    };
  }

  if (/body exceeded|payload too large|request entity too large|content length/i.test(cleaned)) {
    return { message: 'This file is too large for the live upload request. Upload a smaller file and try again.' };
  }

  return { message: cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned };
}
