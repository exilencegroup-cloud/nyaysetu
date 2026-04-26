import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { validatePdf, validateFileSize, validateFileType } from '@/lib/pdf/validator';
import { extractPdfText } from '@/lib/pdf/extractor';
import { cleanExtractedText, truncateForAI } from '@/lib/pdf/cleaner';
import { getErrorMessage } from '@/lib/pdf/errors';
import { extractLegalIntelligence } from '@/lib/ai/extractor';
import { validateAnalysis } from '@/lib/ai/parser';
import { LegalAnalysis } from '@/lib/types';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE',
        message: 'No file uploaded',
        retryable: false,
      });
    }

    // Validate file type
    const typeValidation = validateFileType(file.mimetype || '');
    if (!typeValidation.valid) {
      return res.status(400).json({
        success: false,
        error: typeValidation.error,
        message: getErrorMessage(typeValidation.error!),
        retryable: false,
      });
    }

    // Validate file size
    const sizeValidation = validateFileSize(file.size, 10 * 1024 * 1024);
    if (!sizeValidation.valid) {
      return res.status(400).json({
        success: false,
        error: sizeValidation.error,
        message: getErrorMessage(sizeValidation.error!),
        retryable: false,
      });
    }

    // Read file buffer
    const buffer = require('fs').readFileSync(file.filepath);

    // Validate PDF structure
    const pdfValidation = validatePdf(buffer);
    if (!pdfValidation.valid) {
      return res.status(400).json({
        success: false,
        error: pdfValidation.error,
        message: getErrorMessage(pdfValidation.error!),
        retryable: false,
      });
    }

    // Extract text from PDF
    const extraction = await extractPdfText(buffer);
    if (!extraction.success) {
      return res.status(422).json({
        success: false,
        error: extraction.error,
        message: getErrorMessage(extraction.error!),
        retryable: false,
      });
    }

    // Clean and truncate text
    const cleanedText = cleanExtractedText(extraction.text!);
    const processedText = truncateForAI(cleanedText);

    // Extract legal intelligence using AI
    const analysis = await extractLegalIntelligence(processedText);

    // Validate analysis structure
    const validatedAnalysis = validateAnalysis(analysis);

    // Clean up temp file
    require('fs').unlinkSync(file.filepath);

    return res.status(200).json({
      success: true,
      data: validatedAnalysis,
    });

  } catch (error: any) {
    console.error('Analysis error:', error);

    // Determine if error is retryable
    let errorType = 'AI_ERROR';
    let retryable = true;

    if (error.message?.includes('timeout')) {
      errorType = 'AI_TIMEOUT';
    } else if (error.status === 429) {
      errorType = 'AI_RATE_LIMIT';
    } else if (error.status === 503) {
      errorType = 'AI_UNAVAILABLE';
    }

    return res.status(500).json({
      success: false,
      error: errorType,
      message: error.message || 'Analysis failed. Please try again.',
      retryable,
    });
  }
}
