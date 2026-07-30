import { GazeSample } from '@/types';
import { detectMergedFixations, dispersion } from '@/exercises/fixationDetection';
import { saccadesFromFixations, dispersionThresholdFor, dispersionThresholdForAngular } from '@/exercises/saccadesFromFixations';
import { lineReturnThresholdFor, preprocessForDetection } from '@/exercises/saccadeAnalysis';

export interface VisualSignalSample extends GazeSample {
  calibrated?: boolean;
}

export type VisualSignalStatus = 'sem-sinal' | 'baixo' | 'adequado' | 'ruidoso';

export interface FunctionalVisualSignalSummary {
  status: VisualSignalStatus;
  label: string;
  detail: string;
  sourceLabel: string;
  eventLabel: string;
  tone: 'slate' | 'amber' | 'emerald' | 'rose';
  horizontalRange: number;
  verticalRange: number;
  fixationShare: number;
  continuityPct: number;
  sampleRateHz: number;
  sensitivityScore: number;
  lineReturnCandidate: boolean;
  // Which rule anchored the fixation dispersion threshold this call — 'angular'
  // when live geometry was usable, 'relative-fallback' otherwise. Mirrors
  // SaccadeMetrics.thresholdSource so the live hint and the clinical metric can
  // never silently disagree about which instrument produced the number.
  thresholdSource: 'angular' | 'relative-fallback';
}

export interface FunctionalVisualSignalOptions {
  coverage?: number | null;
  // Live viewing geometry (this frame's IPD-derived distance), NOT the
  // capture-time anchor used by analyzeSaccades — the hint reruns every ~200ms
  // as the geometry itself changes. Absent/invalid falls back to the
  // span-relative threshold below.
  geometry?: { pxPerDeg: number; canvasWidthPx: number };
}

// --- Limiares de APRESENTAÇÃO do painel ao vivo ---
// Sintonizados na régua antiga (por amostra); mantidos após a migração para o
// detector por tempo e sujeitos a reancoragem empírica com Anders lendo o
// painel (REVISÃO SUGERIDA no spec 2026-07-28). São cortes de rótulo, não medidas.
const MIN_SAMPLES = 5;
const MIN_DURATION_MS = 250;
const USEFUL_HORIZONTAL_RANGE = 0.18;
const LOW_HORIZONTAL_RANGE = 0.08;
const CONTINUITY_GAP_MS = 160;
const NOISY_DIRECTION_CHANGE_RATE = 0.7;
const NOISY_MIN_RANGE = 0.12;
const USEFUL_CONTINUITY = 70;
const USEFUL_SENSITIVITY = 55;
const LOW_CONTINUITY = 50;

