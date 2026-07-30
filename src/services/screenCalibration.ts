// Calibração física da tela: px/cm medido com um cartão ISO/IEC 7810 ID-1
// (85,60mm de largura — qualquer cartão de crédito/débito serve), no espírito do
// "virtual chinrest" (Li et al. 2020). A referência CSS de ~96dpi assume que o
// monitor obedece à norma; com escala de SO ela erra em fator desconhecido, e todo
// grau absoluto da série herda esse erro. A medida vive em localStorage com uma
// chave de invalidação {dpr, screen, orientação}: qualquer mudança de regime de
// vídeo invalida a medida em vez de arrastá-la silenciosamente para outra tela.
//
// Dono único do px/cm ativo: quem precisa de px/cm consulta activePxPerCm() e
// carimba o `source` junto do número — medida e proveniência andam sempre juntas
// (mesmo padrão do thresholdSource do engine v3).

import { CSS_PX_PER_CM } from './viewingGeometry';
import { currentOrientation } from './ocularSignalContract';

export const CARD_WIDTH_MM = 85.6; // ISO/IEC 7810 ID-1
const CARD_WIDTH_CM = CARD_WIDTH_MM / 10;
// Faixa de sanidade: monitores/phones reais ficam em ~25-70 px(CSS)/cm; fora
// disso a "medida" é erro de manuseio. Fora da faixa não se clampa — fallback
// honesto, como na derivação do blinkBaseline.
export const MEASURED_PX_PER_CM_RANGE = Object.freeze({ min: 20, max: 80 });
export const SCREEN_CALIBRATION_STORAGE_KEY = 'linhafixa_screen_calibration_v1';
const DPR_EPSILON = 1e-3;

export type PxPerCmSource = 'measured' | 'css-reference';

export interface ScreenCalibrationKey {
  devicePixelRatio: number;
  screenWidth: number;
  screenHeight: number;
  orientation: 'portrait' | 'landscape';
}

export interface ScreenCalibration {
  pxPerCm: number;
  cardWidthPx: number; // largura ajustada na tela quando casou com o cartão físico
  measuredAt: number;  // epoch ms
  key: ScreenCalibrationKey;
}

export interface ActivePxPerCm {
  pxPerCm: number;
  source: PxPerCmSource;
}

function inMeasuredRange(pxPerCm: number): boolean {
  return Number.isFinite(pxPerCm)
    && pxPerCm >= MEASURED_PX_PER_CM_RANGE.min
    && pxPerCm <= MEASURED_PX_PER_CM_RANGE.max;
}

export function pxPerCmFromCardWidthPx(cardWidthPx: number): number | null {
  if (!Number.isFinite(cardWidthPx) || cardWidthPx <= 0) return null;
  const pxPerCm = cardWidthPx / CARD_WIDTH_CM;
  return inMeasuredRange(pxPerCm) ? pxPerCm : null;
}

export function sameScreenCalibrationKey(a: ScreenCalibrationKey, b: ScreenCalibrationKey): boolean {
  return Math.abs(a.devicePixelRatio - b.devicePixelRatio) < DPR_EPSILON
    && a.screenWidth === b.screenWidth
    && a.screenHeight === b.screenHeight
    && a.orientation === b.orientation;
}

// Valida se a key tem a shape correta (todos os 4 campos presentes e com tipos esperados)
function isValidScreenCalibrationKey(key: unknown): key is ScreenCalibrationKey {
  if (!key || typeof key !== 'object') return false;
  const k = key as Record<string, unknown>;
  return (
    typeof k.devicePixelRatio === 'number'
    && typeof k.screenWidth === 'number'
    && typeof k.screenHeight === 'number'
    && (k.orientation === 'portrait' || k.orientation === 'landscape')
  );
}

export function resolveScreenCalibration(
  stored: ScreenCalibration | null,
  currentKey: ScreenCalibrationKey,
): ScreenCalibration | null {
  if (!stored) return null;
  if (!inMeasuredRange(stored.pxPerCm)) return null;
  if (!isValidScreenCalibrationKey(stored.key)) return null;
  return sameScreenCalibrationKey(stored.key, currentKey) ? stored : null;
}

export function currentScreenCalibrationKey(): ScreenCalibrationKey | null {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return null;
  return {
    devicePixelRatio: window.devicePixelRatio || 1,
    screenWidth: screen.width,
    screenHeight: screen.height,
    orientation: currentOrientation(),
  };
}

export function loadScreenCalibration(): ScreenCalibration | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SCREEN_CALIBRATION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScreenCalibration) : null;
  } catch {
    return null;
  }
}

export function saveScreenCalibration(cardWidthPx: number): ScreenCalibration | null {
  const key = currentScreenCalibrationKey();
  const pxPerCm = pxPerCmFromCardWidthPx(cardWidthPx);
  if (!key || pxPerCm == null || typeof localStorage === 'undefined') return null;
  const calibration: ScreenCalibration = { pxPerCm, cardWidthPx, measuredAt: Date.now(), key };
  localStorage.setItem(SCREEN_CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
  return calibration;
}

export function clearScreenCalibration(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(SCREEN_CALIBRATION_STORAGE_KEY);
}

// Px/cm vigente + proveniência, resolvidos a cada chamada (a medida só muda via
// Settings; o custo é uma leitura de localStorage). Chave divergente = tela em
// regime diferente do medido → fallback carimbado, nunca a medida errada.
export function activePxPerCm(): ActivePxPerCm {
  const key = currentScreenCalibrationKey();
  if (key) {
    const measured = resolveScreenCalibration(loadScreenCalibration(), key);
    if (measured) return { pxPerCm: measured.pxPerCm, source: 'measured' };
  }
  return { pxPerCm: CSS_PX_PER_CM, source: 'css-reference' };
}
