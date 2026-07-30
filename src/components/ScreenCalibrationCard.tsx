import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CARD_WIDTH_MM,
  activePxPerCm,
  clearScreenCalibration,
  currentScreenCalibrationKey,
  loadScreenCalibration,
  pxPerCmFromCardWidthPx,
  resolveScreenCalibration,
  saveScreenCalibration,
} from '@/services/screenCalibration';
import { CSS_PX_PER_CM } from '@/services/viewingGeometry';
import { CreditCard } from 'lucide-react';

// Proporção ISO/IEC 7810 ID-1: 85,60 × 53,98 mm.
const CARD_ASPECT = 53.98 / 85.6;
const CARD_WIDTH_CM = CARD_WIDTH_MM / 10;
const SLIDER_MIN_PX = 200;
const SLIDER_MAX_PX = 600;

// Ritual do "virtual chinrest": encostar um cartão físico na tela e ajustar o
// retângulo até coincidir. px/cm = larguraPx / 8,56cm — mede a tela de verdade
// em vez de assumir os 96dpi da referência CSS.
export function ScreenCalibrationCard() {
  const [saved, setSaved] = useState(() => {
    const key = currentScreenCalibrationKey();
    return key ? resolveScreenCalibration(loadScreenCalibration(), key) : null;
  });
  const [cardWidthPx, setCardWidthPx] = useState(() =>
    saved?.cardWidthPx ?? Math.round(CSS_PX_PER_CM * CARD_WIDTH_CM),
  );
  const previewPxPerCm = useMemo(() => pxPerCmFromCardWidthPx(cardWidthPx), [cardWidthPx]);
  const active = activePxPerCm();

  const rectRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(false);

  // maxWidth: '100%' no retângulo protege o layout, mas num container mais
  // estreito que cardWidthPx a largura RENDERIZADA fica menor que o valor
  // salvo — o usuário alinharia o cartão físico ao retângulo cortado e
  // carimbaria como 'measured' um px/cm errado. Mede a largura real após
  // cada render/resize e bloqueia o salvar quando o clamp está ativo.
  useLayoutEffect(() => {
    const measure = () => {
      const el = rectRef.current;
      if (!el) return;
      // offsetWidth, não clientWidth: com o border-box do Tailwind o width
      // inline inclui as bordas (border-2 = 4px), e clientWidth as exclui —
      // comparar clientWidth com cardWidthPx acusaria clamp sempre.
      setClamped(el.offsetWidth < cardWidthPx - 1);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [cardWidthPx]);

  const nudge = (delta: number) =>
    setCardWidthPx(w => Math.min(SLIDER_MAX_PX, Math.max(SLIDER_MIN_PX, w + delta)));

  return (
    <div className="p-6 bg-surface-sunken rounded-2xl space-y-4">
      <div className="text-lg font-bold text-strong flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-indigo-500" /> Calibração de tela (cartão físico)
      </div>
      <p className="text-sm text-mild">
        Encoste um cartão de crédito/débito na tela e ajuste o retângulo até as larguras
        coincidirem. Isso mede o tamanho real do pixel — os graus absolutos da série
        dependem dessa régua.
      </p>
      <div
        ref={rectRef}
        className="border-2 border-indigo-500 rounded-lg bg-accent-soft"
        style={{ width: `${cardWidthPx}px`, height: `${Math.round(cardWidthPx * CARD_ASPECT)}px`, maxWidth: '100%' }}
        aria-label="Retângulo de comparação com o cartão"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="range"
          min={SLIDER_MIN_PX}
          max={SLIDER_MAX_PX}
          step={1}
          value={cardWidthPx}
          onChange={e => setCardWidthPx(Number(e.target.value))}
          className="flex-1 min-w-40 accent-indigo-600"
        />
        <button type="button" onClick={() => nudge(-1)} className="px-3 py-1 rounded-lg border border-line-strong text-mild font-bold">−1px</button>
        <button type="button" onClick={() => nudge(1)} className="px-3 py-1 rounded-lg border border-line-strong text-mild font-bold">+1px</button>
      </div>
      <div className="text-sm text-mild">
        {clamped
          ? 'Tela estreita demais para medir com este tamanho — o retângulo está cortado.'
          : previewPxPerCm != null
            ? `Medida atual: ${previewPxPerCm.toFixed(2)} px/cm (referência CSS: ${CSS_PX_PER_CM} px/cm)`
            : 'Fora da faixa plausível (20–80 px/cm) — ajuste o retângulo até casar com o cartão.'}
        {' · '}
        {active.source === 'measured'
          ? `Em uso: medida de ${saved ? new Date(saved.measuredAt).toLocaleDateString('pt-BR') : '—'}`
          : 'Em uso: referência CSS (sem medida válida para esta tela)'}
      </div>
      <div className="flex gap-3 flex-wrap">
        <button
          type="button"
          disabled={previewPxPerCm == null || clamped}
          onClick={() => setSaved(saveScreenCalibration(cardWidthPx))}
          className="px-5 py-3 bg-accent hover:bg-indigo-500 text-white rounded-xl font-bold disabled:opacity-40"
        >
          Salvar medida
        </button>
        <button
          type="button"
          onClick={() => { clearScreenCalibration(); setSaved(null); }}
          className="px-5 py-3 bg-surface border border-line-strong text-mild rounded-xl font-bold"
        >
          Voltar à referência CSS
        </button>
      </div>
    </div>
  );
}
