import React, { useState, useEffect } from 'react';
import CitizenApp from './components/CitizenApp';
import PoliceDashboard from './components/PoliceDashboard';
import { EmergencyAlert, AlertStatus } from './types';
import { Smartphone, Siren, Activity, Wifi, WifiOff } from 'lucide-react';
import { escutarEmergencias } from './services/firebaseService';

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [viewMode, setViewMode] = useState<'citizen' | 'police'>('citizen');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3000);
    
    // Registro de Service Worker otimizado para deploy em qualquer domínio
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('firebase-messaging-sw.js')
        .then(reg => {
          console.log('GOGOMA Service Worker Ready:', reg.scope);
        })
        .catch(err => {
          console.debug('Service Worker Registration skipped:', err.message);
        });
    }

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    const unsubscribe = escutarEmergencias((novosAlertas) => {
      setAlerts(novosAlertas);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const hasPendingAlerts = alerts.some(a => a.status === AlertStatus.NEW);

  if (showSplash) {
    return (
      <div className="h-screen w-full bg-[#050507] flex flex-col items-center justify-center text-white p-8 text-center z-[999] fixed inset-0">
        <div className="mb-8 p-6 bg-[#0a0a0c] rounded-full border-4 border-red-600 shadow-[0_0_50px_rgba(220,38,38,0.5)]">
            <Siren size={64} className="text-red-500 animate-pulse" />
        </div>
        <h1 className="text-5xl font-black tracking-tighter mb-2 uppercase text-white leading-tight">GOGOMA</h1>
        <p className="text-[10px] text-slate-500 font-mono tracking-[0.3em] uppercase mb-6">Operações Moçambique</p>
        <div className="flex items-center gap-2 text-yellow-500 font-bold text-lg animate-pulse mt-8">
            <Activity size={20} />
            <p>CONECTANDO AO COMANDO CENTRAL...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-black">
      <div className="bg-[#0a0a0c] text-white p-3 flex justify-between items-center text-[10px] border-b border-white/5 z-50 relative">
        <div className="flex items-center gap-2">
            <button onClick={() => setViewMode('citizen')} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black uppercase transition-all ${viewMode === 'citizen' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>
              <Smartphone size={14} /> <span>Cidadão</span>
            </button>
            <button onClick={() => setViewMode('police')} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black uppercase transition-all ${viewMode === 'police' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>
              <Siren size={14} /> <span>Comando</span>
            </button>
        </div>

        <div className="flex items-center gap-4">
             {hasPendingAlerts ? (
                <div className="flex items-center gap-2 bg-red-600/20 px-3 py-1.5 rounded-lg border border-red-600 animate-pulse">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                    <span className="text-red-500 font-black tracking-widest">SOS ATIVO</span>
                </div>
             ) : (
                <div className="flex items-center gap-2 opacity-30">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                    <span className="font-black tracking-widest">EM ESCUTA</span>
                </div>
             )}
             {isOnline ? <Wifi size={14} className="text-green-500"/> : <WifiOff size={14} className="text-red-500"/>}
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
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