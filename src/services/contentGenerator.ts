import { apiUrl } from './apiBase';
import {
  BackendRequestError,
  backendFailureFromResponse,
  networkBackendFailure,
} from './apiFailure';

export async function getReadingContent(complexity: 'facil' | 'dificil', targetDurationSec = 20): Promise<string> {
  try {
    const response = await fetch(apiUrl('/api/generateReadingContent'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complexity, targetDurationSec }),
    });
    if (!response.ok) throw await backendFailureFromResponse(response);
    const data = await response.json().catch(() => null) as { text?: unknown } | null;
    if (typeof data?.text !== 'string' || !data.text.trim()) {
      throw new BackendRequestError('invalid-payload', response.status);
    }
    return data.text.trim();
  } catch (error) {
    throw networkBackendFailure(error);
  }
}
