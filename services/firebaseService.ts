import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, update, get, child } from "firebase/database";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { AlertStatus, EmergencyType, EmergencyAlert } from "../types";

// Configuração fornecida
const firebaseConfig = {
  apiKey: "AIzaSyAiCRqKono7N2KxkCGpPD9lAlHRx-AUGKY",
  authDomain: "gogoma-2.firebaseapp.com",
  databaseURL: "https://gogoma-2-default-rtdb.firebaseio.com",
  projectId: "gogoma-2",
  storageBucket: "gogoma-2.firebasestorage.app",
  messagingSenderId: "50833835620",
  appId: "1:50833835620:web:c63b6def7f1ccc23ad8171"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
let messaging: any = null;

try {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    messaging = getMessaging(app);
  }
} catch (e) {
  console.warn("Firebase Messaging não inicializado.");
}

const FCM_SERVER_KEY = "SUA_SERVER_KEY_AQUI"; 

export const enviarEmergencia = async (
  numero: string, 
  descricao: string, 
  latitude: number | null, 
  longitude: number | null,
  tipo: EmergencyType,
  enderecoManual: string
) => {
  const alertasRef = ref(db, 'notificacoes');
  
  const novoAlerta: Partial<EmergencyAlert> = {
    contactNumber: numero,
    description: descricao || "",
    location: {
      lat: latitude,
      lng: longitude
    },
    type: tipo,
    status: AlertStatus.NEW,
    timestamp: Date.now(),
    manualAddress: enderecoManual
  };

  try {
    // Gravação direta no Firebase RTDB
    const result = await push(alertasRef, novoAlerta);
    console.log("Sucesso: Alerta gravado ID:", result.key);
  } catch (error: any) {
    console.error("Erro Firebase RTDB:", error);
    if (error.code === 'PERMISSION_DENIED' || error.message?.toLowerCase().includes('permission')) {
      throw new Error("Acesso negado. Verifique se as Regras de Segurança no Firebase Console estão como 'true'.");
    }
    throw new Error("Erro de conexão. Verifique sua rede e tente novamente.");
  }

  // Notificação Push em segundo plano
  enviarNotificacaoPushParaTodos(
    "🚨 Novo Pedido de Socorro",
    `Local: ${enderecoManual} - Contacto: ${numero}`
  ).catch(() => {});
};

export const escutarEmergencias = (callback: (alertas: EmergencyAlert[]) => void) => {
  const alertasRef = ref(db, 'notificacoes');
  return onValue(alertasRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const listaAlertas: EmergencyAlert[] = Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));
      callback(listaAlertas);
    } else {
      callback([]);
    }
  }, (error) => {
    console.error("Erro ao escutar dados:", error);
  });
};

export const atualizarStatusEmergencia = async (id: string, novoStatus: AlertStatus) => {
  const alertaRef = ref(db, `notificacoes/${id}`);
  await update(alertaRef, { status: novoStatus });
};

export const solicitarPermissaoNotificacao = async (badgeId: string) => {
  if (!messaging) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, {
        vapidKey: "BJjEAoUmes2nPKi3nc4YA9ORy29oaUCDnTLYSc6Lw5t_oY-FlYyTUBDcyFRaceJAbTBND7cFwfAGOhZAwPbGrEQ"
      });
      if (token) await salvarTokenPolicia(badgeId, token);
    }
  } catch (error) {
    console.error("FCM Token Error:", error);
  }
};

const salvarTokenPolicia = async (badgeId: string, token: string) => {
  const userRef = ref(db, `policias/${badgeId}`);
  await update(userRef, { token: token, last_login: Date.now() });
};

export const onMessageListener = () => {
  if (!messaging) return Promise.resolve(null);
  return new Promise((resolve) => {
    onMessage(messaging, (payload) => resolve(payload));
  });
};

export const enviarNotificacaoPushParaTodos = async (titulo: string, corpo: string) => {
  if (!FCM_SERVER_KEY || FCM_SERVER_KEY.includes("SUA_SERVER_KEY")) return;
  try {
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, `policias`));
    if (snapshot.exists()) {
      const policias = snapshot.val();
      const tokens: string[] = [];
      Object.keys(policias).forEach((key) => {
        if (policias[key].token) tokens.push(policias[key].token);
      });
      if (tokens.length === 0) return;
      const promises = tokens.map(token => 
        fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${FCM_SERVER_KEY}`
          },
          body: JSON.stringify({
            to: token,
            notification: { title: titulo, body: corpo, icon: "/icon.png" },
            priority: "high"
          })
        })
      );
      await Promise.all(promises);
    }
  } catch (error) {
    console.warn("Notificação Push ignorada devido a erro de rede ou CORS.");
  }
};