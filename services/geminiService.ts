import { GoogleGenAI } from "@google/genai";
import { EmergencyType, GeoLocation } from "../types";

export const getPoliceProtocol = async (
  type: EmergencyType,
  location: GeoLocation
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `
      Você é um assistente tático para a polícia de Moçambique.
      Recebemos um alerta de: ${type}.
      Localização aproximada (Lat/Lng): ${location.lat}, ${location.lng}.

      Gere um "Protocolo de Ação Imediata" curto e direto (máximo 4 pontos) para o policial despachante.
      Foque em segurança, verificação e recursos necessários.
      Use português de Moçambique.
      Formato: Texto simples com bullet points. Sem preâmbulos.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Não foi possível gerar o protocolo. Siga os procedimentos padrão.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Erro de conexão com IA. Siga os procedimentos padrão.";
  }
};