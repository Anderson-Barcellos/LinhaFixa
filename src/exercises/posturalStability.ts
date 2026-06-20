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

export type PosturalStatus =
  | 'insufficient'
  | 'stable'
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
  label: string;
  insight: string;
}

export interface PosturalContext {
  // Neutral head roll (deg) captured at calibration; defaults to 0 (upright).
  baselineRoll?: number | null;
  // True when Motion Assist flagged shaking/high movement during the window.
  motionHighMovement?: boolean;
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

export function summarizePosturalStability(
  samples: PosturalSample[],
  context: PosturalContext = {},
): PosturalStabilityMetrics {
  const n = samples.length;
  if (n < MIN_SAMPLES) {
    return {
      status: 'insufficient',
      confidence: 'low',
      samples: n,
      cervicalStability: 0,
      sustainedTiltDeg: 0,
      rotationRange: 0,
      highMovement: Boolean(context.motionHighMovement),
      label: 'Sinal postural insuficiente',
      insight: 'Não houve amostras de cabeça suficientes para estimar a estabilidade cervical nesta captura.',
    };
  }

  const yaw = samples.map(s => s.yaw);
  const pitch = samples.map(s => s.pitch);
  const roll = samples.map(s => s.roll);

  const jitter = Math.hypot(std(yaw), std(pitch));
  const baselineRoll = context.baselineRoll ?? 0;
  const sustainedTiltDeg = round1(Math.abs(mean(roll) - baselineRoll));
  const rotationRange = round1(Math.max(...yaw) - Math.min(...yaw));
  const highMovement = Boolean(context.motionHighMovement) || jitter >= MAX_JITTER;

  const cervicalStability = Math.round(
    clamp(100 * (1 - (jitter - STEADY_JITTER) / (MAX_JITTER - STEADY_JITTER)), 0, 100),
  );

  let status: PosturalStatus;
  if (highMovement) {
    status = 'high-movement';
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
      : status === 'stable' && n >= 150
        ? 'high'
        : 'medium';

  return {
    status,
    confidence,
    samples: n,
    cervicalStability,
    sustainedTiltDeg,
    rotationRange,
    highMovement,
    label: statusLabel(status),
    insight: statusInsight(status, { cervicalStability, sustainedTiltDeg, rotationRange }),
  };
}

function statusLabel(status: PosturalStatus): string {
  switch (status) {
    case 'stable': return 'Postura estável';
    case 'sustained-tilt': return 'Inclinação sustentada';
    case 'rotating': return 'Rotação da cabeça';
    case 'high-movement': return 'Movimento alto';
    default: return 'Sinal postural insuficiente';
  }
}

function statusInsight(
  status: PosturalStatus,
  m: { cervicalStability: number; sustainedTiltDeg: number; rotationRange: number },
): string {
  switch (status) {
    case 'stable':
      return `Cabeça firme (estabilidade cervical ${m.cervicalStability}%), sem inclinação ou rotação sustentada.`;
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
