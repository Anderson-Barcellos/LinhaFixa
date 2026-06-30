import { ExerciseResult, SessionResult, ValidationCapture } from '@/types';
import { PosturalStabilityMetrics } from '@/exercises/posturalStability';
import { summarizeSaccadeSignalQuality, type SaccadeSignalQuality } from '@/services/signalQuality';

export interface OcularReadingPoint {
  id: string;
  timestamp: number;
  label: string;
  sourceKind: 'reading-session' | 'capture';
  sourceLabel: string;
  signalSourceLabel: string;
  signalQuality: SaccadeSignalQuality;
  sampleRateHz: number | null;
  saccades: number;
  regressions: number;
  meanFixationMs: number;
  samplesValid: number;
  coverage: number | null;
}

export interface StatisticSectionSummary {
  label: string;
  value: string;
  detail: string;
  insight: string;
  tone: 'slate' | 'emerald' | 'amber' | 'indigo' | 'rose';
}

export interface StatisticsSummary {
  overview: {
    sessionCount: number;
    captureCount: number;
    exerciseCount: number;
    totalMinutes: number;
    averageStillness: number | null;
    symptomDelta: number | null;
    latestTimestamp: number | null;
  };
  sections: {
    training: StatisticSectionSummary;
    symptoms: StatisticSectionSummary;
    reading: StatisticSectionSummary;
    diagnostics: StatisticSectionSummary;
    posture: StatisticSectionSummary;
  };
}

export function buildStatisticsSummary(
  sessions: SessionResult[],
  captures: ValidationCapture[]
): StatisticsSummary {
  const sortedSessions = [...sessions].sort((a, b) => b.timestamp - a.timestamp);
  const sortedCaptures = [...captures].sort((a, b) => b.timestamp - a.timestamp);
  const exerciseCount = sessions.reduce((sum, s) => sum + s.exercises.length, 0);
  const totalMinutes = Math.round(sessions.reduce((sum, s) => sum + s.durationSec, 0) / 60);
  const stillnessScores = sessions
    .flatMap(s => s.exercises.map(e => e.headStillnessScore))
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const posturalSamples = [
    ...sessions.flatMap(s => s.exercises.map(e => e.extraData?.posturalStability as PosturalStabilityMetrics | undefined)),
    ...captures.map(c => c.postural),
  ].filter((p): p is PosturalStabilityMetrics => !!p && p.status !== 'insufficient');
  const averageStillness = average(stillnessScores);
  const symptomDelta = averageSymptomDelta(sessions);
  const latestTimestamp = Math.max(
    0,
    ...sessions.map(s => s.timestamp),
    ...captures.map(c => c.timestamp)
  ) || null;

  return {
    overview: {
      sessionCount: sessions.length,
      captureCount: captures.length,
      exerciseCount,
      totalMinutes,
      averageStillness,
      symptomDelta,
      latestTimestamp,
    },
    sections: {
      training: trainingSummary(sortedSessions, exerciseCount, totalMinutes),
      symptoms: symptomsSummary(sortedSessions, symptomDelta),
      reading: readingSummary(sessions, captures),
      diagnostics: diagnosticsSummary(sortedCaptures),
      posture: postureSummary(posturalSamples, averageStillness),
    },
  };
}

