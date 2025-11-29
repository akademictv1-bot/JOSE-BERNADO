import React, { useState, useEffect } from 'react';
import CitizenApp from './components/CitizenApp';
import PoliceDashboard from './components/PoliceDashboard';
import { EmergencyAlert, EmergencyType, GeoLocation, AlertStatus } from './types';
import { Smartphone, Siren, Activity, Radio, Wifi, WifiOff } from 'lucide-react';
import { escutarEmergencias } from './services/firebaseService';

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [viewMode, setViewMode] = useState<'citizen' | 'police'>('citizen');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Lista de alertas vinda do Firebase (Realtime)
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);

  // Splash Screen Timer
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Monitorar conexão de internet
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 1. Escutar Emergências do Firebase (Substitui localStorage)
  useEffect(() => {
    // A função retorna o unsubscribe (off)
    const unsubscribe = escutarEmergencias((novosAlertas) => {
      setAlerts(novosAlertas);
    });

    // Cleanup ao desmontar
    return () => unsubscribe();
  }, []);

  // Verificar se existem alertas pendentes (NOVO)
  const hasPendingAlerts = alerts.some(a => a.status === AlertStatus.NEW);

  // --- SPLASH SCREEN RENDER ---
  if (showSplash) {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-white p-8 text-center z-50 fixed inset-0">
        <div className="mb-8 p-6 bg-slate-900 rounded-full border-4 border-red-600 shadow-[0_0_50px_rgba(220,38,38,0.5)]">
            <Siren size={64} className="text-red-500 animate-pulse" />
        </div>
        <h1 className="text-5xl font-black tracking-tighter mb-2 uppercase text-white leading-tight">
            GOGOMA
        </h1>
        <p className="text-xs text-slate-500 font-mono tracking-widest uppercase mb-6">
            Produtores: José Horácio e Wilade Joaquim
        </p>
        
        <div className="flex items-center gap-2 text-yellow-500 font-bold text-xl animate-pulse mt-8">
            <Activity size={24} />
            <p>Seja rápido a chamar a emergência</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col">
      {/* 3. Indicador Global Vermelho (Barra de Topo) */}
      <div className="bg-black text-white p-2 flex justify-between items-center text-xs border-b border-gray-800 z-50 relative">
        
        {/* Lado Esquerdo: Seletor de Modo */}
        <div className="flex items-center gap-2">
            <button 
              onClick={() => setViewMode('citizen')}
              className={`flex items-center gap-2 px-3 py-1 rounded-full transition-all ${viewMode === 'citizen' ? 'bg-slate-800 text-white border border-slate-600' : 'text-gray-500'}`}
            >
              <Smartphone size={14} /> <span className="hidden sm:inline">Cidadão</span>
            </button>
            <button 
              onClick={() => setViewMode('police')}
              className={`flex items-center gap-2 px-3 py-1 rounded-full transition-all ${viewMode === 'police' ? 'bg-slate-800 text-white border border-slate-600' : 'text-gray-500'}`}
            >
              <Siren size={14} /> <span className="hidden sm:inline">Polícia</span>
            </button>
        </div>

        {/* Centro/Direita: Indicador de Alerta Pendente */}
        <div className="flex items-center gap-4">
             {/* INDICADOR GLOBAL DE EMERGÊNCIA */}
             {hasPendingAlerts ? (
                <div className="flex items-center gap-2 bg-red-900/50 px-3 py-1 rounded border border-red-600 animate-pulse">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                    <span className="text-red-400 font-bold tracking-widest uppercase">ALERTA ATIVO</span>
                </div>
             ) : (
                <div className="flex items-center gap-2 opacity-30">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-[10px] tracking-widest uppercase">Monitorando</span>
                </div>
             )}

             {/* Indicador de Conexão */}
             <div className="flex items-center gap-1">
                {isOnline ? <Wifi size={14} className="text-green-500"/> : <WifiOff size={14} className="text-red-500"/>}
             </div>
        </div>
      </div>

      {/* Main View Container */}
      <div className="flex-1 relative bg-gray-900">
        {viewMode === 'citizen' ? (
          <CitizenApp isOnline={isOnline} />
        ) : (
          <PoliceDashboard alerts={alerts} isOnline={isOnline} />
        )}
      </div>
    </div>
  );
};

export default App;