import React, { useState, useEffect, useRef } from 'react';
import { EmergencyType, GeoLocation } from '../types';
import { enviarEmergencia } from '../services/firebaseService'; // Importar serviço Firebase
import { Shield, CloudLightning, Car, CheckCircle, ArrowRight, MessageSquareWarning, RefreshCcw, WifiOff, MapPin, AlertTriangle } from 'lucide-react';

interface CitizenAppProps {
  isOnline: boolean;
}

const CitizenApp: React.FC<CitizenAppProps> = ({ isOnline }) => {
  // Step 0: Input Phone & Description, Step 1: Select/SOS, Step 2: Success (Final)
  const [step, setStep] = useState<0 | 1 | 2>(0); 
  const [phoneNumber, setPhoneNumber] = useState('');
  const [description, setDescription] = useState('');
  
  const [selectedType, setSelectedType] = useState<EmergencyType | null>(null);
  
  // GPS State
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [sending, setSending] = useState(false);

  // Timer to reset app 10 seconds after success
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (step === 2) {
      timer = setTimeout(() => {
        handleReset();
      }, 10000); // 10 seconds
    }
    return () => clearTimeout(timer);
  }, [step]);

  // Start watching GPS immediately upon mount for best accuracy
  useEffect(() => {
    startGpsWatch();
    return () => stopGpsWatch();
  }, []);

  const startGpsWatch = () => {
    if (!navigator.geolocation) {
      setErrorMsg("GPS não suportado neste dispositivo. O alerta será enviado sem localização.");
      return;
    }

    setLoadingLoc(true);
    setErrorMsg(null);

    const geoOptions = { 
      enableHighAccuracy: true, 
      timeout: 20000, 
      maximumAge: 0 
    };

    const handleSuccess = (pos: GeolocationPosition) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
        setGpsAccuracy(pos.coords.accuracy);
        setLoadingLoc(false);
        setErrorMsg(null);
    };

    const handleError = (err: GeolocationPositionError) => {
        console.error("GPS Error:", err);
        setLoadingLoc(false);
        
        // Specific error handling for permissions
        if (err.code === err.PERMISSION_DENIED) {
            setErrorMsg("PERMISSÃO NEGADA: Ative o GPS nas configurações do telefone para enviar sua localização.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
            setErrorMsg("Sinal GPS indisponível. Tente ir para um local aberto.");
        } else if (err.code === err.TIMEOUT) {
            // Don't show error on timeout, just keep trying or fallback silently
            console.warn("GPS Timeout");
        }

        // Don't clear location if we had one previously (stale is better than none)
        if (!location) {
             // We keep location null, allowing fallback
        }
    };
    
    // 1. Force a single request (Best for WebViews to trigger permission prompt)
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, geoOptions);

    // 2. Start continuous watch
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      geoOptions
    );
  };

  const stopGpsWatch = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers
    const val = e.target.value.replace(/\D/g, '');
    // Limit to 9 digits (Mozambique standard)
    if (val.length <= 9) {
        setPhoneNumber(val);
    }
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.length !== 9) {
      setErrorMsg("O número deve ter exactamente 9 dígitos.");
      return;
    }
    setErrorMsg(null);
    setStep(1); // Move to SOS screen
  };

  const handleSOS = () => {
    // FALLBACK LOGIC: If no location, send anyway with nulls
    if (!location) {
      // User is forcing send without GPS
      executeSend(selectedType || EmergencyType.GENERAL, { lat: null, lng: null });
      return;
    }
    executeSend(selectedType || EmergencyType.GENERAL, location);
  };

  const executeSend = async (type: EmergencyType, loc: GeoLocation) => {
    const fullNumber = `+258 ${phoneNumber}`;
    setSending(true);

    if (isOnline) {
      try {
        // 2. Enviar para o Firebase (accepts null lat/lng)
        await enviarEmergencia(fullNumber, description, loc.lat, loc.lng, type);
        setSending(false);
        setStep(2); // Move to static success screen
      } catch (error) {
        console.error("Erro envio:", error);
        setErrorMsg("Erro de conexão. Tente novamente.");
        setSending(false);
      }
    } else {
      // MODO OFFLINE (SMS Fallback)
      let smsBody = `SOS GOGOMA! Tipo: ${type}. Tlf: ${fullNumber}. Desc: ${description}.`;
      
      if (loc.lat && loc.lng) {
          const mapsLink = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
          smsBody += ` Local: ${mapsLink}`;
      } else {
          smsBody += ` Local: Desconhecido (GPS Falhou)`;
      }

      window.open(`sms:112?body=${encodeURIComponent(smsBody)}`, '_self');
      setSending(false);
      setStep(2);
    }
  };

  const handleReset = () => {
    setStep(0);
    setDescription(''); // Clear description for next use
    setSelectedType(null);
    // Keep phoneNumber for convenience
  };

  // --- SCREEN: SUCCESS (FINAL STATIC) ---
  if (step === 2) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-900 text-white p-6 text-center">
        <div className="bg-green-600 rounded-full p-6 mb-8 animate-bounce">
            <CheckCircle size={64} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold mb-6 text-green-400">✅ ALERTA ENVIADO</h1>
        
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 max-w-sm w-full">
            <p className="text-lg font-medium mb-4 text-gray-200">
                Todas as unidades conectadas foram notificadas.
            </p>
            {!location && (
                <p className="text-xs text-orange-400 mb-2 font-bold border border-orange-500/50 p-2 rounded bg-orange-900/20">
                    Aviso: Localização GPS não foi enviada.
                </p>
            )}
            {!isOnline && (
               <p className="text-xs text-yellow-500 mb-2 font-mono">Modo Offline: Verifique se o SMS foi enviado.</p>
            )}
            <p className="text-sm text-gray-400 border-t border-gray-600 pt-4 mt-4">
                Mantenha a calma.
            </p>
        </div>

        <button 
            onClick={handleReset}
            className="mt-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700"
        >
            <RefreshCcw size={16} /> Nova Emergência
        </button>
        
        <div className="mt-auto pb-4">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">
                GOGOMA
            </p>
            <p className="text-[10px] text-slate-600 uppercase tracking-wide">
                Prod: José Horácio e Wilade Joaquim
            </p>
        </div>
      </div>
    );
  }

  // --- SCREEN: PHONE & DESCRIPTION INPUT (INITIAL) ---
  if (step === 0) {
    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-6 justify-center">
            {!isOnline && (
              <div className="absolute top-0 left-0 w-full bg-yellow-900 text-yellow-200 text-center text-xs font-bold py-1 flex items-center justify-center gap-2">
                 <WifiOff size={12} /> MODO OFFLINE (ENVIO VIA SMS)
              </div>
            )}

            <div className="mb-6 text-center">
                <Shield size={48} className="mx-auto text-red-600 mb-4" />
                <h1 className="text-2xl font-bold">Pedido de Socorro</h1>
                <p className="text-slate-400 text-sm mt-2">Identifique-se para validar o alerta.</p>
            </div>

            <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-4">
                {/* Phone Input */}
                <div>
                    <label className="text-xs text-slate-400 font-bold uppercase ml-1 mb-1 block">Seu Contacto (Obrigatório)</label>
                    <div className="relative">
                        {/* Mozambique Code Prefix */}
                        <div className="absolute left-0 top-0 h-full w-16 bg-slate-700 rounded-l-xl flex items-center justify-center border border-slate-600">
                            <span className="text-gray-300 font-bold text-sm">+258</span>
                        </div>
                        
                        <input 
                            type="tel" 
                            placeholder="84 / 85 ..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 pl-20 text-xl font-mono tracking-widest focus:outline-none focus:border-red-500 transition-colors placeholder:text-slate-600 text-white"
                            value={phoneNumber}
                            onChange={handlePhoneChange}
                            autoFocus
                            required
                        />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 text-right">{phoneNumber.length}/9 dígitos</p>
                </div>

                {/* Description Input */}
                <div>
                    <label className="text-xs text-slate-400 font-bold uppercase ml-1 mb-1 block">O que está a acontecer? (Opcional)</label>
                    <div className="relative">
                        <MessageSquareWarning className="absolute left-4 top-4 text-slate-500" size={20} />
                        <textarea 
                            placeholder="Ex: Assalto armado, Acidente grave..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 pl-12 text-base focus:outline-none focus:border-red-500 transition-colors placeholder:text-slate-600 text-white resize-none h-24"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>

                {errorMsg && <p className="text-red-500 text-sm text-center font-bold bg-red-900/20 p-2 rounded border border-red-900/50">{errorMsg}</p>}
                
                <button 
                    type="submit"
                    className="bg-white text-slate-900 font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform mt-4 hover:bg-gray-100"
                >
                    Continuar <ArrowRight size={20} />
                </button>
            </form>
        </div>
    )
  }

  // --- SCREEN: SOS INTERFACE ---
  return (
    <div className="flex flex-col h-full bg-slate-900 text-white relative">
      {/* Header / Status Bar */}
      <div className="p-4 bg-slate-800 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${loadingLoc ? 'bg-yellow-900/30 border-yellow-700 text-yellow-500' : location ? 'bg-green-900/30 border-green-700 text-green-500' : 'bg-red-900/30 border-red-700 text-red-500'}`}>
                {loadingLoc ? (
                    <MapPin size={12} className="animate-bounce" />
                ) : location ? (
                    <MapPin size={12} />
                ) : (
                    <AlertTriangle size={12} />
                )}
                <span className="text-xs font-mono font-bold">
                    {loadingLoc ? 'GPS: BUSCANDO...' : location ? `GPS: OK (±${Math.round(gpsAccuracy || 0)}m)` : 'GPS: SEM SINAL'}
                </span>
            </div>
        </div>
        <div className="text-xs text-slate-400 font-mono">+258 {phoneNumber}</div>
      </div>

      <div className="flex-1 flex flex-col p-4 gap-4">
        {/* Error Banner */}
        {errorMsg && (
          <div className="bg-red-600 text-white p-3 rounded-lg text-center font-bold animate-pulse text-sm">
            {errorMsg}
          </div>
        )}
        
        {!location && !loadingLoc && !errorMsg && (
             <div className="bg-orange-600/20 border border-orange-500 text-orange-200 p-2 rounded text-center text-xs">
                 Aviso: GPS não detetado. O alerta será enviado sem localização exata.
             </div>
        )}

        {/* SOS Button Area */}
        <div className="flex-1 flex items-center justify-center py-4">
          <button
            onClick={handleSOS}
            disabled={sending}
            className={`
              w-64 h-64 rounded-full flex flex-col items-center justify-center
              bg-red-600 shadow-2xl border-8 border-red-800
              active:scale-95 transition-transform duration-100
              ${!selectedType && !sending ? 'animate-pulse-red' : ''}
              ${sending ? 'opacity-50 cursor-wait' : ''}
            `}
          >
            {sending ? (
              <span className="text-2xl font-black animate-pulse">ENVIANDO...</span>
            ) : (
              <>
                <span className="text-6xl font-black tracking-tighter">SOS</span>
                <span className="text-sm mt-2 uppercase font-semibold">
                  {selectedType ? 'Enviar Agora' : 'Emergência'}
                </span>
                <span className="text-xs mt-1 opacity-75">Toque para Ajuda</span>
              </>
            )}
          </button>
        </div>

        {/* Category Selection */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <button
            onClick={() => setSelectedType(EmergencyType.POLICE_CIVIL)}
            className={`p-4 rounded-xl flex flex-col items-center gap-2 transition-colors border-2 ${
              selectedType === EmergencyType.POLICE_CIVIL
                ? 'bg-blue-600 border-blue-400'
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Shield size={32} />
            <span className="text-xs font-bold text-center leading-tight">POLÍCIA CIVIL</span>
          </button>

          <button
            onClick={() => setSelectedType(EmergencyType.POLICE_TRAFFIC)}
            className={`p-4 rounded-xl flex flex-col items-center gap-2 transition-colors border-2 ${
              selectedType === EmergencyType.POLICE_TRAFFIC
                ? 'bg-orange-600 border-orange-400'
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Car size={32} />
            <span className="text-xs font-bold text-center leading-tight">TRÂNSITO</span>
          </button>

          <button
            onClick={() => setSelectedType(EmergencyType.DISASTER)}
            className={`p-4 rounded-xl flex flex-col items-center gap-2 transition-colors border-2 ${
              selectedType === EmergencyType.DISASTER
                ? 'bg-teal-600 border-teal-400'
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <CloudLightning size={32} />
            <span className="text-xs font-bold text-center leading-tight">CLIMA</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CitizenApp;