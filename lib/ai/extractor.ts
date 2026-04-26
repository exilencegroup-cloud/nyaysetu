import { openai } from './client';
import { LEGAL_ANALYSIS_PROMPT } from './prompts';
import { LegalAnalysis } from '../types';

export async function extractLegalIntelligence(text: string): Promise<LegalAnalysis> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: LEGAL_ANALYSIS_PROMPT,
      },
      {
        role: 'user',
        content: text,
      },
    ],
    temperature: 0.1,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content in AI response');
  }

  const parsed = JSON.parse(content);
  return parsed as LegalAnalysis;
}
