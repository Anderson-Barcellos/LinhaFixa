import type {
  DeviceClass,
  DeviceClassSource,
  RecallTestResult,
  SessionResult,
  ValidationCapture,
} from '@/types';
import { inferLegacyDeviceClass } from './deviceClass';
import {
  buildOcularReadingSeries,
  partitionOcularReadingSeries,
  type OcularReadingPoint,
} from './statisticsSummary';

export type NotebookBucket = 'comparable' | 'baseline' | 'audit' | 'activity';
export type NotebookRecordKind = 'capture' | 'recall' | 'training';

export interface NotebookRecord {
  id: string;
  sourceId: string;
  kind: NotebookRecordKind;
  bucket: NotebookBucket;
  timestamp: number;
  title: string;
  statusLabel: string;
  deviceClass: DeviceClass | null;
  deviceClassSource: DeviceClassSource | null;
  deviceLabel: string;
  sampleRateLabel: string | null;
  detail: string;
  recall: { scoreLabel: string; topic: string } | null;
}

export interface ExperimentNotebookProjection {
  series: {
    title: 'Leitura — série atual';
    comparisonKey: string | null;
    comparisonLabel: string | null;
  };
  all: NotebookRecord[];
  recent: NotebookRecord[];
  comparable: NotebookRecord[];
  baselines: NotebookRecord[];
  audit: NotebookRecord[];
  activities: NotebookRecord[];
  counts: {
    total: number;
    comparable: number;
    baselines: number;
    audit: number;
    activities: number;
  };
}

export function buildExperimentNotebookProjection(input: {
  sessions: SessionResult[];
  captures: ValidationCapture[];
  recalls: RecallTestResult[];
}): ExperimentNotebookProjection {
  const points = buildOcularReadingSeries([], input.captures);
  const partition = partitionOcularReadingSeries(points);
  const comparableIds = new Set(
    partition.comparableGroups.flatMap(group => group.points.map(point => point.id)),
  );
  const pointById = new Map(points.map(point => [point.id, point]));
  const recallByCapture = new Map(
    input.recalls
      .filter(recall => recall.captureId)
      .map(recall => [recall.captureId!, recall]),
  );

  const captureRecords = input.captures.map(capture => {
    const point = pointById.get(capture.id)!;
    const linkedRecall = recallByCapture.get(capture.id) ?? null;
    const bucket: NotebookBucket = comparableIds.has(capture.id)
      ? 'comparable'
      : point.validity.grade === 'exploratory'
        ? 'baseline'
        : 'audit';
    return captureRecord(capture, point, linkedRecall, bucket);
  });

  const linkedRecallIds = new Set(recallByCapture.values());
  const recallActivities = input.recalls
    .filter(recall => !linkedRecallIds.has(recall))
    .map(recallActivityRecord);
  const trainingActivities = input.sessions.map(trainingActivityRecord);
  const activities = [...recallActivities, ...trainingActivities];
  const all = [...captureRecords, ...activities].sort((a, b) => b.timestamp - a.timestamp);
  const recent = all.slice(0, 8);
  const newestGroup = [...partition.comparableGroups]
    .sort((a, b) => (
      (b.points.at(-1)?.timestamp ?? 0) - (a.points.at(-1)?.timestamp ?? 0)
    ))[0] ?? null;

  const comparable = captureRecords.filter(record => record.bucket === 'comparable');
  const baselines = captureRecords.filter(record => record.bucket === 'baseline');
  const audit = captureRecords.filter(record => record.bucket === 'audit');

  return {
    series: {
      title: 'Leitura — série atual',
      comparisonKey: newestGroup?.key ?? null,
      comparisonLabel: newestGroup?.label ?? null,
    },
    all,
    recent,
    comparable,
    baselines,
    audit,
    activities,
    counts: {
      total: all.length,
      comparable: comparable.length,
      baselines: baselines.length,
      audit: audit.length,
      activities: activities.length,
    },
  };
}

const DEVICE_LABEL: Record<DeviceClass, string> = {
  phone: 'Celular',
  tablet: 'Tablet',
  desktop: 'Desktop',
};

function deviceLabel(deviceClass: DeviceClass | null): string {
  return deviceClass ? DEVICE_LABEL[deviceClass] : 'Classe não confirmada';
}

function finiteSampleRateLabel(value: number | null): string | null {
  return value !== null && Number.isFinite(value) ? `${Math.round(value)} Hz` : null;
}

function captureRecord(
  capture: ValidationCapture,
  point: OcularReadingPoint,
  recall: RecallTestResult | null,
  bucket: Exclude<NotebookBucket, 'activity'>,
): NotebookRecord {
  const legacyDevice = point.deviceClass
    ? null
    : inferLegacyDeviceClass({
        layoutMode: capture.environment?.layoutMode,
        viewport: capture.environment?.viewport,
      });
  const deviceClass = point.deviceClass ?? legacyDevice?.deviceClass ?? null;
  const deviceClassSource = point.deviceClassSource ?? legacyDevice?.deviceClassSource ?? null;
  const statusLabel = bucket === 'comparable'
    ? 'Sessão válida'
    : bucket === 'baseline'
      ? 'Baseline exploratório'
      : point.validity.grade === 'invalid'
        ? 'Tentativa não utilizável'
        : 'Contexto insuficiente';

  return {
    id: `capture:${capture.id}`,
    sourceId: capture.id,
    kind: 'capture',
    bucket,
    timestamp: capture.timestamp,
    title: recall ? `Leitura — ${recall.topic}` : 'Leitura ocular',
    statusLabel,
    deviceClass,
    deviceClassSource,
    deviceLabel: deviceLabel(deviceClass),
    sampleRateLabel: finiteSampleRateLabel(point.sampleRateHz),
    detail: point.validity.reasonCodes.length
      ? point.validity.reasonCodes.join(', ')
      : `${point.saccades} sacadas · ${point.regressions} regressões`,
    recall: recall
      ? { scoreLabel: `${recall.score}/${recall.questions.length}`, topic: recall.topic }
      : null,
  };
}

function recallActivityRecord(recall: RecallTestResult): NotebookRecord {
  return {
    id: `recall:${recall.id}`,
    sourceId: recall.id,
    kind: 'recall',
    bucket: 'activity',
    timestamp: recall.timestamp,
    title: `Recall — ${recall.topic}`,
    statusLabel: 'Recall registrado',
    deviceClass: null,
    deviceClassSource: null,
    deviceLabel: 'Classe não confirmada',
    sampleRateLabel: null,
    detail: `${recall.score}/${recall.questions.length} respostas corretas`,
    recall: { scoreLabel: `${recall.score}/${recall.questions.length}`, topic: recall.topic },
  };
}

function trainingActivityRecord(session: SessionResult): NotebookRecord {
  const exerciseCount = session.exercises.length;
  return {
    id: `training:${session.id}`,
    sourceId: session.id,
    kind: 'training',
    bucket: 'activity',
    timestamp: session.timestamp,
    title: session.clinicianSummaryPtBR || 'Plano de treino',
    statusLabel: 'Treino registrado',
    deviceClass: null,
    deviceClassSource: null,
    deviceLabel: 'Classe não confirmada',
    sampleRateLabel: null,
    detail: `${Math.round(session.durationSec / 60)} min · ${exerciseCount} ${
      exerciseCount === 1 ? 'exercício' : 'exercícios'
    }`,
    recall: null,
  };
}
