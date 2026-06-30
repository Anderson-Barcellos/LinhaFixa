type VideoFrameCallback = (now: number, metadata: { expectedDisplayTime?: number; mediaTime?: number }) => void;

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: VideoFrameCallback) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
  getVideoPlaybackQuality?: () => { totalVideoFrames?: number };
};

interface AnimationFrameScheduler {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
}

export interface VideoFrameLoopHandle {
  stop: () => void;
}

// Runs work on real video frames when the browser exposes requestVideoFrameCallback.
// Falling back to rAF keeps older engines working, but the preferred path avoids
// re-processing the same camera frame multiple times on high-refresh displays.
export function startVideoFrameLoop(
  video: HTMLVideoElement,
  onFrame: (timestamp: number) => void,
  scheduler?: AnimationFrameScheduler
): VideoFrameLoopHandle {
  const frameVideo = video as VideoWithFrameCallback;
  const hasVideoFrameCallback = typeof frameVideo.requestVideoFrameCallback === 'function';
  const fallbackScheduler = scheduler ?? (globalThis as typeof globalThis & { window?: AnimationFrameScheduler }).window;
  let active = true;
  let handle = 0;
  let lastFallbackMediaTime: number | null = null;
  let lastFallbackPresentedFrames: number | null = null;

  const schedule = () => {
    if (!active) return;
    if (hasVideoFrameCallback) {
      handle = frameVideo.requestVideoFrameCallback!((now, metadata) => {
        if (!active) return;
        onFrame(metadata.expectedDisplayTime ?? now);
        schedule();
      });
      return;
    }

    if (!fallbackScheduler) {
      throw new Error('requestAnimationFrame is unavailable and no scheduler was provided');
    }

    handle = fallbackScheduler.requestAnimationFrame(now => {
      if (!active) return;
      if (fallbackVideoFrameAdvanced()) {
        onFrame(now);
      }
      schedule();
    });
  };

  schedule();

  return {
    stop() {
      if (!active) return;
      active = false;
      if (hasVideoFrameCallback) {
        frameVideo.cancelVideoFrameCallback?.(handle);
      } else {
        fallbackScheduler.cancelAnimationFrame(handle);
      }
    },
  };
  function fallbackVideoFrameAdvanced(): boolean {
    const qualityFrames = frameVideo.getVideoPlaybackQuality?.().totalVideoFrames;
    const mediaAdvanced = lastFallbackMediaTime === null || frameVideo.currentTime !== lastFallbackMediaTime;
    if (typeof qualityFrames === 'number') {
      const frameAdvanced = lastFallbackPresentedFrames === null || qualityFrames !== lastFallbackPresentedFrames;
      if (frameAdvanced || mediaAdvanced) {
        lastFallbackPresentedFrames = qualityFrames;
        lastFallbackMediaTime = frameVideo.currentTime;
        return true;
      }
      return false;
    }

    if (mediaAdvanced) {
      lastFallbackMediaTime = frameVideo.currentTime;
      return true;
    }
    return false;
  }
}
