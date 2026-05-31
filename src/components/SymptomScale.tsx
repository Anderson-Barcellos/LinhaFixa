import React from 'react';
import { SymptomRating } from '@/types';

interface SymptomScaleProps {
  symptoms: SymptomRating;
  onChange: (s: SymptomRating) => void;
  onSubmit: () => void;
}

export function SymptomScale({ symptoms, onChange, onSubmit }: SymptomScaleProps) {
  const fields: { key: keyof SymptomRating; label: string }[] = [
    { key: 'dorOcular', label: 'Dor Ocular' },
    { key: 'cefaleia', label: 'Dor de cabeça (Cefaleia)' },
    { key: 'visaoDupla', label: 'Visão Dupla (Diplopia)' },
    { key: 'tontura', label: 'Tontura' },
    { key: 'nausea', label: 'Náusea' },
    { key: 'fotofobia', label: 'Sensibilidade à luz' },
    { key: 'fadigaVisual', label: 'Fadiga visual (Cansaço)' },
    { key: 'borramento', label: 'Visão Borrada' },
  ];

  const update = (key: keyof SymptomRating, val: number) => {
    onChange({ ...symptoms, [key]: val });
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
      <h2 className="text-2xl font-semibold mb-2 text-slate-800 dark:text-slate-100">Como você está se sentindo?</h2>
      <p className="text-slate-500 mb-6 font-medium">0 = Nenhum sintoma | 10 = Muito severo</p>
      
      <div className="space-y-6">
        {fields.map(({ key, label }) => (
          <div key={key} className="flex flex-col md:flex-row md:items-center gap-4 border-b border-slate-100 dark:border-slate-700 pb-4">
            <span className="md:w-1/3 font-medium text-slate-700 dark:text-slate-200">{label}</span>
            <div className="flex-1 flex justify-between gap-1">
              {[0,1,2,3,4,5,6,7,8,9,10].map(val => (
                <button
                  key={val}
                  onClick={() => update(key, val)}
                  className={`w-10 h-10 md:w-12 md:h-12 rounded-full font-medium transition-colors ${
                    symptoms[key] === val 
                      ? val >= 7 ? 'bg-red-500 text-white shadow-lg' : val >= 4 ? 'bg-amber-500 text-white shadow-lg' : 'bg-blue-600 text-white shadow-lg'
                      : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <button 
          onClick={onSubmit}
          className="w-full py-4 bg-slate-900 text-white font-semibold text-lg rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md"
        >
          Confirmar e Continuar
        </button>
      </div>
    </div>
  );
}
