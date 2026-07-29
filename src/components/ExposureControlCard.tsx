import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  lockExposure,
  readExposureCapabilities,
  unlockExposure,
  type ExposureCapabilities,
} from '@/services/cameraExposure';

// Card de diagnóstico opt-in: trava a exposição da webcam na sessão atual para
// tirar o auto-exposure da frente do sinal. Nada aqui persiste em perfil nem
// altera o pipeline de análise. O card é o dono do lock: restaura o modo
// automático quando a câmera para, quando desmonta e em pagehide — a
// configuração persiste no hardware da webcam se ninguém a desfizer.
interface ExposureControlCardProps {
  active: boolean;
  streamRef: MutableRefObject<MediaStream | null>;
}

export function ExposureControlCard({ active, streamRef }: ExposureControlCardProps) {
  const [caps, setCaps] = useState<ExposureCapabilities | null>(null);
  const [lockedTime, setLockedTime] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lockedTrackRef = useRef<MediaStreamTrack | null>(null);
  const locked = lockedTime !== null;

  useEffect(() => {
    if (!active) return;
    setCaps(readExposureCapabilities(streamRef.current?.getVideoTracks()[0]));
    return () => {
      const track = lockedTrackRef.current;
      lockedTrackRef.current = null;
      if (track) void unlockExposure(track);
      setCaps(null);
      setLockedTime(null);
      setError(null);
    };
  }, [active, streamRef]);

  // Rede de segurança de página enquanto travado; pagehide cobre bfcache/mobile
  // onde beforeunload não dispara.
  useEffect(() => {
    if (!locked) return;
    const restore = () => {
      const track = lockedTrackRef.current;
      lockedTrackRef.current = null;
      if (track) void unlockExposure(track);
    };
    window.addEventListener('pagehide', restore);
    return () => window.removeEventListener('pagehide', restore);
  }, [locked]);

  const toggle = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (locked) {
        lockedTrackRef.current = null;
        await unlockExposure(track);
        setLockedTime(null);
      } else {
        const result = await lockExposure(track, caps ?? undefined);
        if ('reason' in result) {
          setError(result.reason === 'apply-failed'
            ? 'A câmera rejeitou o modo manual.'
            : 'Sem suporte a exposição manual.');
        } else {
          lockedTrackRef.current = track;
          setLockedTime(result.exposureTime);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-slate-900/50 border border-white/10 p-3 flex flex-col gap-2">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Exposição da câmera</div>
      {!active && <div className="text-xs text-slate-500">Ligue a câmera para inspecionar.</div>}
      {active && caps && !caps.manualSupported && (
        <div className="text-xs text-slate-500">
          Sem modo manual nesta câmera/navegador
          {caps.modes.length > 0 ? ` (modos: ${caps.modes.join(', ')})` : ''}.
        </div>
      )}
      {active && caps?.manualSupported && (
        <>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Modo atual</span>
            <span className="font-bold text-slate-200">
              {locked ? `manual @ ${lockedTime}` : caps.current?.exposureMode ?? 'auto'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            exposureTime {caps.exposureTime?.min ?? '?'}–{caps.exposureTime?.max ?? '?'}
          </div>
          <button
            onClick={toggle}
            disabled={busy}
            className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${locked ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-white/10 text-slate-300 hover:bg-white/20'} disabled:opacity-50`}
          >
            {busy ? '…' : locked ? 'Destravar exposição' : 'Travar exposição'}
          </button>
          <div className="text-[11px] text-slate-500">
            Congela a exposição no valor atual para estabilizar o sinal. Volta ao automático ao parar a câmera ou sair da página.
          </div>
        </>
      )}
      {error && <div className="text-xs text-amber-400">{error}</div>}
    </div>
  );
}
