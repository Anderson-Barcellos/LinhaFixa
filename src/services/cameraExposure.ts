import { finiteNumber, rangeCapability, type NumericCapabilityRange } from './cameraTelemetry';

// Controle opt-in de exposição da webcam. O auto-exposure de webcam comum
// (especialmente no Windows) oscila com a cena e injeta ruído fotométrico no
// sinal que o MediaPipe recebe; travar a exposição estabiliza a fonte sem tocar
// no pipeline de análise — a série histórica permanece comparável.
//
// O serviço é puro (sem estado de módulo): quem trava é dono do ciclo de vida
// e responde por destravar — hoje o ExposureControlCard, que restaura o modo
// contínuo no teardown e em pagehide, porque a configuração persiste no
// hardware da webcam depois que a página fecha.
//
// Chrome/Windows (webrtcHacks, Chrome 101+): exposureMode:'manual' e
// exposureTime DEVEM ir em chamadas separadas de applyConstraints — juntos, o
// exposureTime é ignorado silenciosamente.

export interface ExposureCapabilities {
  manualSupported: boolean;
  modes: string[];
  exposureTime?: NumericCapabilityRange;
  current?: { exposureMode?: string; exposureTime?: number };
}

export type ExposureLockResult =
  | { locked: true; exposureTime: number }
  | { locked: false; reason: 'unsupported' | 'apply-failed' };

// getCapabilities/getSettings/applyConstraints ainda não tipam os campos de
// exposição no lib.dom padrão — leitura estruturalmente tolerante (como o
// cameraTelemetry) e constraint set estendido para escrita.
interface ExposureCapabilityShape {
  exposureMode?: unknown;
  exposureTime?: NumericCapabilityRange;
}

interface ExposureConstraintSet extends MediaTrackConstraintSet {
  exposureMode?: string;
  exposureTime?: number;
}

function exposureConstraints(set: ExposureConstraintSet): MediaTrackConstraints {
  return { advanced: [set] };
}

export function readExposureCapabilities(
  track: MediaStreamTrack | null | undefined,
): ExposureCapabilities {
  const getCapabilities = track?.getCapabilities;
  if (!getCapabilities) return { manualSupported: false, modes: [] };
  let capabilities: ExposureCapabilityShape;
  try {
    capabilities = getCapabilities.call(track) as ExposureCapabilityShape;
  } catch {
    return { manualSupported: false, modes: [] };
  }

  const modes = Array.isArray(capabilities.exposureMode)
    ? capabilities.exposureMode.filter((mode): mode is string => typeof mode === 'string')
    : [];
  const exposureTime = rangeCapability(capabilities.exposureTime);
  if (!modes.includes('manual') || !exposureTime) {
    return { manualSupported: false, modes, exposureTime };
  }
  return { manualSupported: true, modes, exposureTime, current: readExposureSettings(track) };
}

export async function lockExposure(
  track: MediaStreamTrack,
  caps: ExposureCapabilities = readExposureCapabilities(track),
): Promise<ExposureLockResult> {
  if (!caps.manualSupported) return { locked: false, reason: 'unsupported' };

  const target = resolveTimeTarget(caps);
  try {
    await track.applyConstraints(exposureConstraints({ exposureMode: 'manual' }));
    await track.applyConstraints(exposureConstraints({ exposureTime: target }));
  } catch {
    await unlockExposure(track);
    return { locked: false, reason: 'apply-failed' };
  }
  return { locked: true, exposureTime: target };
}

export async function unlockExposure(track: MediaStreamTrack): Promise<void> {
  try {
    await track.applyConstraints(exposureConstraints({ exposureMode: 'continuous' }));
  } catch {
    // destravar é best-effort: track já encerrado ou modo contínuo recusado
  }
}

function readExposureSettings(
  track: MediaStreamTrack | null | undefined,
): ExposureCapabilities['current'] {
  const settings = track?.getSettings?.() as
    | { exposureMode?: unknown; exposureTime?: unknown }
    | undefined;
  return {
    exposureMode: typeof settings?.exposureMode === 'string' ? settings.exposureMode : undefined,
    exposureTime: finiteNumber(settings?.exposureTime),
  };
}

// Congela a exposição no valor que o auto acabou de negociar (menor salto
// visível); sem leitura atual, o ponto médio do range é o chute neutro.
function resolveTimeTarget(caps: ExposureCapabilities): number {
  const min = caps.exposureTime?.min ?? 0;
  const max = caps.exposureTime?.max ?? min;
  const candidate = caps.current?.exposureTime ?? (min + max) / 2;
  return Math.min(Math.max(candidate, min), max);
}
