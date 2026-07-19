import { ExerciseImplementation } from './engine';
import { getReadingContent } from '../services/contentGenerator';
import { analyzeSaccades } from './saccadeAnalysis';
import { readingFontAngleDeg } from '../services/viewingGeometry';
import { selectCaptureSeries } from '../services/validationCapture';
import { GazeSample } from '@/types';

// roundRect isn't available in every browser; fall back to a plain rect.
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof (ctx as any).roundRect === 'function') {
    ctx.beginPath();
    (ctx as any).roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
}

function buildReadingResult(context: Parameters<ExerciseImplementation['update']>[0]) {
  const s = context.state;
  const series = selectCaptureSeries(
    s.calibratedGazeSamples ?? [],
    s.rawGazeSamples ?? [],
  );
  if (!s.contentReady) {
    return {
      score: 0,
      invalidReason: s.error ? 'reading-content-error' : 'reading-content-unavailable',
      textLoaded: false,
      textComplexity: context.parameters.textComplexity || 'facil',
      saccadeMetrics: analyzeSaccades([], { signalSource: 'unavailable' }),
      calibratedSampleCount: series.calibratedSampleCount,
      rawSampleCount: series.rawSampleCount,
    };
  }

  const saccadeMetrics = analyzeSaccades(series.samples, { signalSource: series.signalSource });
  return {
    intervals: s.intervals,
    textLoaded: true,
    textComplexity: context.parameters.textComplexity || 'facil',
    saccadeMetrics,
    calibratedSampleCount: series.calibratedSampleCount,
    rawSampleCount: series.rawSampleCount,
  };
}

