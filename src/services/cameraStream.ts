let sharedStream: MediaStream | null = null;
let pendingStream: Promise<MediaStream> | null = null;
let claimGeneration = 0;
let pendingAcquisition: CameraAcquisition | null = null;

interface CameraAcquisition {
  disposableOrigin: boolean;
  claimedByPersistentConsumer: boolean;
  discarded: boolean;
}

export interface FrontCameraRequest {
  claim: number;
  promise: Promise<MediaStream>;
  acquisition: CameraAcquisition | null;
}

export function buildFrontCameraConstraints(): MediaStreamConstraints {
  return {
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60, max: 120 },
    },
    audio: false,
  };
}

export function isReusableStream(stream: MediaStream | null): stream is MediaStream {
  if (!stream) return false;
  return stream.getTracks().some(track => track.kind === 'video' && track.readyState === 'live');
}

export async function getFrontCameraStream(): Promise<MediaStream> {
  return cameraRequest(false).promise;
}

export function requestFrontCameraStream(): FrontCameraRequest {
  return cameraRequest(true);
}

function cameraRequest(disposable: boolean): FrontCameraRequest {
  const claim = ++claimGeneration;
  if (isReusableStream(sharedStream)) {
    return { claim, promise: Promise.resolve(sharedStream), acquisition: null };
  }
  if (pendingStream && pendingAcquisition) {
    if (!disposable) pendingAcquisition.claimedByPersistentConsumer = true;
    return { claim, promise: pendingStream, acquisition: pendingAcquisition };
  }

  const acquisition: CameraAcquisition = {
    disposableOrigin: disposable,
    claimedByPersistentConsumer: !disposable,
    discarded: false,
  };
  pendingAcquisition = acquisition;
  const acquisitionPromise = navigator.mediaDevices.getUserMedia(buildFrontCameraConstraints())
    .then(stream => {
      if (pendingAcquisition !== acquisition) {
        stream.getTracks().forEach(track => track.stop());
        acquisition.discarded = true;
        return stream;
      }
      sharedStream = stream;
      return stream;
    })
    .finally(() => {
      if (pendingAcquisition === acquisition) {
        pendingStream = null;
        pendingAcquisition = null;
      }
    });
  pendingStream = acquisitionPromise;

  return { claim, promise: acquisitionPromise, acquisition };
}

export function discardFrontCameraRequest(
  request: FrontCameraRequest,
  stream: MediaStream,
): boolean {
  if (
    request.claim !== claimGeneration
    || request.acquisition?.disposableOrigin !== true
    || request.acquisition.discarded
    || request.acquisition.claimedByPersistentConsumer
    || sharedStream !== stream
  ) return false;
  stream.getTracks().forEach(track => track.stop());
  sharedStream = null;
  return true;
}

export function retainFrontCameraRequest(request: FrontCameraRequest): void {
  if (request.acquisition) request.acquisition.claimedByPersistentConsumer = true;
}

export async function attachStream(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  const needsAttach = video.srcObject !== stream;
  if (needsAttach) {
    video.srcObject = stream;
  }
  video.muted = true;
  video.playsInline = true;
  if (needsAttach || video.paused) {
    await video.play();
  }
}

export function getActiveCameraStream(): MediaStream | null {
  return isReusableStream(sharedStream) ? sharedStream : null;
}

export function stopCameraStream(): void {
  if (sharedStream) {
    sharedStream.getTracks().forEach(track => track.stop());
  }
  sharedStream = null;
  pendingStream = null;
  pendingAcquisition = null;
}
