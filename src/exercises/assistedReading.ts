import { ExerciseImplementation } from './engine';
import { getReadingContent } from '../services/contentGenerator';

export const assistedReadingExercise: ExerciseImplementation = {
  id: 'assistedReading',
  init: (context) => {
    context.state = {
      text: "Aguarde, gerando texto adaptado...",
      chunks: [],
      currentIndex: 0,
      intervals: [] as number[],
      lastTapTime: context.timeMs,
      setupDone: false,
      loading: true
    };

    getReadingContent(context.parameters.textComplexity || 'facil').then(text => {
      context.state.text = text;
      context.state.loading = false;
      context.state.setupDone = false; // Trigger re-setup
      context.state.lastTapTime = context.timeMs; // Reset time
    });
  },
  update: (context) => {
    const s = context.state;
    if (s.loading) return;
    
    if (!s.setupDone) {
      s.setupDone = true;
      const { ctx, width, height } = context;
      ctx.font = '32px Inter, sans-serif';
      
      const rawWords = s.text.split(' ');
      const chunks = [];
      for(let i=0; i<rawWords.length; i+=2) {
         chunks.push(rawWords.slice(i, i+2).join(' '));
      }

      const margin = 100;
      const maxWidth = width - margin * 2;
      let currX = margin;
      let currY = height / 3;
      const lineHeight = 60 * (context.parameters.lineSpacingMultiplier || 1.5);
      
      s.chunks = [];
      
      chunks.forEach(c => {
         const metrics = ctx.measureText(c + ' ');
         if (currX + metrics.width > width - margin && currX > margin) {
            currX = margin;
            currY += lineHeight;
         }
         s.chunks.push({ text: c, x: currX, y: currY, width: metrics.width, height: 40 });
         currX += metrics.width;
      });
      
      // Center vertically if needed
      const totalHeight = currY - (height/3);
      const offsetY = (height - totalHeight) / 2 - (height/3);
      s.chunks.forEach((c: any) => c.y += offsetY);
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
    
    ctx.font = '32px Inter, sans-serif';
    ctx.textBaseline = 'bottom';
    
    if (s.loading) {
       ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
       ctx.textAlign = 'center';
       ctx.fillText("Aguarde, gerando texto inteligente...", width/2, height/2);
       return;
    }

    s.chunks.forEach((c: any, index: number) => {
       if (index === s.currentIndex) {
          // Highlight background
          ctx.beginPath();
          ctx.roundRect(c.x - 5, c.y - c.height + 5, c.width + 10, c.height, 8);
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
    if (s.loading) return;
    if (s.currentIndex < s.chunks.length) {
       const now = context.timeMs;
       if (s.currentIndex > 0) {
         s.intervals.push(now - s.lastTapTime);
       }
       s.lastTapTime = now;
       s.currentIndex++;
       
       if (s.currentIndex === s.chunks.length) {
          // measure last tap
          context.finishExercise({
             intervals: s.intervals,
             textComplexity: context.parameters.textComplexity || 'facil'
          });
       }
    }
  }
}
