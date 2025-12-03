import React, { useState, useEffect, useRef, useMemo } from 'react';
import { EmergencyAlert, AlertStatus, EmergencyType } from '../types';
import { getPoliceProtocol } from '../services/geminiService';
import { atualizarStatusEmergencia, solicitarPermissaoNotificacao, onMessageListener, enviarNotificacaoPushParaTodos } from '../services/firebaseService'; // Importar serviço FCM
import { Bell, Map, Phone, Navigation, BrainCircuit, Lock, CheckCircle, FileText, LogOut, Wifi, WifiOff, Archive, AlertCircle, Clock, ArrowDownCircle, MapPin, User, Calendar, MapPinOff, Activity, BarChart3, MapPinned } from 'lucide-react';

interface PoliceDashboardProps {
  alerts: EmergencyAlert[];
  isOnline: boolean;
}

const PoliceDashboard: React.FC<PoliceDashboardProps> = ({ alerts, isOnline }) => {
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
  
  // Tabs State: 'pending' (Ativos/Não Resolvidos) or 'resolved' (Resolvidos)
  const [activeTab, setActiveTab] = useState<'pending' | 'resolved'>('pending');

  // --- PAGINAÇÃO DINÂMICA ---
  const [visibleCount, setVisibleCount] = useState(20); // Carregar 20 por vez
  const listRef = useRef<HTMLDivElement>(null);

  // Audio & Alarm State
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeOscillatorRef = useRef<OscillatorNode | null>(null);
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPushTimeRef = useRef<number>(0); // Controla debounce de push repetido
  const [isAlarmRinging, setIsAlarmRinging] = useState(false); // Para o alerta visual (tela piscando)

  // Resetar contagem ao trocar de aba (Lógica de refresh)
  useEffect(() => {
    setVisibleCount(20);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [activeTab]);

  // Lógica de Scroll Infinito
  const handleScroll = () => {
    if (listRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = listRef.current;
      // Carregar mais quando estiver perto do fim (50px de margem)
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        setVisibleCount(prev => prev + 20);
      }
    }
  };

  // Estatísticas de 24 Horas (Dinâmico)
  const stats24h = useMemo(() => {
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    
    // Filtrar alertas válidos das últimas 24h
    const recentAlerts = alerts.filter(a => a.timestamp && a.timestamp > twentyFourHoursAgo);

    return {
        total: recentAlerts.length,
        pending: recentAlerts.filter(a => a.status !== AlertStatus.RESOLVED).length,
        resolved: recentAlerts.filter(a => a.status === AlertStatus.RESOLVED).length
    };
  }, [alerts]);

  // Inicializar Listener de Notificações quando autenticado
  useEffect(() => {
    if (isAuthenticated) {
        onMessageListener()
            .then((payload: any) => {
                if (payload) {
                    console.log("Notificação recebida em foreground:", payload);
                    // Opcional: Mostrar toast ou alerta visual extra
                }
            })
            .catch(err => console.log('failed: ', err));
    }
  }, [isAuthenticated]);
  
  // Validação rigorosa de dados
  const isValidAlert = (alert: EmergencyAlert) => {
    return (
        alert.contactNumber && 
        alert.contactNumber.length > 5 &&
        alert.timestamp > 1700000000000
    );
  };

  // Processamento da Lista
  const processedAlerts = alerts
    .filter(isValidAlert)
    .filter(alert => {
        if (activeTab === 'pending') {
            return alert.status !== AlertStatus.RESOLVED;
        } else {
            return alert.status === AlertStatus.RESOLVED;
        }
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  const visibleAlerts = processedAlerts.slice(0, visibleCount);
  const hasMore = visibleCount < processedAlerts.length;

  // --- LÓGICA DE ALARME E NOTIFICAÇÃO INTELIGENTE ---
  const checkCriticalAlerts = () => {
      const now = Date.now();
      const hasNew = alerts.some(a => a.status === AlertStatus.NEW);
      
      // 8) Regra de 1 Hora: Alerta não atendido > 1h
      const longUnresolvedAlerts = alerts.filter(a => 
          a.status !== AlertStatus.RESOLVED && (now - a.timestamp > 3600000)
      );
      const hasLongUnresolved = longUnresolvedAlerts.length > 0;

      // Retorna true se precisar tocar alarme
      if (hasNew || hasLongUnresolved) {
          
          // Lógica extra para REENVIAR PUSH se passar de 1h
          // Usamos um debounce de 5 minutos para não floodar o Firebase se a aba estiver aberta
          if (hasLongUnresolved && (now - lastPushTimeRef.current > 300000)) {
              console.log("⚠️ Alerta pendente > 1h detectado. Reenviando Push...");
              enviarNotificacaoPushParaTodos(
                  "⏳ Alerta Crítico Pendente",
                  "Existe um pedido de socorro sem resposta há mais de 1 hora!"
              );
              lastPushTimeRef.current = now;
          }
          
          return true;
      }
      return false;
  };

  useEffect(() => {
    // 7) O alarme não toca se não houver pedidos ativos (checkCriticalAlerts valida isso)
    const shouldRing = checkCriticalAlerts();

    if (isAuthenticated && shouldRing) {
        if (!alarmIntervalRef.current) {
            console.log("🚨 ALARME DISPARADO");
            
            triggerSirenSequence(); 
            
            // Repetir a cada 40s (10s som + 30s silencio)
            alarmIntervalRef.current = setInterval(() => {
                if (checkCriticalAlerts()) {
                    triggerSirenSequence();
                } else {
                    stopAlarm();
                }
            }, 40000); 
        }
    } else {
        stopAlarm();
    }

    return () => {
        if (!isAuthenticated) stopAlarm();
    };
  }, [alerts, isAuthenticated]);

  const stopAlarm = () => {
    if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
    }
    stopSirenSound();
    setIsAlarmRinging(false);
  };

  const stopSirenSound = () => {
    if (activeOscillatorRef.current) {
        try {
            activeOscillatorRef.current.stop();
            activeOscillatorRef.current.disconnect();
        } catch (e) { /* ignore */ }
        activeOscillatorRef.current = null;
    }
  };

  const triggerSirenSequence = () => {
    setIsAlarmRinging(true);
    triggerSirenSound();
    
    setTimeout(() => {
        stopSirenSound();
        setIsAlarmRinging(false);
    }, 10000);
  };

  const triggerSirenSound = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([1000, 500, 1000, 500, 1000, 500, 2000]);
    }

    try {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        stopSirenSound();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        const duration = 10;

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);

        for (let i = 0; i < duration; i++) {
            osc.frequency.linearRampToValueAtTime(1500, now + i + 0.5);
            osc.frequency.linearRampToValueAtTime(600, now + i + 1.0);
        }

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.5);
        gain.gain.setValueAtTime(0.5, now + duration - 0.5);
        gain.gain.linearRampToValueAtTime(0, now + duration);

        osc.start(now);
        osc.stop(now + duration);

        activeOscillatorRef.current = osc;
        osc.onended = () => {
            if (activeOscillatorRef.current === osc) {
                activeOscillatorRef.current = null;
            }
        };

    } catch (e) {
        console.error("Audio error", e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (badgeId === '8866' && password === '1234') {
        setIsAuthenticated(true);
        localStorage.setItem('gogoma_police_auth', 'true');
        setAuthError(false);
        if (!audioCtxRef.current) {
             audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        // 2) e 3) Obter Token e salvar em policias/{ID}/token
        await solicitarPermissaoNotificacao(badgeId);
    } else {
        setAuthError(true);
    }
  };

  const handleLogout = () => {
    stopAlarm();
    setIsAuthenticated(false);
    localStorage.removeItem('gogoma_police_auth');
    setSelectedAlert(null);
    setBadgeId('');
    setPassword('');
  };

  const updateAlertStatus = async (id: string, status: AlertStatus) => {
      await atualizarStatusEmergencia(id, status);
      if (status === AlertStatus.RESOLVED && activeTab === 'pending') {
         if (selectedAlert?.id === id) setSelectedAlert(null);
      }
  };

  const handleSelectAlert = (alert: EmergencyAlert) => {
    setSelectedAlert(alert);
    setAiProtocol(null); 
  };

  const handleGenerateProtocol = async () => {
    if (!selectedAlert || !isOnline) return;
    setLoadingAi(true);
    const loc = (selectedAlert.location && selectedAlert.location.lat) 
        ? selectedAlert.location 
        : { lat: 0, lng: 0 }; 
    
    const advice = await getPoliceProtocol(selectedAlert.type, loc);
    setAiProtocol(advice);
    setLoadingAi(false);
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  };

  const formatFullDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getElapsedTime = (ts: number) => {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Agora';
    if (minutes > 60) return `${Math.floor(minutes/60)}h ${minutes%60}m atrás`;
    return `${minutes} min atrás`;
  };

  const handleRefresh = () => {
      setVisibleCount(20);
      if (listRef.current) listRef.current.scrollTop = 0;
  };

  // --- AUTH SCREEN ---
  if (!isAuthenticated) {
    return (
        <div className="flex flex-col h-full bg-slate-950 items-center justify-center p-6 text-white">
            <div className="bg-slate-900 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-800 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-purple-600"></div>
                <div className="flex justify-center mb-6 text-blue-500">
                    <div className="p-4 bg-slate-800 rounded-full">
                        <Lock size={40} />
                    </div>
                </div>
                <h2 className="text-xl font-bold text-center mb-1 tracking-wide">ACESSO RESTRITO</h2>
                <p className="text-slate-500 text-center mb-8 text-xs uppercase tracking-widest">Portal Tático GOGOMA</p>
                
                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">ID Agente</label>
                        <input 
                            type="password" 
                            className="w-full bg-slate-800 border-2 border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-600 font-bold text-center tracking-[0.5em]"
                            value={badgeId}
                            onChange={(e) => setBadgeId(e.target.value)}
                            autoComplete="off"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">Senha de Acesso</label>
                        <input 
                            type="password" 
                            className="w-full bg-slate-800 border-2 border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none transition-all font-bold text-center tracking-[0.5em]"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    {authError && <p className="text-red-400 text-xs font-bold text-center animate-pulse">Acesso Negado. Verifique credenciais.</p>}
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-lg transition-colors uppercase text-sm tracking-widest shadow-lg mt-2">
                        Autenticar
                    </button>
                </form>
            </div>
            <div className="mt-8 text-[10px] text-slate-600 font-mono">
                SISTEMA DE SEGURANÇA 1.0.4
            </div>
        </div>
    )
  }

  // --- DASHBOARD UI ---
  return (
    <div className={`flex flex-col h-full bg-slate-900 text-gray-100 font-sans relative ${isAlarmRinging ? 'animate-pulse bg-red-950/50' : ''}`}>
      
      {/* Visual Alarm Overlay */}
      {isAlarmRinging && (
        <div className="absolute inset-0 z-0 bg-red-600/10 pointer-events-none animate-pulse"></div>
      )}

      {/* Top Bar */}
      <div className={`p-3 md:p-4 flex justify-between items-center shadow-lg z-10 ${isAlarmRinging ? 'bg-red-900 animate-pulse border-b-4 border-red-500' : 'bg-slate-800'}`}>
        <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isAlarmRinging ? 'bg-white text-red-600 animate-ping' : 'bg-slate-700 text-slate-400'}`}>
                <AlertCircle size={20} />
            </div>
            <div>
                <h1 className="text-sm md:text-lg font-black tracking-widest uppercase text-white">
                    {isAlarmRinging ? '🚨 EMERGÊNCIA ATIVA' : 'Comando #04'}
                </h1>
                <p className="text-[10px] text-slate-300 font-mono hidden md:block">MONITORAMENTO EM TEMPO REAL</p>
            </div>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
                <div className={`font-bold text-xs flex items-center gap-1 justify-end ${isOnline ? 'text-green-400' : 'text-red-500'}`}>
                    {isOnline ? (
                      <> <Wifi size={12} /> CONECTADO </>
                    ) : (
                      <> <WifiOff size={12} /> OFFLINE </>
                    )}
                </div>
            </div>
            
            <button 
                onClick={handleLogout}
                className="bg-slate-700 hover:bg-red-900 p-2 rounded text-slate-300 hover:text-white transition-colors z-20"
                title="Sair / Bloquear"
            >
                <LogOut size={18} />
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row z-10">
        
        {/* List Column */}
        <div className={`${selectedAlert ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-2/5 border-r border-slate-700 bg-slate-800`}>
          
          {/* Botão de Refresh Manual */}
          <div className="bg-slate-800 p-2 border-b border-slate-700 flex justify-center">
               <button 
                onClick={handleRefresh}
                className="w-full py-2 bg-slate-700/50 hover:bg-slate-700 rounded text-xs text-slate-400 hover:text-white font-bold uppercase tracking-wider transition-colors"
               >
                   Atualizar Lista
               </button>
          </div>

          {/* Tabs Header */}
          <div className="flex border-b border-slate-700 bg-slate-800 sticky top-0 z-10">
              <button 
                onClick={() => setActiveTab('pending')}
                className={`flex-1 py-4 text-[10px] sm:text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    activeTab === 'pending' 
                    ? 'border-b-4 border-blue-500 text-white bg-slate-700' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Bell size={14} /> 
                EM ANDAMENTO
              </button>
              <button 
                onClick={() => setActiveTab('resolved')}
                className={`flex-1 py-4 text-[10px] sm:text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    activeTab === 'resolved' 
                    ? 'border-b-4 border-green-500 text-white bg-slate-700' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Archive size={14} /> 
                RESOLVIDOS
              </button>
          </div>

          {/* ESTATÍSTICAS DE 24H (NOVO) */}
          <div className="bg-slate-900/50 p-2 border-b border-slate-700 flex justify-around items-center text-[10px] text-slate-400 font-mono shadow-inner">
                <div className="flex items-center gap-1" title="Total nas últimas 24h">
                    <Activity size={12} className="text-blue-500"/>
                    <span>24H: <b className="text-white text-sm">{stats24h.total}</b></span>
                </div>
                <div className="h-4 w-px bg-slate-700"></div>
                <div className="flex items-center gap-1" title="Pendentes nas últimas 24h">
                    <AlertCircle size={12} className="text-yellow-500"/>
                    <span>PEND: <b className="text-white text-sm">{stats24h.pending}</b></span>
                </div>
                <div className="h-4 w-px bg-slate-700"></div>
                <div className="flex items-center gap-1" title="Resolvidos nas últimas 24h">
                    <CheckCircle size={12} className="text-green-500"/>
                    <span>RES: <b className="text-white text-sm">{stats24h.resolved}</b></span>
                </div>
          </div>

          {/* Infinite Scroll List */}
          <div 
            ref={listRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 pb-20 touch-pan-y overscroll-contain"
          >
            {processedAlerts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center opacity-50">
                    <div className="mb-4 bg-slate-700 p-4 rounded-full">
                        <CheckCircle size={32} />
                    </div>
                    <p className="text-sm font-bold uppercase">Lista Vazia</p>
                    <p className="text-xs">Nenhuma ocorrência nesta categoria.</p>
                </div>
            ) : (
                <>
                {visibleAlerts.map(alert => (
                    <div 
                        key={alert.id}
                        onClick={() => handleSelectAlert(alert)}
                        className={`
                            p-4 border-b border-slate-700 cursor-pointer transition-colors relative group
                            ${selectedAlert?.id === alert.id ? 'bg-slate-700' : 'hover:bg-slate-700/50'}
                            ${alert.status === AlertStatus.NEW ? 'bg-red-900/10' : ''}
                        `}
                    >
                        {/* Indicador de Novo */}
                        {alert.status === AlertStatus.NEW && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600 animate-pulse"></div>
                        )}
                        
                        {/* Linha 1: Tipo e Status */}
                        <div className="flex justify-between items-start mb-2">
                            <span className={`text-xs font-black uppercase tracking-tight px-2 py-0.5 rounded ${
                                alert.type === EmergencyType.POLICE_CIVIL ? 'bg-blue-900/30 text-blue-400' : 
                                alert.type === EmergencyType.POLICE_TRAFFIC ? 'bg-orange-900/30 text-orange-400' : 
                                alert.type === EmergencyType.DISASTER ? 'bg-teal-900/30 text-teal-400' : 'bg-gray-800 text-gray-400'
                            }`}>
                                {alert.type}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                 alert.status === AlertStatus.NEW ? 'text-red-500 animate-pulse' : 
                                 alert.status === AlertStatus.IN_PROGRESS ? 'text-yellow-500' : 'text-slate-500'
                             }`}>
                                {alert.status === AlertStatus.NEW ? '● NOVO' : alert.status}
                             </span>
                        </div>
                        
                        {/* Linha 2: Nome do Usuário (Telefone) */}
                        <div className="flex items-center gap-2 mb-1 text-slate-200">
                             <User size={14} className="text-slate-500" />
                             <span className="font-mono text-sm font-bold">{alert.contactNumber}</span>
                        </div>

                        {/* Linha 3: Hora */}
                        <div className="flex items-center gap-2 mb-1 text-slate-400">
                             <Clock size={14} className="text-slate-500" />
                             <span className="text-xs">{formatFullDate(alert.timestamp)}</span>
                        </div>

                        {/* Linha 4: Localização ou Endereço Manual */}
                        <div className="flex items-center gap-2 text-slate-400">
                             <MapPin size={14} className={alert.location?.lat ? "text-green-500" : "text-slate-500"} />
                             <span className="text-xs truncate">
                                {alert.manualAddress 
                                    ? alert.manualAddress 
                                    : alert.location?.lat 
                                        ? `${alert.location.lat.toFixed(4)}, ${alert.location.lng?.toFixed(4)}`
                                        : 'Sem localização'}
                             </span>
                        </div>

                        {/* Botões de Ação na Lista */}
                        {activeTab === 'pending' && (
                            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-700/50">
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        updateAlertStatus(alert.id, AlertStatus.IN_PROGRESS);
                                    }}
                                    disabled={alert.status === AlertStatus.IN_PROGRESS}
                                    className={`py-2 text-[10px] font-bold uppercase rounded flex items-center justify-center gap-1 transition-colors ${
                                        alert.status === AlertStatus.IN_PROGRESS 
                                        ? 'bg-yellow-900/20 text-yellow-600 cursor-not-allowed' 
                                        : 'bg-slate-700 text-slate-300 hover:bg-yellow-600 hover:text-white'
                                    }`}
                                >
                                    EM ANDAMENTO
                                </button>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        updateAlertStatus(alert.id, AlertStatus.RESOLVED);
                                    }}
                                    className="py-2 text-[10px] font-bold uppercase rounded flex items-center justify-center gap-1 transition-colors bg-slate-700 text-slate-300 hover:bg-green-600 hover:text-white"
                                >
                                    RESOLVIDO
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                
                {hasMore && (
                    <div className="p-4 text-center text-slate-500 text-xs animate-pulse bg-slate-800/50 mt-2">
                        <ArrowDownCircle size={16} className="mx-auto mb-1" />
                        Carregando mais pedidos...
                    </div>
                )}
                </>
            )}
          </div>
        </div>

        {/* Detail View */}
        {selectedAlert ? (
            <div className="flex-1 flex flex-col bg-slate-900 overflow-y-auto">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 md:hidden sticky top-0 z-20 shadow-md">
                    <button onClick={() => setSelectedAlert(null)} className="text-sm text-slate-300 font-bold flex items-center gap-1">
                        ← Voltar
                    </button>
                    <span className="font-bold text-sm uppercase text-slate-400">Detalhe</span>
                </div>

                <div className="p-6 md:p-8 max-w-4xl mx-auto w-full">
                    {/* Status Header */}
                    <div className="flex items-center gap-3 mb-6">
                        <span className={`text-xl md:text-3xl font-black uppercase ${
                            selectedAlert.type === EmergencyType.POLICE_CIVIL ? 'text-blue-500' : 
                            selectedAlert.type === EmergencyType.POLICE_TRAFFIC ? 'text-orange-500' : 
                            selectedAlert.type === EmergencyType.DISASTER ? 'text-teal-500' : 'text-gray-400'
                        }`}>
                            {selectedAlert.type}
                        </span>
                        <div className="flex-1 h-px bg-slate-700"></div>
                        <span className="font-mono text-slate-500 text-xs md:text-sm">{formatTime(selectedAlert.timestamp)}</span>
                    </div>

                    {/* Key Info Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-800 p-5 rounded-lg border-l-4 border-blue-500 shadow-lg">
                            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Contacto do Cidadão</label>
                            <div className="text-2xl font-mono text-white mt-1 flex items-center gap-3">
                                <Phone size={24} className="text-green-500" />
                                <a href={`tel:${selectedAlert.contactNumber}`} className="hover:text-green-400 transition-colors">
                                    {selectedAlert.contactNumber}
                                </a>
                            </div>
                        </div>
                        <div className="bg-slate-800 p-5 rounded-lg border-l-4 border-yellow-500 shadow-lg">
                             <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Tempo Decorrido</label>
                             <div className="text-2xl font-bold text-white mt-1">
                                 {getElapsedTime(selectedAlert.timestamp)}
                             </div>
                        </div>
                    </div>

                    {/* Address / Manual Location */}
                    {selectedAlert.manualAddress && (
                        <div className="mb-6 bg-slate-800 p-5 rounded-lg border border-slate-700">
                             <label className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-2 mb-3 tracking-wider">
                                <MapPinned size={14} /> Endereço Informado
                            </label>
                            <div className="text-xl text-white font-bold leading-relaxed">
                                {selectedAlert.manualAddress}
                            </div>
                        </div>
                    )}

                    {/* Description Area */}
                    <div className="mb-6 bg-slate-800 p-5 rounded-lg border border-slate-700">
                        <label className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-2 mb-3 tracking-wider">
                            <FileText size={14} /> Relato do Incidente
                        </label>
                        <div className={`text-lg leading-relaxed p-2 ${selectedAlert.description ? 'text-slate-200' : 'text-slate-500 italic'}`}>
                            {selectedAlert.description || "Nenhuma descrição fornecida."}
                        </div>
                    </div>

                    {/* GPS & Map */}
                    <div className="mb-8">
                        <div className="bg-slate-800/50 p-2 rounded mb-2 flex justify-between items-center text-xs font-mono text-slate-400">
                           {selectedAlert.location && selectedAlert.location.lat ? (
                               <span>COORDS: {selectedAlert.location.lat.toFixed(6)}, {selectedAlert.location.lng?.toFixed(6)}</span>
                           ) : (
                               <span className="text-red-400">GPS: DADOS NÃO DISPONÍVEIS</span>
                           )}
                        </div>
                        
                        {selectedAlert.location && selectedAlert.location.lat ? (
                            <a 
                                href={`https://www.google.com/maps/search/?api=1&query=${selectedAlert.location.lat},${selectedAlert.location.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-5 rounded-xl flex items-center justify-center gap-3 shadow-lg transition-all hover:shadow-green-900/20 active:scale-95 text-lg"
                            >
                                <Map size={24} />
                                ABRIR NO GOOGLE MAPS
                            </a>
                        ) : (
                            <div className="w-full bg-slate-700 text-slate-400 font-bold py-5 rounded-xl flex items-center justify-center gap-3 cursor-not-allowed opacity-75">
                                <MapPinOff size={24} />
                                LOCALIZAÇÃO GPS NÃO ENVIADA
                            </div>
                        )}
                    </div>

                    {/* Botões de Ação Grandes (Detalhe) */}
                    {selectedAlert.status !== AlertStatus.RESOLVED && (
                        <div className="mb-8">
                            <h3 className="text-slate-500 uppercase text-[10px] font-bold mb-3 tracking-widest">Ações do Operador</h3>
                            <div className="flex gap-4">
                                <button 
                                    onClick={() => updateAlertStatus(selectedAlert.id, AlertStatus.IN_PROGRESS)}
                                    className={`flex-1 py-4 rounded-lg font-bold border-2 transition-all ${
                                        selectedAlert.status === AlertStatus.IN_PROGRESS 
                                        ? 'bg-yellow-600 border-yellow-500 text-white opacity-50 cursor-not-allowed' 
                                        : 'border-yellow-600/50 text-yellow-500 hover:bg-yellow-600/10'
                                    }`}
                                    disabled={selectedAlert.status === AlertStatus.IN_PROGRESS}
                                >
                                    <Navigation className="mx-auto mb-2" size={24} />
                                    EM ANDAMENTO
                                </button>
                                <button 
                                    onClick={() => updateAlertStatus(selectedAlert.id, AlertStatus.RESOLVED)}
                                    className="flex-1 py-4 rounded-lg font-bold border-2 border-green-600/50 text-green-500 hover:bg-green-600 hover:text-white transition-all"
                                >
                                    <CheckCircle className="mx-auto mb-2" size={24} />
                                    MARCAR RESOLVIDO
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Gemini Integration */}
                    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-blue-400 font-bold flex items-center gap-2 text-sm uppercase tracking-wide">
                                <BrainCircuit size={18} />
                                Assistente Tático (IA)
                            </h3>
                            {!aiProtocol && isOnline && (
                                <button 
                                    onClick={handleGenerateProtocol}
                                    disabled={loadingAi}
                                    className="text-xs bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-full text-white disabled:opacity-50 transition-colors font-bold"
                                >
                                    {loadingAi ? 'ANALISANDO...' : 'GERAR PROTOCOLO'}
                                </button>
                            )}
                        </div>
                        
                        {loadingAi && (
                            <div className="flex items-center gap-3 text-sm text-slate-400 animate-pulse p-4">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200"></div>
                                Consultando base de dados tática...
                            </div>
                        )}
                        
                        {aiProtocol && (
                            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line bg-slate-900/50 p-4 rounded border border-slate-700/50">
                                {aiProtocol}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        ) : (
            <div className="hidden md:flex flex-1 items-center justify-center text-slate-600 bg-slate-900 flex-col gap-4">
                <div className="p-6 bg-slate-800 rounded-full">
                    <Navigation size={64} className="opacity-50" />
                </div>
                <p className="font-bold uppercase tracking-widest text-sm">Selecione um alerta para despachar</p>
            </div>
        )}

      </div>
    </div>
  );
};

export default PoliceDashboard;