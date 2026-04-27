import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CHAT_PROMPT = `You are assisting a lawyer analyzing a legal case.

You are given structured case data including:
- facts
- arguments
- court reasoning
- outcome

Answer the user's question using ONLY this data.

Rules:
- Be precise
- Refer to specific arguments or reasoning
- Do not invent information
- If not available, say "Not specified in the case"

Case data:
{caseData}

User question:
{question}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { question, caseData } = req.body;

    const prompt = CHAT_PROMPT
      .replace('{caseData}', JSON.stringify(caseData, null, 2))
      .replace('{question}', question);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const answer = completion.choices[0]?.message?.content || 'No response generated';

    res.status(200).json({ answer });
  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ error: 'Failed to process question' });
  }
}
