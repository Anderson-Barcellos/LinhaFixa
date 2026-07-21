import {
  Activity,
  ChevronRight,
  CircleCheck,
  FlaskConical,
  TriangleAlert,
} from 'lucide-react';

import type { NotebookRecord } from '@/services/experimentNotebookProjection';

const bucketStyle = {
  comparable: {
    icon: CircleCheck,
    iconClass: 'bg-emerald-100 text-emerald-700',
    label: 'text-emerald-700',
  },
  baseline: {
    icon: FlaskConical,
    iconClass: 'border border-dashed border-accent text-accent',
    label: 'text-accent-strong',
  },
  audit: {
    icon: TriangleAlert,
    iconClass: 'bg-rose-100 text-rose-700',
    label: 'text-rose-700',
  },
  activity: {
    icon: Activity,
    iconClass: 'bg-app-inset text-mild',
    label: 'text-mild',
  },
} as const;

export function NotebookRecordRow({
  record,
  onOpen,
}: {
  key?: string;
  record: NotebookRecord;
  onOpen: (record: NotebookRecord) => void;
}) {
  const style = bucketStyle[record.bucket];
  const Icon = style.icon;

  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className="grid min-h-20 w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-line-strong py-4 text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-label={`Abrir ${record.title}, ${record.statusLabel}`}
    >
      <span className={`grid h-12 w-12 place-items-center rounded-full ${style.iconClass}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-bold ${style.label}`}>
          {record.statusLabel}
        </span>
        <span className="mt-1 block truncate text-sm font-medium text-mild">
          {record.deviceLabel}{record.sampleRateLabel ? ` · ${record.sampleRateLabel}` : ''}
        </span>
        <span className="mt-1 block text-xs text-faint">
          {new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(record.timestamp)}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 text-faint" aria-hidden="true" />
    </button>
  );
}
