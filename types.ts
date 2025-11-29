export enum EmergencyType {
  POLICE_CIVIL = 'Polícia Civil',
  POLICE_TRAFFIC = 'Polícia Trânsito',
  DISASTER = 'Clima/Desastre',
  GENERAL = 'Emergência Geral'
}

export enum AlertStatus {
  NEW = 'NOVO',
  IN_PROGRESS = 'EM TRÂNSITO',
  RESOLVED = 'RESOLVIDO'
}

export interface GeoLocation {
  lat: number | null; // Allow null for fallback
  lng: number | null; // Allow null for fallback
  accuracy?: number;
}

export interface EmergencyAlert {
  id: string;
  type: EmergencyType;
  location: GeoLocation;
  timestamp: number; // Unix timestamp
  status: AlertStatus;
  description?: string; // Optional description
  contactNumber: string; // Mandatory contact number
  aiAdvice?: string; // Field for Gemini generated advice
}

// Simple base64 beep for the alarm
export const ALARM_SOUND_B64 = "data:audio/wav;base64,UklGRl9vT1BXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"; // Placeholder, simplified