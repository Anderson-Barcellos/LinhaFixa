import type {
  AssessmentMode,
  AssessmentResultSummary,
  AssessmentStage,
  RecallTestResult,
  ValidationCapture,
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

export const LEGACY_ASSESSMENT_WORKSPACE_ROUTE = '/eye-tracking-test' as const;
export const LIVE_ASSESSMENT_WORKSPACE_ROUTE = '/assessment?workspace=live' as const;
export const ASSESSMENT_WORKSPACE_QUERY_KEY = 'workspace' as const;
export const LIVE_ASSESSMENT_WORKSPACE_VALUE = 'live' as const;

export interface AssessmentWorkspaceLatestRecord {
  mode: AssessmentMode;
  captureTitle: string | null;
  recallResult: RecallTestResult | null;
  timestamp: number | null;
  hasCaptureResult: boolean;
}

export function isLiveAssessmentWorkspace(search: string): boolean {
  return (
    new URLSearchParams(search).get(ASSESSMENT_WORKSPACE_QUERY_KEY) ===
    LIVE_ASSESSMENT_WORKSPACE_VALUE
  );
}

export function deriveAssessmentWorkspaceLatestRecord(
  captures: ValidationCapture[],
  recalls: RecallTestResult[],
): AssessmentWorkspaceLatestRecord {
  const latestCapture = captures[0] ?? null;
  const latestRecall = recalls[0] ?? null;

  if (!latestCapture && !latestRecall) {
    return {
      mode: 'capture',
      captureTitle: null,
      recallResult: null,
      timestamp: null,
      hasCaptureResult: false,
    };
  }

  if (!latestRecall || (latestCapture && latestCapture.timestamp >= latestRecall.timestamp)) {
    return {
      mode: 'capture',
      captureTitle: latestCapture ? 'Captura ocular registrada' : null,
      recallResult: null,
      timestamp: latestCapture?.timestamp ?? null,
      hasCaptureResult: latestCapture !== null,
    };
  }

  return {
    mode: 'recall',
    captureTitle: `Recall: ${latestRecall.topic}`,
    recallResult: latestRecall,
    timestamp: latestRecall.timestamp,
    hasCaptureResult: true,
  };
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
