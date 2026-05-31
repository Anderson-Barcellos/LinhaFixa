import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { saveConsent } from '@/services/storage';
import { ShieldAlert, Eye, Settings, HeartPulse } from 'lucide-react';

export function ConsentScreen() {
  const navigate = useNavigate();
  const { setConsentAccepted } = useAppStore();
  const [checked, setChecked] = useState(false);

  const handleAccept = async () => {
    if (!checked) return;
    await saveConsent();
    setConsentAccepted(true);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-3xl w-full bg-white rounded-3xl p-10 md:p-14 shadow-sm border border-slate-100">
        <div className="flex justify-center mb-8">
           <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
             <ShieldAlert className="w-10 h-10" />
           </div>
        </div>
        
        <h1 className="text-3xl font-bold text-center text-slate-800 mb-8">Aviso Importante e Consentimento</h1>
        
        <div className="space-y-6 text-slate-600 text-lg">
          <div className="flex gap-4 items-start">
             <HeartPulse className="w-6 h-6 text-red-500 shrink-0 mt-1" />
             <p><strong>Uso Clínico:</strong> Este aplicativo é uma ferramenta de apoio. Ele não diagnostica condições oftalmológicas, visuais ou neurológicas, e não substitui a terapia visual orientada por um especialista.</p>
          </div>
          
          <div className="flex gap-4 items-start">
             <Eye className="w-6 h-6 text-blue-500 shrink-0 mt-1" />
             <p><strong>Privacidade (Câmera):</strong> Solicitaremos uso da câmera frontal exclusivamente para verificar se sua cabeça está parada durante os exercícios (estabilidade). As imagens <strong>não são salvas</strong> nem enviadas para nenhum servidor. O processamento é inteiramente local.</p>
          </div>

          <div className="flex gap-4 items-start">
             <Settings className="w-6 h-6 text-amber-500 shrink-0 mt-1" />
             <p><strong>Interrupção:</strong> Caso sinta tontura forte, náusea, visão dupla súbita, dor ou muito cansaço visual, pare imediatamente o exercício e procure seu médico ou terapeuta.</p>
          </div>
        </div>

        <label className="flex items-start gap-4 mt-12 p-6 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
          <input 
            type="checkbox" 
            className="w-6 h-6 mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span className="text-slate-800 font-medium text-lg leading-snug">
            Li e compreendi os termos. Aceito usar o aplicativo consciente de que ele é uma ferramenta de treino e não um fim diagnóstico ou cura médica.
          </span>
        </label>

        <div className="mt-10 flex justify-center">
          <button
            disabled={!checked}
            onClick={handleAccept}
            className={`px-10 py-4 rounded-xl text-xl font-bold transition-all shadow-md ${checked ? 'bg-slate-900 text-white hover:-translate-y-1 hover:shadow-lg' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
          >
            Começar
          </button>
        </div>
        
      </div>
    </div>
  );
}
