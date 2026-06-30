import { ExerciseImplementation } from './engine';
import { getReadingContent } from '../services/contentGenerator';
import { analyzeSaccades } from './saccadeAnalysis';
import { GazeSample } from '@/types';

// Maps the user's font preference to a reading font size in px.
function readingFontPx(pref: string): number {
  switch (pref) {
    case 'small': return 26;
    case 'large': return 40;
    case 'huge': return 48;
    default: return 32; // 'normal'
  }
}

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
  if (!s.contentReady) {
    return {
      score: 0,
      invalidReason: s.error ? 'reading-content-error' : 'reading-content-unavailable',
      textLoaded: false,
      textComplexity: context.parameters.textComplexity || 'facil',
      saccadeMetrics: analyzeSaccades([], { signalSource: 'unavailable' }),
    };
  }

  const saccadeMetrics = analyzeSaccades(s.gazeSamples, {
    signalSource: s.gazeSamples.length ? 'calibrated-mediapipe' : 'unavailable',
  });
  return {
    intervals: s.intervals,
    textLoaded: true,
    textComplexity: context.parameters.textComplexity || 'facil',
    saccadeMetrics,
  };
}

export const assistedReadingExercise: ExerciseImplementation = {
  id: 'assistedReading',
  init: (context) => {
    const fontPx = readingFontPx(context.fontSizePreference);
    context.state = {
      text: "Aguarde, gerando texto adaptado...",
      chunks: [],
      currentIndex: 0,
      intervals: [] as number[],
      gazeSamples: [] as GazeSample[],
      lastTapTime: context.timeMs,
      setupDone: false,
      loading: true,
      error: null as string | null,
      contentReady: false,
      fontPx
    };

    getReadingContent(context.parameters.textComplexity || 'facil')
      .then(text => {
        const cleanText = text.trim();
        if (!cleanText) throw new Error('empty generated reading text');
        context.state.text = cleanText;
        context.state.loading = false;
        context.state.error = null;
        context.state.contentReady = true;
        context.state.setupDone = false; // Trigger re-setup
        context.state.gazeSamples = [];
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

      const margin = 100;
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

    // Continuously sample calibrated webcam gaze only after the real reading text
    // exists. Raw iris ratios are intentionally ignored here: reading saccades
    // require calibration.
    if (context.latestGazePoint && context.width > 0 && context.height > 0) {
      s.gazeSamples.push({
        t: context.timeMs,
        h: context.latestGazePoint.x / context.width,
        v: context.latestGazePoint.y / context.height,
      });
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
          context.finishExercise(buildReadingResult(context));
       }
    }
  },
  getResultData: (context) => buildReadingResult(context),
}
