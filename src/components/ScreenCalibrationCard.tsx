import React, { useMemo, useState } from 'react';
import {
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  activePxPerCm,
  clearScreenCalibration,
  currentScreenCalibrationKey,
  loadScreenCalibration,
  pxPerCmFromSpanPx,
  resolveScreenCalibration,
  saveScreenCalibration,
} from '@/services/screenCalibration';
import { CSS_PX_PER_CM } from '@/services/viewingGeometry';
import { CreditCard } from 'lucide-react';

// Proporção ISO/IEC 7810 ID-1: 85,60 × 53,98 mm.
const CARD_ASPECT = CARD_HEIGHT_MM / CARD_WIDTH_MM;
const SLIDER_MIN_PX = 150;

type CardPose = 'deitado' | 'em-pe';

function spanMmFor(pose: CardPose): number {
  return pose === 'deitado' ? CARD_WIDTH_MM : CARD_HEIGHT_MM;
}

// Ritual do "virtual chinrest": encostar um cartão físico na tela e ajustar o
// retângulo até coincidir. px/cm = spanPx / spanCm — mede a tela de verdade em
// vez de assumir os 96dpi da referência CSS. O ritual roda em OVERLAY de tela
// cheia: o teto da medida tem de ser o viewport, nunca a largura de um card de
// layout — um teto de container tornaria o instrumento cego exatamente nas
// telas mais densas. Em viewport estreito (phone), mede-se com o cartão em pé
// (lado de 53,98mm).
export function ScreenCalibrationCard() {
  const [measuring, setMeasuring] = useState(false);
  const [saved, setSaved] = useState(() => {
    const key = currentScreenCalibrationKey();
    return key ? resolveScreenCalibration(loadScreenCalibration(), key) : null;
  });
  const active = activePxPerCm();

  if (measuring) {
    return (
      <ScreenCalibrationOverlay
        initialSpanPx={saved?.cardWidthPx}
        onDone={result => {
          if (result) setSaved(result);
          setMeasuring(false);
        }}
      />
    );
  }

  return (
    <div className="p-6 bg-surface-sunken rounded-2xl space-y-4">
      <div className="text-lg font-bold text-strong flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-indigo-500" /> Calibração de tela (cartão físico)
      </div>
      <p className="text-sm text-mild">
        Meça o tamanho real do pixel comparando um cartão de crédito/débito com um
        retângulo na tela — os graus absolutos da série dependem dessa régua.
      </p>
      <div className="text-sm text-mild">
        {active.source === 'measured'
          ? `Em uso: ${active.pxPerCm.toFixed(2)} px/cm medidos em ${saved ? new Date(saved.measuredAt).toLocaleDateString('pt-BR') : '—'} (referência CSS: ${CSS_PX_PER_CM} px/cm)`
          : `Em uso: referência CSS (${CSS_PX_PER_CM} px/cm) — sem medida válida para esta tela`}
      </div>
      <div className="flex gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setMeasuring(true)}
          className="px-5 py-3 bg-accent hover:bg-indigo-500 text-white rounded-xl font-bold"
        >
          {active.source === 'measured' ? 'Medir novamente' : 'Medir agora'}
        </button>
        {active.source === 'measured' && (
          <button
            type="button"
            onClick={() => { clearScreenCalibration(); setSaved(null); }}
            className="px-5 py-3 bg-surface border border-line-strong text-mild rounded-xl font-bold"
          >
            Voltar à referência CSS
          </button>
        )}
      </div>
    </div>
  );
}

