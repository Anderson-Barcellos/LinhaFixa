import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { RecallQuestion } from '@/types';

// Multiple-choice quiz shown right after a recall reading capture: one question at a
// time (no feedback mid-quiz, so later answers aren't contaminated), then a review
// stage with the correction and each question's rationale.

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export function RecallQuiz({ topic, questions, onDone }: {
  topic: string;
  questions: RecallQuestion[];
  onDone: (answers: number[], score: number) => void;
}) {
  const [answers, setAnswers] = useState<number[]>([]);
  const [reviewing, setReviewing] = useState(false);

  const choose = (optionIndex: number) => {
    const next = [...answers, optionIndex];
    setAnswers(next);
    if (next.length === questions.length) setReviewing(true);
  };

  if (!reviewing) {
    const index = answers.length;
    const question = questions[index];
    return (
      <div className="bg-slate-800 rounded-3xl p-8 max-w-2xl w-full border border-white/10">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">{topic}</span>
          <span className="text-sm font-bold text-slate-400">Questão {index + 1}/{questions.length}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-6">
          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${(index / questions.length) * 100}%` }} />
        </div>

        <h2 className="text-xl font-bold text-white mb-6">{question.question}</h2>

        <div className="flex flex-col gap-2">
          {question.options.map((option, i) => (
            <button
              key={i}
              onClick={() => choose(i)}
              className="flex items-start gap-3 text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-indigo-600/40 border border-white/10 hover:border-indigo-400/50 transition-colors active:scale-[0.99]"
            >
              <span className="shrink-0 w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-sm font-bold text-slate-300">{LETTERS[i]}</span>
              <span className="text-slate-100 font-medium pt-0.5">{option}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const score = answers.reduce((acc, answer, i) => acc + (answer === questions[i].correctIndex ? 1 : 0), 0);
  return (
    <div className="bg-slate-800 rounded-3xl p-8 max-w-2xl w-full border border-white/10 max-h-[90vh] flex flex-col">
      <h2 className="text-2xl font-bold text-white mb-1">Recall: {score}/{questions.length}</h2>
      <p className="text-xs text-slate-400 mb-5">{topic} · confira a correção e o trecho que fundamenta cada resposta.</p>

      <div className="overflow-y-auto flex flex-col gap-3 pr-1 mb-6">
        {questions.map((q, i) => {
          const hit = answers[i] === q.correctIndex;
          return (
            <div key={i} className={`rounded-xl border p-4 ${hit ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
              <div className="flex items-start gap-2 mb-2">
                {hit
                  ? <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  : <X className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
                <span className="text-sm font-bold text-slate-100">{i + 1}. {q.question}</span>
              </div>
              <div className="text-xs text-slate-300 font-medium ml-6">
                {!hit && <div className="mb-1">Tua resposta: {LETTERS[answers[i]]}) {q.options[answers[i]]}</div>}
                <div className={hit ? '' : 'text-emerald-300'}>Correta: {LETTERS[q.correctIndex]}) {q.options[q.correctIndex]}</div>
                <div className="text-slate-400 mt-1 italic">{q.rationale}</div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => onDone(answers, score)}
        className="shrink-0 w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-white"
      >
        Salvar e ver métricas da leitura
      </button>
    </div>
  );
}
