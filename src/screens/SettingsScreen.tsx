import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { saveProfile } from '@/services/storage';
import { CalibrationOverlay } from '@/components/CalibrationOverlay';
import { isCalibrated, getAccuracyDeg } from '@/services/gazeCalibration';
import { clampViewingDistanceCm, normalizeViewingDistanceInput, viewingDistanceInputValue } from '@/services/viewingDistance';
import { requestMotionPermissionFromGesture, startMotionSensor } from '@/services/motionSensor';
import { ArrowLeft, Save, Eye, ScanEye } from 'lucide-react';

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
    viewingDistanceCm: viewingDistanceInputValue(profile?.viewingDistanceCm),
  });

  const handleSubmit = async () => {
    // Basic types assertions for MVP
    const updated = {
	     ...formData,
	     fontSizePreference: formData.fontSizePreference as any,
	     contrastPreference: formData.contrastPreference as any,
	     viewingDistanceCm: clampViewingDistanceCm(formData.viewingDistanceCm),
	  };
    await saveProfile(updated);
    setProfile(updated);
    navigate('/');
  };

  const beginCalibration = async () => {
    const motionPermission = await requestMotionPermissionFromGesture();
    if (motionPermission === 'granted') startMotionSensor();
    setShowCalibration(true);
  };

  if (showCalibration) {
    return (
        <CalibrationOverlay
	        viewingDistanceCm={clampViewingDistanceCm(formData.viewingDistanceCm)}
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
                 min={20}
                 max={120}
                 inputMode="numeric"
                 onChange={e => setFormData({...formData, viewingDistanceCm: normalizeViewingDistanceInput(e.target.value)})}
                 onBlur={() => setFormData({...formData, viewingDistanceCm: String(clampViewingDistanceCm(formData.viewingDistanceCm))})}
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
                <span className="text-lg font-medium text-slate-700">
                  Usar câmera frontal para medir dinâmica ocular de leitura e estabilidade da cabeça
                </span>
             </label>
          </div>

          {formData.cameraEnabled && (
            <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
               <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                     <div className="text-lg font-bold text-slate-800 flex items-center gap-2"><Eye className="w-5 h-5 text-indigo-500" /> Calibração espacial do olhar</div>
                     <div className="text-sm text-slate-500 font-medium mt-1">
                        {isCalibrated()
                          ? `Calibrada — precisão estimada ${getAccuracyDeg() != null ? `~${getAccuracyDeg()!.toFixed(1)}°` : 'não medida'}`
                          : 'Não calibrada nesta sessão. A análise dinâmica ainda pode usar o movimento bruto.'}
                     </div>
                  </div>
                  <button onClick={beginCalibration} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold">
                     {isCalibrated() ? 'Recalibrar' : 'Calibrar agora'}
                  </button>
               </div>
               <p className="text-xs text-indigo-400 font-medium mt-3">
                 A calibração melhora a posição na tela; sacadas, regressões e ritmo de leitura
                 continuam sendo estimativas experimentais por webcam.
               </p>
               <button
                  onClick={() => navigate('/eye-tracking-test')}
                  className="mt-4 flex items-center gap-2 px-5 py-3 bg-white border border-indigo-200 text-indigo-700 rounded-xl font-bold hover:bg-indigo-50"
               >
                  <ScanEye className="w-5 h-5" /> Dinâmica ocular de leitura
               </button>
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
