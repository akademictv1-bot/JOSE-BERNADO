import React, { useState, useEffect } from 'react';
import CitizenApp from './components/CitizenApp';
import PoliceDashboard from './components/PoliceDashboard';
import { EmergencyAlert, EmergencyType, GeoLocation, AlertStatus } from './types';
import { Smartphone, Siren, Activity } from 'lucide-react';

const STORAGE_KEY = 'moz_emergency_alerts_db';

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [viewMode, setViewMode] = useState<'citizen' | 'police'>('citizen');
  
  // Load initial alerts from localStorage to simulate persistent DB
  const [alerts, setAlerts] = useState<EmergencyAlert[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // Splash Screen Timer
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Sync with localStorage whenever alerts change (Simulate sending to Backend)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  }, [alerts]);

  // Listen for changes from other tabs (Simulate Real-time Socket Recieving)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        setAlerts(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Handler for when Citizen sends an alert
  const handleNewAlert = (type: EmergencyType, location: GeoLocation, phone: string, description: string) => {
    const newAlert: EmergencyAlert = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      location,
      timestamp: Date.now(),
      status: AlertStatus.NEW,
      contactNumber: phone,
      description: description
    };

    setAlerts(prev => [newAlert, ...prev]);
  };

  // Handler for Police updating status
  const handleUpdateStatus = (id: string, status: AlertStatus) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === id ? { ...alert, status } : alert
    ));
  };

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
      {/* Simulation Toggle Bar - Allows user to switch roles */}
      <div className="bg-black text-white p-2 flex justify-center items-center gap-4 text-xs border-b border-gray-800 z-50">
        <span className="uppercase tracking-widest text-gray-500 hidden md:inline">Modo de Simulação:</span>
        <button 
          onClick={() => setViewMode('citizen')}
          className={`flex items-center gap-2 px-4 py-1 rounded-full transition-all ${viewMode === 'citizen' ? 'bg-red-600 text-white font-bold' : 'bg-gray-800 text-gray-400'}`}
        >
          <Smartphone size={14} /> Cidadão
        </button>
        <button 
          onClick={() => setViewMode('police')}
          className={`flex items-center gap-2 px-4 py-1 rounded-full transition-all ${viewMode === 'police' ? 'bg-blue-600 text-white font-bold' : 'bg-gray-800 text-gray-400'}`}
        >
          <Siren size={14} /> Posto Policial
          {/* Notification Badge on toggle */}
          {alerts.some(a => a.status === AlertStatus.NEW) && (
             <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
             </span>
          )}
        </button>
      </div>

      {/* Main View Container */}
      <div className="flex-1 relative bg-gray-900">
        {viewMode === 'citizen' ? (
          <CitizenApp onSendAlert={handleNewAlert} />
        ) : (
          <PoliceDashboard alerts={alerts} updateAlertStatus={handleUpdateStatus} />
        )}
      </div>
    </div>
  );
};

export default App;