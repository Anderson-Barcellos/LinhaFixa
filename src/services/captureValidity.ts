import type { GazeSample, SaccadeMetrics } from '@/types';

export type CaptureValidityGrade = 'comparable' | 'exploratory' | 'invalid';
export type TemporalTier = 'high-temporal' | 'coarse-temporal' | 'insufficient-temporal';
export type CaptureInterruptionReason =
  | 'page-hidden-during-capture'
  | 'pagehide-during-capture'
  | 'navigation-during-capture'
  | 'camera-stopped-during-capture';
export type CaptureValidityReasonCode =
  | 'capture-duration-too-short'
  | 'capture-coverage-below-threshold'
  | 'capture-source-inconsistent'
  | 'capture-calibration-unavailable'
  | 'capture-calibration-incompatible'
  | 'capture-coarse-temporal'
  | 'capture-insufficient-temporal'
  | 'capture-source-unavailable'
  | 'capture-tracking-gap'
  | CaptureInterruptionReason
  | 'legacy-unassessed';

export const CAPTURE_VALIDITY_THRESHOLDS = Object.freeze({
  minimumDurationMs: 20_000,
  minimumCoveragePercent: 80,
  minimumSelectedSourceRatio: 0.9,
  minimumTemporalRateHz: 24,
  highTemporalRateHz: 45,
  trackingGapMs: 200,
});

export interface CaptureValiditySnapshot {
  contractVersion: 1;
  assessedAt: number | null;
  grade: CaptureValidityGrade;
  reasonCodes: CaptureValidityReasonCode[];
  durationMs: number | null;
  coverage: number | null;
  signalSource: NonNullable<SaccadeMetrics['signalSource']> | null;
  selectedSourceRatio: number | null;
  sampleRateHz: number | null;
  temporalTier: TemporalTier;
  gapCount: number;
  interruption: CaptureInterruptionReason | null;
}

export interface CaptureValidityInput {
  assessedAt: number;
  durationMs: number;
  coverage: number;
  signalSource: NonNullable<SaccadeMetrics['signalSource']>;
  selectedSourceRatio: number | null;
  sampleRateHz: number | null | undefined;
  calibrationAccepted: boolean;
  calibrationCompatible: boolean;
  gapCount: number;
  interruption: CaptureInterruptionReason | null;
}

export function classifyTemporalTier(sampleRateHz: number | null | undefined): TemporalTier {
  if (
    typeof sampleRateHz !== 'number'
    || !Number.isFinite(sampleRateHz)
    || sampleRateHz < CAPTURE_VALIDITY_THRESHOLDS.minimumTemporalRateHz
  ) {
    return 'insufficient-temporal';
  }
  return sampleRateHz >= CAPTURE_VALIDITY_THRESHOLDS.highTemporalRateHz
    ? 'high-temporal'
    : 'coarse-temporal';
}

export function countTrackingGaps(
  samples: GazeSample[],
  thresholdMs: number = CAPTURE_VALIDITY_THRESHOLDS.trackingGapMs,
): number {
  if (
    !Number.isFinite(thresholdMs)
    || thresholdMs < 0
    || samples.some(sample => !Number.isFinite(sample.t) || sample.t < 0)
  ) {
    return -1;
  }

  const timestamps = samples.map(sample => sample.t).sort((a, b) => a - b);

  let gaps = 0;
  for (let index = 1; index < timestamps.length; index += 1) {
    if (timestamps[index] - timestamps[index - 1] > thresholdMs) gaps += 1;
  }
  return gaps;
}

export function assessCaptureValidity(input: CaptureValidityInput): CaptureValiditySnapshot {
  const reasonCodes: CaptureValidityReasonCode[] = [];
  let invalid = false;

  const assessedAt = finiteAtLeast(input.assessedAt, 0);
  if (assessedAt === null) invalid = true;

  const durationMs = finiteAtLeast(input.durationMs, 0);
  if (durationMs === null || durationMs < CAPTURE_VALIDITY_THRESHOLDS.minimumDurationMs) {
    reasonCodes.push('capture-duration-too-short');
    invalid = true;
  }

  const coverage = finiteInRange(input.coverage, 0, 100);
  if (coverage === null || coverage < CAPTURE_VALIDITY_THRESHOLDS.minimumCoveragePercent) {
    reasonCodes.push('capture-coverage-below-threshold');
    if (coverage === null) invalid = true;
  }

  const selectedSourceRatio = finiteInRange(input.selectedSourceRatio, 0, 1);
  if (
    selectedSourceRatio === null
    || selectedSourceRatio < CAPTURE_VALIDITY_THRESHOLDS.minimumSelectedSourceRatio
  ) {
    reasonCodes.push('capture-source-inconsistent');
    if (selectedSourceRatio === null) invalid = true;
  }

  const signalSource = isSignalSource(input.signalSource) ? input.signalSource : null;
  if (signalSource !== 'unavailable') {
    if (signalSource !== 'calibrated-mediapipe' || !input.calibrationAccepted) {
      reasonCodes.push('capture-calibration-unavailable');
    } else if (!input.calibrationCompatible) {
      reasonCodes.push('capture-calibration-incompatible');
    }
  }

  const sampleRateHz = finiteAtLeast(input.sampleRateHz, 0);
  const temporalTier = classifyTemporalTier(sampleRateHz);
  if (temporalTier === 'coarse-temporal') {
    reasonCodes.push('capture-coarse-temporal');
  } else if (temporalTier === 'insufficient-temporal') {
    reasonCodes.push('capture-insufficient-temporal');
    invalid = true;
  }

  if (signalSource === null || signalSource === 'unavailable') {
    reasonCodes.push('capture-source-unavailable');
    invalid = true;
  }

  const validGapCount = Number.isSafeInteger(input.gapCount) && input.gapCount >= 0;
  const gapCount = validGapCount ? input.gapCount : 0;
  if (!validGapCount || gapCount > 0) {
    reasonCodes.push('capture-tracking-gap');
    if (!validGapCount) invalid = true;
  }

  if (input.interruption !== null) {
    reasonCodes.push(input.interruption);
    invalid = true;
  }

  return {
    contractVersion: 1,
    assessedAt: assessedAt ?? 0,
    grade: invalid ? 'invalid' : reasonCodes.length > 0 ? 'exploratory' : 'comparable',
    reasonCodes,
    durationMs,
    coverage,
    signalSource,
    selectedSourceRatio,
    sampleRateHz,
    temporalTier,
    gapCount,
    interruption: input.interruption,
  };
}

