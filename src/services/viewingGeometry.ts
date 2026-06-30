// Viewing geometry: turn the device-pixel world into a visual-angle world.
//
// Why: webcam gaze is only meaningful in degrees of visual angle, not pixels. A
// fixed font in CSS px looks huge on a phone and tiny on a large monitor, and the
// reading task is not comparable across devices/distances. Here we (a) estimate the
// camera→eye distance from the inter-pupillary distance (IPD) seen by MediaPipe, and
// (b) convert a target visual angle into CSS px at that distance, so the reading text
// keeps the same apparent size whether the user leans in or sits back.
//
// Honest limit: without a physical card calibration we assume the CSS reference of
// ~96 dpi (37.8 px/cm). That makes the scaling correct WITHIN a device and across
// sessions; absolute comparability ACROSS devices stays approximate until a card /
// virtual-chinrest step measures real px/mm.

import { clampViewingDistanceCm } from './viewingDistance';

// Iris-center landmark indices on the 478-point MediaPipe FaceLandmarker mesh.
export const IRIS_LEFT = 468;
export const IRIS_RIGHT = 473;

// CSS reference: 96 px/inch ≈ 37.795 px/cm. CSS pixels are defined against this
// reference regardless of the device's real DPR, so DPR does not enter the angle math.
export const CSS_PX_PER_CM = 37.795;

export interface DistanceAnchor {
  distanceCm: number; // the (profile) distance assumed when the anchor was captured
  ipdPx: number;      // the IPD in image px measured at that distance
}

type Landmark = { x: number; y: number };

// Inter-pupillary distance in image pixels from the two iris centers. Returns null
// when the mesh is too small to hold the iris points. y is scaled by image height so
// the euclidean distance stays correct under head roll.
export function interpupillaryPx(
  landmarks: Landmark[] | null | undefined,
  imageWidthPx: number,
  imageHeightPx: number,
): number | null {
  if (!landmarks || landmarks.length <= IRIS_RIGHT) return null;
  const l = landmarks[IRIS_LEFT];
  const r = landmarks[IRIS_RIGHT];
  if (!l || !r) return null;
  const dx = (l.x - r.x) * imageWidthPx;
  const dy = (l.y - r.y) * imageHeightPx;
  const ipd = Math.hypot(dx, dy);
  return ipd > 0 ? ipd : null;
}

// Estimate the camera→eye distance (cm) from the current IPD and a reference anchor,
// using the pinhole relation: apparent size ∝ 1/distance, so distance scales with the
// inverse of the measured IPD. Falls back to the profile distance when there is no
// usable anchor/measurement. Always clamped to the safe 20–120 cm range.
export function estimateDistanceCm(
  currentIpdPx: number | null,
  anchor: DistanceAnchor | null,
  fallbackCm: number,
): number {
  if (!anchor || anchor.ipdPx <= 0 || currentIpdPx == null || currentIpdPx <= 0) {
    return clampViewingDistanceCm(fallbackCm);
  }
  const raw = (anchor.distanceCm * anchor.ipdPx) / currentIpdPx;
  return clampViewingDistanceCm(raw);
}

// CSS px subtended by 1° of visual angle at a given distance. Length on screen for 1°
// is 2·d·tan(0.5°) cm; multiply by px/cm to get CSS px.
export function cssPxPerDeg(distanceCm: number, pxPerCm: number = CSS_PX_PER_CM): number {
  return 2 * distanceCm * Math.tan((Math.PI / 180) / 2) * pxPerCm;
}

// CSS px for a font whose glyph height should subtend `targetAngleDeg` of visual angle
// at `distanceCm`. This is the value that stays perceptually constant across distance.
export function readingFontCssPx(
  targetAngleDeg: number,
  distanceCm: number,
  pxPerCm: number = CSS_PX_PER_CM,
): number {
  return targetAngleDeg * cssPxPerDeg(distanceCm, pxPerCm);
}

// Reading-size preferences expressed as visual angle (degrees of font height) instead
// of fixed px. The values reproduce the previous fixed sizes (26/32/40/48 px) at the
// 40 cm reference, so the experience is unchanged at that distance and only becomes
// distance-stable. Larger angles also keep saccades big enough for a ~2–5° webcam to
// resolve — a smaller, "natural" font would push saccades below the sensor's limit.
export const READING_ANGLE_DEG: Record<string, number> = {
  small: 1.0,
  normal: 1.2,
  large: 1.5,
  huge: 1.8,
};

export function readingFontAngleDeg(pref: string): number {
  return READING_ANGLE_DEG[pref] ?? READING_ANGLE_DEG.normal;
}

// Session-wide distance anchor, written once at calibration (profile distance + the
// IPD measured then) and read by the capture loop to turn the live IPD into a distance
// estimate. Singleton like the gaze-calibration model; the math functions above stay
// pure and take the anchor as an argument.
let distanceAnchor: DistanceAnchor | null = null;

export function setDistanceAnchor(anchor: DistanceAnchor | null) {
  distanceAnchor = anchor && anchor.ipdPx > 0 ? anchor : null;
}

export function getDistanceAnchor(): DistanceAnchor | null {
  return distanceAnchor;
}

export function resetDistanceAnchor() {
  distanceAnchor = null;
}
