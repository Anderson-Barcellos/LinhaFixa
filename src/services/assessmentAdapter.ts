import type {
  AssessmentMode,
  AssessmentResultSummary,
  AssessmentStage,
  RecallTestResult,
} from '@/types';
import {
  buildAssessmentResultSummary,
  canStartAssessment,
  deriveAssessmentStage,
  type AssessmentStageInput,
} from './assessmentFlow';

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
  resultSummary: AssessmentResultSummary | null;
}

export interface BuildAssessmentWorkspaceSnapshotInput extends AssessmentStageInput {
  captureCount: number;
  latestSessionLabel: string | null;
  captureTitle: string | null;
  recallResult: RecallTestResult | null;
}

export function mapLegacyRoute(pathname: string): '/assessment' | null {
  return pathname === '/eye-tracking-test' ? '/assessment' : null;
}

export function buildAssessmentWorkspaceSnapshot(
  input: BuildAssessmentWorkspaceSnapshotInput,
): AssessmentWorkspaceSnapshot {
  const stageInput: AssessmentStageInput = {
    mode: input.mode,
    readingTextState: input.readingTextState,
    capturing: input.capturing,
    recallGenerating: input.recallGenerating,
    recallQuizOpen: input.recallQuizOpen,
    hasCaptureResult: input.hasCaptureResult,
  };
  const stage = deriveAssessmentStage(stageInput);
  const { reason: blockReason } = canStartAssessment(stageInput);
  const resultSummary = input.captureTitle
    ? buildAssessmentResultSummary({
        mode: input.mode,
        captureTitle: input.captureTitle,
        recallResult: input.recallResult,
      })
    : null;

  return {
    heading: 'Avaliacao',
    subheading: 'Leitura, captura ocular e recall em fluxo guiado.',
    primaryAction: {
      label: input.mode === 'recall' ? 'Ler e responder' : 'Iniciar captura de leitura',
      disabled: blockReason !== null,
    },
    savedCapturesLabel: `Capturas salvas (${input.captureCount})`,
    latestSessionLabel: input.latestSessionLabel,
    stage,
    mode: input.mode,
    blockReason,
    resultSummary,
  };
}
