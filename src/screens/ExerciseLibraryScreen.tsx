import React from 'react';
import { useNavigate } from 'react-router-dom';
import { registry } from '@/exercises/implementations';
import { ArrowLeft } from 'lucide-react';

export function ExerciseLibraryScreen() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center mb-10 gap-6">
          <button onClick={() => navigate('/')} className="p-3 bg-white rounded-full hover:bg-slate-100 shadow-sm border border-slate-100">
             <ArrowLeft className="w-6 h-6 text-slate-700" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Biblioteca</h1>
            <p className="text-slate-500 font-medium">Pratique exercícios avulsos fora do protocolo principal.</p>
          </div>
        </header>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.keys(registry).map(k => (
            <div key={k} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-800 capitalize mb-2">{k.replace('_', ' ')}</h3>
                <p className="text-slate-500 font-medium line-clamp-3">Módulo de treino visual interativo.</p>
              </div>
              <button 
                onClick={() => navigate('/player', { state: { singleExercise: k } })}
                className="mt-6 w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                Praticar Agora
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
