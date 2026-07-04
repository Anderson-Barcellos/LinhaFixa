import { apiUrl } from './apiBase';
import { RecallQuestion } from '@/types';

export interface RecallContent {
  topic: string;
  text: string;
}

export const RECALL_QUESTION_COUNT = 6;
export const RECALL_OPTION_COUNT = 5;

// Minimal shape validation so a malformed AI response never reaches the quiz UI
// (same pattern as the planner's isValidPlan).
export function isValidRecallQuestions(payload: any): payload is { questions: RecallQuestion[] } {
  return !!payload
    && Array.isArray(payload.questions)
    && payload.questions.length === RECALL_QUESTION_COUNT
    && payload.questions.every((q: any) =>
      q
      && typeof q.question === 'string' && q.question.trim().length > 0
      && Array.isArray(q.options) && q.options.length === RECALL_OPTION_COUNT
      && q.options.every((o: any) => typeof o === 'string' && o.trim().length > 0)
      && Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < RECALL_OPTION_COUNT
      && typeof q.rationale === 'string');
}

// Shuffle each question's options so the correct position never depends on the
// model's habits; correctIndex is remapped to follow its option.
export function shuffleQuestionOptions(
  questions: RecallQuestion[],
  random: () => number = Math.random
): RecallQuestion[] {
  return questions.map(q => {
    const order = q.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return {
      ...q,
      options: order.map(i => q.options[i]),
      correctIndex: order.indexOf(q.correctIndex),
    };
  });
}

export async function getRecallText(): Promise<RecallContent> {
  const response = await fetch(apiUrl('/api/generateRecallText'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (response.ok) {
    const data = await response.json();
    if (typeof data?.text === 'string' && data.text.trim()) {
      return { topic: typeof data.topic === 'string' ? data.topic : 'Leitura', text: data.text.trim() };
    }
  }
  throw new Error('Não foi possível gerar o texto de recall por IA.');
}

export async function getRecallQuestions(text: string): Promise<RecallQuestion[]> {
  const response = await fetch(apiUrl('/api/generateRecallQuestions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (response.ok) {
    const data = await response.json();
    if (isValidRecallQuestions(data)) {
      return shuffleQuestionOptions(data.questions);
    }
  }
  throw new Error('Não foi possível gerar as questões de recall por IA.');
}
