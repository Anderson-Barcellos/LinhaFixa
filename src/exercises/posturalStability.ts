// Cervical/postural stability index derived from head-pose samples (yaw/pitch/roll)
// plus an optional Motion Assist movement flag. This is a thin interpretation layer,
// deliberately separate from the ocular saccade detector (saccadeAnalysis.ts): it
// never reads or alters gaze metrics. When there isn't enough head signal it reports
// 'insufficient' honestly instead of faking a perfect, still posture.

export interface PosturalSample {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface PosturalBaseline {
  yaw: number;
  pitch: number;
  roll: number;
  samples: number;
  timestamp: number;
}

export type PosturalStatus =
  | 'insufficient'
  | 'stable'
  | 'position-changed'
  | 'sustained-tilt'
  | 'rotating'
  | 'high-movement';

export type PosturalConfidence = 'high' | 'medium' | 'low';

export interface PosturalStabilityMetrics {
  status: PosturalStatus;
  confidence: PosturalConfidence;
  samples: number;
  cervicalStability: number; // 0..100, higher = steadier head hold
  sustainedTiltDeg: number;  // sustained head roll away from neutral (deg)
  rotationRange: number;     // peak-to-peak yaw excursion (head-pose units)
  highMovement: boolean;
  baselineApplied?: boolean;
  baselineYaw?: number | null;
  baselinePitch?: number | null;
  baselineRoll?: number | null;
  yawOffset?: number;
  pitchOffset?: number;
  motionStatus?: 'unavailable' | 'stable' | 'moved' | 'shaking';
  motionDeltaDeg?: number | null;
  motionConfidence?: 'high' | 'medium' | 'low';
  durationMs?: number;
  sampleRateHz?: number;
  faceCoverage?: number;
  label: string;
  insight: string;
}

export interface PosturalContext {
  baseline?: PosturalBaseline | null;
  // Neutral head roll (deg) captured at calibration; defaults to 0 (upright).
  baselineRoll?: number | null;
  // True when Motion Assist flagged shaking/high movement during the window.
  motionHighMovement?: boolean;
  motionStatus?: 'unavailable' | 'stable' | 'moved' | 'shaking';
  motionDeltaDeg?: number | null;
  motionConfidence?: 'high' | 'medium' | 'low';
  durationMs?: number;
  faceCoverage?: number;
}

const MIN_SAMPLES = 5;
// Head-pose jitter (std of yaw/pitch) thresholds, aligned with the existing
// "stable within ~5" rule used in ExerciseCanvas.
const STEADY_JITTER = 3;
const MAX_JITTER = 15;
// Sustained roll offset that reads as a held head tilt.
const SUSTAINED_TILT_DEG = 8;
// Peak-to-peak yaw excursion that reads as the head turning side to side.
const ROTATION_RANGE = 12;
let sessionPosturalBaseline: PosturalBaseline | null = null;

export function summarizePosturalBaseline(samples: PosturalSample[], timestamp = Date.now()): PosturalBaseline | null {
  const valid = samples.filter(s => Number.isFinite(s.yaw) && Number.isFinite(s.pitch) && Number.isFinite(s.roll));
  if (valid.length === 0) return null;
  return {
    yaw: round1(mean(valid.map(s => s.yaw))),
    pitch: round1(mean(valid.map(s => s.pitch))),
    roll: round1(mean(valid.map(s => s.roll))),
    samples: valid.length,
    timestamp,
  };
}

export function setPosturalBaseline(baseline: PosturalBaseline | null): void {
  sessionPosturalBaseline = baseline ? { ...baseline } : null;
}

export function getPosturalBaseline(): PosturalBaseline | null {
  return sessionPosturalBaseline ? { ...sessionPosturalBaseline } : null;
}

export function resetPosturalBaseline(): void {
  sessionPosturalBaseline = null;
}

export function summarizePosturalStability(
  samples: PosturalSample[],
  context: PosturalContext = {},
): PosturalStabilityMetrics {
  const n = samples.length;
  const baseline = context.baseline ?? null;
  const baselineApplied = Boolean(baseline);
  const baselineYaw = baseline?.yaw ?? null;
  const baselinePitch = baseline?.pitch ?? null;
  const baselineRoll = baseline?.roll ?? context.baselineRoll ?? null;
  if (n < MIN_SAMPLES) {
    return {
      status: 'insufficient',
      confidence: 'low',
      samples: n,
      cervicalStability: 0,
      sustainedTiltDeg: 0,
      rotationRange: 0,
      highMovement: Boolean(context.motionHighMovement),
      baselineApplied,
      baselineYaw,
      baselinePitch,
      baselineRoll,
      yawOffset: 0,
      pitchOffset: 0,
      motionStatus: context.motionStatus,
      motionDeltaDeg: context.motionDeltaDeg ?? null,
      motionConfidence: context.motionConfidence,
      durationMs: context.durationMs,
      sampleRateHz: sampleRateHz(n, context.durationMs),
      faceCoverage: context.faceCoverage,
      label: 'Sinal postural insuficiente',
      insight: 'Não houve amostras de cabeça suficientes para estimar a estabilidade cervical nesta captura.',
    };
  }

  const yaw = samples.map(s => s.yaw);
  const pitch = samples.map(s => s.pitch);
  const roll = samples.map(s => s.roll);

  const jitter = Math.hypot(std(yaw), std(pitch));
  const meanYaw = mean(yaw);
  const meanPitch = mean(pitch);
  const neutralRoll = baselineRoll ?? 0;
  const sustainedTiltDeg = round1(Math.abs(mean(roll) - neutralRoll));
  const yawOffset = round1(baselineYaw == null ? 0 : meanYaw - baselineYaw);
  const pitchOffset = round1(baselinePitch == null ? 0 : meanPitch - baselinePitch);
  const rotationRange = round1(Math.max(...yaw) - Math.min(...yaw));
  const highMovement = Boolean(context.motionHighMovement) || context.motionStatus === 'shaking' || jitter >= MAX_JITTER;

  const cervicalStability = Math.round(
    clamp(100 * (1 - (jitter - STEADY_JITTER) / (MAX_JITTER - STEADY_JITTER)), 0, 100),
  );

  let status: PosturalStatus;
  if (highMovement) {
    status = 'high-movement';
  } else if (context.motionStatus === 'moved') {
    status = 'position-changed';
  } else if (rotationRange >= ROTATION_RANGE) {
    status = 'rotating';
  } else if (sustainedTiltDeg >= SUSTAINED_TILT_DEG) {
    status = 'sustained-tilt';
  } else {
    status = 'stable';
  }

  const confidence: PosturalConfidence =
    highMovement || n < 30
      ? 'low'
      : context.motionConfidence === 'low'
        ? 'low'
      : status === 'stable' && n >= 150
        ? (context.motionConfidence === 'medium' ? 'medium' : 'high')
        : 'medium';

  return {
    status,
    confidence,
    samples: n,
    cervicalStability,
    sustainedTiltDeg,
    rotationRange,
    highMovement,
    baselineApplied,
    baselineYaw,
    baselinePitch,
    baselineRoll,
    yawOffset,
    pitchOffset,
    motionStatus: context.motionStatus,
    motionDeltaDeg: context.motionDeltaDeg ?? null,
    motionConfidence: context.motionConfidence,
    durationMs: context.durationMs,
    sampleRateHz: sampleRateHz(n, context.durationMs),
    faceCoverage: context.faceCoverage,
    label: statusLabel(status),
    insight: statusInsight(status, { cervicalStability, sustainedTiltDeg, rotationRange, motionDeltaDeg: context.motionDeltaDeg ?? null }),
  };
}

function statusLabel(status: PosturalStatus): string {
  switch (status) {
    case 'stable': return 'Postura estável';
    case 'position-changed': return 'Posição mudou';
    case 'sustained-tilt': return 'Inclinação sustentada';
    case 'rotating': return 'Rotação da cabeça';
    case 'high-movement': return 'Movimento alto';
    default: return 'Sinal postural insuficiente';
  }
}

function statusInsight(
  status: PosturalStatus,
  m: { cervicalStability: number; sustainedTiltDeg: number; rotationRange: number; motionDeltaDeg: number | null },
): string {
  switch (status) {
    case 'stable':
      return `Cabeça firme (estabilidade cervical ${m.cervicalStability}%), sem inclinação ou rotação sustentada.`;
    case 'position-changed':
      return `O aparelho mudou de posição desde a calibração${m.motionDeltaDeg != null ? ` (~${m.motionDeltaDeg}°)` : ''}; a postura pode não ser comparável com o baseline.`;
    case 'sustained-tilt':
      return `Cabeça inclinada de forma sustentada (~${m.sustainedTiltDeg}°). Reposicionar o pescoço reduz tensão cervical durante a leitura.`;
    case 'rotating':
      return `Cabeça girando lateralmente (amplitude ${m.rotationRange}). Manter o rosto de frente para a tela estabiliza o sinal.`;
    case 'high-movement':
      return 'Muito movimento da cabeça ou do aparelho durante a captura; a estabilidade postural ficou baixa.';
    default:
      return 'Sinal postural insuficiente para interpretação.';
  }
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function std(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function sampleRateHz(samples: number, durationMs?: number): number | undefined {
  if (!durationMs || durationMs <= 0 || samples < 2) return undefined;
  return Math.round(((samples - 1) / durationMs) * 1000);
}