export const assistedReadingExercise: ExerciseImplementation = {
  id: 'assistedReading',
  init: (context) => {
    // Size the reading font by visual angle (same geometry as the diagnostics
    // screen), so saccade amplitudes are comparable between the exercise and the
    // diagnostic capture instead of depending on device-specific fixed px.
    // Clamped: the profile distance feeding degToPx is self-declared (up to 120cm),
    // so an entry error would otherwise blow the text up to ~140px.
    const fontPx = Math.max(18, Math.min(56, Math.round(context.degToPx(readingFontAngleDeg(context.fontSizePreference)))));
    context.state = {
      text: "Aguarde, gerando texto adaptado...",
      chunks: [],
      currentIndex: 0,
      intervals: [] as number[],
      calibratedGazeSamples: [] as GazeSample[],
      rawGazeSamples: [] as GazeSample[],
      lastTapTime: context.timeMs,
      setupDone: false,
      loading: true,
      error: null as string | null,
      contentReady: false,
      fontPx
    };

    getReadingContent(context.parameters.textComplexity || 'facil', context.parameters.durationSec)
      .then(text => {
        const cleanText = text.trim();
        if (!cleanText) throw new Error('empty generated reading text');
        context.state.text = cleanText;
        context.state.loading = false;
        context.state.error = null;
        context.state.contentReady = true;
        context.state.setupDone = false; // Trigger re-setup
        context.state.calibratedGazeSamples = [];
        context.state.rawGazeSamples = [];
        context.state.lastTapTime = context.timeMs; // Reset time
      })
      .catch(() => {
        context.state.loading = false;
        context.state.error = 'Não foi possível gerar o texto por IA. Verifique a configuração da OpenAI e tente novamente.';
      });
  },
  update: (context) => {
    const s = context.state;

    if (s.loading || s.error) return;

    if (!s.setupDone) {
      s.setupDone = true;
      const { ctx, width, height } = context;
      ctx.font = `${s.fontPx}px Inter, sans-serif`;

      const rawWords = s.text.split(' ');
      const chunks = [];
      for(let i=0; i<rawWords.length; i+=2) {
         chunks.push(rawWords.slice(i, i+2).join(' '));
      }

      const margin = Math.max(24, width * 0.06);
      let currX = margin;
      let currY = height / 3;
      const lineHeight = (s.fontPx * 1.875) * (context.parameters.lineSpacingMultiplier || 1.5);

      s.chunks = [];

      chunks.forEach(c => {
         const metrics = ctx.measureText(c + ' ');
         if (currX + metrics.width > width - margin && currX > margin) {
            currX = margin;
            currY += lineHeight;
         }
         s.chunks.push({ text: c, x: currX, y: currY, width: metrics.width, height: s.fontPx * 1.25 });
         currX += metrics.width;
      });

      // Center vertically if needed
      const totalHeight = currY - (height/3);
      const offsetY = (height - totalHeight) / 2 - (height/3);
      s.chunks.forEach((c: any) => c.y += offsetY);
    }

    // Calibrated canvas ratios and raw iris ratios use different units. Keep them
    // in mutually exclusive per-frame buffers so a source transition cannot create
    // a fabricated saccade; result selection analyzes only the majority source.
    if (context.latestGazePoint && context.width > 0 && context.height > 0) {
      s.calibratedGazeSamples.push({
        t: context.timeMs,
        h: context.latestGazePoint.x / context.width,
        v: context.latestGazePoint.y / context.height,
      });
    } else if (context.latestGaze) {
      s.rawGazeSamples.push({ ...context.latestGaze });
    }
  },
  draw: (context) => {
    const s = context.state;
    const { ctx, width, height } = context;
    ctx.clearRect(0,0,width,height);

    // Check contrast mode
    const isDark = context.parameters.contrastMode === 'dark';
    ctx.fillStyle = isDark ? '#0f172a' : '#f8fafc';
    ctx.fillRect(0,0,width,height);

    ctx.font = `${s.fontPx}px Inter, sans-serif`;
    ctx.textBaseline = 'bottom';

    if (s.loading) {
       ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
       ctx.textAlign = 'center';
       ctx.fillText("Aguarde, gerando texto inteligente...", width/2, height/2);
       return;
    }

    if (s.error) {
       ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
       ctx.textAlign = 'center';
       ctx.font = `${Math.max(18, Math.min(28, s.fontPx))}px Inter, sans-serif`;
       ctx.fillText(s.error, width / 2, height / 2);
       ctx.font = '18px Inter, sans-serif';
       ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
       ctx.fillText('Use Parar Imediatamente e tente novamente após configurar a chave.', width / 2, height / 2 + 42);
       ctx.textAlign = 'left';
       return;
    }

    s.chunks.forEach((c: any, index: number) => {
       if (index === s.currentIndex) {
          // Highlight background
          drawRoundedRect(ctx, c.x - 5, c.y - c.height + 5, c.width + 10, c.height, 8);
          ctx.fillStyle = '#3b82f6';
          ctx.fill();
          ctx.fillStyle = '#ffffff'; // contrasting text
       } else if (index < s.currentIndex) {
          ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
       } else {
          ctx.fillStyle = isDark ? '#cbd5e1' : '#334155';
       }
       ctx.fillText(c.text, c.x, c.y);
    });

    ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
    ctx.font = '18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Toque na tela em qualquer lugar para avançar ao terminar de ler a marcação', width/2, height - 100);
    ctx.textAlign = 'left';
  },
  onInput: (x, y, context) => {
    const s = context.state;
    if (s.loading || s.error) return;
    if (s.currentIndex < s.chunks.length) {
       const now = context.timeMs;
       if (s.currentIndex > 0) {
         s.intervals.push(now - s.lastTapTime);
       }
       s.lastTapTime = now;
       s.currentIndex++;

       if (s.currentIndex === s.chunks.length) {
          const minMs = (context.parameters.durationSec || 0) * 1000 * 0.7;
          if (context.timeMs >= minMs) {
             context.finishExercise(buildReadingResult(context));
          } else {
             // Text ran out early: restart the pass so the exercise sustains its
             // target duration; intervals keep accumulating and the canvas
             // durationSec ceiling still ends the run.
             s.currentIndex = 0;
          }
       }
    }
  },
  getResultData: (context) => buildReadingResult(context),
}
