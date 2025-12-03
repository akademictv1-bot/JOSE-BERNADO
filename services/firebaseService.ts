import * as firebaseApp from "firebase/app";
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
const app = firebaseApp.initializeApp(firebaseConfig);
const db = getDatabase(app);
let messaging: any = null;

// Inicializar Messaging apenas se suportado
try {
  messaging = getMessaging(app);
} catch (e) {
  console.warn("Firebase Messaging não suportado neste navegador.", e);
}

// CHAVE DO SERVIDOR PARA ENVIAR NOTIFICAÇÕES (Legacy API Key)
// ATENÇÃO: Substitua pela sua Server Key real do console do Firebase para que o envio funcione
const FCM_SERVER_KEY = "SUA_SERVER_KEY_AQUI"; 

/**
 * 1. Função enviarEmergencia
 * Envia dados para o DB e dispara notificação PUSH.
 */
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
    description: descricao,
    location: {
      lat: latitude,
      lng: longitude
    },
    type: tipo,
    status: AlertStatus.NEW,
    timestamp: Date.now(),
    manualAddress: enderecoManual
  };

  await push(alertasRef, novoAlerta);

  // 4) Quando cidadão cria pedido, envia notificação push para polícias
  await enviarNotificacaoPushParaTodos(
    "🚨 Novo Pedido de Socorro",
    "Um cidadão pediu ajuda. Clique para abrir."
  );
};

/**
 * 2. Função escutarEmergencias
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
 * Atualizar status
 */
export const atualizarStatusEmergencia = async (id: string, novoStatus: AlertStatus) => {
  const alertaRef = ref(db, `notificacoes/${id}`);
  await update(alertaRef, {
    status: novoStatus
  });
};

// --- FUNÇÕES DE NOTIFICAÇÃO (FCM) ---

/**
 * 2) & 3) Solicita permissão e grava token em 'policias/{ID}/token'
 */
export const solicitarPermissaoNotificacao = async (badgeId: string) => {
  if (!messaging) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // INSERIDO: Chave VAPID fornecida pelo usuário
      const token = await getToken(messaging, {
        vapidKey: "BJjEAoUmes2nPKi3nc4YA9ORy29oaUCDnTLYSc6Lw5t_oY-FlYyTUBDcyFRaceJAbTBND7cFwfAGOhZAwPbGrEQ"
      });
      
      if (token) {
        console.log("Token FCM gerado e salvo para o agente:", badgeId);
        // Salvar token na tabela 'policias' conforme solicitado
        await salvarTokenPolicia(badgeId, token);
      }
    }
  } catch (error) {
    console.error("Erro ao obter token FCM:", error);
  }
};

/**
 * Salva o token device_token na tabela policias/{badgeId}/token
 */
const salvarTokenPolicia = async (badgeId: string, token: string) => {
  // Caminho exato solicitado: policias/{ID_do_polícia}/token
  const userRef = ref(db, `policias/${badgeId}`);
  await update(userRef, {
    token: token,
    last_login: Date.now()
  });
};

/**
 * Listener Foreground
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
 * 9) LÓGICA DE ENVIO (Script de Envio)
 * Lê tokens de 'policias' e envia POST para FCM.
 */
export const enviarNotificacaoPushParaTodos = async (titulo: string, corpo: string) => {
  // Verificação de segurança simples
  if (!FCM_SERVER_KEY || FCM_SERVER_KEY.includes("SUA_SERVER_KEY")) {
    console.warn("FCM: Chave do servidor não configurada. Notificação Push ignorada. Obtenha a Server Key no Console do Firebase.");
    return;
  }

  try {
    // 1. Ler todos os policias para pegar os tokens
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, `policias`));
    
    if (snapshot.exists()) {
      const policias = snapshot.val();
      const tokens: string[] = [];

      // Extrair tokens salvos na estrutura policias/{id}/token
      Object.keys(policias).forEach((key) => {
        const p = policias[key];
        if (p && p.token) {
          tokens.push(p.token);
        }
      });

      if (tokens.length === 0) return;

      console.log(`Enviando Push para ${tokens.length} policiais...`);

      // 2. Enviar notificação para cada token
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
              title: titulo,
              body: corpo,
              icon: "/icon.png",
              click_action: "https://gogoma.app/" // URL do app
            },
            priority: "high"
          })
        });
      });

      await Promise.all(promises);
      console.log("Notificações enviadas com sucesso.");
    }
  } catch (error) {
    console.error("Erro ao enviar notificações Push:", error);
  }
};