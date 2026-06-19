let sharedStream: MediaStream | null = null;
let pendingStream: Promise<MediaStream> | null = null;

export function buildFrontCameraConstraints(): MediaStreamConstraints {
  return {
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  };
}

export function isReusableStream(stream: MediaStream | null): stream is MediaStream {
  if (!stream) return false;
  return stream.getTracks().some(track => track.kind === 'video' && track.readyState === 'live');
}

export async function getFrontCameraStream(): Promise<MediaStream> {
  if (isReusableStream(sharedStream)) return sharedStream;
  if (pendingStream) return pendingStream;

  pendingStream = navigator.mediaDevices.getUserMedia(buildFrontCameraConstraints())
    .then(stream => {
      sharedStream = stream;
      return stream;
    })
    .finally(() => {
      pendingStream = null;
    });

  return pendingStream;
}

export async function attachStream(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  video.muted = true;
  video.playsInline = true;
  await video.play();
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
}
