import { SaccadeMetrics } from '@/types';

export interface ReadingDynamicsSummary {
  signalLabel: string;
  positionLabel: string;
  primaryInsight: string;
  confidenceNote: string;
}

export function summarizeReadingDynamics(metrics: SaccadeMetrics, coverage: number): ReadingDynamicsSummary {
  if (!metrics.trackingAvailable || metrics.samplesValid < 5) {
    return {
      signalLabel: 'Sinal insuficiente',
      positionLabel: 'Sem leitura confiável',
      primaryInsight: 'Não houve amostras suficientes para estimar a dinâmica ocular nesta captura.',
      confidenceNote: 'Ajuste enquadramento, iluminação e distância para melhorar a continuidade do sinal.',
    };
  }

  const fixation = Math.round(metrics.meanFixationMs);
  const coverageLabel = `${Math.round(coverage)}%`;
  const regressionRatio = metrics.saccadeCount > 0
    ? metrics.regressionCount / metrics.saccadeCount
    : 0;
  const signalLabel = coverage >= 80 && metrics.samplesValid >= 300
    ? 'Sinal temporal consistente'
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
    confidenceNote: `Cobertura facial de ${coverageLabel}. A leitura prioriza movimento relativo e ritmo temporal, não palavra exata.`,
  };
}
