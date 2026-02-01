import React, { useState, useEffect, useRef } from 'react';
import { EmergencyType, GeoLocation, UserProfile } from '../types';
import { criarEmergencia, registrarUsuario, verificarUsuarioExistente, buscarUsuarioPorNumero } from '../services/firebaseService';
import { Shield, CloudLightning, Car, CheckCircle, MessageSquareWarning, RefreshCcw, MapPin, User, Activity, AlertCircle, Settings } from 'lucide-react';

interface CitizenAppProps {
  isOnline: boolean;
}

const CitizenApp: React.FC<CitizenAppProps> = ({ isOnline }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCity, setRegCity] = useState('');
  const [regNeighborhood, setRegNeighborhood] = useState('');

  const [description, setDescription] = useState('');
  const [selectedType, setSelectedType] = useState<EmergencyType | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0); 
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsDenied, setGpsDenied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [sending, setSending] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const savedProfile = localStorage.getItem('gogoma_user_profile');
    if (savedProfile) {
      setProfile(JSON.parse(savedProfile));
      setIsRegistered(true);
      if ('Notification' in window) Notification.requestPermission();
    }
    startGpsWatch();
    return () => stopGpsWatch();
  }, [isRegistered]);

  const startGpsWatch = () => {
    if (!navigator.geolocation) {
      setErrorMsg("GPS não suportado neste dispositivo.");
      return;
    }
    
    setGpsDenied(false);
    const options = {
      enableHighAccuracy: true,
      maximumAge: 5000, 
      timeout: 15000 
    };

    const handleSuccess = (pos: GeolocationPosition) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsAccuracy(pos.coords.accuracy);
        setGpsDenied(false);
        setErrorMsg(null);
    };

    const handleError = (err: GeolocationPositionError) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsDenied(true);
          setErrorMsg("Permissão de Localização Negada.");
        } else if (err.code === err.TIMEOUT) {
          // Fallback para baixa precisão em caso de timeout
          navigator.geolocation.getCurrentPosition(handleSuccess, (e) => {
            setErrorMsg("Sinal GPS fraco. Tente ir para um local aberto.");
          }, { enableHighAccuracy: false, timeout: 10000 });
        }
    };

    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, options);
    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, null, options);
  };

  const stopGpsWatch = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPhone.length < 9) {
      setErrorMsg("Número inválido.");
      return;
    }
    setWorking(true);
    setErrorMsg(null);
    try {
      if (authMode === 'register') {
        const check = await verificarUsuarioExistente(regPhone, regName);
        if (check.exists) {
          setErrorMsg(check.reason || "Usuário já existe.");
          setWorking(false);
          return;
        }
        const newProfile: UserProfile = { name: regName, phoneNumber: regPhone, city: regCity, neighborhood: regNeighborhood };
        await registrarUsuario(newProfile);
        localStorage.setItem('gogoma_user_profile', JSON.stringify(newProfile));
        setProfile(newProfile);
        setIsRegistered(true);
      } else {
        const user = await buscarUsuarioPorNumero(regPhone);
        if (!user) {
          setErrorMsg("Número não encontrado.");
        } else if (user.name.toLowerCase().trim() !== regName.toLowerCase().trim()) {
          setErrorMsg("O nome não coincide.");
        } else {
          localStorage.setItem('gogoma_user_profile', JSON.stringify(user));
          setProfile(user);
          setIsRegistered(true);
        }
      }
    } catch (err) { setErrorMsg("Erro de conexão."); } finally { setWorking(false); }
  };

  const handleSOS = async () => {
    if (!profile) return;
    if (gpsDenied) {
      alert("Aviso: Sem GPS, a polícia terá dificuldade em localizá-lo. Por favor, ative a localização nas definições do navegador.");
    }
    setSending(true);
    setErrorMsg(null);
    try {
      await criarEmergencia({
        userName: profile.name,
        contactNumber: profile.phoneNumber,
        description: description || "SOS IMEDIATO",
        location: { lat: location?.lat || null, lng: location?.lng || null },
        type: selectedType || EmergencyType.GENERAL,
        manualAddress: `${profile.city}, ${profile.neighborhood}`
      });
      setStep(2);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 500]);
    } catch (error: any) { setErrorMsg("Falha ao enviar SOS."); } finally { setSending(false); }
  };

  if (!isRegistered) {
    return (
      <div className="flex flex-col h-full bg-[#050507] text-white p-6 overflow-y-auto">
        <div className="text-center mb-8 pt-8">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-2xl rotate-3">
            <User size={40} className="-rotate-3" />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tighter">PORTAL CIDADÃO</h1>
          <p className="text-slate-500 text-[10px] font-bold mt-2 uppercase tracking-widest">Acesso Seguro • Moçambique</p>
        </div>

        <div className="flex bg-[#0d0d10] p-1.5 rounded-[20px] mb-8 border border-white/5 shadow-inner">
          <button onClick={() => { setAuthMode('register'); setErrorMsg(null); }} className={`flex-1 py-4 rounded-[14px] text-[10px] font-black uppercase transition-all ${authMode === 'register' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>REGISTAR</button>
          <button onClick={() => { setAuthMode('login'); setErrorMsg(null); }} className={`flex-1 py-4 rounded-[14px] text-[10px] font-black uppercase transition-all ${authMode === 'login' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>ENTRAR</button>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-4">
            <input type="text" placeholder="NOME COMPLETO" required className="w-full bg-[#0d0d10] border border-white/5 rounded-2xl p-5 focus:border-blue-500 outline-none text-sm font-bold uppercase" value={regName} onChange={e => setRegName(e.target.value)} />
            <input type="tel" maxLength={9} placeholder="TELEMÓVEL (82/84...)" required className="w-full bg-[#0d0d10] border border-white/5 rounded-2xl p-5 font-mono text-xl focus:border-blue-500 outline-none" value={regPhone} onChange={e => setRegPhone(e.target.value.replace(/\D/g, ''))} />
            {authMode === 'register' && (
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="CIDADE" required className="w-full bg-[#0d0d10] border border-white/5 rounded-2xl p-5 focus:border-blue-500 outline-none text-[10px] font-bold uppercase" value={regCity} onChange={e => setRegCity(e.target.value)} />
                <input type="text" placeholder="BAIRRO" required className="w-full bg-[#0d0d10] border border-white/5 rounded-2xl p-5 focus:border-blue-500 outline-none text-[10px] font-bold uppercase" value={regNeighborhood} onChange={e => setRegNeighborhood(e.target.value)} />
              </div>
            )}
          </div>
          {errorMsg && <div className="bg-red-600/10 border border-red-600/20 text-red-500 p-4 rounded-2xl text-[10px] font-black text-center uppercase tracking-widest">{errorMsg}</div>}
          <button type="submit" disabled={working} className="w-full bg-blue-600 py-6 rounded-3xl font-black uppercase text-xs tracking-[0.2em] shadow-2xl active:scale-95 transition-all mt-4">
            {working ? <RefreshCcw size={20} className="animate-spin mx-auto" /> : (authMode === 'register' ? 'CRIAR CONTA AGORA' : 'ACEDER AO SISTEMA')}
          </button>
        </form>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#050507] text-white p-8 text-center">
        <div className="bg-green-600 rounded-[40px] p-10 mb-8 animate-bounce shadow-[0_0_50px_rgba(34,197,94,0.3)]"><CheckCircle size={80} /></div>
        <h1 className="text-4xl font-black mb-4 uppercase tracking-tighter text-green-500">SOS ENVIADO!</h1>
        <p className="text-slate-400 text-sm leading-relaxed max-w-xs">A polícia recebeu o seu alerta.<br/>Mantenha-se seguro.</p>
        <button onClick={() => { setStep(0); setSelectedType(null); setDescription(''); }} className="mt-12 flex items-center gap-3 bg-[#0d0d10] px-10 py-5 rounded-full border border-white/5 font-black uppercase tracking-widest text-[10px] active:scale-90 transition-all shadow-xl">
          <RefreshCcw size={16} /> NOVO ALERTA SOS
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black text-white relative">
      {/* Header com Informações do Usuário */}
      <div className="p-4 bg-[#0d0d10] border-b border-white/5 flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600/10 rounded-xl flex items-center justify-center border border-blue-600/20"><User size={18} className="text-blue-600" /></div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-tight">{profile?.name}</div>
            <div className="text-[8px] text-slate-500 font-mono uppercase">{profile?.neighborhood}</div>
          </div>
        </div>
        <button onClick={() => { if(confirm("Sair?")) { localStorage.removeItem('gogoma_user_profile'); setIsRegistered(false); } }} className="p-2 text-slate-800 hover:text-red-500 transition-colors"><RefreshCcw size={18} /></button>
      </div>

      <div className="flex-1 flex flex-col p-6 gap-6 justify-center min-h-0 overflow-y-auto">
        
        {/* Status do GPS com Tratamento de Erro Visual */}
        {gpsDenied ? (
          <div className="bg-red-600/10 border border-red-600/30 p-4 rounded-2xl flex flex-col items-center gap-3 text-center animate-pulse">
            <div className="flex items-center gap-2 text-red-500 font-black text-[10px] uppercase tracking-widest">
              <AlertCircle size={18} /> GPS BLOQUEADO
            </div>
            <p className="text-[9px] text-red-400 font-bold uppercase leading-tight">Para sua segurança, clique no ícone de cadeado na barra de endereço e ative a Localização.</p>
            <button onClick={startGpsWatch} className="bg-red-600 px-4 py-2 rounded-lg text-[9px] font-black uppercase flex items-center gap-2">
              <RefreshCcw size={12} /> TENTAR NOVAMENTE
            </button>
          </div>
        ) : (
          <div className={`flex items-center justify-center gap-3 py-2 px-6 rounded-full self-center border text-[9px] font-black uppercase tracking-[0.2em] transition-all ${location ? 'bg-green-600/10 border-green-500/30 text-green-500' : 'bg-yellow-600/10 border-yellow-500/30 text-yellow-500 animate-pulse'}`}>
            <MapPin size={14} className={location ? "" : "animate-bounce"} />
            {location ? `GPS CONECTADO (±${Math.round(gpsAccuracy || 0)}m)` : 'OBTENDO GPS...'}
          </div>
        )}

        {/* Botão de Pânico Principal */}
        <div className="flex items-center justify-center">
          <button 
            onClick={handleSOS} 
            disabled={sending} 
            className={`w-64 h-64 md:w-80 md:h-80 rounded-full flex flex-col items-center justify-center bg-red-600 border-[16px] border-red-800 shadow-[0_0_80px_rgba(220,38,38,0.4)] animate-pulse-red active:scale-90 transition-all ${sending ? 'opacity-50' : ''}`}
          >
            <span className="text-8xl md:text-9xl font-black tracking-tighter leading-none mb-2">SOS</span>
            <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-50">PEDIR AJUDA</span>
          </button>
        </div>

        {/* Seleção de Tipo de Emergência */}
        <div className="grid grid-cols-3 gap-4 max-w-md mx-auto w-full">
          {[
            { type: EmergencyType.POLICE_CIVIL, icon: <Shield size={32}/>, label: 'CIVIL', color: 'bg-blue-600 border-blue-400' },
            { type: EmergencyType.POLICE_TRAFFIC, icon: <Car size={32}/>, label: 'TRÂNSITO', color: 'bg-orange-600 border-orange-400' },
            { type: EmergencyType.DISASTER, icon: <Activity size={32}/>, label: 'CLIMA', color: 'bg-teal-600 border-teal-400' }
          ].map((item) => (
            <button key={item.label} onClick={() => setSelectedType(item.type)} className={`p-5 rounded-3xl flex flex-col items-center gap-3 border-2 transition-all ${selectedType === item.type ? `${item.color} scale-110 shadow-2xl` : 'bg-[#0d0d10] border-white/5 text-slate-500 hover:text-white'}`}>
              {item.icon}
              <span className="text-[9px] font-black tracking-widest">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Campo de Descrição Opcional */}
      <div className="p-6 bg-[#0d0d10] border-t border-white/5 flex-shrink-0">
        <div className="relative group max-w-xl mx-auto">
          <MessageSquareWarning className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={24} />
          <input type="text" placeholder="DESCRIÇÃO (OPCIONAL)" className="w-full bg-black border border-white/5 rounded-3xl py-6 pl-14 pr-6 text-sm font-bold uppercase focus:border-red-600 outline-none transition-all" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
      </div>
    </div>
  );
};

export default CitizenApp;