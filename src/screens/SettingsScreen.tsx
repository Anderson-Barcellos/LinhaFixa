import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { saveProfile } from '@/services/storage';
import { CalibrationOverlay } from '@/components/CalibrationOverlay';
import { isCalibrated, getAccuracyDeg } from '@/services/gazeCalibration';
import { ArrowLeft, Save, Eye } from 'lucide-react';

export function SettingsScreen() {
  const navigate = useNavigate();
  const { profile, setProfile } = useAppStore();
  const [showCalibration, setShowCalibration] = useState(false);
  // Bump to refresh the calibration status label after calibrating.
  const [, setCalTick] = useState(0);

  const [formData, setFormData] = useState({
    name: profile?.name || '',
    isAdult: profile?.isAdult ?? true,
    fontSizePreference: profile?.fontSizePreference || 'normal',
    contrastPreference: profile?.contrastPreference || 'light',
    cameraEnabled: profile?.cameraEnabled ?? true,
    viewingDistanceCm: profile?.viewingDistanceCm || 40,
  });

  const handleSubmit = async () => {
    // Basic types assertions for MVP
    const updated = {
       ...formData,
       fontSizePreference: formData.fontSizePreference as any,
       contrastPreference: formData.contrastPreference as any
    };
    await saveProfile(updated);
    setProfile(updated);
    navigate('/');
  };

  if (showCalibration) {
    return (
      <CalibrationOverlay
        viewingDistanceCm={formData.viewingDistanceCm}
        onComplete={() => { setShowCalibration(false); setCalTick(t => t + 1); }}
        onSkip={() => { setShowCalibration(false); setCalTick(t => t + 1); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center mb-10 gap-6">
          <button onClick={() => navigate('/')} className="p-3 bg-white rounded-full hover:bg-slate-100 shadow-sm border border-slate-100">
             <ArrowLeft className="w-6 h-6 text-slate-700" />
          </button>
          <h1 className="text-3xl font-bold text-slate-800">Ajustes & Perfil</h1>
        </header>

        <div className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-slate-100 space-y-8">
          
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Nome</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full text-lg p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Como prefere ser chamado?"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Perfil</label>
              <select 
                value={formData.isAdult ? 'adult' : 'child'}
                onChange={e => setFormData({...formData, isAdult: e.target.value === 'adult'})}
                className="w-full text-lg p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="adult">Adulto / Independente</option>
                <option value="child">Criança / Guiado</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Tamanho da Fonte (Leitura)</label>
              <select 
                value={formData.fontSizePreference}
                onChange={e => setFormData({...formData, fontSizePreference: e.target.value as any})}
                className="w-full text-lg p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="small">Pequena</option>
                <option value="normal">Normal</option>
                <option value="large">Grande</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Tema / Contraste (Leitura)</label>
              <select 
                value={formData.contrastPreference}
                onChange={e => setFormData({...formData, contrastPreference: e.target.value as any})}
                className="w-full text-lg p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="light">Claro (Fundo Branco)</option>
                <option value="dark">Escuro (Alto Contraste)</option>
              </select>
            </div>

            <div>
               <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Distância da Tela (cm)</label>
               <input 
                 type="number" 
                 value={formData.viewingDistanceCm}
                 onChange={e => setFormData({...formData, viewingDistanceCm: parseInt(e.target.value) || 40})}
                 className="w-full text-lg p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
               />
            </div>
          </div>

          <div>
             <label className="flex items-center gap-4 p-6 bg-slate-50 rounded-2xl cursor-pointer">
                <input 
                  type="checkbox"
                  checked={formData.cameraEnabled}
                  onChange={e => setFormData({...formData, cameraEnabled: e.target.checked})}
                  className="w-6 h-6 border-slate-300 text-blue-600 rounded"
                />
                <span className="text-lg font-medium text-slate-700">Usar câmera frontal para monitorar a cabeça e medir o olhar (sacadas, fixação, perseguição)</span>
             </label>
          </div>

          {formData.cameraEnabled && (
            <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
               <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                     <div className="text-lg font-bold text-slate-800 flex items-center gap-2"><Eye className="w-5 h-5 text-indigo-500" /> Calibração do olhar</div>
                     <div className="text-sm text-slate-500 font-medium mt-1">
                        {isCalibrated()
                          ? `Calibrada — precisão estimada ${getAccuracyDeg() != null ? `~${getAccuracyDeg()!.toFixed(1)}°` : 'não medida'}`
                          : 'Não calibrada nesta sessão. Calibre para habilitar as métricas oculares.'}
                     </div>
                  </div>
                  <button onClick={() => setShowCalibration(true)} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold">
                     {isCalibrated() ? 'Recalibrar' : 'Calibrar agora'}
                  </button>
               </div>
               <p className="text-xs text-indigo-400 font-medium mt-3">Estimativa por webcam (~30Hz, ~1–2°). Não detecta microssacadas nem substitui equipamento clínico.</p>
            </div>
          )}

          <button onClick={handleSubmit} className="w-full py-4 bg-slate-900 text-white font-bold text-lg rounded-xl flex items-center justify-center gap-3 mt-4 hover:opacity-90">
             <Save className="w-5 h-5"/> Salvar Preferências
          </button>
        </div>
      </div>
    </div>
  );
}
