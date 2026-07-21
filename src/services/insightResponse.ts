import { apiUrl } from './apiBase';
import {
  BackendRequestError,
  backendFailureFromResponse,
  networkBackendFailure,
} from './apiFailure';

export async function requestGeneratedInsight(sessionSummary: unknown): Promise<string> {
  try {
    const response = await fetch(apiUrl('/api/generateInsight'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionSummary }),
    });
    if (!response.ok) throw await backendFailureFromResponse(response);
    const body = await response.json().catch(() => null) as { text?: unknown } | null;
    if (typeof body?.text !== 'string' || !body.text.trim()) {
      throw new BackendRequestError('invalid-payload', response.status);
    }
    return body.text.trim();
  } catch (error) {
    throw networkBackendFailure(error);
  }
}
