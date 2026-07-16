import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalibrationReusePrompt } from '../../src/components/CalibrationReusePrompt';
import { CaptureValiditySummary } from '../../src/components/CaptureValiditySummary';
import type { AssessedValidationCapture } from '../../src/types';
import type { CaptureValidityGrade, CaptureValiditySnapshot } from '../../src/services/captureValidity';
import '../../src/index.css';

type State = 'mismatch' | CaptureValidityGrade;

function validity(grade: CaptureValidityGrade): CaptureValiditySnapshot {
  const exploratory = grade === 'exploratory';
  const invalid = grade === 'invalid';
  return {
    contractVersion: 1,
    assessedAt: 1_752_690_000_000,
    grade,
    reasonCodes: invalid
      ? ['page-hidden-during-capture']
      : exploratory ? ['capture-coarse-temporal'] : [],
    durationMs: invalid ? 7_500 : 24_000,
    coverage: invalid ? 42 : 96,
    signalSource: 'calibrated-mediapipe',
    selectedSourceRatio: invalid ? 0.72 : 0.97,
    sampleRateHz: exploratory ? 30 : 60,
    temporalTier: exploratory ? 'coarse-temporal' : 'high-temporal',
    gapCount: invalid ? 1 : 0,
    interruption: invalid ? 'page-hidden-during-capture' : null,
  };
}

function capture(grade: CaptureValidityGrade): AssessedValidationCapture {
  const snapshot = validity(grade);
  return {
    id: `fixture-${grade}`,
    timestamp: snapshot.assessedAt ?? 0,
    durationMs: snapshot.durationMs ?? 0,
    conditions: { lighting: 'normal', distanceCm: 40, posture: 'upright' },
    coverage: snapshot.coverage ?? 0,
    calibrated: true,
    metrics: {
      trackingAvailable: grade !== 'invalid',
      samplesValid: grade === 'invalid' ? 0 : 1200,
      signalSource: 'calibrated-mediapipe',
      sampleRateHz: snapshot.sampleRateHz ?? undefined,
      saccadeCount: grade === 'invalid' ? 0 : 14,
      regressionCount: grade === 'invalid' ? 0 : 2,
      lineReturnCount: grade === 'invalid' ? 0 : 3,
      meanSaccadeAmplitude: grade === 'invalid' ? null : 0.124,
      meanFixationMs: grade === 'invalid' ? null : 286,
    },
    postural: {
      status: 'insufficient', confidence: 'low', samples: 0, cervicalStability: 0,
      sustainedTiltDeg: 0, rotationRange: 0, highMovement: false,
      label: 'Sinal insuficiente', insight: 'Fixture visual.',
    },
    axis: { hStd: 0, hRange: 0, vStd: 0, vRange: 0 },
    validity: snapshot,
    sampleCount: 0,
    samples: [],
  };
}

function App() {
  const [state, setState] = useState<State>('mismatch');
  const [action, setAction] = useState('nenhuma');
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <nav className="sticky top-0 z-50 flex flex-wrap gap-2 border-b border-white/10 bg-slate-950/95 p-3" aria-label="Estados da fixture">
        {(['mismatch', 'comparable', 'exploratory', 'invalid'] as State[]).map(item => (
          <button key={item} data-state={item} onClick={() => setState(item)} className="rounded-lg bg-white/10 px-3 py-2 text-sm font-bold">
            {item}
          </button>
        ))}
        <output data-testid="fixture-action" className="ml-auto self-center text-xs text-slate-300">ação: {action}</output>
      </nav>
      <div data-testid={`fixture-${state}`}>
        {state === 'mismatch' ? (
          <CalibrationReusePrompt
            reasons={['Orientação mudou de retrato para paisagem', 'A superfície de leitura mudou de tamanho']}
            onRecalibrate={() => setAction('recalibrar')}
            onContinueRaw={() => setAction('modo-bruto')}
          />
        ) : (
          <div className="mx-auto max-w-2xl p-4 sm:p-8">
            <h1 className="mb-4 text-xl font-bold">Estado persistido: {state}</h1>
            <CaptureValiditySummary capture={capture(state)} />
          </div>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
