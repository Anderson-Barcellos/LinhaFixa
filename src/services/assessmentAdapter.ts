import type {
  AssessmentMode,
  AssessmentStage,
} from '@/types';

export interface AssessmentWorkspaceSnapshot {
  heading: string;
  subheading: string;
  primaryAction: {
    label: string;
    disabled: boolean;
  };
  savedCapturesLabel: string;
  latestSessionLabel: string | null;
  stage: AssessmentStage;
  mode: AssessmentMode;
  blockReason: string | null;
}

export interface BuildAssessmentWorkspaceSnapshotInput {
  mode: AssessmentMode;
  stage: AssessmentStage;
  blockReason: string | null;
  captureCount: number;
  latestSessionLabel: string | null;
  recallOutcome: { score: number; total: number; topic: string } | null;
}

export function mapLegacyRoute(pathname: string): '/assessment' | null {
  return pathname === '/eye-tracking-test' ? '/assessment' : null;
}

export function buildAssessmentWorkspaceSnapshot(
  input: BuildAssessmentWorkspaceSnapshotInput,
): AssessmentWorkspaceSnapshot {
  return {
    heading: 'Avaliacao',
    subheading: 'Leitura, captura ocular e recall em fluxo guiado.',
    primaryAction: {
      label: input.mode === 'recall' ? 'Ler e responder' : 'Iniciar captura de leitura',
      disabled: input.blockReason !== null,
    },
    savedCapturesLabel: `Capturas salvas (${input.captureCount})`,
    latestSessionLabel: input.latestSessionLabel,
    stage: input.stage,
    mode: input.mode,
    blockReason: input.blockReason,
  };
}
