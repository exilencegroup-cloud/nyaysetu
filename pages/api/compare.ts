import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const COMPARE_PROMPT = `You are a legal intelligence assistant comparing two Indian court judgments.

TASK: Compare the two provided judgments and return structured JSON highlighting differences.

For each section, identify:
- Similarities between the cases
- Differences between the cases
- Key insights from the comparison

REQUIRED OUTPUT FORMAT:
{
  "case1_snapshot": {
    "case_name": "Full case title",
    "court": "Court name",
    "date": "Judgment date",
    "judges": "Judge names",
    "case_type": "Case type"
  },
  "case2_snapshot": {
    "case_name": "Full case title",
    "court": "Court name",
    "date": "Judgment date",
    "judges": "Judge names",
    "case_type": "Case type"
  },
  "facts_comparison": {
    "similarities": ["Similar fact 1", "Similar fact 2"],
    "differences": ["Difference in case 1", "Difference in case 2"],
    "key_insights": "Brief summary of factual comparison"
  },
  "arguments_comparison": {
    "similarities": ["Similar argument 1", "Similar argument 2"],
    "differences": ["Different argument in case 1", "Different argument in case 2"],
    "key_insights": "Brief summary of argument comparison"
  },
  "reasoning_comparison": {
    "similarities": ["Similar reasoning 1", "Similar reasoning 2"],
    "differences": ["Different reasoning in case 1", "Different reasoning in case 2"],
    "key_insights": "Brief summary of reasoning comparison"
  },
  "outcome_comparison": {
    "similarities": "Similar outcome aspects",
    "differences": "Different outcomes",
    "key_insights": "Brief summary of outcome comparison"
  },
  "overall_assessment": "Overall comparison summary highlighting key similarities and differences"
}

RULES:
- Extract ONLY from the given text - NO hallucination
- Be specific and precise in comparisons
- Highlight what makes each case unique
- Return ONLY valid JSON - no markdown, no explanations

Case 1:
{case1}

Case 2:
{case2}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const formData = req.body;
    const file1 = formData.get('file1') as File;
    const file2 = formData.get('file2') as File;

    if (!file1 || !file2) {
      return res.status(400).json({ error: 'Both files are required' });
    }

    // Extract text from both PDFs
    const text1 = await extractTextFromPDF(file1);
    const text2 = await extractTextFromPDF(file2);

    // Truncate if too long (keep most important parts)
    const maxLength = 15000;
    const truncatedText1 = text1.length > maxLength ? text1.substring(0, maxLength) : text1;
    const truncatedText2 = text2.length > maxLength ? text2.substring(0, maxLength) : text2;

    const prompt = COMPARE_PROMPT
      .replace('{case1}', truncatedText1)
      .replace('{case2}', truncatedText2);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    const comparison = JSON.parse(responseText);

    res.status(200).json(comparison);
  } catch (error) {
    console.error('Comparison API error:', error);
    res.status(500).json({ error: 'Failed to compare cases' });
  }
}

async function extractTextFromPDF(file: File): Promise<string> {
  // This is a placeholder - in production, you'd use a PDF extraction library
  // For now, return a placeholder text
  return `PDF text extraction for ${file.name}`;
}
