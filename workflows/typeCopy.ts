import { processStoredTypeCopyRange } from '@/pages/api/type-copy';
import { createDurableTypeCopyJob, saveDurableTypeCopyJob, updateDurableTypeCopyJob, type DurableTypeCopyJob } from '@/lib/typeCopyJobStore';
import { documentIdFor, extensionFor, type TypeCopyPage } from '@/lib/typeCopyDemo';

export async function processTypeCopyDocument(input: { jobId: string; sourceUrl: string; fileName: string; fileSize: number }) {
  'use workflow';

  let job = await createJob(input);
  const first = await processPage(input, 1);
  const pages: TypeCopyPage[] = [...first.pages];
  job = await persist(job, pages, first.pageCount, first.pageCount === 1 ? 'complete' : 'processing');

  for (let pageNumber = 2; pageNumber <= first.pageCount; pageNumber += 1) {
    const next = await processPage(input, pageNumber);
    pages.push(...next.pages);
    const complete = pageNumber === first.pageCount;
    job = await persist(job, pages, first.pageCount, complete ? 'complete' : 'processing');
  }

  return { jobId: job.jobId, status: job.status };
}

async function createJob(input: { jobId: string; sourceUrl: string; fileName: string; fileSize: number }) {
  'use step';
  const job = createDurableTypeCopyJob({
    ...input,
    extension: extensionFor(input.fileName),
    documentId: documentIdFor(input.fileName),
  });
  await saveDurableTypeCopyJob(job);
  return job;
}

async function processPage(input: { sourceUrl: string; fileName: string; fileSize: number }, pageNumber: number) {
  'use step';
  console.info(`Type Copy OCR page ${pageNumber}`);
  return processStoredTypeCopyRange({
    blobUrl: input.sourceUrl,
    fileName: input.fileName,
    fileSize: input.fileSize,
    pageStart: pageNumber,
    pageEnd: pageNumber,
  });
}

async function persist(job: DurableTypeCopyJob, pages: TypeCopyPage[], pageCount: number, status: DurableTypeCopyJob['status']) {
  'use step';
  const message = status === 'complete'
    ? 'Type Copy processing complete.'
    : `${pages.length} of ${pageCount} pages ready. Continuing in the background...`;
  const updated = updateDurableTypeCopyJob(job, pages, pageCount, status, message);
  await saveDurableTypeCopyJob(updated);
  return updated;
}
