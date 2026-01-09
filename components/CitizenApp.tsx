import React, { useState, useEffect, useRef } from 'react';
import { EmergencyType, GeoLocation } from '../types';
import { enviarEmergencia } from '../services/firebaseService';
import { Shield, CloudLightning, Car, CheckCircle, ArrowRight, MessageSquareWarning, RefreshCcw, WifiOff, MapPin, AlertTriangle, MapPinned } from 'lucide-react';

interface CitizenAppProps {
  isOnline: boolean;
}

const CitizenApp: React.FC<CitizenAppProps> = ({ isOnline }) => {
  // Step 0: Input Phone & Description, Step 1: Select/SOS, Step 2: Success (Final)
  const [step, setStep] = useState<0 | 1 | 2>(0); 
  const [phoneNumber, setPhoneNumber] = useState('');
  const [description, setDescription] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [selectedType, setSelectedType] = useState<EmergencyType | null>(null);
  
  // GPS State
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (step === 2) {
      timer = setTimeout(() => handleReset(), 10000);
    }
    return () => clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    startGpsWatch();
    return () => stopGpsWatch();
  }, []);

  const startGpsWatch = () => {
    if (!navigator.geolocation) {
      setErrorMsg("GPS não suportado neste dispositivo.");
      return;
    }
    setLoadingLoc(true);
    const geoOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };
    const handleSuccess = (pos: GeolocationPosition) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsAccuracy(pos.coords.accuracy);
        setLoadingLoc(false);
        setErrorMsg(null);
    };
    const handleError = (err: GeolocationPositionError) => {
        setLoadingLoc(false);
        if (err.code === err.PERMISSION_DENIED) {
            setErrorMsg("Ative o GPS nas configurações do telefone.");
        }
    };
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, geoOptions);
    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, geoOptions);
  };

  const stopGpsWatch = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val.length <= 9) setPhoneNumber(val);
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.length !== 9) {
      setErrorMsg("O número deve ter exactamente 9 dígitos.");
      return;
    }
    const prefix = phoneNumber.substring(0, 2);
    const validPrefixes = ['82', '83', '84', '85', '86', '87'];
    if (!validPrefixes.includes(prefix)) {
        setErrorMsg("Número inválido (Use prefixos 82-87).");
        return;
    }
    if (!manualAddress || manualAddress.trim().length < 5) {
        setErrorMsg("Escreva a sua localização (Província, Cidade, Bairro).");
        return;
    }
    setErrorMsg(null);
    setStep(1);
  };

  const handleSOS = () => {
    executeSend(selectedType || EmergencyType.GENERAL, location || { lat: null, lng: null });
  };

  const executeSend = async (type: EmergencyType, loc: GeoLocation) => {
    const fullNumber = `+258 ${phoneNumber}`;
    setSending(true);
    setErrorMsg(null);

    if (isOnline) {
      try {
        await enviarEmergencia(fullNumber, description, loc.lat, loc.lng, type, manualAddress);
        setSending(false);
        setStep(2);
      } catch (error: any) {
        console.error("Erro no envio para o Firebase:", error);
        // Explicar ao usuário que pode ser um problema de conexão real ou permissões do servidor
        setErrorMsg(error.message || "Erro de conexão. Verifique sua internet ou tente via SMS.");
        setSending(false);
      }
    } else {
      let smsBody = `SOS GOGOMA! Tipo: ${type}. Tlf: ${fullNumber}. Desc: ${description}. Local: ${manualAddress}.`;
      if (loc.lat && loc.lng) smsBody += ` GPS: https://maps.google.com/?q=${loc.lat},${loc.lng}`;
      window.open(`sms:112?body=${encodeURIComponent(smsBody)}`, '_self');
      setSending(false);
      setStep(2);
    }
  };

  const handleReset = () => {
    setStep(0);
    setDescription('');
    setSelectedType(null);
    setManualAddress('');
  };

  if (step === 2) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-900 text-white p-6 text-center">
        <div className="bg-green-600 rounded-full p-6 mb-8 animate-bounce">
            <CheckCircle size={64} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold mb-6 text-green-400">✅ ALERTA ENVIADO</h1>
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 max-w-sm w-full shadow-lg">
            <p className="text-lg font-medium mb-4 text-gray-200">A polícia foi notificada via internet.</p>
            {!location && <p className="text-xs text-orange-400 mb-2 font-bold">Aviso: Localização GPS não enviada.</p>}
            {!isOnline && <p className="text-xs text-yellow-500 mb-2 font-mono">Modo Offline: Verifique se o SMS saiu.</p>}
        </div>
        <button onClick={handleReset} className="mt-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800/50 px-6 py-3 rounded-full border border-slate-700 font-bold uppercase tracking-wider text-xs">
            <RefreshCcw size={16} /> Novo Pedido de Ajuda
        </button>
      </div>
    );
  }

  if (step === 0) {
    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-6 overflow-y-auto">
            {!isOnline && (
              <div className="absolute top-0 left-0 w-full bg-yellow-900 text-yellow-200 text-center text-xs font-bold py-1 flex items-center justify-center gap-2 z-20">
                 <WifiOff size={12} /> MODO OFFLINE (ENVIO VIA SMS)
              </div>
            )}
            <div className="mb-6 text-center pt-6">
                <Shield size={48} className="mx-auto text-red-600 mb-4" />
                <h1 className="text-2xl font-bold tracking-tight">Pedido de Socorro</h1>
                <p className="text-slate-400 text-sm mt-2">Preencha os dados abaixo para validar o alerta.</p>
            </div>
            <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-4 pb-10">
                <div>
                    <label className="text-xs text-slate-400 font-bold uppercase ml-1 mb-1 block">Seu Contacto (Obrigatório)</label>
                    <div className="relative">
                        <div className="absolute left-0 top-0 h-full w-16 bg-slate-700 rounded-l-xl flex items-center justify-center border border-slate-600">
                            <span className="text-gray-300 font-bold text-sm">+258</span>
                        </div>
                        <input type="tel" placeholder="84 / 85 ..." className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 pl-20 text-xl font-mono tracking-widest focus:outline-none focus:border-red-500 transition-colors text-white" value={phoneNumber} onChange={handlePhoneChange} required />
                    </div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-blue-400 mb-1">
                        <MapPinned size={16} />
                        <span className="text-xs font-bold uppercase">Sua Localização (Obrigatório)</span>
                    </div>
                    <textarea placeholder="Escreva: Província, Cidade e Bairro (Ex: Maputo, Hulene, Q.15)" className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:border-blue-500 outline-none text-base h-24 resize-none" value={manualAddress} onChange={(e) => setManualAddress(e.target.value)} required />
                </div>
                <div>
                    <label className="text-xs text-slate-400 font-bold uppercase ml-1 mb-1 block">O que está a acontecer? (Opcional)</label>
                    <div className="relative">
                        <MessageSquareWarning className="absolute left-4 top-4 text-slate-500" size={20} />
                        <textarea placeholder="Ex: Assalto, Acidente, etc." className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 pl-12 text-base focus:outline-none focus:border-red-500 transition-colors text-white resize-none h-24" value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                </div>
                {errorMsg && <p className="text-red-500 text-sm text-center font-bold bg-red-900/20 p-2 rounded border border-red-900/50">{errorMsg}</p>}
                <button type="submit" className="bg-white text-slate-900 font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform mt-2 hover:bg-gray-100 shadow-xl">
                    Continuar <ArrowRight size={20} />
                </button>
            </form>
        </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white relative">
      <div className="p-4 bg-slate-800 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${loadingLoc ? 'bg-yellow-900/30 border-yellow-700 text-yellow-500' : location ? 'bg-green-900/30 border-green-700 text-green-500' : 'bg-red-900/30 border-red-700 text-red-500'}`}>
                {loadingLoc ? <MapPin size={12} className="animate-bounce" /> : location ? <MapPin size={12} /> : <AlertTriangle size={12} />}
                <span className="text-xs font-mono font-bold">{loadingLoc ? 'GPS: BUSCANDO...' : location ? `GPS: OK (±${Math.round(gpsAccuracy || 0)}m)` : 'GPS: SEM SINAL'}</span>
            </div>
        </div>
        <div className="text-xs text-slate-400 font-mono tracking-tighter">+258 {phoneNumber}</div>
      </div>
      <div className="flex-1 flex flex-col p-4 gap-4">
        {errorMsg && <div className="bg-red-600 text-white p-3 rounded-lg text-center font-bold animate-pulse text-sm shadow-lg">{errorMsg}</div>}
        <div className="bg-blue-900/20 border border-blue-800 p-2 rounded text-center text-xs text-blue-200 truncate px-4">📍 {manualAddress}</div>
        <div className="flex-1 flex items-center justify-center py-4">
          <button onClick={handleSOS} disabled={sending} className={`w-64 h-64 rounded-full flex flex-col items-center justify-center bg-red-600 shadow-[0_0_50px_rgba(220,38,38,0.4)] border-8 border-red-800 active:scale-95 transition-transform duration-100 ${!selectedType && !sending ? 'animate-pulse-red' : ''} ${sending ? 'opacity-50 cursor-wait' : ''}`}>
            {sending ? <span className="text-2xl font-black animate-pulse">ENVIANDO...</span> : <><span className="text-6xl font-black tracking-tighter">SOS</span><span className="text-sm mt-2 uppercase font-semibold">{selectedType ? 'Enviar Agora' : 'Emergência'}</span></>}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-6">
          <button onClick={() => setSelectedType(EmergencyType.POLICE_CIVIL)} className={`p-4 rounded-xl flex flex-col items-center gap-2 border-2 transition-all ${selectedType === EmergencyType.POLICE_CIVIL ? 'bg-blue-600 border-blue-400 scale-105' : 'bg-slate-800 border-slate-700'}`}><Shield size={32} /><span className="text-xs font-bold text-center leading-tight">CIVIL</span></button>
          <button onClick={() => setSelectedType(EmergencyType.POLICE_TRAFFIC)} className={`p-4 rounded-xl flex flex-col items-center gap-2 border-2 transition-all ${selectedType === EmergencyType.POLICE_TRAFFIC ? 'bg-orange-600 border-orange-400 scale-105' : 'bg-slate-800 border-slate-700'}`}><Car size={32} /><span className="text-xs font-bold text-center leading-tight">TRÂNSITO</span></button>
          <button onClick={() => setSelectedType(EmergencyType.DISASTER)} className={`p-4 rounded-xl flex flex-col items-center gap-2 border-2 transition-all ${selectedType === EmergencyType.DISASTER ? 'bg-teal-600 border-teal-400 scale-105' : 'bg-slate-800 border-slate-700'}`}><CloudLightning size={32} /><span className="text-xs font-bold text-center leading-tight">CLIMA</span></button>
        </div>
      </div>
    </div>
  );
};

export default CitizenApp;