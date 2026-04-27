import { z } from 'zod';

export const SourcePointSchema = z.object({
  text: z.string(),
  source_snippet: z.string(),
  source_hint: z.string().optional(),
  page_number: z.number().optional(),
  paragraph_number: z.number().optional(),
  strength: z.enum(['strong', 'moderate', 'weak']).optional(),
  strength_reason: z.string().optional(),
});

export const RiskFlagSchema = z.object({
  risk: z.string(),
  type: z.enum(['evidence', 'procedural', 'logical', 'documentation']),
  severity: z.enum(['high', 'medium', 'low']),
  explanation: z.string(),
});

export const LegalAnalysisSchema = z.object({
  snapshot: z.object({
    case_name: z.string(),
    court: z.string(),
    date: z.string(),
    judges: z.string(),
    case_type: z.string(),
  }),
  facts: z.array(SourcePointSchema).optional(),
  legal_issues: z.array(SourcePointSchema).optional(),
  arguments: z.object({
    petitioner: z.array(SourcePointSchema).optional(),
    respondent: z.array(SourcePointSchema).optional(),
  }).optional(),
  court_reasoning: z.array(SourcePointSchema).optional(),
  outcome: z.string().optional(),
  key_takeaways: z.array(SourcePointSchema).optional(),
  reusable_arguments: z.array(SourcePointSchema).optional(),
  risks: z.array(RiskFlagSchema).optional(),
});

export type LegalAnalysis = z.infer<typeof LegalAnalysisSchema>;
export type SourcePoint = z.infer<typeof SourcePointSchema>;
export type RiskFlag = z.infer<typeof RiskFlagSchema>;

export function validateAnalysis(data: unknown): LegalAnalysis {
  return LegalAnalysisSchema.parse(data);
}
