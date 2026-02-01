import React, { useState, useEffect, useRef } from 'react';
import { EmergencyAlert, AlertStatus } from '../types';
import { getPoliceProtocol } from '../services/geminiService';
import { atualizarStatusEmergencia, adicionarConselhoIA } from '../services/firebaseService';
import { Bell, Map, Phone, Navigation, BrainCircuit, Lock, CheckCircle, LogOut, Archive, MapPin, User, Activity, Shield, X, RefreshCcw, ArrowLeft, KeySquare } from 'lucide-react';

interface PoliceDashboardProps {
  alerts: EmergencyAlert[];
  isOnline: boolean;
}

const PoliceDashboard: React.FC<PoliceDashboardProps> = ({ alerts, isOnline }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('gogoma_police_auth') === 'true');
  const [badgeId, setBadgeId] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<EmergencyAlert | null>(null);
  const [aiProtocol, setAiProtocol] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'resolved'>('pending');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeOscillators = useRef<OscillatorNode[]>([]);
  const alarmIntervalRef = useRef<any>(null);

  // CREDENCIAIS SECRETAS
  const SECRET_ID = "PRM_9922"; 
  const SECRET_PASS = "Gogoma@2024";

  const hasNewAlerts = alerts.some(a => a.status === AlertStatus.NEW);

  useEffect(() => {
    if (isAuthenticated && hasNewAlerts) {
      if (!alarmIntervalRef.current) {
        startSirenLoop();
        alarmIntervalRef.current = setInterval(startSirenLoop, 5000);
      }
    } else {
      stopSirenTotal();
    }
    return () => stopSirenTotal();
  }, [hasNewAlerts, isAuthenticated]);

  const startSirenLoop = () => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 1);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 3);
      osc.start(); osc.stop(ctx.currentTime + 3);
      activeOscillators.current.push(osc);
      if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
    } catch (e) {}
  };

  const stopSirenTotal = () => {
    if (alarmIntervalRef.current) { clearInterval(alarmIntervalRef.current); alarmIntervalRef.current = null; }
    activeOscillators.current.forEach(osc => { try { osc.stop(); osc.disconnect(); } catch (e) {} });
    activeOscillators.current = [];
    if (navigator.vibrate) navigator.vibrate(0);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (badgeId === SECRET_ID && password === SECRET_PASS) {
      setIsAuthenticated(true);
      localStorage.setItem('gogoma_police_auth', 'true');
      setAuthError(false);
      if ('Notification' in window) await Notification.requestPermission();
    } else {
      setAuthError(true);
      setPassword('');
    }
  };

  const updateAlertStatus = async (id: string, status: AlertStatus) => {
    try {
      await atualizarStatusEmergencia(id, status);
      if (status === AlertStatus.RESOLVED) {
        setSelectedAlert(null);
        stopSirenTotal();
      }
    } catch (err) {}
  };

  const handleGenerateProtocol = async () => {
    if (!selectedAlert) return;
    setLoadingAi(true);
    try {
      const protocol = await getPoliceProtocol(selectedAlert.type, selectedAlert.location);
      setAiProtocol(protocol);
      await adicionarConselhoIA(selectedAlert.id, protocol);
    } catch (err) { setAiProtocol("Erro IA."); } finally { setLoadingAi(false); }
  };

  const filteredAlerts = alerts
    .filter(a => activeTab === 'pending' ? a.status !== AlertStatus.RESOLVED : a.status === AlertStatus.RESOLVED)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-full bg-black items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#0d0d10] p-10 rounded-[40px] border border-white/5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>
          <Lock className="text-red-600 mx-auto mb-6" size={56} />
          <h2 className="text-xl font-black text-center mb-10 uppercase tracking-widest text-white">CENTRAL PRM</h2>
          <form onSubmit={handleLogin} className="space-y-6">
            <input type="text" placeholder="ID DO AGENTE" className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-red-600 font-black text-xs uppercase" value={badgeId} onChange={e => setBadgeId(e.target.value)} />
            <input type="password" placeholder="PALAVRA-PASSE" className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-red-600 font-black text-xs uppercase" value={password} onChange={e => setPassword(e.target.value)} />
            {authError && <div className="text-red-600 text-[10px] font-black text-center animate-pulse uppercase">ACESSO NEGADO</div>}
            <button type="submit" className="w-full bg-red-600 py-5 rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all shadow-xl">AUTENTICAR COMANDO</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-[#0a0a0c] text-white overflow-hidden relative">
      <div className={`w-full md:w-96 h-full border-r border-white/5 flex flex-col transition-all bg-[#0a0a0c] z-10 ${selectedAlert ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#0d0d10] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center"><Shield size={18} className="text-white" /></div>
            <h2 className="font-black uppercase text-[10px] tracking-widest">TERMINAL SOS</h2>
          </div>
          <button onClick={() => { setIsAuthenticated(false); localStorage.removeItem('gogoma_police_auth'); stopSirenTotal(); }} className="p-2 text-white/40 hover:text-white"><LogOut size={18} /></button>
        </div>
        
        <div className="flex border-b border-white/5 text-[10px] font-black uppercase bg-[#0d0d10] flex-shrink-0">
          <button onClick={() => setActiveTab('pending')} className={`flex-1 py-5 transition-all ${activeTab === 'pending' ? 'text-red-500 border-b-2 border-red-600 bg-red-600/5' : 'text-white/20'}`}>ATIVOS ({alerts.filter(a => a.status !== AlertStatus.RESOLVED).length})</button>
          <button onClick={() => setActiveTab('resolved')} className={`flex-1 py-5 transition-all ${activeTab === 'resolved' ? 'text-white border-b-2 border-white bg-white/5' : 'text-white/20'}`}>HISTÓRICO ({alerts.filter(a => a.status === AlertStatus.RESOLVED).length})</button>
        </div>

        {/* ÁREA DE SCROLL CORRIGIDA: min-h-0 e flex-1 garantem que o scroll funcione sem interações prévias */}
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto scroll-container custom-scrollbar pb-32">
          {filteredAlerts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-24 opacity-10">
              <Archive size={64} />
              <p className="text-[10px] font-black uppercase mt-4 tracking-widest">SEM ALERTAS</p>
            </div>
          ) : (
            filteredAlerts.map(alert => (
              <button key={alert.id} onClick={() => { setSelectedAlert(alert); setAiProtocol(alert.aiAdvice || null); }} className={`w-full p-6 border-b border-white/5 flex flex-col gap-2 text-left hover:bg-white/5 active:bg-red-600/5 transition-all outline-none flex-shrink-0 ${selectedAlert?.id === alert.id ? 'bg-white/5 border-l-4 border-l-red-600' : ''}`}>
                <div className="flex justify-between items-start">
                  <span className={`text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-tighter ${alert.status === AlertStatus.NEW ? 'bg-red-600 animate-pulse' : 'bg-white/10 text-white/40'}`}>{alert.status}</span>
                  <span className="text-[9px] font-mono text-white/30">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="font-black text-sm uppercase tracking-tight mt-1">{alert.type}</div>
                <div className="text-[10px] text-white/50 font-bold flex items-center gap-1">
                  <MapPin size={10} className="text-red-600" /> {alert.neighborhood || 'MOÇAMBIQUE'}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className={`flex-1 flex flex-col h-full overflow-hidden bg-[#0a0a0c] ${selectedAlert ? 'fixed inset-0 z-[100] md:relative md:flex' : 'hidden md:flex'}`}>
        {selectedAlert ? (
          <div className="flex flex-col h-full">
            <div className="p-4 bg-[#0d0d10] border-b border-white/10 flex items-center gap-4 flex-shrink-0 z-50">
              <button onClick={() => setSelectedAlert(null)} className="p-3 bg-white/5 rounded-2xl text-white md:hidden active:bg-red-600"><ArrowLeft size={20} /></button>
              <div className="flex-1 overflow-hidden">
                <h1 className="text-sm font-black uppercase text-red-600 truncate">{selectedAlert.type}</h1>
                <p className="text-[9px] text-white/30 font-mono">ID: {selectedAlert.id.slice(-6)}</p>
              </div>
              <button onClick={() => setSelectedAlert(null)} className="hidden md:block p-2 text-white/20 hover:text-white"><X size={24} /></button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto scroll-container custom-scrollbar p-6 md:p-12 pb-40">
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                  <div className="hidden md:block">
                    <h1 className="text-6xl font-black uppercase text-white tracking-tighter border-l-8 border-red-600 pl-6">{selectedAlert.type}</h1>
                    <p className="text-white/20 font-mono text-[10px] mt-4 uppercase tracking-[0.4em]">COMANDO CENTRAL GOGOMA</p>
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    {selectedAlert.status !== AlertStatus.RESOLVED && (
                      <>
                        <button onClick={() => updateAlertStatus(selectedAlert.id, AlertStatus.IN_PROGRESS)} className="flex-1 md:flex-none px-8 py-5 bg-blue-600 rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-3 active:scale-95 shadow-xl"><Navigation size={16} /> DESPACHAR</button>
                        <button onClick={() => updateAlertStatus(selectedAlert.id, AlertStatus.RESOLVED)} className="flex-1 md:flex-none px-8 py-5 bg-green-600 rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-3 active:scale-95 shadow-xl"><CheckCircle size={16} /> RESOLVER</button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-[#121216] p-8 rounded-[32px] border border-white/5 shadow-2xl relative">
                    <h3 className="text-[10px] font-black uppercase text-white/30 mb-6 flex items-center gap-2 border-b border-white/5 pb-4"><User size={12} /> DADOS CIDADÃO</h3>
                    <div className="text-2xl font-black mb-1">{selectedAlert.userName || "ANÔNIMO"}</div>
                    <div className="text-blue-500 font-mono text-lg flex items-center gap-2 mb-6"><Phone size={20} /> {selectedAlert.contactNumber}</div>
                    <div className="p-6 bg-black/40 rounded-2xl border border-white/5 text-sm italic text-white/80 leading-relaxed">"{selectedAlert.description || "Sem detalhes adicionais."}"</div>
                  </div>

                  <div className="bg-[#121216] p-8 rounded-[32px] border border-white/5 shadow-2xl">
                    <h3 className="text-[10px] font-black uppercase text-white/30 mb-6 flex items-center gap-2 border-b border-white/5 pb-4"><MapPin size={12} /> GPS REALTIME</h3>
                    <div className="text-xl font-black uppercase mb-1">{selectedAlert.neighborhood || "MOÇAMBIQUE"}</div>
                    <div className="text-xs text-white/50 mb-8 font-mono">{selectedAlert.manualAddress}</div>
                    {selectedAlert.location?.lat && (
                      <a href={`https://www.google.com/maps?q=${selectedAlert.location.lat},${selectedAlert.location.lng}`} target="_blank" rel="noreferrer" className="w-full flex items-center justify-center gap-3 py-6 bg-blue-600/10 rounded-2xl text-blue-400 text-[10px] font-black border border-blue-500/20 active:bg-blue-600/30 uppercase tracking-widest shadow-xl transition-all">
                        <Map size={20} /> VER NO GOOGLE MAPS
                      </a>
                    )}
                  </div>
                </div>

                <div className="bg-blue-600/5 border border-blue-500/20 rounded-[40px] p-8 md:p-12 space-y-8 shadow-2xl">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <BrainCircuit size={32} className="text-blue-500" />
                      <div>
                        <h3 className="font-black uppercase text-blue-500 tracking-[0.3em] text-sm">IA GEMINI OPERACIONAL</h3>
                        <p className="text-[9px] text-blue-400/40 uppercase font-bold tracking-tighter">ANÁLISE DE CAMPO MOÇAMBIQUE</p>
                      </div>
                    </div>
                    <button onClick={handleGenerateProtocol} disabled={loadingAi} className="w-full md:w-auto px-10 py-5 bg-blue-600 rounded-2xl text-[10px] font-black uppercase shadow-xl hover:bg-blue-500 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                      {loadingAi ? <RefreshCcw size={18} className="animate-spin" /> : <Shield size={18} />}
                      {loadingAi ? 'ANALISANDO...' : 'SOLICITAR TÁTICA IA'}
                    </button>
                  </div>
                  <div className="bg-black/60 p-8 rounded-[32px] border border-white/5 text-blue-100 text-sm md:text-base leading-relaxed whitespace-pre-wrap font-medium border-l-4 border-l-blue-600">
                    {aiProtocol || "O sistema aguarda comando para analisar riscos e sugerir procedimentos."}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-5 select-none p-12 text-center">
            <Shield size={200} />
            <p className="font-black uppercase text-[10px] mt-8 tracking-[1em]">CENTRAL DE COMANDO GOGOMA</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PoliceDashboard;