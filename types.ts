export interface WeightEntry {
  id: string;
  weight: number;
  crateCount: number;
  timestamp: number;
}

export interface MortalityEntry {
  id: string;
  count: number;
  weight: number;
  timestamp: number;
}

export interface Sale {
  id: string;
  clientName: string;
  targetFullCrates: number; // Limit of crates for this client
  createdAt: number;
  fullCrates: WeightEntry[];
  emptyCrates: WeightEntry[];
  mortality: MortalityEntry[];
  isCompleted: boolean;
}

export interface Provider {
  id: string;
  name: string;
  logo?: string;
  initialFullCrates: number;
  chickensPerCrate: number;
  createdAt: number;
  sales: Sale[];
  isActive: boolean;
}

export interface InventoryState {
  mainClient: string;
  mainClientLogo?: string;
  initialFullCrates: number;
  chickensPerCrate: number;
}

export interface AppConfig {
  appLogo?: string;
  printerType?: 'BLUETOOTH' | 'WIFI'; // WIFI uses system driver/window.print
  printerIp?: string; // Optional for future implementations
}

export enum AppView {
  MENU = 'MENU',
  PROVIDERS = 'PROVIDERS',
  GLOBAL_SUMMARY = 'GLOBAL_SUMMARY',
  SETTINGS = 'SETTINGS',
  DASHBOARD = 'DASHBOARD',
  SALE_DETAIL = 'SALE_DETAIL',
  SUMMARY = 'SUMMARY'
}