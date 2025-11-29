import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, update, set, get, child } from "firebase/database";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { AlertStatus, EmergencyType, GeoLocation, EmergencyAlert } from "../types";

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

// Inicializar Messaging apenas se suportado (evita erros em ambientes restritos)
try {
  messaging = getMessaging(app);
} catch (e) {
  console.warn("Firebase Messaging não suportado neste navegador.", e);
}

// CHAVE DO SERVIDOR (Legacy) - NECESSÁRIA PARA ENVIAR NOTIFICAÇÕES SEM BACKEND
// Você deve pegar isso no Firebase Console -> Configurações -> Cloud Messaging
const FCM_SERVER_KEY = "SUA_SERVER_KEY_AQUI_SUBSTITUA_NO_CODIGO"; 

/**
 * 1. Função enviarEmergencia
 * Envia os dados para o nó "notificacoes" no Firebase.
 * Aceita latitude/longitude como null para fallback.
 * AGORA TAMBÉM DISPARA A NOTIFICAÇÃO PUSH.
 */
export const enviarEmergencia = async (
  numero: string, 
  descricao: string, 
  latitude: number | null, 
  longitude: number | null,
  tipo: EmergencyType
) => {
  const alertasRef = ref(db, 'notificacoes');
  
  const novoAlerta = {
    contactNumber: numero,
    description: descricao,
    location: {
      lat: latitude,
      lng: longitude
    },
    type: tipo,
    status: AlertStatus.NEW,
    timestamp: Date.now()
  };

  await push(alertasRef, novoAlerta);

  // Disparar Notificação Push para os Policiais
  await enviarNotificacaoPushParaTodos(tipo);
};

/**
 * 2. Função escutarEmergencias
 * Escuta o nó "notificacoes" em tempo real.
 */
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
  });
};

/**
 * Atualizar o status de uma emergência
 */
export const atualizarStatusEmergencia = async (id: string, novoStatus: AlertStatus) => {
  const alertaRef = ref(db, `notificacoes/${id}`);
  await update(alertaRef, {
    status: novoStatus
  });
};

// --- FUNÇÕES DE NOTIFICAÇÃO (FCM) ---

/**
 * Solicita permissão ao usuário (Policial) e salva o token no DB
 */
export const solicitarPermissaoNotificacao = async (badgeId: string) => {
  if (!messaging) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, {
        vapidKey: "BOyF-uYp2sO_..._SUA_VAPID_KEY_AQUI" // Opcional se usar configuração padrão
      });
      
      if (token) {
        console.log("Token FCM gerado:", token);
        // Salvar token na tabela 'usuarios'
        await salvarTokenNoBanco(badgeId, token);
      }
    }
  } catch (error) {
    console.error("Erro ao obter token FCM:", error);
  }
};

/**
 * Salva o token device_token na tabela usuarios/{badgeId}
 */
const salvarTokenNoBanco = async (badgeId: string, token: string) => {
  const userRef = ref(db, `usuarios/${badgeId}`);
  await update(userRef, {
    device_token: token,
    last_login: Date.now()
  });
};

/**
 * Função Listener para mensagens em Foreground (App aberto)
 */
export const onMessageListener = () => {
  if (!messaging) return Promise.resolve(null);
  return new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });
};

/**
 * LÓGICA DE ENVIO (Client-Side)
 * Lê todos os tokens de 'usuarios' e envia fetch para o Google FCM.
 */
const enviarNotificacaoPushParaTodos = async (tipoEmergencia: string) => {
  if (FCM_SERVER_KEY.includes("SUA_SERVER_KEY")) {
    console.warn("FCM: Chave do servidor não configurada. Notificação Push ignorada.");
    return;
  }

  try {
    // 1. Ler todos os usuários para pegar os tokens
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, `usuarios`));
    
    if (snapshot.exists()) {
      const usuarios = snapshot.val();
      const tokens: string[] = [];

      // Extrair tokens
      Object.keys(usuarios).forEach((key) => {
        const u = usuarios[key];
        if (u.device_token) {
          tokens.push(u.device_token);
        }
      });

      if (tokens.length === 0) return;

      // 2. Enviar notificação para cada token (ou multicast se suportado)
      // Nota: Client-side iterar é a única forma sem backend Cloud Function
      const promises = tokens.map(token => {
        return fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${FCM_SERVER_KEY}`
          },
          body: JSON.stringify({
            to: token,
            notification: {
              title: "Nova Ocorrência GOGOMA",
              body: `Há um novo pedido de socorro: ${tipoEmergencia}`,
              icon: "/icon.png", // Certifique-se de ter um ícone
              click_action: "https://gogoma.app/" // URL do seu app
            },
            priority: "high"
          })
        });
      });

      await Promise.all(promises);
      console.log(`Notificação enviada para ${tokens.length} dispositivos.`);
    }
  } catch (error) {
    console.error("Erro ao enviar notificações Push:", error);
  }
};
