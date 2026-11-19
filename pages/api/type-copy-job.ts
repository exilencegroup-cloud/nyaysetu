import type { NextApiRequest, NextApiResponse } from 'next';
import { loadDurableTypeCopyJob } from '@/lib/typeCopyJobStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : '';
  if (!jobId || !/^typecopy-[a-z0-9-]+$/i.test(jobId)) return res.status(400).json({ message: 'Invalid job id.' });

  try {
    const job = await loadDurableTypeCopyJob(jobId);
    if (!job) return res.status(404).json({ message: 'Type Copy job not found.' });
    return res.status(200).json({ success: true, data: job });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Unable to read Type Copy job.' });
  }
}
