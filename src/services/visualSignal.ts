import { GazeSample } from '@/types';

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
}

export interface FunctionalVisualSignalOptions {
  coverage?: number | null;
}

const MIN_SAMPLES = 5;
const MIN_DURATION_MS = 250;
const USEFUL_HORIZONTAL_RANGE = 0.18;
const LOW_HORIZONTAL_RANGE = 0.08;
const FIXATION_VELOCITY = 0.00045;
const CONTINUITY_GAP_MS = 160;
const LINE_RETURN_DH = -0.35;
const LINE_RETURN_DV = 0.08;

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
  const fixationShare = round0((intervals.filter(i => Math.abs(i.dh) / i.dt <= FIXATION_VELOCITY).length / intervals.length) * 100);
  const sampleRateHz = Math.round(((valid.length - 1) / durationMs) * 1000);
  const lineReturnCandidate = intervals.some(i => i.dh <= LINE_RETURN_DH && Math.abs(i.dv) >= LINE_RETURN_DV);
  const directionChangeRate = directionChanges(intervals.map(i => i.dh)) / Math.max(1, intervals.length - 1);
  const sourceLabel = valid.some(s => s.calibrated) ? 'Calibrado' : 'Bruto';
  const coveragePenalty = typeof options.coverage === 'number' && options.coverage < 60 ? 25 : 0;
  const sensitivityScore = clampScore(
    horizontalRange * 120
    + fixationShare * 0.35
    + continuityPct * 0.25
    - directionChangeRate * 35
    - coveragePenalty
  );

  if (continuityPct < 50 || horizontalRange < LOW_HORIZONTAL_RANGE) {
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
    });
  }

  if (directionChangeRate > 0.7 && horizontalRange >= 0.12) {
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
    });
  }

  const useful = horizontalRange >= USEFUL_HORIZONTAL_RANGE && continuityPct >= 70 && sensitivityScore >= 55;
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
