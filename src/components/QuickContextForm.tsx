import React from 'react';
import { PreTestContext, PostTestContext } from '@/types';

// Quick pre/post-test context forms replacing the old 8-item symptom questionnaire:
// a handful of taps (medication time, sleep, mood, feeling) instead of 88 buttons.

interface ScaleOption {
  value: number;
  emoji: string;
  label: string;
}

const SCALE_MOOD: ScaleOption[] = [
  { value: 1, emoji: '😖', label: 'Péssimo' },
  { value: 2, emoji: '😕', label: 'Baixo' },
  { value: 3, emoji: '😐', label: 'Neutro' },
  { value: 4, emoji: '🙂', label: 'Bom' },
  { value: 5, emoji: '😄', label: 'Ótimo' },
];

const SCALE_FEELING: ScaleOption[] = [
  { value: 1, emoji: '😫', label: 'Péssimo' },
  { value: 2, emoji: '😮‍💨', label: 'Fraco' },
  { value: 3, emoji: '😐', label: 'Regular' },
  { value: 4, emoji: '🙂', label: 'Bem' },
  { value: 5, emoji: '🤩', label: 'Afiado' },
];

const SCALE_FATIGUE: ScaleOption[] = [
  { value: 1, emoji: '😌', label: 'Nenhuma' },
  { value: 2, emoji: '🙂', label: 'Leve' },
  { value: 3, emoji: '😐', label: 'Moderada' },
  { value: 4, emoji: '😮‍💨', label: 'Alta' },
  { value: 5, emoji: '😵', label: 'Exausto' },
];

type Tone = 'light' | 'dark';

const toneClasses = (tone: Tone) => ({
  card: tone === 'dark'
    ? 'bg-slate-800 border border-white/10 text-white'
    : 'bg-surface border border-line text-strong shadow-sm',
  label: tone === 'dark' ? 'text-slate-300' : 'text-mild',
  hint: tone === 'dark' ? 'text-slate-400' : 'text-mild',
  idleButton: tone === 'dark'
    ? 'bg-white/10 hover:bg-white/20 text-slate-200'
    : 'bg-app-inset hover:bg-line-strong text-mild',
  activeButton: 'bg-blue-600 text-white shadow-lg',
  input: tone === 'dark'
    ? 'bg-white/10 text-slate-100 focus:bg-white/15'
    : 'bg-app-inset text-strong focus:bg-line-strong',
  submit: tone === 'dark'
    ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
    : 'bg-ink hover:opacity-90 text-ink-foreground',
});

function EmojiScale({ label, options, value, onChange, tone }: {
  label: string;
  options: ScaleOption[];
  value: number;
  onChange: (v: number) => void;
  tone: Tone;
}) {
  const t = toneClasses(tone);
  return (
    <div>
      <div className={`font-medium mb-2 ${t.label}`}>{label}</div>
      <div className="flex justify-between gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all active:scale-95 ${
              value === opt.value ? t.activeButton : t.idleButton
            }`}
          >
            <span className="text-xl">{opt.emoji}</span>
            <span className="text-[11px] font-bold uppercase tracking-wide">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SleepStepper({ value, onChange, tone }: { value: number; onChange: (v: number) => void; tone: Tone }) {
  const t = toneClasses(tone);
  const step = (delta: number) => onChange(Math.max(0, Math.min(14, Math.round((value + delta) * 2) / 2)));
  return (
    <div>
      <div className={`font-medium mb-2 ${t.label}`}>Horas de sono (última noite)</div>
      <div className="flex items-center gap-3">
        <button onClick={() => step(-0.5)} className={`w-12 h-12 rounded-xl text-xl font-bold ${t.idleButton}`}>−</button>
        <div className={`flex-1 text-center text-2xl font-bold ${t.label}`}>
          {value.toLocaleString('pt-BR', { minimumFractionDigits: value % 1 ? 1 : 0 })} h
        </div>
        <button onClick={() => step(0.5)} className={`w-12 h-12 rounded-xl text-xl font-bold ${t.idleButton}`}>+</button>
      </div>
    </div>
  );
}

export function PreContextForm({ value, onChange, onSubmit, tone = 'light', submitLabel = 'Confirmar e Continuar' }: {
  value: PreTestContext;
  onChange: (v: PreTestContext) => void;
  onSubmit: () => void;
  tone?: Tone;
  submitLabel?: string;
}) {
  const t = toneClasses(tone);
  return (
    <div className={`max-w-2xl mx-auto p-5 rounded-2xl ${t.card}`}>
      <h2 className="text-2xl font-semibold mb-1">Contexto de hoje</h2>
      <p className={`mb-4 font-medium ${t.hint}`}>Quatro toques rápidos antes de começar.</p>

      <div className="space-y-4">
        <div>
          <div className={`font-medium mb-2 ${t.label}`}>Horário do Venvanse</div>
          <div className="flex gap-2">
            <input
              type="time"
              value={value.venvanseTakenAt ?? ''}
              onChange={e => onChange({ ...value, venvanseTakenAt: e.target.value || null })}
              className={`flex-1 px-4 py-3 rounded-xl font-bold outline-none ${t.input}`}
            />
            <button
              onClick={() => onChange({ ...value, venvanseTakenAt: null })}
              className={`px-4 py-3 rounded-xl text-sm font-bold ${value.venvanseTakenAt === null ? t.activeButton : t.idleButton}`}
            >
              Não tomei hoje
            </button>
          </div>
        </div>

        <SleepStepper value={value.sleepHours} onChange={v => onChange({ ...value, sleepHours: v })} tone={tone} />
        <EmojiScale label="Humor" options={SCALE_MOOD} value={value.mood} onChange={v => onChange({ ...value, mood: v })} tone={tone} />
        <EmojiScale label="Como te sentes agora?" options={SCALE_FEELING} value={value.feeling} onChange={v => onChange({ ...value, feeling: v })} tone={tone} />
      </div>

      <div className="mt-5">
        <button onClick={onSubmit} className={`w-full py-3.5 font-semibold text-lg rounded-xl active:scale-95 transition-all ${t.submit}`}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

export function PostContextForm({ value, onChange, onSubmit, tone = 'light', submitLabel = 'Salvar sessão' }: {
  value: PostTestContext;
  onChange: (v: PostTestContext) => void;
  onSubmit: () => void;
  tone?: Tone;
  submitLabel?: string;
}) {
  const t = toneClasses(tone);
  return (
    <div className={`max-w-2xl mx-auto p-5 rounded-2xl ${t.card}`}>
      <h2 className="text-2xl font-semibold mb-1">Como terminaste?</h2>
      <p className={`mb-4 font-medium ${t.hint}`}>Três toques e o registro fecha.</p>

      <div className="space-y-4">
        <EmojiScale label="Como te sentes agora?" options={SCALE_FEELING} value={value.feeling} onChange={v => onChange({ ...value, feeling: v })} tone={tone} />
        <EmojiScale label="Fadiga" options={SCALE_FATIGUE} value={value.fatigue} onChange={v => onChange({ ...value, fatigue: v })} tone={tone} />
        <EmojiScale label="Humor" options={SCALE_MOOD} value={value.mood} onChange={v => onChange({ ...value, mood: v })} tone={tone} />
      </div>

      <div className="mt-5">
        <button onClick={onSubmit} className={`w-full py-3.5 font-semibold text-lg rounded-xl active:scale-95 transition-all ${t.submit}`}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