function ScreenCalibrationOverlay({
  initialSpanPx,
  onDone,
}: {
  initialSpanPx?: number;
  onDone: (saved: ReturnType<typeof saveScreenCalibration>) => void;
}) {
  // Teto físico do gesto: quase todo o viewport. Medido uma vez na abertura —
  // o overlay é efêmero e resize mid-ritual invalidaria a chave de qualquer forma.
  const [viewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const sliderMax = Math.max(SLIDER_MIN_PX + 50, Math.floor(viewport.w) - 32);
  // Cartão em pé por padrão quando o viewport não comporta o lado maior com folga.
  const [pose, setPose] = useState<CardPose>(() =>
    viewport.w < CSS_PX_PER_CM * (CARD_WIDTH_MM / 10) + 80 ? 'em-pe' : 'deitado',
  );
  const [spanPx, setSpanPx] = useState(() => {
    // initialSpanPx vem normalizado ao lado maior (cardWidthPx); converte para
    // o lado da pose inicial antes de usar, senão o px/cm nasce inflado ~1,59×.
    const seedDeitado = initialSpanPx ?? CSS_PX_PER_CM * (CARD_WIDTH_MM / 10);
    const seed = (seedDeitado * spanMmFor(pose)) / CARD_WIDTH_MM;
    return Math.round(Math.min(seed, Math.floor(viewport.w) - 32));
  });

  const previewPxPerCm = useMemo(
    () => pxPerCmFromSpanPx(spanPx, spanMmFor(pose)),
    [spanPx, pose],
  );

  const clampSpan = (v: number) => Math.min(sliderMax, Math.max(SLIDER_MIN_PX, v));
  const nudge = (delta: number) => setSpanPx(w => clampSpan(w + delta));

  const switchPose = (next: CardPose) => {
    if (next === pose) return;
    // Converte o span atual para o outro lado preservando o px/cm implícito.
    setSpanPx(w => clampSpan(Math.round((w * spanMmFor(next)) / spanMmFor(pose))));
    setPose(next);
  };

  // O span ajustado é SEMPRE a dimensão horizontal do retângulo (é ela que se
  // compara com o cartão encostado); o outro lado segue a proporção ISO. Em pé,
  // a horizontal corresponde ao lado menor do cartão físico girado 90°.
  const rectW = spanPx;
  const rectH = pose === 'deitado' ? Math.round(spanPx * CARD_ASPECT) : Math.round(spanPx / CARD_ASPECT);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center gap-6 p-4 overflow-hidden">
      <div className="text-center text-white px-4">
        <p className="text-base md:text-xl font-semibold mb-1">Calibração de tela</p>
        <p className="text-slate-300 text-xs md:text-sm">
          Encoste o cartão {pose === 'deitado' ? 'deitado' : 'em pé (girado 90°)'} na tela e
          ajuste até a largura do retângulo coincidir com a do cartão.
        </p>
      </div>

      <div className="flex gap-2">
        {(['deitado', 'em-pe'] as const).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => switchPose(p)}
            className={`px-4 py-2 rounded-lg text-sm font-bold border ${
              pose === p
                ? 'bg-blue-500 border-blue-400 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-300'
            }`}
          >
            {p === 'deitado' ? 'Cartão deitado (85,6mm)' : 'Cartão em pé (54,0mm)'}
          </button>
        ))}
      </div>

      <div
        className="border-2 border-blue-400 rounded-lg bg-blue-400/10 shrink-0"
        style={{ width: `${rectW}px`, height: `${Math.min(rectH, viewport.h - 220)}px` }}
        aria-label="Retângulo de comparação com o cartão"
      />

      <div className="flex items-center gap-3 flex-wrap justify-center w-full max-w-xl px-2">
        <input
          type="range"
          min={SLIDER_MIN_PX}
          max={sliderMax}
          step={1}
          value={spanPx}
          onChange={e => setSpanPx(Number(e.target.value))}
          className="flex-1 min-w-40 accent-blue-500"
        />
        <button type="button" onClick={() => nudge(-1)} className="px-3 py-1 rounded-lg border border-slate-600 text-slate-200 font-bold">−1px</button>
        <button type="button" onClick={() => nudge(1)} className="px-3 py-1 rounded-lg border border-slate-600 text-slate-200 font-bold">+1px</button>
      </div>

      <div className="text-sm text-slate-300 text-center px-4">
        {previewPxPerCm != null
          ? `Medida atual: ${previewPxPerCm.toFixed(2)} px/cm (referência CSS: ${CSS_PX_PER_CM} px/cm)`
          : 'Fora da faixa plausível (20–80 px/cm) — ajuste até o retângulo casar com o cartão.'}
      </div>

      <div className="flex gap-3 flex-wrap justify-center">
        <button
          type="button"
          disabled={previewPxPerCm == null}
          onClick={() => onDone(saveScreenCalibration(spanPx, spanMmFor(pose)))}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold disabled:opacity-40"
        >
          Salvar medida
        </button>
        <button
          type="button"
          onClick={() => onDone(null)}
          className="px-6 py-3 bg-slate-800 border border-slate-600 text-slate-200 rounded-xl font-bold"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
