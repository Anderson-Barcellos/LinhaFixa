import { SaccadeMetrics } from '@/types';
import {
  captureValidityOrLegacy,
  describeCaptureValidity,
  type CaptureValiditySnapshot,
} from './captureValidity';

export type SignalQualityGrade = 'comparavel' | 'exploratorio' | 'baixo-sinal';

export interface SaccadeSignalQuality {
  grade: SignalQualityGrade;
  label: string;
  detail: string;
  sourceLabel: string;
  sampleRateLabel: string;
  coverageLabel: string;
  tone: 'emerald' | 'amber' | 'rose';
}

export interface SaccadeSignalQualityOptions {
  coverage?: number | null;
  calibrated?: boolean | null;
  // Persisted captures must pass this key even when its legacy value is undefined;
  // that distinguishes unassessed history from non-capture live summaries.
  validity?: CaptureValiditySnapshot;
}

const MIN_VALID_SAMPLES = 5;
const COMPARABLE_SAMPLES = 300;
const COMPARABLE_COVERAGE = 80;
const LOW_COVERAGE = 50;
const COMPARABLE_SAMPLE_RATE_HZ = 24;

export function summarizeSaccadeSignalQuality(
  metrics: SaccadeMetrics,
  options: SaccadeSignalQualityOptions = {}
): SaccadeSignalQuality {
  if ('validity' in options) {
    const validity = captureValidityOrLegacy(options.validity);
    const presentation = describeCaptureValidity(validity);
    const source = options.validity
      ? validity.signalSource
      : metrics.signalSource ?? (options.calibrated ? 'calibrated-mediapipe' : undefined);
    const sourceLabel = source === 'calibrated-mediapipe'
      ? 'Calibrado'
      : source === 'raw-mediapipe'
        ? 'Bruto'
        : 'Indisponível';
    const measuredRate = options.validity ? validity.sampleRateHz : metrics.sampleRateHz;
    const measuredCoverage = options.validity ? validity.coverage : options.coverage;
    const sampleRateLabel = measuredRate != null
      ? `${Math.round(measuredRate)} Hz`
      : 'taxa não medida';
    const coverageLabel = measuredCoverage != null
      ? `${Math.round(measuredCoverage)}% cobertura`
      : 'cobertura não medida';
    return {
      grade: validity.grade === 'comparable'
        ? 'comparavel'
        : validity.grade === 'invalid'
          ? 'baixo-sinal'
          : 'exploratorio',
      label: presentation.label,
      detail: presentation.primary,
      sourceLabel,
      sampleRateLabel,
      coverageLabel,
      tone: presentation.tone,
    };
  }

  const source = metrics.signalSource ?? (options.calibrated ? 'calibrated-mediapipe' : undefined);
  const sourceLabel = source === 'calibrated-mediapipe'
    ? 'Calibrado'
    : source === 'raw-mediapipe'
      ? 'Bruto'
      : 'Indisponível';
  const sampleRateLabel = metrics.sampleRateHz && metrics.sampleRateHz > 0
    ? `${Math.round(metrics.sampleRateHz)} Hz`
    : 'taxa não medida';
  const coverageLabel = typeof options.coverage === 'number'
    ? `${Math.round(options.coverage)}% cobertura`
    : 'cobertura não medida';

  if (
    !metrics.trackingAvailable
    || metrics.samplesValid < MIN_VALID_SAMPLES
    || source === 'unavailable'
    || (typeof options.coverage === 'number' && options.coverage < LOW_COVERAGE)
  ) {
    return {
      grade: 'baixo-sinal',
      label: 'Baixo sinal',
      sourceLabel,
      sampleRateLabel,
      coverageLabel,
      detail: `${metrics.samplesValid} amostras; ${coverageLabel}; fonte ${sourceLabel.toLowerCase()}.`,
      tone: 'rose',
    };
  }

  const isCalibrated = source === 'calibrated-mediapipe' || options.calibrated === true;
  const hasEnoughSamples = metrics.samplesValid >= COMPARABLE_SAMPLES;
  const hasMeasuredCoverage = typeof options.coverage === 'number';
  const hasMeasuredRate = typeof metrics.sampleRateHz === 'number' && metrics.sampleRateHz > 0;
  const hasEnoughCoverage = hasMeasuredCoverage && options.coverage! >= COMPARABLE_COVERAGE;
  const hasEnoughRate = hasMeasuredRate && metrics.sampleRateHz! >= COMPARABLE_SAMPLE_RATE_HZ;

  if (isCalibrated && hasEnoughSamples && hasEnoughCoverage && hasEnoughRate) {
    return {
      grade: 'comparavel',
      label: 'Comparável',
      sourceLabel: 'Calibrado',
      sampleRateLabel,
      coverageLabel,
      detail: `${metrics.samplesValid} amostras; ${coverageLabel}; ${sampleRateLabel}.`,
      tone: 'emerald',
    };
  }

  const reason = isCalibrated && (!hasMeasuredCoverage || !hasMeasuredRate)
    ? 'sinal calibrado, mas com metadado ausente de cobertura ou taxa medida'
    : isCalibrated
    ? 'sinal calibrado, mas ainda com limitação de amostra, cobertura ou taxa medida'
    : 'sinal bruto ou legado sem calibração confirmada';
  return {
    grade: 'exploratorio',
    label: 'Exploratório',
    sourceLabel,
    sampleRateLabel,
    coverageLabel,
    detail: `${metrics.samplesValid} amostras; ${coverageLabel}; ${reason}.`,
    tone: 'amber',
  };
}