export function summarizeFunctionalVisualSignal(
  samples: VisualSignalSample[],
  options: FunctionalVisualSignalOptions = {}
): FunctionalVisualSignalSummary {
  const valid = samples
    .filter(s => Number.isFinite(s.t) && Number.isFinite(s.h) && Number.isFinite(s.v))
    .sort((a, b) => a.t - b.t);

  if (valid.length < MIN_SAMPLES) {
    return emptySummary(valid.length > 0 ? 'Amostras insuficientes para avaliar a captação funcional.' : 'Sem amostras de olhar.');
  }

  const durationMs = valid[valid.length - 1].t - valid[0].t;
  if (durationMs < MIN_DURATION_MS) {
    return emptySummary('Janela temporal curta demais para avaliar movimento de leitura.');
  }

  const hValues = valid.map(s => s.h);
  const vValues = valid.map(s => s.v);
  const horizontalRange = round2(range(hValues));
  const verticalRange = round2(range(vValues));
  const intervals = valid.slice(1).map((s, i) => ({
    dt: s.t - valid[i].t,
    dh: s.h - valid[i].h,
    dv: s.v - valid[i].v,
  })).filter(i => i.dt > 0);

  const continuityPct = round0((intervals.filter(i => i.dt <= CONTINUITY_GAP_MS).length / intervals.length) * 100);
  // Keep measurement precision in the evidence path. Consumers round only when
  // formatting; rounding here could promote 23.5 Hz to the 24 Hz validity tier.
  const sampleRateHz = ((valid.length - 1) / durationMs) * 1000;

  // Same instrument as the clinical analyser (v3): shared h+v pre-filter, Hooge
  // merge pipeline, and the SAME angular anchor when live geometry is available —
  // so the live hint can never disagree with the final metric about what a
  // fixation is. Falls back to the span-relative threshold (stamped) without it.
  const filtered = preprocessForDetection(valid);
  const geo = options.geometry;
  const angular = geo != null
    && Number.isFinite(geo.pxPerDeg) && geo.pxPerDeg > 0
    && Number.isFinite(geo.canvasWidthPx) && geo.canvasWidthPx > 0;
  const thresholdSource = angular ? 'angular' as const : 'relative-fallback' as const;
  const { fixations } = detectMergedFixations(filtered, {
    dispersionThreshold: angular
      ? dispersionThresholdForAngular(geo!.pxPerDeg, geo!.canvasWidthPx)
      : dispersionThresholdFor(dispersion(filtered)),
  });
  const fixatedMs = fixations.reduce((sum, f) => sum + f.durationMs, 0);
  const fixationShare = round0(Math.min(100, (fixatedMs / durationMs) * 100));

  const saccades = saccadesFromFixations(fixations);
  const progressive = saccades.filter(s => s.amplitude > 0).map(s => s.amplitude);
  const lineReturnThreshold = lineReturnThresholdFor(progressive);
  const lineReturnCandidate = saccades.some(
    s => s.amplitude < 0 && Math.abs(s.amplitude) >= lineReturnThreshold,
  );
  // Oscilação entre SACADAS (o olho alternando direção), não entre amostras —
  // a alternância por amostra era dominada pelo ruído e dependia da taxa.
  const directionChangeRate = directionChanges(saccades.map(s => s.amplitude))
    / Math.max(1, saccades.length - 1);
  const sourceLabel = valid.some(s => s.calibrated) ? 'Calibrado' : 'Bruto';
  const coveragePenalty = typeof options.coverage === 'number' && options.coverage < 60 ? 25 : 0;
  const sensitivityScore = clampScore(
    horizontalRange * 120
    + fixationShare * 0.35
    + continuityPct * 0.25
    - directionChangeRate * 35
    - coveragePenalty
  );

  if (continuityPct < LOW_CONTINUITY || horizontalRange < LOW_HORIZONTAL_RANGE) {
    return summary({
      status: 'baixo',
      label: 'Captação baixa',
      detail: 'O sinal ainda não mostra variação horizontal suficiente para leitura.',
      tone: 'amber',
      sourceLabel,
      eventLabel: lineReturnCandidate ? 'Possível retorno de linha' : 'Sem evento amplo',
      horizontalRange,
      verticalRange,
      fixationShare,
      continuityPct,
      sampleRateHz,
      sensitivityScore,
      lineReturnCandidate,
      thresholdSource,
    });
  }

  if (directionChangeRate > NOISY_DIRECTION_CHANGE_RATE && horizontalRange >= NOISY_MIN_RANGE) {
    return summary({
      status: 'ruidoso',
      label: 'Sinal ruidoso',
      detail: 'Há captação, mas a direção oscila demais para leitura estável.',
      tone: 'rose',
      sourceLabel,
      eventLabel: lineReturnCandidate ? 'Possível retorno de linha' : 'Oscilação alta',
      horizontalRange,
      verticalRange,
      fixationShare,
      continuityPct,
      sampleRateHz,
      sensitivityScore,
      lineReturnCandidate,
      thresholdSource,
    });
  }

  const useful = horizontalRange >= USEFUL_HORIZONTAL_RANGE
    && continuityPct >= USEFUL_CONTINUITY
    && sensitivityScore >= USEFUL_SENSITIVITY;
  return summary({
    status: useful ? 'adequado' : 'baixo',
    label: useful ? 'Captação útil' : 'Captação parcial',
    detail: useful
      ? 'O sinal mostra varredura horizontal e pausas compatíveis com leitura.'
      : 'Há algum movimento ocular, mas a captação ainda está parcial.',
    tone: useful ? 'emerald' : 'amber',
    sourceLabel,
    eventLabel: lineReturnCandidate ? 'Possível retorno de linha' : 'Varredura horizontal',
    horizontalRange,
    verticalRange,
    fixationShare,
    continuityPct,
    sampleRateHz,
    sensitivityScore,
    lineReturnCandidate,
    thresholdSource,
  });
}

function emptySummary(detail: string): FunctionalVisualSignalSummary {
  return {
    status: 'sem-sinal',
    label: 'Sem sinal útil',
    detail,
    sourceLabel: 'Indisponível',
    eventLabel: 'Sem evento',
    tone: 'slate',
    horizontalRange: 0,
    verticalRange: 0,
    fixationShare: 0,
    continuityPct: 0,
    sampleRateHz: 0,
    sensitivityScore: 0,
    lineReturnCandidate: false,
    thresholdSource: 'relative-fallback',
  };
}

function summary(value: FunctionalVisualSignalSummary): FunctionalVisualSignalSummary {
  return value;
}

function range(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function directionChanges(deltas: number[]): number {
  let changes = 0;
  let lastSign = 0;
  for (const delta of deltas) {
    const sign = Math.abs(delta) < 0.01 ? 0 : Math.sign(delta);
    if (sign === 0) continue;
    if (lastSign !== 0 && sign !== lastSign) changes++;
    lastSign = sign;
  }
  return changes;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function round0(value: number): number {
  return Math.round(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
