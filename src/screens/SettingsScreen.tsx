import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/app/AppShell';
import { useAppStore } from '@/store/useAppStore';
import { saveProfile } from '@/services/storage';
import { LIVE_ASSESSMENT_WORKSPACE_ROUTE } from '@/services/assessmentAdapter';
import { CalibrationOverlay } from '@/components/CalibrationOverlay';
import { isCalibrated, getAccuracyDeg } from '@/services/gazeCalibration';
import { clampViewingDistanceCm, normalizeViewingDistanceInput, viewingDistanceInputValue } from '@/services/viewingDistance';
import { getTheme, setTheme, type Theme } from '@/services/theme';
import { requestMotionPermissionFromGesture, startMotionSensor } from '@/services/motionSensor';
import { confirmDeviceClass, defaultViewingDistanceCm, resolveDeviceClass } from '@/services/deviceClass';
import type { DeviceClass, UserProfile } from '@/types';
import { Save, Eye, ScanEye } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ScreenCalibrationCard } from '@/components/ScreenCalibrationCard';

interface SettingsFormData {
  name: string;
  isAdult: boolean;
  fontSizePreference: UserProfile['fontSizePreference'];
  contrastPreference: UserProfile['contrastPreference'];
  cameraEnabled: boolean;
  viewingDistanceCm: string;
  deviceClass: DeviceClass;
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, setProfile } = useAppStore();
  const [showCalibration, setShowCalibration] = useState(false);
  // Preferência de dispositivo (localStorage), aplicada na hora — não vive no perfil.
  const [appTheme, setAppTheme] = useState<Theme>(() => getTheme());
  // Bump to refresh the calibration status label after calibrating.
  const [, setCalTick] = useState(0);

  const [formData, setFormData] = useState<SettingsFormData>(() => {
    const suggestedDevice = resolveDeviceClass(profile, {
      width: window.innerWidth,
      height: window.innerHeight,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    });
    return {
      name: profile?.name ?? '',
      isAdult: profile?.isAdult ?? true,
      fontSizePreference: profile?.fontSizePreference ?? 'normal',
      contrastPreference: profile?.contrastPreference ?? 'light',
      cameraEnabled: profile?.cameraEnabled ?? true,
      // Distância salva pelo usuário manda; sem valor salvo, semeia pela classe do
      // dispositivo (não sobrescreve ajuste manual — só preenche o vazio).
      viewingDistanceCm: profile?.viewingDistanceCm != null
        ? viewingDistanceInputValue(profile.viewingDistanceCm)
        : String(defaultViewingDistanceCm(profile?.deviceClass ?? suggestedDevice.deviceClass)),
      deviceClass: profile?.deviceClass ?? suggestedDevice.deviceClass,
    };
  });

  const handleSubmit = async () => {
    const updated: UserProfile = {
      ...formData,
      ...confirmDeviceClass(formData.deviceClass),
      fontSizePreference: formData.fontSizePreference,
      contrastPreference: formData.contrastPreference,
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
    <AppShell
      currentPath={`${location.pathname}${location.search}`}
      title="Ajustes & Perfil"
      subtitle="Perfil, leitura e câmera — preferências deste dispositivo."
    >
      <div className="max-w-3xl">
        <Card className="p-8 md:p-12 space-y-8">
          
          <div>
            <label className="block text-sm font-bold text-mild uppercase tracking-widest mb-2">Nome</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full text-lg p-4 bg-surface-sunken rounded-xl border border-line-strong text-strong focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Como prefere ser chamado?"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-sm font-bold text-mild uppercase tracking-widest mb-2">Perfil</label>
              <select 
                value={formData.isAdult ? 'adult' : 'child'}
                onChange={e => setFormData({...formData, isAdult: e.target.value === 'adult'})}
                className="w-full text-lg p-4 bg-surface-sunken rounded-xl border border-line-strong text-strong focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="adult">Adulto / Independente</option>
                <option value="child">Criança / Guiado</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-mild uppercase tracking-widest mb-2">Tamanho da Fonte (Leitura)</label>
              <select 
                value={formData.fontSizePreference}
                onChange={e => setFormData({
                  ...formData,
                  fontSizePreference: e.target.value as UserProfile['fontSizePreference'],
                })}
                className="w-full text-lg p-4 bg-surface-sunken rounded-xl border border-line-strong text-strong focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="normal">Normal</option>
                <option value="large">Grande</option>
                <option value="huge">Muito grande</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-mild uppercase tracking-widest mb-2">Tema / Contraste (Leitura)</label>
              <select 
                value={formData.contrastPreference}
                onChange={e => setFormData({
                  ...formData,
                  contrastPreference: e.target.value as UserProfile['contrastPreference'],
                })}
                className="w-full text-lg p-4 bg-surface-sunken rounded-xl border border-line-strong text-strong focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="light">Claro (Fundo Branco)</option>
                <option value="dark">Escuro (Alto Contraste)</option>
                <option value="high-contrast">Contraste máximo</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-mild uppercase tracking-widest mb-2">Tema do Aplicativo</label>
              <select
                value={appTheme}
                onChange={e => {
                  const next = e.target.value as Theme;
                  setAppTheme(next);
                  setTheme(next);
                }}
                className="w-full text-lg p-4 bg-surface-sunken rounded-xl border border-line-strong text-strong focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
              </select>
            </div>

            <div>
               <label className="block text-sm font-bold text-mild uppercase tracking-widest mb-2">Distância da Tela (cm)</label>
               <input
                 type="number"
                 value={formData.viewingDistanceCm}
                 min={20}
                 max={120}
                 inputMode="numeric"
                 onChange={e => setFormData({...formData, viewingDistanceCm: normalizeViewingDistanceInput(e.target.value)})}
                 onBlur={() => setFormData({...formData, viewingDistanceCm: String(clampViewingDistanceCm(formData.viewingDistanceCm))})}
                 className="w-full text-lg p-4 bg-surface-sunken rounded-xl border border-line-strong text-strong focus:outline-none focus:ring-2 focus:ring-blue-500"
               />
            </div>
          </div>

          <fieldset>
            <legend className="mb-3 block text-sm font-bold uppercase tracking-widest text-mild">
              Classe deste dispositivo
            </legend>
            <p className="mb-4 text-sm leading-6 text-mild">
              Confirme o aparelho atual. Séries longitudinais só comparam sessões da mesma classe.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {(['phone', 'tablet', 'desktop'] as const).map(value => (
                <label
                  key={value}
                  className={`flex min-h-12 items-center gap-3 rounded-2xl border p-4 ${
                    formData.deviceClass === value
                      ? 'border-accent bg-accent-soft text-accent-strong'
                      : 'border-line-strong text-mild'
                  }`}
                >
                  <input
                    type="radio"
                    name="deviceClass"
                    value={value}
                    checked={formData.deviceClass === value}
                    onChange={() => setFormData(previous => ({
                      ...previous,
                      deviceClass: value,
                      // Seed editável: trocar a classe repõe a distância média do aparelho;
                      // o campo continua ajustável à mão logo abaixo.
                      viewingDistanceCm: String(defaultViewingDistanceCm(value)),
                    }))}
                    className="h-5 w-5 accent-indigo-600"
                  />
                  <span className="font-semibold">
                    {value === 'phone' ? 'Celular' : value === 'tablet' ? 'Tablet' : 'Desktop'}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <ScreenCalibrationCard />

          <div>
             <label className="flex items-center gap-4 p-6 bg-surface-sunken rounded-2xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.cameraEnabled}
                  onChange={e => setFormData({...formData, cameraEnabled: e.target.checked})}
                  className="w-6 h-6 border-slate-300 text-blue-600 rounded"
                />
                <span className="text-lg font-medium text-mild">
                  Usar câmera frontal para medir dinâmica ocular de leitura e estabilidade da cabeça
                </span>
             </label>
          </div>

          {formData.cameraEnabled && (
            <div className="p-6 bg-accent-soft rounded-2xl border border-accent-line">
               <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                     <div className="text-lg font-bold text-strong flex items-center gap-2"><Eye className="w-5 h-5 text-indigo-500" /> Calibração espacial do olhar</div>
                     <div className="text-sm text-mild font-medium mt-1">
                        {isCalibrated()
                          ? `Calibrada — precisão estimada ${getAccuracyDeg() != null ? `~${getAccuracyDeg()!.toFixed(1)}°` : 'não medida'}`
                          : 'Não calibrada nesta sessão. A análise dinâmica ainda pode usar o movimento bruto.'}
                     </div>
                  </div>
                  <button onClick={beginCalibration} className="px-6 py-3 bg-accent hover:bg-indigo-500 text-white rounded-xl font-bold">
                     {isCalibrated() ? 'Recalibrar' : 'Calibrar agora'}
                  </button>
               </div>
               <p className="text-xs text-indigo-400 font-medium mt-3">
                 A calibração melhora a posição na tela; sacadas, regressões e ritmo de leitura
                 continuam sendo estimativas experimentais por webcam.
               </p>
               <button
                  onClick={() => navigate(LIVE_ASSESSMENT_WORKSPACE_ROUTE)}
                  className="mt-4 flex items-center gap-2 px-5 py-3 bg-surface border border-indigo-200 text-accent-strong rounded-xl font-bold hover:bg-accent-soft"
               >
                  <ScanEye className="w-5 h-5" /> Dinâmica ocular de leitura
               </button>
            </div>
          )}

          <button onClick={handleSubmit} className="w-full py-4 bg-ink text-ink-foreground font-bold text-lg rounded-xl flex items-center justify-center gap-3 mt-4 hover:opacity-90">
             <Save className="w-5 h-5"/> Salvar Preferências
          </button>
        </Card>
      </div>
    </AppShell>
  );
}
