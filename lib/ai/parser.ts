import { z } from 'zod';
import { LegalAnalysis } from '../types';

const LegalAnalysisSchema = z.object({
  snapshot: z.object({
    case_name: z.string(),
    court: z.string(),
    date: z.string(),
    judges: z.string(),
    case_type: z.string(),
  }),
  facts: z.array(z.string()),
  legal_issues: z.array(z.string()),
  arguments: z.object({
    petitioner: z.array(z.string()),
    respondent: z.array(z.string()),
  }),
  court_reasoning: z.array(z.string()),
  outcome: z.string(),
  key_takeaways: z.array(z.string()),
  reusable_arguments: z.array(z.string()),
});

export function validateAnalysis(data: unknown): LegalAnalysis {
  return LegalAnalysisSchema.parse(data);
}
