export interface NumericCapabilityRange {
  min?: number;
  max?: number;
}

export interface CameraNegotiatedSettings {
  width?: number;
  height?: number;
  frameRate?: number;
}

export interface CameraCapabilities {
  width?: NumericCapabilityRange;
  height?: NumericCapabilityRange;
  frameRate?: NumericCapabilityRange;
}

export interface CameraVideoTelemetry {
  width: number;
  height: number;
}

export interface CameraMeasuredRates {
  detectionFps?: number;
  ocularSampleRateHz?: number;
  // Main-thread cost of one MediaPipe inference (EMA) and which delegate ran it —
  // together they discriminate "camera delivers few frames" from "processing
  // can't keep up" when detectionFps looks low.
  inferenceEmaMs?: number;
  delegate?: 'GPU' | 'CPU';
}

export interface CameraPipelineTelemetry {
  negotiated: CameraNegotiatedSettings;
  capabilities?: CameraCapabilities;
  video: CameraVideoTelemetry;
  measured: CameraMeasuredRates;
}

export function readCameraPipelineTelemetry(
  video: HTMLVideoElement | null | undefined,
  measured: CameraMeasuredRates = {}
): CameraPipelineTelemetry {
  const track = getVideoTrack(video);
  const settings = readTrackSettings(track);
  return {
    negotiated: settings,
    capabilities: readTrackCapabilities(track),
    video: {
      width: video?.videoWidth || settings.width || 0,
      height: video?.videoHeight || settings.height || 0,
    },
    measured: {
      detectionFps: finiteNumber(measured.detectionFps),
      ocularSampleRateHz: finiteNumber(measured.ocularSampleRateHz),
      inferenceEmaMs: finiteNumber(measured.inferenceEmaMs),
      delegate: measured.delegate === 'GPU' || measured.delegate === 'CPU' ? measured.delegate : undefined,
    },
  };
}

function getVideoTrack(video: HTMLVideoElement | null | undefined): MediaStreamTrack | undefined {
  const stream = video?.srcObject as ({ getVideoTracks?: () => MediaStreamTrack[] } | null);
  if (!stream?.getVideoTracks) return undefined;
  return stream.getVideoTracks()[0];
}

function readTrackSettings(track: MediaStreamTrack | undefined): CameraNegotiatedSettings {
  const settings = track?.getSettings?.();
  return {
    width: finiteNumber(settings?.width),
    height: finiteNumber(settings?.height),
    frameRate: finiteNumber(settings?.frameRate),
  };
}

function readTrackCapabilities(track: MediaStreamTrack | undefined): CameraCapabilities | undefined {
  const getCapabilities = track?.getCapabilities;
  if (!getCapabilities) return undefined;
  try {
    const capabilities = getCapabilities.call(track) as MediaTrackCapabilities;
    return {
      width: rangeCapability(capabilities.width),
      height: rangeCapability(capabilities.height),
      frameRate: rangeCapability(capabilities.frameRate),
    };
  } catch {
    return undefined;
  }
}

function rangeCapability(value: NumericCapabilityRange | undefined): NumericCapabilityRange | undefined {
  if (!value) return undefined;
  return {
    min: finiteNumber(value.min),
    max: finiteNumber(value.max),
  };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
