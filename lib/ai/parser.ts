import { z } from 'zod';

const LegalAnalysisSchema = z.object({
  snapshot: z.object({
    case_name: z.string().optional(),
    court: z.string().optional(),
    date: z.string().optional(),
    judges: z.string().optional(),
    case_type: z.string().optional(),
  }),
  facts: z.array(z.string()).optional(),
  legal_issues: z.array(z.string()).optional(),
  arguments: z.object({
    petitioner: z.array(z.string()).optional(),
    respondent: z.array(z.string()).optional(),
  }).optional(),
  court_reasoning: z.array(z.string()).optional(),
  outcome: z.string().optional(),
  key_takeaways: z.array(z.string()).optional(),
  reusable_arguments: z.array(z.string()).optional(),
});

export type LegalAnalysis = z.infer<typeof LegalAnalysisSchema>;

export function validateAnalysis(data: unknown): LegalAnalysis {
  return LegalAnalysisSchema.parse(data);
}
