import React from 'react';
import type { AssessedValidationCapture } from '@/types';
import { describeCaptureValidity } from '@/services/captureValidity';

export interface CaptureValiditySummaryProps {
  capture: AssessedValidationCapture;
}

export function CaptureValiditySummary({ capture }: CaptureValiditySummaryProps) {
  const validity = capture.validity;
  const presentation = describeCaptureValidity(validity);
  const toneClass = presentation.tone === 'emerald'
    ? 'bg-emerald-500/15 text-emerald-300'
    : presentation.tone === 'rose'
      ? 'bg-rose-500/15 text-rose-300'
      : 'bg-amber-500/15 text-amber-300';

  return (
    <section className="rounded-2xl bg-slate-900/70 border border-white/10 p-4 mb-4" aria-label="Validade da captura">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${toneClass}`}>
          {presentation.label}
        </span>
        <span className="text-sm font-medium text-slate-100">{presentation.primary}</span>
      </div>
      {presentation.reasons.length > 0 && (
        <ul className="space-y-1 mb-3 text-xs text-slate-300">
          {presentation.reasons.map(reason => <li key={reason}>• {reason}</li>)}
        </ul>
      )}
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <Fact label="Duração" value={validity.durationMs != null ? `${(validity.durationMs / 1000).toFixed(1)} s` : 'não medida'} />
        <Fact label="Cobertura" value={validity.coverage != null ? `${validity.coverage.toFixed(0)}%` : 'não medida'} />
        <Fact label="Taxa temporal" value={validity.sampleRateHz != null ? `${validity.sampleRateHz.toFixed(1)} Hz` : 'não medida'} />
        <Fact label="Tier" value={temporalTierLabel(validity.temporalTier)} />
        <Fact label="Fonte selecionada" value={sourceLabel(validity.signalSource)} />
        <Fact label="Consistência da fonte" value={validity.selectedSourceRatio != null ? `${(validity.selectedSourceRatio * 100).toFixed(0)}%` : 'não medida'} />
        <Fact label="Gaps > 200 ms" value={String(validity.gapCount)} />
        <Fact label="Amplitude média" value={capture.metrics.meanSaccadeAmplitude != null ? capture.metrics.meanSaccadeAmplitude.toFixed(3) : 'não estimável'} />
        <Fact label="Fixação média" value={capture.metrics.meanFixationMs != null ? `${capture.metrics.meanFixationMs.toFixed(0)} ms` : 'não estimável'} />
      </dl>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-bold text-slate-200 mt-0.5">{value}</dd>
    </div>
  );
}

function temporalTierLabel(tier: AssessedValidationCapture['validity']['temporalTier']): string {
  if (tier === 'high-temporal') return 'Alta resolução';
  if (tier === 'coarse-temporal') return 'Resolução grosseira';
  return 'Insuficiente';
}

function sourceLabel(source: AssessedValidationCapture['validity']['signalSource']): string {
  if (source === 'calibrated-mediapipe') return 'Calibrada';
  if (source === 'raw-mediapipe') return 'Bruta';
  return 'Indisponível';
}