export function captureValidityOrLegacy(
  snapshot: CaptureValiditySnapshot | undefined,
): CaptureValiditySnapshot {
  if (snapshot) return snapshot;
  return {
    contractVersion: 1,
    assessedAt: null,
    grade: 'exploratory',
    reasonCodes: ['legacy-unassessed'],
    durationMs: null,
    coverage: null,
    signalSource: null,
    selectedSourceRatio: null,
    sampleRateHz: null,
    temporalTier: 'insufficient-temporal',
    gapCount: 0,
    interruption: null,
  };
}

const REASON_TEXT: Record<CaptureValidityReasonCode, string> = {
  'capture-duration-too-short': 'Duração abaixo de 20 segundos',
  'capture-coverage-below-threshold': 'Cobertura facial abaixo de 80%',
  'capture-source-inconsistent': 'Fonte selecionada presente em menos de 90% das amostras',
  'capture-calibration-unavailable': 'Calibração aceita indisponível',
  'capture-calibration-incompatible': 'Calibração incompatível com a geometria da captura',
  'capture-coarse-temporal': 'Taxa temporal entre 24 e 44,99 Hz',
  'capture-insufficient-temporal': 'Taxa temporal abaixo de 24 Hz ou indisponível',
  'capture-source-unavailable': 'Sinal ocular indisponível',
  'capture-tracking-gap': 'Intervalo de rastreamento acima de 200 ms',
  'page-hidden-during-capture': 'A página perdeu visibilidade durante a captura',
  'pagehide-during-capture': 'A página foi descarregada durante a captura',
  'navigation-during-capture': 'A tela de captura foi encerrada durante a medição',
  'camera-stopped-during-capture': 'A câmera foi parada durante a captura',
  'legacy-unassessed': 'Captura legada sem avaliação de validade',
};

const GRADE_PRESENTATION = {
  comparable: { label: 'Comparável', tone: 'emerald', fallback: 'Captura apta para comparação' },
  exploratory: { label: 'Exploratória', tone: 'amber', fallback: 'Captura disponível apenas para exploração' },
  invalid: { label: 'Inválida', tone: 'rose', fallback: 'Captura não utilizável' },
} as const;

export function describeCaptureValidity(snapshot: CaptureValiditySnapshot): {
  label: 'Comparável' | 'Exploratória' | 'Inválida';
  tone: 'emerald' | 'amber' | 'rose';
  primary: string;
  reasons: string[];
} {
  const presentation = GRADE_PRESENTATION[snapshot.grade];
  const reasons = snapshot.reasonCodes.map(reason => REASON_TEXT[reason]);
  const pageInterrupted = snapshot.reasonCodes.some(reason => (
    reason === 'page-hidden-during-capture' || reason === 'pagehide-during-capture'
  ));
  const navigated = snapshot.reasonCodes.includes('navigation-during-capture');
  return {
    label: presentation.label,
    tone: presentation.tone,
    primary: pageInterrupted
      ? 'Captura não utilizável — a página perdeu visibilidade'
      : navigated
        ? 'Captura não utilizável — a tela de captura foi encerrada'
        : reasons[0] ?? presentation.fallback,
    reasons,
  };
}

export function describeCaptureValidityContract(): {
  trackingGapLabel: string;
} {
  return {
    trackingGapLabel: `Gaps > ${CAPTURE_VALIDITY_THRESHOLDS.trackingGapMs} ms`,
  };
}

export function pageInterruptionReason(
  event: 'visibilitychange' | 'pagehide',
  visibilityState?: DocumentVisibilityState,
): CaptureInterruptionReason | null {
  if (event === 'pagehide') return 'pagehide-during-capture';
  return visibilityState !== 'visible' ? 'page-hidden-during-capture' : null;
}

function finiteAtLeast(value: number | null | undefined, minimum: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum ? value : null;
}

function finiteInRange(value: number | null, minimum: number, maximum: number): number | null {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum
    ? value
    : null;
}

function isSignalSource(value: unknown): value is NonNullable<SaccadeMetrics['signalSource']> {
  return value === 'calibrated-mediapipe'
    || value === 'raw-mediapipe'
    || value === 'unavailable';
}
