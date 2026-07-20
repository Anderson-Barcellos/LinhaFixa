import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { registry } from '@/exercises/implementations';
import { AppShell } from '@/components/app/AppShell';
import { signalCameraIntent } from '@/services/adaptivePreload';
import { Card } from '@/components/ui/card';

const EXERCISE_DESCRIPTIONS: Record<string, { title: string; description: string }> = {
  fixation: {
    title: 'Fixação',
    description: 'Sustentar o olhar num alvo fixo — mede a estabilidade da fixação e a quietude da cabeça.',
  },
  saccades: {
    title: 'Sacadas',
    description: 'Saltos rápidos entre alvos alternados — mede latência e precisão dos movimentos sacádicos.',
  },
  smooth_pursuit: {
    title: 'Perseguição suave',
    description: 'Seguir um alvo em movimento contínuo — mede a suavidade da perseguição ocular.',
  },
  assistedReading: {
    title: 'Leitura assistida',
    description: 'Leitura guiada por trechos com texto gerado por IA — mede sacadas, regressões e ritmo no texto.',
  },
};

export function ExerciseLibraryScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const warmCamera = () => signalCameraIntent();
  return (
    <AppShell
      currentPath={`${location.pathname}${location.search}`}
      title="Biblioteca"
      subtitle="Pratique exercícios avulsos fora do protocolo principal."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.keys(registry).map(k => {
          const meta = EXERCISE_DESCRIPTIONS[k];
          return (
            <Card key={k} className="flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-bold text-strong mb-2">{meta?.title ?? k.replace('_', ' ')}</h3>
                <p className="text-mild font-medium line-clamp-3">{meta?.description ?? 'Módulo de treino visual interativo.'}</p>
              </div>
              <button
                onPointerDown={warmCamera}
                onFocus={warmCamera}
                onClick={() => navigate('/player', { state: { singleExercise: k } })}
                className="mt-6 w-full py-3 bg-accent-soft hover:bg-accent-line text-accent-strong font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                Praticar Agora
              </button>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
