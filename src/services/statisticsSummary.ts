import { SessionResult, SymptomRating, ValidationCapture } from '@/types';
import { PosturalStabilityMetrics } from '@/exercises/posturalStability';
import { summarizeSaccadeSignalQuality, type SaccadeSignalQuality } from '@/services/signalQuality';
import {
  captureValidityOrLegacy,
  type CaptureValiditySnapshot,
} from '@/services/captureValidity';

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
  lineReturns: number | null; // null on legacy captures without the metric
  meanFixationMs: number | null;
  samplesValid: number;
  coverage: number | null;
  validity: CaptureValiditySnapshot;
  comparisonKey: string | null;
  orientation: 'portrait' | 'landscape' | null;
  saveProvenance: 'saved-session' | 'saved-capture';
}

export interface OcularComparableGroup {
  key: string;
  label: string;
  points: OcularReadingPoint[];
}

export interface OcularSeriesPartition {
  comparableGroups: OcularComparableGroup[];
  audit: OcularReadingPoint[];
}

export interface DiagnosticInsightRecord {
  id: string;
  date: string;
  orientation: OcularReadingPoint['orientation'];
  saccades: number;
  regressions: number;
  lineReturns: number | null;
  meanFixationMs: number | null;
  samplesValid: number;
  coverage: number | null;
  comparisonExclusionReason: 'missing-comparison-context' | null;
  validity: Pick<
    CaptureValiditySnapshot,
    'grade' | 'reasonCodes' | 'temporalTier' | 'signalSource' | 'selectedSourceRatio' | 'durationMs'
  >;
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
    // Mean feeling change (1-5 scale, after - before) over quick-context sessions;
    // null when the history only has legacy symptom sessions.
    wellbeingDelta: number | null;
    latestTimestamp: number | null;
    ocularValidity: {
      comparable: number;
      exploratory: number;
      invalid: number;
    };
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
  const wellbeingDelta = averageWellbeingDelta(sessions);
  const legacySymptomDelta = averageSymptomDelta(sessions);
  const latestTimestamp = Math.max(
    0,
    ...sessions.map(s => s.timestamp),
    ...captures.map(c => c.timestamp)
  ) || null;
  const ocularPartition = partitionOcularReadingSeries(buildOcularReadingSeries(sessions, captures));
  const comparableOcularPoints = ocularPartition.comparableGroups.flatMap(group => group.points);
  const auditGrades = ocularPartition.audit.map(point => point.validity.grade);

  return {
    overview: {
      sessionCount: sessions.length,
      captureCount: captures.length,
      exerciseCount,
      totalMinutes,
      averageStillness,
      wellbeingDelta,
      latestTimestamp,
      ocularValidity: {
        comparable: comparableOcularPoints.length,
        exploratory: auditGrades.filter(grade => grade === 'exploratory').length,
        invalid: auditGrades.filter(grade => grade === 'invalid').length,
      },
    },
    sections: {
      training: trainingSummary(sortedSessions, exerciseCount, totalMinutes),
      symptoms: wellbeingSummary(sortedSessions, wellbeingDelta, legacySymptomDelta),
      reading: readingSummary(sessions, comparableOcularPoints, ocularPartition.audit),
      diagnostics: diagnosticsSummary(sortedCaptures, comparableOcularPoints, ocularPartition.audit),
      posture: postureSummary(posturalSamples, averageStillness),
    },
  };
}

