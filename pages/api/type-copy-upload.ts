import type { NextApiRequest, NextApiResponse } from 'next';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { start } from 'workflow/api';
import { processTypeCopyDocument } from '@/workflows/typeCopy';

const maxUploadSizeBytes = 500 * 1024 * 1024;
const allowedContentTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const response = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const metadata = parseUploadMetadata(clientPayload);
        const extension = metadata.fileName.split('.').pop()?.toLowerCase();

        if (!extension || !['pdf', 'jpg', 'jpeg', 'png', 'tif', 'tiff'].includes(extension)) {
          throw new Error('Unsupported Type Copy file.');
        }

        return {
          allowedContentTypes,
          maximumSizeInBytes: maxUploadSizeBytes,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify(metadata),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const metadata = parseUploadMetadata(tokenPayload || null);
        if (!metadata.jobId || !metadata.fileName) throw new Error('Upload metadata is missing.');
        await start(processTypeCopyDocument, [{
          jobId: metadata.jobId,
          sourceUrl: blob.url,
          fileName: metadata.fileName,
          fileSize: metadata.fileSize,
        }], {
          experimental_hook: { token: `type-copy:${metadata.jobId}` },
        });
      },
    });

    return res.status(200).json(response);
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || 'Unable to prepare the private upload.' });
  }
}

function parseUploadMetadata(payload: string | null) {
  try {
    const value = JSON.parse(payload || '{}');
    return {
      fileName: typeof value.fileName === 'string' ? value.fileName : '',
      jobId: typeof value.jobId === 'string' ? value.jobId : '',
      fileSize: Number.isFinite(Number(value.fileSize)) ? Number(value.fileSize) : 0,
    };
  } catch {
    return { fileName: '', jobId: '', fileSize: 0 };
  }
}