export function buildOcularReadingSeries(
  sessions: SessionResult[],
  captures: ValidationCapture[]
): OcularReadingPoint[] {
  const readingPoints = sessions.flatMap(session =>
    session.exercises
      .filter(exercise => exercise.exerciseId === 'assistedReading')
      .map((exercise, index) => {
        const metrics = exercise.extraData?.saccadeMetrics;
        if (!metrics?.trackingAvailable) return null;
        const signalQuality = summarizeSaccadeSignalQuality(metrics, {
          coverage: exercise.extraData?.signalCoverage ?? null,
          calibrated: metrics.signalSource === 'calibrated-mediapipe',
        });
        return {
          id: `${session.id}-reading-${index}`,
          timestamp: exercise.timestamp || session.timestamp,
          label: shortDate(exercise.timestamp || session.timestamp),
          sourceKind: 'reading-session' as const,
          sourceLabel: metrics.signalSource === 'calibrated-mediapipe' ? 'Leitura calibrada' : 'Leitura exploratória',
          signalSourceLabel: signalQuality.sourceLabel,
          signalQuality,
          sampleRateHz: metrics.sampleRateHz ?? null,
          saccades: metrics.saccadeCount,
          regressions: metrics.regressionCount,
          meanFixationMs: Math.round(metrics.meanFixationMs),
          samplesValid: metrics.samplesValid,
          coverage: null,
        };
      })
  );

  const capturePoints = captures.map(capture => {
    if (!capture.metrics.trackingAvailable) return null;
    const signalQuality = summarizeSaccadeSignalQuality(capture.metrics, {
      coverage: capture.coverage,
      calibrated: capture.calibrated,
    });
    return {
      id: capture.id,
      timestamp: capture.timestamp,
      label: shortDate(capture.timestamp),
      sourceKind: 'capture' as const,
      sourceLabel: capture.calibrated ? 'Captura calibrada' : 'Captura bruta',
      signalSourceLabel: signalQuality.sourceLabel,
      signalQuality,
      sampleRateHz: capture.metrics.sampleRateHz ?? null,
      saccades: capture.metrics.saccadeCount,
      regressions: capture.metrics.regressionCount,
      meanFixationMs: Math.round(capture.metrics.meanFixationMs),
      samplesValid: capture.metrics.samplesValid,
      coverage: Math.round(capture.coverage),
    };
  });

  return [...readingPoints, ...capturePoints]
    .filter((point): point is OcularReadingPoint => point !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function trainingSummary(
  sessions: SessionResult[],
  exerciseCount: number,
  totalMinutes: number
): StatisticSectionSummary {
  if (sessions.length === 0) {
    return section('Treino', '0', 'sessoes', 'Nenhuma sessao registrada ainda; os resumos aparecem aqui depois do primeiro treino salvo.', 'slate');
  }
  const latest = sessions[0];
  return section(
    'Treino',
    String(sessions.length),
    sessions.length === 1 ? 'sessao' : 'sessoes',
    `${sessions.length} ${plural(sessions.length, 'sessao', 'sessoes')} salvas, ${exerciseCount} ${plural(exerciseCount, 'exercicio', 'exercicios')} e ${totalMinutes} min acumulados. Ultima sessao: ${Math.round(latest.durationSec / 60)} min.`,
    sessions.length >= 3 ? 'emerald' : 'indigo'
  );
}

function symptomsSummary(
  sessions: SessionResult[],
  symptomDelta: number | null
): StatisticSectionSummary {
  if (sessions.length === 0 || symptomDelta === null) {
    return section('Sintomas', 'N/D', 'sem comparativo', 'Ainda nao ha antes/depois suficiente para resumir variacao de sintomas.', 'slate');
  }
  const absDelta = Math.abs(symptomDelta);
  const value = `${symptomDelta > 0 ? '-' : symptomDelta < 0 ? '+' : ''}${formatNumber(absDelta, 1)}`;
  const direction = symptomDelta > 0
    ? `queda media de ${formatNumber(absDelta, 1)} ${plural(absDelta, 'ponto', 'pontos')} entre inicio e fim das sessoes`
    : symptomDelta < 0
      ? `aumento medio de ${formatNumber(absDelta, 1)} ${plural(absDelta, 'ponto', 'pontos')} depois dos treinos`
      : 'sem mudanca media entre antes e depois';
  return section(
    'Sintomas',
    value,
    'pontos',
    `Sintomas mostram ${direction}. Use como tendencia de conforto, nao como conclusao clinica isolada.`,
    symptomDelta > 0 ? 'emerald' : symptomDelta < 0 ? 'amber' : 'slate'
  );
}

function readingSummary(
  sessions: SessionResult[],
  captures: ValidationCapture[]
): StatisticSectionSummary {
  const readingExercises = sessions
    .flatMap(s => s.exercises)
    .filter(e => e.exerciseId === 'assistedReading');
  const intervals = readingExercises.flatMap(e =>
    Array.isArray(e.extraData?.intervals) ? e.extraData.intervals as number[] : []
  );
  const readingMetrics = [
    ...readingExercises.map(e => e.extraData?.saccadeMetrics),
    ...captures.map(c => c.metrics),
  ].filter(m => m?.trackingAvailable);
  const qualityCounts = [
    ...readingExercises.map(e => e.extraData?.saccadeMetrics
      ? summarizeSaccadeSignalQuality(e.extraData.saccadeMetrics, {
        coverage: e.extraData?.signalCoverage ?? null,
        calibrated: e.extraData.saccadeMetrics.signalSource === 'calibrated-mediapipe',
      }).grade
      : null),
    ...captures.map(c => summarizeSaccadeSignalQuality(c.metrics, {
      coverage: c.coverage,
      calibrated: c.calibrated,
    }).grade),
  ].filter(Boolean);

  if (readingExercises.length === 0 && captures.length === 0) {
    return section('Leitura', 'N/D', 'sem dados', 'Historico ainda sem exercicios de leitura ou capturas diagnosticas para resumir ritmo ocular.', 'slate');
  }

  const avgInterval = average(intervals);
  const totalSaccades = sum(readingMetrics.map(m => m.saccadeCount));
  const totalRegressions = sum(readingMetrics.map(m => m.regressionCount));
  const avgFixation = average(readingMetrics.map(m => m.meanFixationMs));
  const ocularPieces = [
    `${totalSaccades} sacadas e ${totalRegressions} regressoes pelo olhar`,
    avgFixation !== null ? `fixacao media de ${formatInteger(avgFixation)} ms` : null,
  ].filter(Boolean);

  if (readingMetrics.length) {
    const touchNote = avgInterval !== null
      ? ` Toque medio de ${formatInteger(avgInterval)} ms aparece apenas como ritmo de avanco manual, nao como medida ocular.`
      : '';
    const comparable = qualityCounts.filter(q => q === 'comparavel').length;
    const qualityNote = comparable > 0
      ? ` ${comparable} ${plural(comparable, 'ponto comparavel', 'pontos comparaveis')} por sinal calibrado.`
      : ' Dados oculares atuais ficam como exploratorios ate haver sinal calibrado suficiente.';
    return section(
      'Leitura',
      String(totalSaccades),
      'sacadas pelo olhar',
      `Resumo ocular da leitura: ${ocularPieces.join(', ')}.${qualityNote}${touchNote}`,
      'indigo'
    );
  }

  return section(
    'Leitura',
    avgInterval !== null ? `${formatInteger(avgInterval)} ms` : 'N/D',
    avgInterval !== null ? 'avanco manual' : 'sem sinal ocular',
    avgInterval !== null
      ? `Ha leitura salva, mas sem sinal ocular suficiente; o toque medio de ${formatInteger(avgInterval)} ms e apenas acompanhamento manual.`
      : 'Ha leitura salva, mas sem sinal ocular suficiente para resumir sacadas e fixacoes.',
    'amber'
  );
}

function diagnosticsSummary(captures: ValidationCapture[]): StatisticSectionSummary {
  if (captures.length === 0) {
    return section('Capturas', '0', 'diagnosticas', 'Area ainda sem capturas diagnosticas salvas; cobertura, eixo H/V e sacadas entram aqui apos a primeira captura.', 'slate');
  }
  const latest = captures[0];
  const avgCoverage = average(captures.map(c => c.coverage)) ?? 0;
  const hRange = latest.axis.hRange;
  const vRange = latest.axis.vRange;
  const axisTone = hRange >= vRange * 1.4
    ? 'eixo horizontal predominou sobre o vertical'
    : 'eixos horizontal e vertical ficaram parecidos';
  return section(
    'Capturas',
    `${formatInteger(avgCoverage)}%`,
    'cobertura media',
    `${captures.length} ${plural(captures.length, 'captura diagnostica', 'capturas diagnosticas')}; ultima com ${formatInteger(latest.coverage)}% de cobertura, ${latest.metrics.saccadeCount} sacadas, ${latest.metrics.regressionCount} regressoes e ${axisTone}.`,
    avgCoverage >= 80 ? 'emerald' : 'amber'
  );
}

function postureSummary(
  posturalSamples: PosturalStabilityMetrics[],
  averageStillness: number | null
): StatisticSectionSummary {
  if (posturalSamples.length === 0 && averageStillness === null) {
    return section('Postura', 'N/D', 'sem amostras', 'Ainda sem amostras posturais suficientes para resumir estabilidade cervical.', 'slate');
  }
  const cervical = average(posturalSamples.map(p => p.cervicalStability)) ?? averageStillness ?? 0;
  const unstable = posturalSamples.filter(p => p.status !== 'stable').length;
  const tilt = average(posturalSamples.map(p => p.sustainedTiltDeg));
  const detail = unstable > 0
    ? `${unstable} ${plural(unstable, 'registro instavel', 'registros instaveis')}`
    : 'sem instabilidade marcada';
  return section(
    'Postura',
    `${formatInteger(cervical)}%`,
    'estabilidade media',
    `Postura resumida em ${formatInteger(cervical)}% de estabilidade cervical, ${detail}${tilt !== null ? ` e inclinacao sustentada media de ${formatNumber(tilt, 1)}°` : ''}.`,
    cervical >= 80 && unstable === 0 ? 'emerald' : 'amber'
  );
}

function section(
  label: string,
  value: string,
  detail: string,
  insight: string,
  tone: StatisticSectionSummary['tone']
): StatisticSectionSummary {
  return { label, value, detail, insight, tone };
}

function average(values: number[]): number | null {
  const valid = values.filter(v => Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function averageSymptomDelta(sessions: SessionResult[]): number | null {
  const deltas = sessions.map(s => maxSymptom(s.symptomsBefore) - maxSymptom(s.symptomsAfter));
  return average(deltas);
}

function maxSymptom(symptoms: SessionResult['symptomsBefore']): number {
  return Math.max(...(Object.values(symptoms) as number[]));
}

function plural(count: number, singular: string, pluralText: string): string {
  return Math.abs(count) === 1 ? singular : pluralText;
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('pt-BR');
}

function formatNumber(value: number, digits: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function shortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}
