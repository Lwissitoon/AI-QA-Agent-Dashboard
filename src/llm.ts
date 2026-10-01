import OpenAI from 'openai';
import { InteractiveElement } from './dom';

const openai = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama' // Required by SDK, ignored by Ollama
});

export interface AgentDecision {
  thought: string;
  action: 'click' | 'type' | 'wait' | 'finish';
  targetId?: number;
  textToType?: string;
  finalAnswer?: string;
}

export async function getNextStep(
  goal: string,
  elements: InteractiveElement[],
  history: string[]
): Promise<AgentDecision> {
  const systemPrompt = `
You are a web automation agent. Your job is to achieve the user's goal by selecting the correct next action based on visible interactive elements.

You MUST respond ONLY with a valid JSON object matching this schema:
{
  "thought": "Brief explanation of why you are taking this action",
  "action": "click" | "type" | "wait" | "finish",
  "targetId": number (required for click or type),
  "textToType": "string" (required only if action is type),
  "finalAnswer": "string" (required only if action is finish)
}
`;

  const userPrompt = `
GOAL: ${goal}

PREVIOUS ACTIONS HISTORY:
${history.length > 0 ? history.join('\n') : 'None'}

AVAILABLE INTERACTIVE ELEMENTS ON THE PAGE:
${JSON.stringify(elements, null, 2)}
`;

  const response = await openai.chat.completions.create({
    model: 'qwen2.5:7b-instruct',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0].message.content || '{}';
  return JSON.parse(content) as AgentDecision;
}