export function buildOcularReadingSeries(
  sessions: SessionResult[],
  captures: ValidationCapture[]
): OcularReadingPoint[] {
  const readingPoints: Array<OcularReadingPoint | null> = sessions.flatMap(session =>
    session.exercises
      .filter(exercise => exercise.exerciseId === 'assistedReading')
      .map((exercise, index) => {
        const metrics = exercise.extraData?.saccadeMetrics;
        if (!metrics) return null;
        const validity = captureValidityOrLegacy(exercise.extraData?.validity);
        const orientation = normalizeOrientation(exercise.extraData?.orientation);
        const signalQuality = summarizeSaccadeSignalQuality(metrics, {
          coverage: exercise.extraData?.signalCoverage ?? null,
          calibrated: metrics.signalSource === 'calibrated-mediapipe',
          validity: exercise.extraData?.validity,
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
          lineReturns: metrics.lineReturnCount ?? null,
          meanFixationMs: metrics.meanFixationMs !== null ? Math.round(metrics.meanFixationMs) : null,
          samplesValid: metrics.samplesValid,
          coverage: null,
          validity,
          comparisonKey: comparisonKey(validity, orientation),
          orientation,
          saveProvenance: 'saved-session' as const,
        };
      })
  );

  const capturePoints: OcularReadingPoint[] = captures.map(capture => {
    const validity = captureValidityOrLegacy(capture.validity);
    const orientation = normalizeOrientation(
      capture.orientation ?? capture.environment?.viewport.orientation,
    );
    const signalQuality = summarizeSaccadeSignalQuality(capture.metrics, {
      coverage: capture.coverage,
      calibrated: capture.calibrated,
      validity: capture.validity,
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
      lineReturns: capture.metrics.lineReturnCount ?? null,
      meanFixationMs: capture.metrics.meanFixationMs !== null
        ? Math.round(capture.metrics.meanFixationMs)
        : null,
      samplesValid: capture.metrics.samplesValid,
      coverage: Math.round(capture.coverage),
      validity,
      comparisonKey: comparisonKey(validity, orientation),
      orientation,
      saveProvenance: 'saved-capture' as const,
    };
  });

  return [...readingPoints, ...capturePoints]
    .filter((point): point is OcularReadingPoint => point !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function partitionOcularReadingSeries(points: OcularReadingPoint[]): OcularSeriesPartition {
  const groups = new Map<string, OcularComparableGroup>();
  const audit: OcularReadingPoint[] = [];

  for (const point of points) {
    if (point.validity.grade !== 'comparable' || point.comparisonKey === null) {
      audit.push(point);
      continue;
    }
    const existing = groups.get(point.comparisonKey);
    if (existing) {
      existing.points.push(point);
    } else {
      groups.set(point.comparisonKey, {
        key: point.comparisonKey,
        label: comparisonLabel(point),
        points: [point],
      });
    }
  }

  return {
    comparableGroups: [...groups.values()].map(group => ({
      ...group,
      points: [...group.points].sort((a, b) => a.timestamp - b.timestamp),
    })),
    audit: [...audit].sort((a, b) => a.timestamp - b.timestamp),
  };
}

export function resolveSelectedOcularGroupKey(
  groups: OcularComparableGroup[],
  currentKey: string | null,
): string | null {
  if (currentKey && groups.some(group => group.key === currentKey)) return currentKey;

  let newestKey: string | null = null;
  let newestTimestamp = Number.NEGATIVE_INFINITY;
  for (const group of groups) {
    for (const point of group.points) {
      if (point.timestamp > newestTimestamp) {
        newestTimestamp = point.timestamp;
        newestKey = group.key;
      }
    }
  }
  return newestKey;
}

export function buildDiagnosticInsightPayload(partition: OcularSeriesPartition): {
  comparableDiagnosticCaptures: DiagnosticInsightRecord[];
  auditDiagnosticCaptures: DiagnosticInsightRecord[];
} {
  const comparable = partition.comparableGroups
    .flatMap(group => group.points)
    .filter(point => point.sourceKind === 'capture')
    .map(diagnosticInsightRecord);
  const audit = partition.audit
    .filter(point => point.sourceKind === 'capture')
    .map(diagnosticInsightRecord);
  return {
    comparableDiagnosticCaptures: comparable,
    auditDiagnosticCaptures: audit,
  };
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

function wellbeingSummary(
  sessions: SessionResult[],
  wellbeingDelta: number | null,
  legacySymptomDelta: number | null
): StatisticSectionSummary {
  if (wellbeingDelta !== null) {
    const absDelta = Math.abs(wellbeingDelta);
    const value = `${wellbeingDelta > 0 ? '+' : wellbeingDelta < 0 ? '-' : ''}${formatNumber(absDelta, 1)}`;
    const direction = wellbeingDelta > 0
      ? `melhora media de ${formatNumber(absDelta, 1)} ${plural(absDelta, 'ponto', 'pontos')} na sensacao entre inicio e fim`
      : wellbeingDelta < 0
        ? `queda media de ${formatNumber(absDelta, 1)} ${plural(absDelta, 'ponto', 'pontos')} na sensacao depois dos testes`
        : 'sensacao estavel entre antes e depois';
    return section(
      'Bem-estar',
      value,
      'sensacao (1-5)',
      `Contexto rapido mostra ${direction}. Use como tendencia de conforto, nao como conclusao clinica isolada.`,
      wellbeingDelta > 0 ? 'emerald' : wellbeingDelta < 0 ? 'amber' : 'slate'
    );
  }

  // Legacy fallback: histories saved before the quick context (0-10 symptom scale).
  if (sessions.length === 0 || legacySymptomDelta === null) {
    return section('Bem-estar', 'N/D', 'sem comparativo', 'Ainda nao ha antes/depois suficiente para resumir variacao de bem-estar.', 'slate');
  }
  const absDelta = Math.abs(legacySymptomDelta);
  const value = `${legacySymptomDelta > 0 ? '-' : legacySymptomDelta < 0 ? '+' : ''}${formatNumber(absDelta, 1)}`;
  const direction = legacySymptomDelta > 0
    ? `queda media de ${formatNumber(absDelta, 1)} ${plural(absDelta, 'ponto', 'pontos')} entre inicio e fim das sessoes`
    : legacySymptomDelta < 0
      ? `aumento medio de ${formatNumber(absDelta, 1)} ${plural(absDelta, 'ponto', 'pontos')} depois dos treinos`
      : 'sem mudanca media entre antes e depois';
  return section(
    'Bem-estar',
    value,
    'pontos (escala antiga)',
    `Sintomas (escala antiga) mostram ${direction}. Use como tendencia de conforto, nao como conclusao clinica isolada.`,
    legacySymptomDelta > 0 ? 'emerald' : legacySymptomDelta < 0 ? 'amber' : 'slate'
  );
}

function readingSummary(
  sessions: SessionResult[],
  comparablePoints: OcularReadingPoint[],
  auditPoints: OcularReadingPoint[],
): StatisticSectionSummary {
  const readingExercises = sessions
    .flatMap(s => s.exercises)
    .filter(e => e.exerciseId === 'assistedReading');
  const intervals = readingExercises.flatMap(e =>
    Array.isArray(e.extraData?.intervals) ? e.extraData.intervals as number[] : []
  );

  if (readingExercises.length === 0 && comparablePoints.length === 0 && auditPoints.length === 0) {
    return section('Leitura', 'N/D', 'sem dados', 'Historico ainda sem exercicios de leitura ou capturas diagnosticas para resumir ritmo ocular.', 'slate');
  }

  const avgInterval = average(intervals);
  const totalSaccades = sum(comparablePoints.map(point => point.saccades));
  const totalRegressions = sum(comparablePoints.map(point => point.regressions));
  const lineReturnValues = comparablePoints
    .map(point => point.lineReturns)
    .filter((v): v is number => typeof v === 'number');
  const totalLineReturns = lineReturnValues.length ? sum(lineReturnValues) : null;
  const fixationValues = comparablePoints
    .map(point => point.meanFixationMs)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const avgFixation = average(fixationValues);
  const ocularPieces = [
    `${totalSaccades} sacadas e ${totalRegressions} regressoes pelo olhar`,
    totalLineReturns !== null ? `${totalLineReturns} ${plural(totalLineReturns, 'retorno de linha', 'retornos de linha')}` : null,
    avgFixation !== null
      ? `fixacao media de ${formatInteger(avgFixation)} ms`
      : 'fixação média não estimável',
  ].filter(Boolean);

  if (comparablePoints.length) {
    const touchNote = avgInterval !== null
      ? ` Toque medio de ${formatInteger(avgInterval)} ms aparece apenas como ritmo de avanco manual, nao como medida ocular.`
      : '';
    const comparable = comparablePoints.length;
    const qualityNote = ` ${comparable} ${plural(comparable, 'ponto comparavel', 'pontos comparaveis')} por sinal calibrado; ${auditPoints.length} ${plural(auditPoints.length, 'registro permanece', 'registros permanecem')} para auditoria.`;
    return section(
      'Leitura',
      String(totalSaccades),
      'sacadas pelo olhar',
      `Resumo ocular da leitura: ${ocularPieces.join(', ')}.${qualityNote}${touchNote}`,
      'indigo'
    );
  }

  const auditNote = auditPoints.length > 0
    ? ` ${auditPoints.length} ${plural(auditPoints.length, 'registro ocular foi mantido', 'registros oculares foram mantidos')} para auditoria, sem entrar na tendência.`
    : '';
  return section(
    'Leitura',
    avgInterval !== null ? `${formatInteger(avgInterval)} ms` : 'N/D',
    avgInterval !== null ? 'avanco manual' : 'sem sinal ocular',
    avgInterval !== null
      ? `Ha leitura salva, mas sem sinal ocular suficiente; o toque medio de ${formatInteger(avgInterval)} ms e apenas acompanhamento manual.`
      : `Não há captura comparável para resumir sacadas e fixações.${auditNote}`,
    'amber'
  );
}

function diagnosticsSummary(
  captures: ValidationCapture[],
  comparablePoints: OcularReadingPoint[],
  auditPoints: OcularReadingPoint[],
): StatisticSectionSummary {
  if (captures.length === 0) {
    return section('Capturas', '0', 'diagnosticas', 'Area ainda sem capturas diagnosticas salvas; cobertura, eixo H/V e sacadas entram aqui apos a primeira captura.', 'slate');
  }
  const captureComparable = comparablePoints.filter(point => point.sourceKind === 'capture');
  const captureAudit = auditPoints.filter(point => point.sourceKind === 'capture');
  if (captureComparable.length === 0) {
    return section(
      'Capturas',
      'N/D',
      'sem tendência comparável',
      `${captures.length} ${plural(captures.length, 'captura diagnóstica salva', 'capturas diagnósticas salvas')}; ${captureAudit.length} para auditoria e nenhuma apta a comparação temporal.`,
      captureAudit.some(point => point.validity.grade === 'invalid') ? 'rose' : 'amber',
    );
  }
  const comparableIds = new Set(captureComparable.map(point => point.id));
  const comparableCaptures = captures.filter(capture => comparableIds.has(capture.id));
  const latest = [...comparableCaptures].sort((a, b) => b.timestamp - a.timestamp)[0];
  const avgCoverage = average(captureComparable.map(point => point.coverage).filter((value): value is number => value !== null)) ?? 0;
  const hRange = latest.axis.hRange;
  const vRange = latest.axis.vRange;
  const axisTone = hRange >= vRange * 1.4
    ? 'eixo horizontal predominou sobre o vertical'
    : 'eixos horizontal e vertical ficaram parecidos';
  return section(
    'Capturas',
    `${formatInteger(avgCoverage)}%`,
    'cobertura media',
    `${captureComparable.length} ${plural(captureComparable.length, 'comparável', 'comparáveis')} e ${captureAudit.length} para auditoria; última comparável com ${formatInteger(latest.coverage)}% de cobertura, ${latest.metrics.saccadeCount} sacadas, ${latest.metrics.regressionCount} regressões${latest.metrics.lineReturnCount != null ? `, ${latest.metrics.lineReturnCount} retornos de linha` : ''} e ${axisTone}.`,
    avgCoverage >= 80 ? 'emerald' : 'amber'
  );
}

function comparisonKey(
  validity: CaptureValiditySnapshot,
  orientation: OcularReadingPoint['orientation'],
): string | null {
  if (
    orientation === null
    || validity.signalSource === null
    || validity.temporalTier === 'insufficient-temporal'
  ) return null;
  return `${orientation}|${validity.temporalTier}|${validity.signalSource}`;
}

function normalizeOrientation(value: unknown): OcularReadingPoint['orientation'] {
  return value === 'portrait' || value === 'landscape' ? value : null;
}

function comparisonLabel(point: OcularReadingPoint): string {
  const orientation = point.orientation === 'portrait' ? 'Retrato' : 'Paisagem';
  const tier = point.validity.temporalTier === 'high-temporal'
    ? '≥45 Hz'
    : point.validity.temporalTier === 'coarse-temporal'
      ? '24–44 Hz'
      : '<24 Hz';
  const source = point.validity.signalSource === 'calibrated-mediapipe'
    ? 'Calibrado'
    : point.validity.signalSource === 'raw-mediapipe'
      ? 'Bruto'
      : 'Sem fonte';
  return `${orientation} · ${tier} · ${source}`;
}

function diagnosticInsightRecord(point: OcularReadingPoint): DiagnosticInsightRecord {
  return {
    id: point.id,
    date: new Date(point.timestamp).toISOString(),
    orientation: point.orientation,
    saccades: point.saccades,
    regressions: point.regressions,
    lineReturns: point.lineReturns,
    meanFixationMs: point.meanFixationMs,
    samplesValid: point.samplesValid,
    coverage: point.coverage,
    comparisonExclusionReason: point.validity.grade === 'comparable' && point.comparisonKey === null
      ? 'missing-comparison-context'
      : null,
    validity: {
      grade: point.validity.grade,
      reasonCodes: [...point.validity.reasonCodes],
      temporalTier: point.validity.temporalTier,
      signalSource: point.validity.signalSource,
      selectedSourceRatio: point.validity.selectedSourceRatio,
      durationMs: point.validity.durationMs,
    },
  };
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

function averageWellbeingDelta(sessions: SessionResult[]): number | null {
  const deltas = sessions
    .filter(s => s.contextBefore && s.contextAfter)
    .map(s => s.contextAfter!.feeling - s.contextBefore!.feeling);
  return average(deltas);
}

function averageSymptomDelta(sessions: SessionResult[]): number | null {
  const deltas = sessions
    .filter(s => s.symptomsBefore && s.symptomsAfter)
    .map(s => maxSymptom(s.symptomsBefore!) - maxSymptom(s.symptomsAfter!));
  return average(deltas);
}

function maxSymptom(symptoms: SymptomRating): number {
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
