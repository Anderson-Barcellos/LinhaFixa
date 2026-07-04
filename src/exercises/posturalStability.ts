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

// Head pose as produced by faceTracking.estimateHeadPose: yaw/pitch are normalized
// landmark offsets ×100 (NOT degrees) whose magnitude grows with the face size in
// the frame; roll is real degrees; scale is the face width in normalized image
// coordinates. Extra fields (x, y) are ignored via structural typing.
export interface HeadPoseSample {
  yaw: number;
  pitch: number;
  roll: number;
  scale?: number;
}

// Face width (normalized image coords) at a typical webcam/selfie distance. Rescaling
// yaw/pitch to this reference keeps their magnitude in the range the thresholds below
// were tuned for, while making the signal distance-invariant: sitting closer to the
// camera no longer inflates the numbers.
export const REFERENCE_FACE_SCALE = 0.3;
// Below this the face box is degenerate (tracker glitch) — rescaling by it would
// explode the sample, so we fall back to the raw values instead.
const MIN_VALID_FACE_SCALE = 0.02;

export function toPosturalSample(pose: HeadPoseSample): PosturalSample {
  const scale = pose.scale != null && pose.scale > MIN_VALID_FACE_SCALE ? pose.scale : REFERENCE_FACE_SCALE;
  const k = REFERENCE_FACE_SCALE / scale;
  return { yaw: pose.yaw * k, pitch: pose.pitch * k, roll: pose.roll };
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
// Head-pose jitter thresholds (std of detrended yaw/pitch, in REFERENCE_FACE_SCALE
// units). Provisional until recalibrated on real captures (PACK Pescoço v2, PN4).
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

  // Jitter only sees what remains after removing the linear trend: slow, steady
  // drift (the head naturally following lines down a long page) is not tremor.
  const jitter = Math.hypot(std(detrend(yaw)), std(detrend(pitch)));
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

// Live head-stillness classifier for the in-exercise warning ("Mantenha a cabeça
// parada"). Replaces the old absolute |yaw|<5 && |pitch|<5 check, which compared a
// biased signal against zero: a neutral face has a large positive pitch (the nose tip
// sits below the eye line), so the old rule flickered with camera distance. This one
// is baseline-relative — the calibrated neutral pose when available, otherwise the
// median of the first frames of the exercise itself — with hysteresis plus a
// consecutive-frame debounce so the warning doesn't strobe at frame rate.
export interface LiveStabilityTracker {
  update(sample: PosturalSample): boolean; // true = head currently counts as still
}

const LIVE_WARMUP_SAMPLES = 30;
// Deviation (hypot of yaw/pitch offsets, REFERENCE_FACE_SCALE units) that starts
// reading as head movement, and the level it must return under to count as still
// again. Provisional until PN4 recalibration on real captures.
const LIVE_ENTER_DEVIATION = 6;
const LIVE_EXIT_DEVIATION = 3.5;
const LIVE_FLIP_STREAK = 5;

export function createLiveStabilityTracker(baseline?: PosturalBaseline | null): LiveStabilityTracker {
  let refYaw = baseline?.yaw ?? null;
  let refPitch = baseline?.pitch ?? null;
  const warmup: PosturalSample[] = [];
  let stable = true;
  let streak = 0;

  return {
    update(sample: PosturalSample): boolean {
      if (refYaw == null || refPitch == null) {
        warmup.push(sample);
        if (warmup.length >= LIVE_WARMUP_SAMPLES) {
          refYaw = median(warmup.map(s => s.yaw));
          refPitch = median(warmup.map(s => s.pitch));
        }
        // Don't nag before the neutral pose is known.
        return true;
      }
      const deviation = Math.hypot(sample.yaw - refYaw, sample.pitch - refPitch);
      if (stable) {
        streak = deviation >= LIVE_ENTER_DEVIATION ? streak + 1 : 0;
        if (streak >= LIVE_FLIP_STREAK) {
          stable = false;
          streak = 0;
        }
      } else {
        streak = deviation <= LIVE_EXIT_DEVIATION ? streak + 1 : 0;
        if (streak >= LIVE_FLIP_STREAK) {
          stable = true;
          streak = 0;
        }
      }
      return stable;
    },
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

// Residuals after removing the least-squares linear fit from the series.
function detrend(values: number[]): number[] {
  const n = values.length;
  if (n < 2) return values.map(() => 0);
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return values.map((v, i) => v - (yMean + slope * (i - xMean)));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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
