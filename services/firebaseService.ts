import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  updateDoc, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  setDoc, 
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { EmergencyAlert, AlertStatus, UserProfile } from '../types';

const firebaseConfig = {
  apiKey: "AIzaSyAiCRqKono7N2KxkCGpPD9lAlHRx-AUGKY",
  authDomain: "gogoma-2.firebaseapp.com",
  databaseURL: "https://gogoma-2-default-rtdb.firebaseio.com",
  projectId: "gogoma-2",
  storageBucket: "gogoma-2.firebasestorage.app",
  messagingSenderId: "50833835620",
  appId: "1:50833835620:web:c63b6def7f1ccc23ad8171"
};

const app = initializeApp(firebaseConfig);

/**
 * Inicializa o Firestore com o novo sistema de cache persistente (v10.x+)
 * Substitui o deprecated enableIndexedDbPersistence()
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

/**
 * Converte dados do Firebase para objetos simples JS.
 * Fundamental para evitar erros de "circular structure" com Timestamps e DocumentRefs.
 */
const cleanData = (data: any) => {
  if (!data) return data;
  const clean: any = {};
  Object.keys(data).forEach(key => {
    const val = data[key];
    if (val && typeof val === 'object' && typeof val.toDate === 'function') {
      clean[key] = val.toDate().getTime();
    } 
    else if (val && typeof val === 'object' && !Array.isArray(val)) {
       clean[key] = { ...val };
    }
    else {
      clean[key] = val;
    }
  });
  return clean;
};

export async function buscarUsuarioPorNumero(phoneNumber: string): Promise<UserProfile | null> {
  try {
    const userDoc = await getDoc(doc(db, 'usuarios', phoneNumber));
    return userDoc.exists() ? (userDoc.data() as UserProfile) : null;
  } catch (error) {
    console.error('Erro Firebase:', error);
    throw error;
  }
}

export async function verificarUsuarioExistente(phoneNumber: string, name: string): Promise<{ exists: boolean; reason?: string }> {
  try {
    const userDoc = await getDoc(doc(db, 'usuarios', phoneNumber));
    if (userDoc.exists()) return { exists: true, reason: 'Número já cadastrado.' };
    const q = query(collection(db, 'usuarios'), where('name', '==', name));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) return { exists: true, reason: 'Nome já cadastrado.' };
    return { exists: false };
  } catch (error) { throw error; }
}

export async function registrarUsuario(perfil: UserProfile) {
  await setDoc(doc(db, 'usuarios', perfil.phoneNumber), { 
    ...perfil, 
    dataRegisto: Date.now() 
  });
}

export async function criarEmergencia(alerta: any) {
  const docRef = await addDoc(collection(db, 'emergencias'), {
    ...alerta,
    timestamp: Date.now(),
    status: AlertStatus.NEW,
  });
  return docRef.id;
}

export function escutarEmergencias(callback: (alertas: EmergencyAlert[]) => void) {
  return onSnapshot(collection(db, 'emergencias'), (snapshot) => {
    const alertas: EmergencyAlert[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      alertas.push({ id: doc.id, ...cleanData(data) } as EmergencyAlert);
    });
    alertas.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(alertas);
  }, (error) => {
    console.error("Erro no Listener Realtime:", error);
  });
}

export async function atualizarStatusEmergencia(emergenciaId: string, novoStatus: AlertStatus) {
  const docRef = doc(db, 'emergencias', emergenciaId);
  await updateDoc(docRef, { status: novoStatus, dataAtualizacao: Date.now() });
}

export async function adicionarConselhoIA(emergenciaId: string, conselho: string) {
  const docRef = doc(db, 'emergencias', emergenciaId);
  await updateDoc(docRef, { aiAdvice: conselho });
}

export default { buscarUsuarioPorNumero, registrarUsuario, criarEmergencia, escutarEmergencias, atualizarStatusEmergencia };