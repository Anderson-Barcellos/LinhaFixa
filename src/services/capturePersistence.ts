import type { AssessedValidationCapture } from '@/types';

export type CapturePersistenceStatus = 'saving' | 'saved' | 'failed';

export interface CapturePersistenceResult {
  capture: AssessedValidationCapture;
  persistence: Exclude<CapturePersistenceStatus, 'saving'>;
}

export async function persistValidationCapture(
  capture: AssessedValidationCapture,
  save: (capture: AssessedValidationCapture) => Promise<unknown>,
): Promise<CapturePersistenceResult> {
  try {
    await save(capture);
    return { capture, persistence: 'saved' };
  } catch {
    return { capture, persistence: 'failed' };
  }
}
