import React, { useState, useEffect, useRef } from 'react';
import { EmergencyAlert, AlertStatus, EmergencyType } from '../types';
import { getPoliceProtocol } from '../services/geminiService';
import { Bell, Map, Phone, Navigation, Radio, BrainCircuit, Lock, CheckCircle, FileText, LogOut, Vibrate } from 'lucide-react';

interface PoliceDashboardProps {
  alerts: EmergencyAlert[];
  updateAlertStatus: (id: string, status: AlertStatus) => void;
}

const PoliceDashboard: React.FC<PoliceDashboardProps> = ({ alerts, updateAlertStatus }) => {
  // Auth State - Initialize from localStorage to persist login
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('gogoma_police_auth') === 'true';
  });
  
  const [badgeId, setBadgeId] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(false);

  const [selectedAlert, setSelectedAlert] = useState<EmergencyAlert | null>(null);
  const [aiProtocol, setAiProtocol] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  
  // Sort alerts: Newest first, putting NEW status at the top
  const sortedAlerts = [...alerts].sort((a, b) => {
    if (a.status === AlertStatus.NEW && b.status !== AlertStatus.NEW) return -1;
    if (a.status !== AlertStatus.NEW && b.status === AlertStatus.NEW) return 1;
    return b.timestamp - a.timestamp;
  });

  const activeAlertsCount = alerts.filter(a => a.status === AlertStatus.NEW).length;
  
  // Audio Ref
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Play alarm sound when there are NEW alerts
  useEffect(() => {
    if (isAuthenticated && activeAlertsCount > 0) {
      playAlarm();
    }
  }, [activeAlertsCount, isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // HARDCODED CREDENTIALS as per requirement
    if (badgeId === '8866' && password === '1234') {
        setIsAuthenticated(true);
        localStorage.setItem('gogoma_police_auth', 'true'); // Persist login
        setAuthError(false);
    } else {
        setAuthError(true);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('gogoma_police_auth');
    setSelectedAlert(null);
    setBadgeId('');
    setPassword('');
  };

  const playAlarm = () => {
    // 1. Vibration (Android/Mobile)
    // Pattern: Vibrate 500ms, Pause 200ms, Vibrate 500ms, Pause 200ms, Vibrate 1000ms
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([500, 200, 500, 200, 1000]);
    }

    // 2. Audio Alarm
    // Simple oscillator alarm for browser compatibility without external files
    try {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        if(ctx.state === 'suspended') ctx.resume();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.1);
        osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.2);
        
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.error("Audio play failed (interaction required)", e);
    }
  };

  const handleSelectAlert = (alert: EmergencyAlert) => {
    setSelectedAlert(alert);
    setAiProtocol(null); // Reset AI advice
  };

  const handleGenerateProtocol = async () => {
    if (!selectedAlert) return;
    setLoadingAi(true);
    const advice = await getPoliceProtocol(selectedAlert.type, selectedAlert.location);
    setAiProtocol(advice);
    setLoadingAi(false);
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  };

  const getElapsedTime = (ts: number) => {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Agora';
    return `${minutes} min atrás`;
  };

  // --- AUTH SCREEN ---
  if (!isAuthenticated) {
    return (
        <div className="flex flex-col h-full bg-gray-900 items-center justify-center p-6 text-white">
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700">
                <div className="flex justify-center mb-6 text-blue-500">
                    <Lock size={48} />
                </div>
                <h2 className="text-2xl font-bold text-center mb-1">Acesso Restrito</h2>
                <p className="text-gray-400 text-center mb-6 text-sm">Portal de Resposta a Emergências</p>
                
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ID Agente (Badge)</label>
                        <input 
                            type="text" 
                            className="w-full bg-gray-900 border border-gray-600 rounded p-3 text-white focus:border-blue-500 focus:outline-none"
                            value={badgeId}
                            onChange={(e) => setBadgeId(e.target.value)}
                            placeholder="Ex: 8866"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Senha</label>
                        <input 
                            type="password" 
                            className="w-full bg-gray-900 border border-gray-600 rounded p-3 text-white focus:border-blue-500 focus:outline-none"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    {authError && <p className="text-red-500 text-sm font-bold bg-red-900/20 p-2 rounded text-center">Credenciais inválidas.</p>}
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded transition-colors">
                        ENTRAR NO SISTEMA
                    </button>
                </form>
            </div>
        </div>
    )
  }

  // --- DASHBOARD UI ---
  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 font-sans">
      {/* Top Bar */}
      <div className={`p-4 flex justify-between items-center ${activeAlertsCount > 0 ? 'bg-red-900 animate-pulse' : 'bg-slate-800'}`}>
        <div className="flex items-center gap-3">
            <Radio className={activeAlertsCount > 0 ? 'animate-ping' : ''} />
            <h1 className="text-xl font-bold tracking-wider">POSTO POLICIAL #04</h1>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
                <div className="text-xs text-gray-400">AGENTE (8866)</div>
                <div className="font-bold text-sm text-green-400">ONLINE</div>
            </div>
            
            <button 
                onClick={handleLogout}
                className="bg-gray-700 hover:bg-gray-600 p-2 rounded text-gray-300"
                title="Sair / Bloquear"
            >
                <LogOut size={18} />
            </button>

            <div className="flex items-center gap-2 bg-gray-900 px-3 py-1 rounded border border-gray-700">
                <Bell size={20} className={activeAlertsCount > 0 ? 'text-yellow-400' : 'text-gray-500'} />
                <span className="font-mono text-xl">{activeAlertsCount} NOVOS</span>
            </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        
        {/* List Column */}
        <div className={`${selectedAlert ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-2/5 border-r border-gray-700 bg-gray-800`}>
          <div className="p-3 bg-gray-700 text-xs font-bold uppercase text-gray-400 flex justify-between">
            <span>Alertas Recentes</span>
            <span>Status</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sortedAlerts.length === 0 ? (
                <div className="p-8 text-center text-gray-500">Sem alertas ativos.</div>
            ) : (
                sortedAlerts.map(alert => (
                    <div 
                        key={alert.id}
                        onClick={() => handleSelectAlert(alert)}
                        className={`p-4 border-b border-gray-700 cursor-pointer active:bg-gray-600 transition-colors ${selectedAlert?.id === alert.id ? 'bg-gray-700' : ''}`}
                    >
                        <div className="flex justify-between mb-1">
                            <span className={`font-bold ${alert.type === EmergencyType.POLICE_CIVIL ? 'text-blue-400' : alert.type === EmergencyType.POLICE_TRAFFIC ? 'text-orange-400' : 'text-teal-400'}`}>
                                {alert.type}
                            </span>
                            <span className="font-mono text-gray-300">{formatTime(alert.timestamp)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                             <span className="text-sm text-gray-400 truncate flex items-center gap-1">
                                <Phone size={12} /> {alert.contactNumber}
                             </span>
                             <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                 alert.status === AlertStatus.NEW ? 'bg-red-600 text-white' : 
                                 alert.status === AlertStatus.IN_PROGRESS ? 'bg-yellow-600 text-white' : 'bg-green-700 text-gray-200'
                             }`}>
                                {alert.status}
                             </span>
                        </div>
                    </div>
                ))
            )}
          </div>
        </div>

        {/* Detail View */}
        {selectedAlert ? (
            <div className="flex-1 flex flex-col bg-gray-900 overflow-y-auto">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800 md:hidden">
                    <button onClick={() => setSelectedAlert(null)} className="text-sm text-gray-300 underline">Voltar</button>
                    <span className="font-bold">Detalhe do Alerta</span>
                </div>

                <div className="p-6">
                    {/* Key Info Cards */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-800 p-4 rounded-lg border-l-4 border-blue-500">
                            <label className="text-xs text-gray-400 uppercase">Cidadão (Contato)</label>
                            <div className="text-xl font-mono text-white mt-1 flex items-center gap-2">
                                <Phone size={20} className="text-green-500" />
                                <a href={`tel:${selectedAlert.contactNumber}`} className="underline decoration-dotted">
                                    {selectedAlert.contactNumber}
                                </a>
                            </div>
                        </div>
                        <div className="bg-slate-800 p-4 rounded-lg border-l-4 border-yellow-500">
                             <label className="text-xs text-gray-400 uppercase">Tempo Decorrido</label>
                             <div className="text-2xl font-bold text-white mt-1">
                                 {getElapsedTime(selectedAlert.timestamp)}
                             </div>
                        </div>
                    </div>

                    {/* Description Area */}
                    <div className="mb-6 bg-slate-800 p-4 rounded-lg border border-slate-700">
                        <label className="text-xs text-gray-400 uppercase font-bold flex items-center gap-2 mb-2">
                            <FileText size={14} /> Descrição da Ocorrência
                        </label>
                        <div className={`text-lg p-2 rounded ${selectedAlert.description ? 'text-white' : 'text-gray-500 italic'}`}>
                            {selectedAlert.description || "Nenhuma descrição fornecida pelo cidadão."}
                        </div>
                    </div>

                     {/* Coordinates */}
                     <div className="bg-slate-800 p-3 rounded mb-4 flex justify-between items-center">
                        <span className="text-sm text-gray-400">GPS:</span>
                        <span className="font-mono text-yellow-500">{selectedAlert.location.lat}, {selectedAlert.location.lng}</span>
                     </div>

                    {/* Map Action */}
                    <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${selectedAlert.location.lat},${selectedAlert.location.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 mb-6 shadow-lg transition-transform active:scale-95"
                    >
                        <Map size={24} />
                        ABRIR LOCALIZAÇÃO (MAPS)
                    </a>

                    {/* Status Actions */}
                    <div className="mb-8">
                        <h3 className="text-gray-400 uppercase text-xs font-bold mb-3">Ações de Resposta</h3>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => updateAlertStatus(selectedAlert.id, AlertStatus.IN_PROGRESS)}
                                className={`flex-1 py-3 rounded-lg font-bold border-2 ${selectedAlert.status === AlertStatus.IN_PROGRESS ? 'bg-yellow-600 border-yellow-500 text-white' : 'border-yellow-600 text-yellow-500'}`}
                            >
                                <Navigation className="mx-auto mb-1" size={20} />
                                EM TRÂNSITO
                            </button>
                            <button 
                                onClick={() => updateAlertStatus(selectedAlert.id, AlertStatus.RESOLVED)}
                                className={`flex-1 py-3 rounded-lg font-bold border-2 ${selectedAlert.status === AlertStatus.RESOLVED ? 'bg-green-700 border-green-600 text-white' : 'border-green-700 text-green-600'}`}
                            >
                                <CheckCircle className="mx-auto mb-1" size={20} />
                                RESOLVIDO
                            </button>
                        </div>
                    </div>

                    {/* Gemini Integration */}
                    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-blue-300 font-bold flex items-center gap-2">
                                <BrainCircuit size={18} />
                                IA Tática (Gemini)
                            </h3>
                            {!aiProtocol && (
                                <button 
                                    onClick={handleGenerateProtocol}
                                    disabled={loadingAi}
                                    className="text-xs bg-blue-600 px-3 py-1 rounded text-white disabled:opacity-50"
                                >
                                    {loadingAi ? 'Gerando...' : 'Gerar Protocolo'}
                                </button>
                            )}
                        </div>
                        
                        {loadingAi && <div className="text-sm text-gray-400 animate-pulse">Consultando base de dados tática...</div>}
                        
                        {aiProtocol && (
                            <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-line bg-slate-900 p-3 rounded">
                                {aiProtocol}
                            </div>
                        )}
                         {!aiProtocol && !loadingAi && (
                             <p className="text-xs text-gray-500">Toque para receber sugestões de procedimentos baseados no tipo de emergência.</p>
                         )}
                    </div>

                </div>
            </div>
        ) : (
            <div className="hidden md:flex flex-1 items-center justify-center text-gray-600">
                Selecione um alerta para ver detalhes
            </div>
        )}

      </div>
    </div>
  );
};

export default PoliceDashboard;