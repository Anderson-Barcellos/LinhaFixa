import { SaccadeMetrics } from '@/types';
import { summarizeSaccadeSignalQuality, type SaccadeSignalQuality } from '@/services/signalQuality';

export interface ReadingDynamicsSummary {
  signalLabel: string;
  positionLabel: string;
  primaryInsight: string;
  confidenceNote: string;
  signalQuality: SaccadeSignalQuality;
}

export function summarizeReadingDynamics(metrics: SaccadeMetrics, coverage: number | null): ReadingDynamicsSummary {
  const signalQuality = summarizeSaccadeSignalQuality(metrics, {
    coverage,
    calibrated: metrics.signalSource === 'calibrated-mediapipe',
  });

  if (!metrics.trackingAvailable || metrics.samplesValid < 5) {
    return {
      signalLabel: 'Sinal insuficiente',
      positionLabel: 'Sem leitura confiável',
      primaryInsight: 'Não houve amostras suficientes para estimar a dinâmica ocular nesta captura.',
      confidenceNote: 'Ajuste enquadramento, iluminação e distância para melhorar a continuidade do sinal.',
      signalQuality,
    };
  }

  const fixation = Math.round(metrics.meanFixationMs);
  const regressionRatio = metrics.saccadeCount > 0
    ? metrics.regressionCount / metrics.saccadeCount
    : 0;
  const signalLabel = signalQuality.grade === 'comparavel'
    ? 'Sinal temporal consistente'
    : signalQuality.grade === 'baixo-sinal'
      ? 'Sinal temporal fraco'
      : 'Sinal temporal parcial';
  const regressionTone = regressionRatio >= 0.35
    ? 'com regressões frequentes'
    : regressionRatio >= 0.15
      ? 'com algumas regressões'
      : 'com poucas regressões';

  return {
    signalLabel,
    positionLabel: 'Posição textual aproximada',
    primaryInsight: `${metrics.saccadeCount} sacadas, ${metrics.regressionCount} regressões e fixação média de ${fixation} ms, ${regressionTone}.`,
    confidenceNote: `${signalQuality.label}: ${signalQuality.detail} A leitura prioriza movimento relativo e ritmo temporal, não palavra exata.`,
    signalQuality,
  };
}
