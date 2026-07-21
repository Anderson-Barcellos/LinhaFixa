export type BackendFailureKind =
  | 'offline'
  | 'rate-limited'
  | 'configuration'
  | 'invalid-payload'
  | 'unavailable';

export class BackendRequestError extends Error {
  constructor(
    public readonly kind: BackendFailureKind,
    public readonly status: number | null = null,
    public readonly retryAfterSec: number | null = null,
  ) {
    super(kind);
    this.name = 'BackendRequestError';
  }
}

export async function backendFailureFromResponse(
  response: Response,
): Promise<BackendRequestError> {
  const body = await response.clone().json().catch(() => null) as {
    error?: unknown;
  } | null;
  const retryHeader = response.headers.get('retry-after');
  const retryAfterSec = retryHeader && Number.isFinite(Number(retryHeader))
    ? Number(retryHeader)
    : null;

  if (response.status === 429) {
    return new BackendRequestError('rate-limited', 429, retryAfterSec);
  }
  if (body?.error === 'OPENAI_API_KEY_MISSING') {
    return new BackendRequestError('configuration', response.status, null);
  }
  return new BackendRequestError('unavailable', response.status, null);
}

export function networkBackendFailure(error: unknown): BackendRequestError {
  if (error instanceof BackendRequestError) return error;
  return new BackendRequestError(error instanceof TypeError ? 'offline' : 'unavailable');
}

export function backendFailureMessage(error: BackendRequestError): string {
  if (error.kind === 'rate-limited') {
    const minutes = error.retryAfterSec
      ? Math.max(1, Math.ceil(error.retryAfterSec / 60))
      : null;
    return minutes
      ? `Limite temporário atingido — tente novamente em ${minutes} min.`
      : 'Limite temporário atingido — aguarde e tente novamente.';
  }
  if (error.kind === 'configuration') return 'Serviço de IA não configurado no backend.';
  if (error.kind === 'invalid-payload') {
    return 'O backend devolveu uma resposta inválida. Tente novamente.';
  }
  if (error.kind === 'offline') {
    return 'Sem conexão com o backend. Verifique a rede e tente novamente.';
  }
  return 'O backend está indisponível no momento. Tente novamente.';
}
