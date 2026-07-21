import { BookOpen, Eye } from 'lucide-react';

import type { ReadingDynamicsSummary } from '@/exercises/readingDynamics';
import { CaptureValiditySummary } from '@/components/CaptureValiditySummary';
import { formatSampleRateHz } from '@/services/sampleRatePresentation';
import type {
  AssessedValidationCapture,
  CaptureEnvironment,
  SaccadeMetrics,
} from '@/types';

export function AssessmentResultPanel({
  capture,
  persistence,
  recallOutcome,
  recallPersistence,
  captureSummary,
  onRetrySave,
  onRetryRecallSave,
  onClose,
  onRestart,
}: {
  capture: AssessedValidationCapture;
  persistence: 'saving' | 'saved' | 'failed';
  recallOutcome: { score: number; total: number; topic: string } | null;
  recallPersistence: 'idle' | 'saving' | 'saved' | 'failed';
  captureSummary: ReadingDynamicsSummary | null;
  onRetrySave: () => void;
  onRetryRecallSave: () => void;
  onClose: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="bg-slate-800 rounded-3xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto border border-white/10">
      <div className="flex items-center gap-2 mb-1">
        <Eye className="w-5 h-5 text-indigo-400" />
        <h2 className="text-2xl font-bold">Dinamica ocular capturada</h2>
      </div>
      <p className="text-xs text-slate-400 mb-6">
        Estimativa experimental por webcam. Prioriza movimento relativo, ritmo e eventos
        de leitura; não promete palavra exata nem detecta microssacadas.
      </p>

      <CaptureValiditySummary capture={capture} />
      <div className="flex items-center justify-between gap-3 mb-4 text-xs">
        <span
          className={
            persistence === 'saved'
              ? 'text-emerald-300'
              : persistence === 'failed'
                ? 'text-rose-300'
                : 'text-slate-400'
          }
        >
          {persistence === 'saved'
            ? 'Captura salva'
            : persistence === 'failed'
              ? 'Registro não salvo'
              : 'Salvando captura…'}
        </span>
        {persistence === 'failed' ? (
          <button
            type="button"
            onClick={onRetrySave}
            className="px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 font-bold"
          >
            Tentar salvar novamente
          </button>
        ) : null}
      </div>

      {recallOutcome ? (
        <div className="mb-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/15 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-widest text-indigo-300">
                Recall · {recallOutcome.topic}
              </div>
              <div className="text-2xl font-bold text-white">
                {recallOutcome.score}/{recallOutcome.total} corretas
              </div>
            </div>
            <BookOpen className="h-8 w-8 shrink-0 text-indigo-300" />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <p className={recallPersistence === 'failed' ? 'text-rose-300' : 'text-slate-400'}>
              {recallPersistence === 'saved'
                ? 'Recall salvo'
                : recallPersistence === 'failed'
                  ? 'Recall não salvo — a captura ocular permanece preservada'
                  : 'Salvando recall…'}
            </p>
            {recallPersistence === 'failed' ? (
              <button
                type="button"
                onClick={onRetryRecallSave}
                className="rounded-lg bg-rose-500/15 px-3 py-1.5 font-bold text-rose-200 hover:bg-rose-500/25"
              >
                Tentar salvar recall novamente
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {capture.metrics.trackingAvailable && captureSummary ? (
        <>
          <div className="rounded-2xl bg-slate-900/70 border border-white/10 p-4 mb-4">
            <p className="text-xs text-slate-400 mb-2">{captureSummary.positionLabel}</p>
            <p className="text-sm text-slate-200 font-medium">
              {captureSummary.primaryInsight}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Cobertura (rosto)" value={`${capture.coverage.toFixed(0)}%`} big />
            <Metric label="Amostras válidas" value={String(capture.metrics.samplesValid)} big />
            <Metric label="Taxa efetiva" value={formatSampleRateHz(capture.metrics.sampleRateHz)} big />
            <Metric
              label="Fonte"
              value={sourceConsistencyLabel(
                capture.metrics.signalSource,
                capture.calibratedSampleCount,
                capture.rawSampleCount,
              )}
              big
            />
            {(capture.extrapolatedSampleCount ?? 0) > 0 ? (
              <Metric
                label="Extrapolação rejeitada"
                value={`${capture.extrapolatedSampleCount} frames`}
                big
              />
            ) : null}
            <Metric label="Sacadas" value={String(capture.metrics.saccadeCount)} big />
            <Metric label="Regressões" value={String(capture.metrics.regressionCount)} big />
            <Metric
              label="Retornos de linha"
              value={capture.metrics.lineReturnCount != null ? String(capture.metrics.lineReturnCount) : 'N/D'}
              big
            />
          </div>
          {capture.environment ? (
            <div className="rounded-2xl bg-slate-900/70 border border-white/10 p-4 mt-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                  Ambiente e câmera
                </h3>
                <span className="px-2.5 py-1 rounded-full bg-slate-700 text-slate-200 text-xs font-bold">
                  {capture.environment.layoutMode === 'desktop'
                    ? 'Layout desktop'
                    : 'Layout compacto'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Metric
                  label="Câmera negociada"
                  value={cameraNegotiatedLabel(capture.environment)}
                />
                <Metric
                  label="Vídeo recebido"
                  value={videoSizeLabel(capture.environment)}
                />
                <Metric
                  label="FPS câmera"
                  value={rateLabel(capture.environment.camera.frameRate)}
                />
                <Metric
                  label="FPS detecção"
                  value={rateLabel(capture.environment.rates.detectionFps)}
                />
                <Metric
                  label="Taxa ocular"
                  value={rateLabel(capture.environment.rates.ocularSampleRateHz)}
                />
                <Metric
                  label="Superfície"
                  value={surfaceSizeLabel(capture.environment)}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-amber-300 font-medium">
          Detecção insuficiente para estimar sacadas ({capture.metrics.samplesValid} amostras,
          cobertura {capture.coverage.toFixed(0)}%). Ajuste o enquadramento, a iluminação e a
          distância e tente novamente.
        </p>
      )}

      {capture.postural.status !== 'insufficient' ? (
        <div className="rounded-2xl bg-slate-900/70 border border-white/10 p-4 mt-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                capture.postural.status === 'stable'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              {capture.postural.label}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-700 text-slate-200 text-xs font-bold">
              Estabilidade cervical {capture.postural.cervicalStability}%
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-700 text-slate-200 text-xs font-bold">
              {capture.postural.baselineApplied ? 'Baseline aplicado' : 'Sem baseline'}
            </span>
            <span className="ml-auto text-xs text-slate-400">
              Confiança {posturalConfidenceLabel(capture.postural.confidence)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Metric
              label="Delta aparelho"
              value={capture.postural.motionDeltaDeg != null ? `${capture.postural.motionDeltaDeg.toFixed(1)}°` : 'N/D'}
            />
            <Metric
              label="Taxa postura"
              value={formatSampleRateHz(capture.postural.sampleRateHz)}
            />
            <Metric
              label="Yaw Δ"
              value={capture.postural.baselineApplied ? capture.postural.yawOffset.toFixed(1) : 'N/D'}
            />
            <Metric
              label="Pitch Δ"
              value={capture.postural.baselineApplied ? capture.postural.pitchOffset.toFixed(1) : 'N/D'}
            />
          </div>
          <p className="text-xs text-slate-400">{capture.postural.insight}</p>
        </div>
      ) : null}

      <div className="flex gap-3 mt-8">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold"
        >
          Fechar
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold"
        >
          Nova captura
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={`rounded-xl bg-white/5 p-3 ${big ? 'min-h-[84px]' : ''}`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`${big ? 'text-lg' : 'text-sm'} font-bold text-white mt-1`}>
        {value}
      </div>
    </div>
  );
}

function rateLabel(value: number | undefined): string {
  return formatSampleRateHz(value);
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return 'Alta';
  if (confidence >= 0.6) return 'Média';
  return 'Baixa';
}

function posturalConfidenceLabel(confidence: 'low' | 'medium' | 'high'): string {
  if (confidence === 'high') return 'Alta';
  if (confidence === 'medium') return 'Média';
  return 'Baixa';
}

function sourceConsistencyLabel(
  source: SaccadeMetrics['signalSource'],
  calibratedCount: number | undefined,
  rawCount: number | undefined,
): string {
  const base =
    source === 'calibrated-mediapipe'
      ? 'Calibrada'
      : source === 'raw-mediapipe'
        ? 'Bruta'
        : 'N/D';
  const total = (calibratedCount ?? 0) + (rawCount ?? 0);
  if (base === 'N/D' || total === 0) return base;
  const chosen =
    source === 'calibrated-mediapipe' ? (calibratedCount ?? 0) : (rawCount ?? 0);
  return `${base} (${Math.round((chosen / total) * 100)}%)`;
}

function cameraNegotiatedLabel(environment: CaptureEnvironment): string {
  const { width, height } = environment.camera;
  return width && height ? `${Math.round(width)}×${Math.round(height)}` : 'N/D';
}

function videoSizeLabel(environment: CaptureEnvironment): string {
  const { width, height } = environment.video;
  return width && height ? `${Math.round(width)}×${Math.round(height)}` : 'N/D';
}

function surfaceSizeLabel(environment: CaptureEnvironment): string {
  return `${Math.round(environment.surfaceRect.width)}×${Math.round(environment.surfaceRect.height)}`;
}
