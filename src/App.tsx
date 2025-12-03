import React, { useState, useEffect, useRef } from 'react';
import { Plus, Users, ArrowLeft, FileText, Scale, Settings, Upload, Image as ImageIcon, Bluetooth, Printer, RefreshCw, LogOut, Home, Lock, Unlock, Trash2, Edit, AlertTriangle, LayoutGrid, PieChart, X, Calendar, Search, BarChart3, ClipboardList, Copy, Eye, Download, Smartphone, TrendingUp, Wifi, Package, Activity } from 'lucide-react';
import { Sale, InventoryState, AppView, AppConfig, Provider } from './types';
import { WeighingPanel } from './components/WeighingPanel';
import { generateDailyReport } from './services/gemini';

// --- Bluetooth Type Definitions ---
interface BluetoothDevice {
  id: string;
  name?: string;
  gatt?: {
    connect: () => Promise<any>;
  };
}

interface BluetoothRemoteGATTCharacteristic {
  writeValue: (value: BufferSource) => Promise<void>;
  readValue: () => Promise<DataView>;
  startNotifications: () => Promise<void>;
  addEventListener: (type: string, listener: (event: any) => void) => void;
  value?: DataView;
}

declare global {
  interface Navigator {
    bluetooth: {
      requestDevice: (options: any) => Promise<BluetoothDevice>;
    };
  }
  interface Window {
    deferredPrompt: any;
  }
}

// --- ESC/POS Printer Helpers ---
const ESC = '\x1b';
const GS = '\x1d';
const COMMANDS = {
  INIT: ESC + '@',
  BOLD_ON: ESC + 'E' + '\x01',
  BOLD_OFF: ESC + 'E' + '\x00',
  CENTER: ESC + 'a' + '\x01',
  LEFT: ESC + 'a' + '\x00',
  CUT: GS + 'V' + '\x41' + '\x00'
};

// --- Metric Calculations ---
const calculateSaleMetrics = (sale: Sale, chickensPerCrate: number = 9) => {
  const fullWeight = sale.fullCrates.reduce((a, b) => a + b.weight, 0);
  const fullCount = sale.fullCrates.reduce((a, b) => a + b.crateCount, 0);
  
  const emptyWeight = sale.emptyCrates.reduce((a, b) => a + b.weight, 0);
  const emptyCount = sale.emptyCrates.reduce((a, b) => a + b.crateCount, 0);
  
  const deadCount = sale.mortality.reduce((a, b) => a + b.count, 0);
  const deadWeight = sale.mortality.reduce((a, b) => a + b.weight, 0);

  const avgTare = emptyCount > 0 ? emptyWeight / emptyCount : 2.5;
  const totalTare = fullCount * avgTare;
  const netWeight = Math.max(0, fullWeight - totalTare - deadWeight);

  // Average Weight per Bird Calculation
  // Total Birds = (Full Crates * Chickens per Crate) - Dead Birds
  const totalBirds = (fullCount * chickensPerCrate) - deadCount;
  const avgWeightPerBird = totalBirds > 0 ? netWeight / totalBirds : 0;

  return { fullWeight, fullCount, emptyWeight, emptyCount, avgTare, totalTare, deadCount, deadWeight, netWeight, totalBirds, avgWeightPerBird };
};

// --- Simple Chart Components ---
const SimpleLineChart = ({ data, labels, color = "#ef4444" }: { data: number[], labels: string[], color?: string }) => {
    if (data.length < 1) return <div className="h-40 flex items-center justify-center text-gray-400 text-xs">Sin datos</div>;
    
    const max = Math.max(...data, 1);
    const min = 0;
    const height = 100;
    const width = 100;
    
    // Create points for polyline
    const points = data.map((val, idx) => {
        const x = data.length === 1 ? 50 : (idx / (data.length - 1)) * width;
        const y = height - ((val - min) / (max - min)) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="w-full h-48 relative pt-4">
             <div className="absolute inset-0 flex items-end justify-between px-2 pb-6 opacity-20 pointer-events-none">
                 {/* Grid lines vertical */}
                 {data.map((_, i) => <div key={i} className="h-full w-px bg-gray-400"></div>)}
             </div>
             <svg viewBox={`0 -10 ${width} ${height + 20}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                 <polyline 
                    fill="none" 
                    stroke={color} 
                    strokeWidth="3" 
                    points={points} 
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                 />
                 {data.map((val, idx) => {
                     const x = data.length === 1 ? 50 : (idx / (data.length - 1)) * width;
                     const y = height - ((val - min) / (max - min)) * height;
                     return (
                        <g key={idx}>
                             <circle cx={x} cy={y} r="4" fill="white" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                             <text x={x} y={y - 15} textAnchor="middle" fontSize="10" fill="#374151" className="font-bold">{val}</text>
                        </g>
                     )
                 })}
             </svg>
             <div className="flex justify-between mt-2 px-1">
                 {labels.map((l, i) => (
                     <div key={i} className="text-[10px] text-gray-500 text-center w-16 truncate transform -rotate-45 origin-top-left translate-y-2">{l}</div>
                 ))}
             </div>
        </div>
    );
};

const SimpleBarChart = ({ data, labels }: { data: number[], labels: string[] }) => {
    if (data.length === 0) return <div className="h-40 flex items-center justify-center text-gray-400 text-xs">Sin datos</div>;
    const max = Math.max(...data, 1);
    
    return (
        <div className="flex items-end justify-between h-48 gap-3 pt-6 w-full overflow-x-auto pb-6">
            {data.map((val, idx) => (
                <div key={idx} className="flex-1 min-w-[40px] flex flex-col items-center gap-1 group">
                    <div className="text-[10px] font-bold text-gray-500 mb-1">{val.toFixed(0)}</div>
                    <div 
                        className="w-full bg-blue-500 rounded-t-md hover:bg-blue-600 transition-all relative shadow-sm" 
                        style={{ height: `${(val / max) * 100}%`, minHeight: '4px' }}
                    ></div>
                    <div className="text-[9px] text-gray-600 font-medium truncate w-full text-center mt-1 transform -rotate-45 origin-top-left translate-y-2 h-8">{labels[idx]}</div>
                </div>
            ))}
        </div>
    );
};


export default function App() {
  const [view, setView] = useState<AppView>(AppView.MENU);
  
  // Persistent Config
  const [appConfig, setAppConfig] = useState<AppConfig>({ printerType: 'BLUETOOTH' });
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  
  const currentProvider = providers.find(p => p.id === selectedProviderId);
  const currentSales = currentProvider?.sales || [];
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [newProvider, setNewProvider] = useState<Partial<Provider>>({ chickensPerCrate: 9 });

  // Bluetooth State
  const [scaleDevice, setScaleDevice] = useState<BluetoothDevice | null>(null);
  const [scaleChar, setScaleChar] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [printerDevice, setPrinterDevice] = useState<BluetoothDevice | null>(null);
  const [printerChar, setPrinterChar] = useState<BluetoothRemoteGATTCharacteristic | null>(null);

  // Ticket Preview State
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketContent, setTicketContent] = useState('');

  // Weight Details Modal State
  const [detailSale, setDetailSale] = useState<Sale | null>(null);

  // AI Report
  const [aiReport, setAiReport] = useState<string>('');
  const [loadingReport, setLoadingReport] = useState(false);

  // PWA Install State
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  // --- Persistence ---
  useEffect(() => {
    const savedLogo = localStorage.getItem('polloControl_appLogo');
    const savedPrinterType = localStorage.getItem('polloControl_printerType');
    
    setAppConfig(prev => ({ 
        ...prev, 
        appLogo: savedLogo || undefined,
        printerType: (savedPrinterType as 'BLUETOOTH' | 'WIFI') || 'BLUETOOTH'
    }));
    
    const savedProviders = localStorage.getItem('polloControl_providers');
    if (savedProviders) {
        try {
            setProviders(JSON.parse(savedProviders));
        } catch (e) {
            console.error("Error loading providers", e);
        }
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      window.deferredPrompt = e;
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (providers.length > 0) {
        localStorage.setItem('polloControl_providers', JSON.stringify(providers));
    }
  }, [providers]);

  // --- Logic ---

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const saveConfig = (newConfig: Partial<AppConfig>) => {
      const updated = { ...appConfig, ...newConfig };
      setAppConfig(updated);
      if (updated.printerType) localStorage.setItem('polloControl_printerType', updated.printerType);
      if (updated.appLogo) localStorage.setItem('polloControl_appLogo', updated.appLogo);
  };

  const handleCreateProvider = () => {
    if (!newProvider.name || !newProvider.initialFullCrates) {
        alert("Ingrese nombre y total de jabas");
        return;
    }
    const provider: Provider = {
        id: Date.now().toString(),
        name: newProvider.name,
        logo: newProvider.logo,
        initialFullCrates: Number(newProvider.initialFullCrates),
        chickensPerCrate: Number(newProvider.chickensPerCrate) || 9,
        createdAt: Date.now(),
        sales: [],
        isActive: true
    };
    setProviders([...providers, provider]);
    setNewProvider({ chickensPerCrate: 9, name: '', initialFullCrates: 0, logo: '' });
    setShowProviderForm(false);
  };

  const handleDeleteProvider = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("¿Eliminar este proveedor y todo su historial? Esta acción no se puede deshacer.")) {
        setProviders(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleDeleteSale = (saleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedProviderId) return;
    
    if (window.confirm("¿Está seguro de ELIMINAR este cliente? Se borrarán todas sus pesas y estadísticas. Use esta opción si ingresó mal el límite de jabas.")) {
        const updatedSales = currentSales.filter(s => s.id !== saleId);
        handleUpdateProviderSales(selectedProviderId, updatedSales);
        
        if (detailSale?.id === saleId) setDetailSale(null);
        if (currentSaleId === saleId) {
            setView(AppView.DASHBOARD);
            setCurrentSaleId(null);
        }
    }
  };

  const handleUpdateProviderSales = (providerId: string, updatedSales: Sale[]) => {
      setProviders(prev => prev.map(p => {
          if (p.id === providerId) {
              return { ...p, sales: updatedSales };
          }
          return p;
      }));
  };

  // --- Bluetooth Connection ---
  const connectScale = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: false,
        filters: [
            { namePrefix: 'HC' }, 
            { namePrefix: 'BT' }, 
            { namePrefix: 'Scale' },
            { services: ['0000ffe0-0000-1000-8000-00805f9b34fb'] }
        ],
        optionalServices: ['00001800-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb']
      });
      
      const server = await device.gatt?.connect();
      if (!server) throw new Error("No se pudo conectar al servidor GATT");

      const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
      
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
          // Future real-time updates
      });
      setScaleChar(characteristic);
      setScaleDevice(device);
      alert(`Balanza conectada: ${device.name}`);

    } catch (err) {
      alert("Error conectando balanza: " + err);
      // Fallback visual para simulación
      setScaleDevice({ id: 'simulated', name: 'Simulador (Demo)' } as BluetoothDevice);
    }
  };

  const readScaleWeight = async () => {
    if (scaleChar && scaleChar.value) {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(scaleChar.value);
        const match = text.match(/[\d]+(\.[\d]+)?/);
        if (match) return parseFloat(match[0]);
    }
    return parseFloat((Math.random() * 20 + 10).toFixed(2));
  };

  const connectPrinter = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: false,
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });
      const server = await device.gatt?.connect();
      if (!server) throw new Error("GATT Server Error");
      
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
      
      setPrinterDevice(device);
      setPrinterChar(characteristic);
      alert(`Impresora conectada: ${device.name}`);
    } catch (err) {
      alert("No se pudo conectar por Bluetooth. Verifique que la impresora esté encendida.");
      setPrinterDevice(null);
    }
  };

  const openTicketPreview = (text: string) => {
    setTicketContent(text);
    setTicketModalOpen(true);
  };

  // --- Printing Logic ---
  const printViaBrowser = (text: string) => {
    // Esta función usa la capacidad nativa del navegador para imprimir en impresoras WiFi
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Por favor, permita las ventanas emergentes para imprimir por WiFi.");
        return;
    }
    
    // Limpieza de códigos ESC/POS para visualización HTML
    const cleanText = text.replace(/\x1b/g, '').replace(/\x1d/g, '');
    const htmlContent = `
        <html>
        <head>
            <title>Ticket Pollo Control</title>
            <style>
                body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 10px; width: 300px; }
                pre { white-space: pre-wrap; word-wrap: break-word; }
                .bold { font-weight: bold; }
                .center { text-align: center; }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            <pre>${cleanText}</pre>
        </body>
        </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handlePrintAction = async (text: string) => {
    if (appConfig.printerType === 'WIFI') {
        printViaBrowser(text);
        return;
    }

    // Bluetooth Logic
    if (printerDevice && printerChar) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(COMMANDS.INIT + text + '\n\n\n' + COMMANDS.CUT);
            await printerChar.writeValue(data);
            alert("Enviado a impresora Bluetooth");
        } catch (e) {
            console.error("Fallo impresión BT", e);
            alert("Error enviando datos. Intente reconectar.");
        }
    } else {
        alert("Impresora Bluetooth no conectada. Conéctela en Configuración o cambie a modo WiFi.");
    }
  };

  // --- Reports ---
  const generateTicket = (sale: Sale, provider: Provider) => {
    const m = calculateSaleMetrics(sale, provider.chickensPerCrate);
    const date = new Date(sale.createdAt).toLocaleString();
    return `
${COMMANDS.CENTER}POLLO CONTROL PRO
PROVEEDOR: ${provider.name.toUpperCase()}
--------------------------------
CLIENTE: ${sale.clientName.toUpperCase()}
FECHA: ${date}
${sale.isCompleted ? '(VENTA CERRADA)' : '(PENDIENTE)'}
--------------------------------
${COMMANDS.LEFT}
Jabas Solicitadas: ${sale.targetFullCrates}
Jabas Llenas:      ${m.fullCount}
Peso Bruto:        ${m.fullWeight.toFixed(2)} kg
Jabas Vacias:      ${m.emptyCount}
Tara (Prom):       ${m.totalTare.toFixed(2)} kg
Muertos:           ${m.deadCount} und
Peso Muertos:      ${m.deadWeight.toFixed(2)} kg
--------------------------------
${COMMANDS.BOLD_ON}PESO NETO:      ${m.netWeight.toFixed(2)} kg${COMMANDS.BOLD_OFF}
Prom. Pollo:       ${m.avgWeightPerBird.toFixed(3)} kg
--------------------------------
`;
  };

  const generateProviderSummary = () => {
    if (!currentProvider) return '';
    const totals = currentSales.reduce((acc, sale) => {
      const m = calculateSaleMetrics(sale, currentProvider.chickensPerCrate);
      return {
        fc: acc.fc + m.fullCount,
        fw: acc.fw + m.fullWeight,
        ec: acc.ec + m.emptyCount,
        tt: acc.tt + m.totalTare,
        dc: acc.dc + m.deadCount,
        dw: acc.dw + m.deadWeight,
        nw: acc.nw + m.netWeight,
        birds: acc.birds + m.totalBirds
      };
    }, { fc:0, fw:0, ec:0, tt:0, dc:0, dw:0, nw:0, birds: 0 });

    const totalAvg = totals.birds > 0 ? totals.nw / totals.birds : 0;
    const date = new Date().toLocaleString();

    return `
${COMMANDS.CENTER}RESUMEN DE PROVEEDOR
${currentProvider.name.toUpperCase()}
${date}
--------------------------------
${COMMANDS.LEFT}
Total Ventas:   ${currentSales.length}
Stock Inicial:  ${currentProvider.initialFullCrates} Jabas
Jabas Vendidas: ${totals.fc}
Stock Actual:   ${currentProvider.initialFullCrates - totals.fc}
--------------------------------
Peso Bruto Tot: ${totals.fw.toFixed(2)} kg
Tara Total:     ${totals.tt.toFixed(2)} kg
Muertos Total:  ${totals.dc} u / ${totals.dw.toFixed(2)} kg
--------------------------------
${COMMANDS.BOLD_ON}NETO TOTAL:     ${totals.nw.toFixed(2)} kg${COMMANDS.BOLD_OFF}
PROMEDIO POLLO: ${totalAvg.toFixed(3)} kg
--------------------------------
`;
  };

  // --- Functions ---
  const copySaleDetailsToClipboard = (sale: Sale) => {
     if(!currentProvider) return;
     const m = calculateSaleMetrics(sale, currentProvider.chickensPerCrate);
     let text = `*📋 DETALLE - ${sale.clientName}*\n`;
     text += `Neto: ${m.netWeight.toFixed(2)} kg\n`;
     text += `Promedio: ${m.avgWeightPerBird.toFixed(3)} kg/u\n`;
     navigator.clipboard.writeText(text);
     alert("Copiado al portapapeles");
  };

  const copyProviderSummaryToClipboard = () => {
    if (!currentProvider) return;
    let text = `*📊 REPORTE - ${currentProvider.name}*\n`;
    navigator.clipboard.writeText(text);
    alert("Copiado al portapapeles");
  };

  // --- Sale Operations ---
  const handleCreateSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProviderId) return;
    
    const form = e.target as HTMLFormElement;
    const nameInput = form.elements.namedItem('clientName') as HTMLInputElement;
    const limitInput = form.elements.namedItem('crateLimit') as HTMLInputElement;
    
    const name = nameInput.value;
    const limit = parseInt(limitInput.value);

    if (!name || isNaN(limit) || limit <= 0) {
      alert("Ingrese nombre de cliente y cantidad de jabas a pesar");
      return;
    }

    const newSale: Sale = {
      id: Date.now().toString(),
      clientName: name,
      targetFullCrates: limit,
      createdAt: Date.now(),
      fullCrates: [],
      emptyCrates: [],
      mortality: [],
      isCompleted: false,
    };
    handleUpdateProviderSales(selectedProviderId, [...currentSales, newSale]);
    setCurrentSaleId(newSale.id);
    setView(AppView.SALE_DETAIL);
    form.reset();
  };

  const toggleSaleLock = (saleId: string) => {
      if (!selectedProviderId) return;
      const updatedSales = currentSales.map(s => {
          if (s.id === saleId) return { ...s, isCompleted: !s.isCompleted };
          return s;
      });
      handleUpdateProviderSales(selectedProviderId, updatedSales);
  };

  const addWeight = (type: 'FULL' | 'EMPTY' | 'MORTALITY', weight: number, count: number) => {
    if (!currentSaleId || !selectedProviderId || !currentProvider) return;
    const currentSale = currentSales.find(s => s.id === currentSaleId);
    if (!currentSale) return;

    if (type === 'FULL') {
        const totalSoldGlobal = currentSales.reduce((acc, s) => acc + s.fullCrates.reduce((sum, c) => sum + c.crateCount, 0), 0);
        if (totalSoldGlobal + count > currentProvider.initialFullCrates) {
            alert(`Stock insuficiente.`);
            return;
        }
        const currentClientCount = currentSale.fullCrates.reduce((sum, c) => sum + c.crateCount, 0);
        if (currentClientCount + count > currentSale.targetFullCrates) {
             alert(`Límite del cliente excedido.`);
             return;
        }
    }
    if (type === 'EMPTY') {
        const totalFullCrates = currentSale.fullCrates.reduce((sum, c) => sum + c.crateCount, 0);
        const totalEmptyCrates = currentSale.emptyCrates.reduce((sum, c) => sum + c.crateCount, 0);
        if (totalEmptyCrates + count > totalFullCrates) {
            alert(`No puede devolver más vacías que llenas.`);
            return;
        }
    }

    const entryId = Date.now().toString();
    const timestamp = Date.now();
    const updatedSales = currentSales.map(sale => {
      if (sale.id === currentSaleId) {
        if (sale.isCompleted) return sale; 
        if (type === 'FULL') return { ...sale, fullCrates: [...sale.fullCrates, { id: entryId, weight, crateCount: count, timestamp }] };
        if (type === 'EMPTY') return { ...sale, emptyCrates: [...sale.emptyCrates, { id: entryId, weight, crateCount: count, timestamp }] };
        return { ...sale, mortality: [...sale.mortality, { id: entryId, weight, count, timestamp }] };
      }
      return sale;
    });
    handleUpdateProviderSales(selectedProviderId, updatedSales);
  };

  const deleteEntry = (type: 'FULL' | 'EMPTY' | 'MORTALITY', id: string) => {
    if (!currentSaleId || !selectedProviderId) return;
    const updatedSales = currentSales.map(sale => {
      if (sale.id === currentSaleId) {
        if (sale.isCompleted) return sale;
        if (type === 'FULL') return { ...sale, fullCrates: sale.fullCrates.filter(e => e.id !== id) };
        if (type === 'EMPTY') return { ...sale, emptyCrates: sale.emptyCrates.filter(e => e.id !== id) };
        return { ...sale, mortality: sale.mortality.filter(e => e.id !== id) };
      }
      return sale;
    });
    handleUpdateProviderSales(selectedProviderId, updatedSales);
  };

  const handleAppLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => saveConfig({ appLogo: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  // --- Renders ---
  const renderTicketModal = () => {
    if (!ticketModalOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Printer size={18} /> Vista Previa
            </h3>
            <button onClick={() => setTicketModalOpen(false)} className="p-1 hover:bg-gray-200 rounded-full transition"><X size={20}/></button>
          </div>
          <div className="p-6 bg-gray-100 overflow-y-auto flex-1">
             <div className="bg-white p-4 shadow-sm border border-gray-200 font-mono text-sm whitespace-pre-wrap text-gray-800 mx-auto max-w-[300px]">
                {ticketContent.replace(/\x1b/g, '').replace(/\x1d/g, '')}
             </div>
          </div>
          <div className="p-4 border-t bg-white flex gap-3">
            <button onClick={() => setTicketModalOpen(false)} className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition">Cancelar</button>
            <button onClick={() => { handlePrintAction(ticketContent); setTicketModalOpen(false); }} className="flex-1 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold shadow-md transition flex justify-center items-center gap-2">
              {appConfig.printerType === 'WIFI' ? <Wifi size={16} /> : <Bluetooth size={16} />} Imprimir
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderWeightDetailModal = () => {
      if (!detailSale || !currentProvider) return null;
      const m = calculateSaleMetrics(detailSale, currentProvider.chickensPerCrate);
      const maxRows = Math.max(detailSale.fullCrates.length, detailSale.emptyCrates.length, detailSale.mortality.length);
      const rows = Array.from({ length: maxRows }, (_, i) => ({
        full: detailSale.fullCrates[i],
        empty: detailSale.emptyCrates[i],
        mort: detailSale.mortality[i]
      }));
      return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full flex flex-col max-h-[90vh]">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-xl text-gray-800">Detalle: {detailSale.clientName}</h3>
                    <button onClick={() => setDetailSale(null)} className="p-2 hover:bg-gray-100 rounded-full"><X/></button>
                </div>
                <div className="p-4 overflow-y-auto flex-1">
                    <table className="w-full text-sm border">
                       <thead className="bg-gray-100 font-bold">
                           <tr>
                               <th className="p-2 border">#</th>
                               <th className="p-2 border text-blue-800">Llenas (Kg)</th>
                               <th className="p-2 border text-gray-800">Vacías (Kg)</th>
                               <th className="p-2 border text-red-800">Muertos (Kg)</th>
                           </tr>
                       </thead>
                       <tbody>
                           {rows.map((r, i) => (
                               <tr key={i} className="border-b">
                                   <td className="p-2 text-center">{i+1}</td>
                                   <td className="p-2 text-center">{r.full ? `${r.full.weight.toFixed(2)} (${r.full.crateCount}j)` : ''}</td>
                                   <td className="p-2 text-center">{r.empty ? `${r.empty.weight.toFixed(2)} (${r.empty.crateCount}j)` : ''}</td>
                                   <td className="p-2 text-center">{r.mort ? `${r.mort.weight.toFixed(2)} (${r.mort.count}u)` : ''}</td>
                               </tr>
                           ))}
                       </tbody>
                    </table>
                </div>
                <div className="p-4 border-t flex justify-between items-center bg-gray-50">
                    <div className="flex flex-col">
                        <span className="text-xs text-gray-500 uppercase">Promedio Pollo</span>
                        <span className="font-bold text-lg">{m.avgWeightPerBird.toFixed(3)} kg</span>
                    </div>
                    <div className="text-xl font-bold text-blue-700">Neto: {m.netWeight.toFixed(2)} KG</div>
                    <button onClick={() => setDetailSale(null)} className="px-4 py-2 bg-gray-200 rounded-lg">Cerrar</button>
                </div>
            </div>
        </div>
      );
  };

  // --- Views ---
  const renderSettings = () => {
    return (
    <div className="max-w-2xl mx-auto animate-fade-in">
        <button onClick={() => setView(AppView.MENU)} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-6 font-medium">
             <ArrowLeft size={20} /> Volver al Menú
        </button>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
             <div className="p-6 border-b">
                 <h2 className="text-xl font-bold flex items-center gap-2"><Settings className="text-gray-400" /> Configuración</h2>
             </div>
             
             <div className="p-6 space-y-8">
                 {/* Printer Settings */}
                 <div>
                     <h3 className="font-medium text-gray-900 mb-4">Configuración de Impresión</h3>
                     <div className="grid grid-cols-2 gap-4 mb-4">
                         <button 
                            onClick={() => saveConfig({ printerType: 'BLUETOOTH' })} 
                            className={`p-4 rounded-lg border flex flex-col items-center gap-2 transition ${appConfig.printerType === 'BLUETOOTH' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                         >
                            <Bluetooth size={24} />
                            <span className="font-bold text-sm">Bluetooth</span>
                         </button>
                         <button 
                            onClick={() => saveConfig({ printerType: 'WIFI' })} 
                            className={`p-4 rounded-lg border flex flex-col items-center gap-2 transition ${appConfig.printerType === 'WIFI' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                         >
                            <Wifi size={24} />
                            <span className="font-bold text-sm">WiFi / Sistema</span>
                         </button>
                     </div>
                     
                     {appConfig.printerType === 'BLUETOOTH' && (
                         <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                             <p className="text-xs text-gray-500 mb-3">Conecte su impresora térmica Bluetooth portátil.</p>
                             <button onClick={connectPrinter} className={`w-full py-3 px-4 rounded-lg border flex items-center justify-center gap-2 font-medium ${printerDevice ? 'bg-green-100 text-green-800 border-green-300' : 'bg-white border-gray-300 text-gray-700'}`}>
                                <Printer size={18} /> {printerDevice ? 'Impresora Conectada' : 'Conectar Impresora Bluetooth'}
                             </button>
                         </div>
                     )}

                     {appConfig.printerType === 'WIFI' && (
                         <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                             <p className="text-sm text-gray-700 mb-2 font-bold">Modo Driver de Sistema / WiFi</p>
                             <p className="text-xs text-gray-500">Este modo abre la ventana de impresión nativa de su dispositivo. Asegúrese de que su celular o PC esté conectado a la misma red WiFi que la impresora y que esta sea reconocida por el sistema (ej. AirPrint o Servicio de Impresión Android).</p>
                         </div>
                     )}
                 </div>

                 {/* Scale */}
                 <div className="border-t pt-6">
                     <h3 className="font-medium text-gray-900 mb-4">Balanza Digital</h3>
                     <button onClick={connectScale} className={`w-full py-3 px-4 rounded-lg border flex items-center justify-center gap-2 font-medium ${scaleDevice ? 'bg-green-100 text-green-800 border-green-300' : 'bg-white border-gray-300 text-gray-700'}`}>
                        <Bluetooth size={18} /> {scaleDevice ? 'Balanza Conectada' : 'Conectar Balanza Bluetooth'}
                     </button>
                 </div>

                 {/* Logo */}
                 <div className="border-t pt-6">
                     <h3 className="font-medium text-gray-900 mb-4">Personalización</h3>
                     <div className="flex items-center gap-4">
                         {appConfig.appLogo ? <img src={appConfig.appLogo} className="w-16 h-16 object-contain border rounded" /> : <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center text-gray-400"><ImageIcon/></div>}
                         <label className="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg shadow-sm text-sm font-medium transition">
                             Subir Logo de la Aplicación
                             <input type="file" accept="image/*" className="hidden" onChange={handleAppLogoUpload} />
                         </label>
                     </div>
                 </div>

                 <div className="border-t pt-6">
                     <h3 className="font-medium text-red-600 mb-4">Zona de Peligro</h3>
                     <button onClick={() => { if(window.confirm("¿Borrar todos los datos?")) { localStorage.clear(); window.location.reload(); }}} className="text-red-600 hover:bg-red-50 px-4 py-2 rounded border border-red-200 text-sm font-medium">
                         Restablecer Fábrica (Borrar Todo)
                     </button>
                 </div>
             </div>
        </div>
    </div>
    );
  };

  const renderGlobalSummary = () => {
     // Prepare data for charts
     // Chart 1: Mortality per Provider (Linear)
     const mortalityByProvider = providers.map(p => {
         const totalDead = p.sales.reduce((acc, s) => acc + s.mortality.reduce((sum, m) => sum + m.count, 0), 0);
         return { name: p.name, count: totalDead };
     }).filter(d => d.count > 0);

     // Chart 2: Sales per Client (Bar) - Top 10 clients by net weight
     const clientSales: Record<string, number> = {};
     providers.forEach(p => {
         p.sales.forEach(s => {
             const m = calculateSaleMetrics(s, p.chickensPerCrate);
             if (m.netWeight > 0) {
                 clientSales[s.clientName] = (clientSales[s.clientName] || 0) + m.netWeight;
             }
         });
     });
     
     const topClients = Object.entries(clientSales)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

     return (
         <div className="max-w-6xl mx-auto animate-fade-in pb-12">
             <button onClick={() => setView(AppView.MENU)} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-6 font-medium">
                 <ArrowLeft size={20} /> Volver al Menú
             </button>
             <h2 className="text-2xl font-bold text-gray-800 mb-6">Resumen General Global</h2>
             
             {/* Charts Area */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                 <div className="bg-white p-6 rounded-xl shadow-sm border">
                     <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2 text-red-600"><TrendingUp size={18}/> Pollos Muertos por Proveedor</h3>
                     <p className="text-xs text-gray-400 mb-4">Tendencia de mortalidad</p>
                     <SimpleLineChart 
                        data={mortalityByProvider.map(d => d.count)} 
                        labels={mortalityByProvider.map(d => d.name)} 
                        color="#dc2626"
                     />
                 </div>
                 <div className="bg-white p-6 rounded-xl shadow-sm border">
                     <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2 text-blue-600"><BarChart3 size={18}/> Top Ventas por Cliente (Kg)</h3>
                     <p className="text-xs text-gray-400 mb-4">Peso Neto acumulado</p>
                     <SimpleBarChart 
                        data={topClients.map(([,v]) => v)} 
                        labels={topClients.map(([k]) => k)} 
                     />
                 </div>
             </div>
         </div>
     );
  };

  const renderMainMenu = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in max-w-4xl mx-auto">
      <div 
        onClick={() => setView(AppView.PROVIDERS)}
        className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-lg hover:border-blue-300 transition cursor-pointer group flex flex-col items-center text-center gap-4"
      >
        <div className="p-4 bg-blue-50 text-blue-600 rounded-full group-hover:scale-110 transition-transform">
           <Users size={48} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Gestionar Proveedores</h2>
          <p className="text-gray-500 mt-2">Registrar pesajes, ventas y mermas por proveedor.</p>
        </div>
      </div>

      <div 
        onClick={() => setView(AppView.GLOBAL_SUMMARY)}
        className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-lg hover:border-purple-300 transition cursor-pointer group flex flex-col items-center text-center gap-4"
      >
        <div className="p-4 bg-purple-50 text-purple-600 rounded-full group-hover:scale-110 transition-transform">
           <PieChart size={48} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Resumen Global</h2>
          <p className="text-gray-500 mt-2">Estadísticas generales de todos los proveedores.</p>
        </div>
      </div>

      <div 
        onClick={() => setView(AppView.SETTINGS)}
        className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer flex items-center gap-4"
      >
        <div className="p-3 bg-gray-100 text-gray-600 rounded-lg">
           <Settings size={24} />
        </div>
        <h3 className="font-bold text-gray-700">Configuración</h3>
      </div>
      
      {installPrompt && (
          <div 
            onClick={handleInstallClick}
            className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6 rounded-2xl shadow-md hover:shadow-lg transition cursor-pointer flex items-center justify-center gap-3"
          >
            <Download size={24} />
            <span className="font-bold">Instalar Aplicación</span>
          </div>
      )}
    </div>
  );

  const renderProvidersList = () => (
    <div className="max-w-3xl mx-auto animate-fade-in">
       <button onClick={() => setView(AppView.MENU)} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-6 font-medium">
             <ArrowLeft size={20} /> Volver al Menú
       </button>
       
       <div className="flex justify-between items-center mb-6">
           <h2 className="text-2xl font-bold text-gray-800">Proveedores</h2>
           <button onClick={() => setShowProviderForm(!showProviderForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 transition shadow-sm">
               {showProviderForm ? <X size={20}/> : <Plus size={20}/>} {showProviderForm ? 'Cancelar' : 'Nuevo Proveedor'}
           </button>
       </div>

       {showProviderForm && (
           <div className="bg-white p-6 rounded-xl shadow-md border border-blue-100 mb-8 animate-slide-down">
               <h3 className="font-bold text-gray-800 mb-4">Registrar Nuevo Proveedor</h3>
               <div className="grid gap-4">
                   <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Proveedor</label>
                       <input 
                          type="text" 
                          placeholder="Ej. Avícola San Juan"
                          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          value={newProvider.name || ''}
                          onChange={e => setNewProvider({...newProvider, name: e.target.value})}
                       />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                       <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">Stock Jabas Inicial</label>
                           <input 
                              type="number" 
                              placeholder="0"
                              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                              value={newProvider.initialFullCrates || ''}
                              onChange={e => setNewProvider({...newProvider, initialFullCrates: parseInt(e.target.value)})}
                           />
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">Pollos por Jaba (Ref)</label>
                           <input 
                              type="number" 
                              placeholder="9"
                              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                              value={newProvider.chickensPerCrate || ''}
                              onChange={e => setNewProvider({...newProvider, chickensPerCrate: parseInt(e.target.value)})}
                           />
                       </div>
                   </div>
                   <button onClick={handleCreateProvider} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition mt-2">
                       Guardar Proveedor
                   </button>
               </div>
           </div>
       )}

       <div className="space-y-4">
           {providers.map(provider => (
               <div 
                  key={provider.id} 
                  onClick={() => { setSelectedProviderId(provider.id); setView(AppView.DASHBOARD); }}
                  className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition cursor-pointer flex justify-between items-center group relative overflow-hidden"
               >
                   <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg uppercase">
                           {provider.name.substring(0, 2)}
                       </div>
                       <div>
                           <h3 className="font-bold text-lg text-gray-800">{provider.name}</h3>
                           <p className="text-sm text-gray-500">{provider.sales.length} clientes registrados hoy</p>
                       </div>
                   </div>
                   <div className="flex items-center gap-4">
                        <span className="text-xs bg-gray-100 px-3 py-1 rounded-full text-gray-600 font-medium">
                            Stock: {provider.initialFullCrates - provider.sales.reduce((acc, s) => acc + s.fullCrates.reduce((a, b) => a + b.crateCount, 0), 0)}
                        </span>
                        <button 
                            onClick={(e) => handleDeleteProvider(provider.id, e)}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition z-10"
                        >
                            <Trash2 size={18} />
                        </button>
                   </div>
               </div>
           ))}
           {providers.length === 0 && !showProviderForm && (
               <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-dashed">
                   <Users size={48} className="mx-auto mb-4 opacity-50"/>
                   <p>No hay proveedores registrados.</p>
               </div>
           )}
       </div>
    </div>
  );

  const renderDashboard = () => {
    if (!currentProvider) return null;
    const usedStock = currentSales.reduce((acc, s) => acc + s.fullCrates.reduce((sum, c) => sum + c.crateCount, 0), 0);
    const remainingStock = currentProvider.initialFullCrates - usedStock;

    return (
      <div className="max-w-5xl mx-auto animate-fade-in pb-20">
         <div className="flex items-center justify-between mb-6">
             <button onClick={() => setView(AppView.PROVIDERS)} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 font-medium">
                 <ArrowLeft size={20} /> Volver
             </button>
             <div className="flex gap-2">
                 <button onClick={() => setView(AppView.SUMMARY)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 shadow-sm">
                     <FileText size={18} /> Reporte Día
                 </button>
             </div>
         </div>

         <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8 relative overflow-hidden">
             <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                 <div>
                     <h2 className="text-3xl font-bold text-gray-800">{currentProvider.name}</h2>
                     <p className="text-gray-500 flex items-center gap-2 mt-1"><Calendar size={14}/> {new Date(currentProvider.createdAt).toLocaleDateString()}</p>
                 </div>
                 <div className="flex gap-6 text-right">
                     <div>
                         <div className="text-xs text-gray-500 uppercase font-bold">Stock Inicial</div>
                         <div className="text-2xl font-mono font-bold text-gray-400">{currentProvider.initialFullCrates}</div>
                     </div>
                     <div>
                         <div className="text-xs text-gray-500 uppercase font-bold">Disponible</div>
                         <div className={`text-2xl font-mono font-bold ${remainingStock < 20 ? 'text-red-600' : 'text-green-600'}`}>{remainingStock}</div>
                     </div>
                 </div>
             </div>
         </div>

         {/* New Sale Form */}
         <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-8">
             <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Plus className="text-blue-600"/> Nuevo Cliente / Venta</h3>
             <form onSubmit={handleCreateSale} className="flex flex-col md:flex-row gap-4 items-end">
                 <div className="flex-1 w-full">
                     <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Nombre Cliente</label>
                     <input name="clientName" type="text" placeholder="Ej. Restaurante Central" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                 </div>
                 <div className="w-full md:w-48">
                     <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Jabas a Pesar</label>
                     <input name="crateLimit" type="number" placeholder="0" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                 </div>
                 <button type="submit" className="w-full md:w-auto bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 h-[42px]">
                     Iniciar Pesaje
                 </button>
             </form>
         </div>

         {/* Active Sales List */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {currentSales.slice().reverse().map(sale => {
                 const m = calculateSaleMetrics(sale, currentProvider.chickensPerCrate);
                 const progress = Math.min(100, (m.fullCount / sale.targetFullCrates) * 100);
                 
                 return (
                     <div 
                        key={sale.id} 
                        onClick={() => { setCurrentSaleId(sale.id); setView(AppView.SALE_DETAIL); }}
                        className={`bg-white rounded-xl border shadow-sm cursor-pointer hover:shadow-md transition relative group ${sale.isCompleted ? 'border-gray-200 opacity-80' : 'border-blue-100'}`}
                     >
                         <div className="p-5">
                             <div className="flex justify-between items-start mb-3">
                                 <div>
                                     <h4 className="font-bold text-lg text-gray-800 line-clamp-1">{sale.clientName}</h4>
                                     <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${sale.isCompleted ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                                         {sale.isCompleted ? 'Finalizado' : 'En Proceso'}
                                     </span>
                                 </div>
                                 <button onClick={(e) => handleDeleteSale(sale.id, e)} className="text-gray-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition">
                                     <Trash2 size={16} />
                                 </button>
                             </div>

                             <div className="space-y-3">
                                 <div>
                                     <div className="flex justify-between text-xs text-gray-500 mb-1">
                                         <span>Progreso ({m.fullCount}/{sale.targetFullCrates})</span>
                                         <span>{progress.toFixed(0)}%</span>
                                     </div>
                                     <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                         <div className={`h-full rounded-full ${sale.isCompleted ? 'bg-gray-400' : 'bg-blue-500'}`} style={{width: `${progress}%`}}></div>
                                     </div>
                                 </div>

                                 <div className="flex justify-between items-center pt-2 border-t border-dashed">
                                     <div className="text-xs text-gray-500">Peso Neto</div>
                                     <div className="font-mono font-bold text-xl text-gray-800">{m.netWeight.toFixed(2)} <span className="text-sm text-gray-400">kg</span></div>
                                 </div>
                                 <div className="flex justify-between items-center text-xs">
                                     <span className="text-gray-400">Prom. Pollo:</span>
                                     <span className="font-mono font-medium text-gray-600">{m.avgWeightPerBird.toFixed(2)} kg</span>
                                 </div>
                             </div>
                         </div>
                     </div>
                 );
             })}
         </div>
      </div>
    );
  };

  const renderSaleDetail = () => {
    if (!currentSaleId || !currentProvider) return null;
    const sale = currentSales.find(s => s.id === currentSaleId);
    if (!sale) return null;

    const m = calculateSaleMetrics(sale, currentProvider.chickensPerCrate);
    const isLocked = sale.isCompleted;

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col animate-fade-in">
             <div className="flex items-center justify-between mb-4 flex-shrink-0">
                 <button onClick={() => setView(AppView.DASHBOARD)} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 font-medium">
                     <ArrowLeft size={20} /> Volver
                 </button>
                 <div className="flex items-center gap-2">
                     <button 
                        onClick={() => openTicketPreview(generateTicket(sale, currentProvider))} 
                        className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg shadow-sm hover:bg-gray-50 transition"
                     >
                         <Printer size={20} />
                     </button>
                     <button 
                        onClick={() => setDetailSale(sale)}
                        className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg shadow-sm hover:bg-gray-50 transition"
                     >
                         <Eye size={20} />
                     </button>
                     <button 
                        onClick={() => toggleSaleLock(sale.id)} 
                        className={`px-4 py-2 rounded-lg shadow-sm font-bold text-white flex items-center gap-2 transition ${isLocked ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'}`}
                     >
                         {isLocked ? <Unlock size={18}/> : <Lock size={18}/>} {isLocked ? 'Abrir Venta' : 'Cerrar Venta'}
                     </button>
                 </div>
             </div>

             <div className="bg-white p-4 rounded-xl shadow-sm border mb-4 flex-shrink-0">
                 <div className="flex justify-between items-start">
                     <div>
                         <h2 className="text-2xl font-bold text-gray-800">{sale.clientName}</h2>
                         <div className="flex gap-4 text-sm text-gray-500 mt-1 flex-wrap">
                             <span className="flex items-center gap-1"><Package size={14} className="text-blue-500"/> Meta: {sale.targetFullCrates} jabas</span>
                             <span className="flex items-center gap-1"><Scale size={14} className="text-green-500"/> Neto: {m.netWeight.toFixed(2)} kg</span>
                             <span className="flex items-center gap-1"><Activity size={14} className="text-purple-500"/> Prom: {m.avgWeightPerBird.toFixed(3)} kg</span>
                         </div>
                     </div>
                     <div className="text-right">
                         <div className="text-xs text-gray-400 uppercase font-bold">Balanza</div>
                         <div className="font-mono text-3xl font-bold text-blue-600 cursor-pointer hover:text-blue-800 transition" onClick={async () => {
                             const w = await readScaleWeight();
                             alert(`Peso capturado: ${w}`); 
                         }}>
                             0.00 <span className="text-sm">kg</span>
                         </div>
                     </div>
                 </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
                 <WeighingPanel 
                    type="FULL" 
                    entries={sale.fullCrates} 
                    onAdd={(w, c) => addWeight('FULL', w, c)} 
                    onDelete={(id) => deleteEntry('FULL', id)}
                    disabled={isLocked}
                    maxAllowed={sale.targetFullCrates - m.fullCount}
                 />
                 <WeighingPanel 
                    type="EMPTY" 
                    entries={sale.emptyCrates} 
                    onAdd={(w, c) => addWeight('EMPTY', w, c)} 
                    onDelete={(id) => deleteEntry('EMPTY', id)}
                    disabled={isLocked}
                 />
                 <WeighingPanel 
                    type="MORTALITY" 
                    entries={sale.mortality} 
                    onAdd={(w, c) => addWeight('MORTALITY', w, c)} 
                    onDelete={(id) => deleteEntry('MORTALITY', id)}
                    disabled={isLocked}
                 />
             </div>
        </div>
    );
  };

  const renderSummary = () => {
    if (!currentProvider) return null;
    
    // Calculate provider totals
    const totals = currentSales.reduce((acc, sale) => {
        const m = calculateSaleMetrics(sale, currentProvider.chickensPerCrate);
        return {
            fw: acc.fw + m.fullWeight,
            nw: acc.nw + m.netWeight,
            fc: acc.fc + m.fullCount,
            dc: acc.dc + m.deadCount,
            birds: acc.birds + m.totalBirds
        };
    }, { fw: 0, nw: 0, fc: 0, dc: 0, birds: 0 });

    const providerAvg = totals.birds > 0 ? totals.nw / totals.birds : 0;

    const handleGenerateAIReport = async () => {
        setLoadingReport(true);
        const report = await generateDailyReport({ 
            mainClient: currentProvider.name,
            mainClientLogo: currentProvider.logo,
            initialFullCrates: currentProvider.initialFullCrates,
            chickensPerCrate: currentProvider.chickensPerCrate
        }, currentSales);
        setAiReport(report);
        setLoadingReport(false);
    };

    return (
        <div className="max-w-4xl mx-auto animate-fade-in pb-20">
             <div className="flex items-center justify-between mb-6">
                 <button onClick={() => setView(AppView.DASHBOARD)} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 font-medium">
                     <ArrowLeft size={20} /> Volver al Tablero
                 </button>
             </div>

             <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200 mb-8">
                 <div className="flex justify-between items-start mb-8 border-b pb-6">
                     <div>
                         <h2 className="text-3xl font-bold text-gray-800">Reporte Diario</h2>
                         <p className="text-xl text-gray-500 mt-1">{currentProvider.name}</p>
                         <p className="text-sm text-gray-400 mt-1">{new Date().toLocaleDateString()} - {new Date().toLocaleTimeString()}</p>
                     </div>
                     <button 
                        onClick={() => openTicketPreview(generateProviderSummary())}
                        className="bg-gray-900 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-800 transition shadow-lg"
                     >
                         <Printer size={18} /> Imprimir Resumen
                     </button>
                 </div>

                 <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                     <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                         <div className="text-sm text-blue-600 font-bold uppercase mb-1">Total Bruto</div>
                         <div className="text-2xl font-bold text-gray-800">{totals.fw.toFixed(2)} kg</div>
                     </div>
                     <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                         <div className="text-sm text-green-600 font-bold uppercase mb-1">Total Neto</div>
                         <div className="text-2xl font-bold text-gray-800">{totals.nw.toFixed(2)} kg</div>
                     </div>
                     <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                         <div className="text-sm text-indigo-600 font-bold uppercase mb-1">Prom. Pollo</div>
                         <div className="text-2xl font-bold text-gray-800">{providerAvg.toFixed(2)} kg</div>
                     </div>
                     <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                         <div className="text-sm text-red-600 font-bold uppercase mb-1">Mermas (u)</div>
                         <div className="text-2xl font-bold text-gray-800">{totals.dc}</div>
                     </div>
                 </div>

                 <div className="mb-8">
                     <div className="flex justify-between items-center mb-4">
                         <h3 className="font-bold text-gray-700 flex items-center gap-2"><Smartphone size={18} /> Análisis Inteligente (AI)</h3>
                         {!aiReport && (
                            <button 
                                onClick={handleGenerateAIReport} 
                                disabled={loadingReport}
                                className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                            >
                                {loadingReport ? 'Generando...' : 'Generar Análisis'}
                            </button>
                         )}
                     </div>
                     
                     <div className="bg-gradient-to-br from-purple-50 to-white p-6 rounded-xl border border-purple-100 min-h-[100px] text-sm leading-relaxed text-gray-700">
                         {loadingReport ? (
                             <div className="flex items-center justify-center h-20 gap-3 text-purple-600">
                                 <RefreshCw className="animate-spin" /> Analizando datos...
                             </div>
                         ) : aiReport ? (
                             <div className="whitespace-pre-line animate-fade-in">
                                 {aiReport}
                             </div>
                         ) : (
                             <p className="text-gray-400 text-center italic py-4">Haga clic en Generar Análisis para obtener un reporte ejecutivo potenciado por Gemini AI.</p>
                         )}
                     </div>
                 </div>

                 <div>
                     <h3 className="font-bold text-gray-700 mb-4">Detalle por Cliente</h3>
                     <div className="overflow-x-auto">
                         <table className="w-full text-sm">
                             <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                                 <tr>
                                     <th className="p-3 text-left">Cliente</th>
                                     <th className="p-3 text-right">Jabas</th>
                                     <th className="p-3 text-right">Peso Neto</th>
                                     <th className="p-3 text-right">Prom. Pollo</th>
                                     <th className="p-3 text-center">Estado</th>
                                     <th className="p-3 text-right">Acciones</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y">
                                 {currentSales.map(sale => {
                                     const m = calculateSaleMetrics(sale, currentProvider.chickensPerCrate);
                                     return (
                                         <tr key={sale.id} className="hover:bg-gray-50">
                                             <td className="p-3 font-medium text-gray-800">{sale.clientName}</td>
                                             <td className="p-3 text-right">{m.fullCount}</td>
                                             <td className="p-3 text-right font-bold">{m.netWeight.toFixed(2)}</td>
                                             <td className="p-3 text-right text-gray-600">{m.avgWeightPerBird.toFixed(3)}</td>
                                             <td className="p-3 text-center">
                                                 <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${sale.isCompleted ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                                                     {sale.isCompleted ? 'CERRADO' : 'ABIERTO'}
                                                 </span>
                                             </td>
                                             <td className="p-3 text-right flex justify-end gap-2">
                                                 <button onClick={() => copySaleDetailsToClipboard(sale)} className="p-1 text-gray-400 hover:text-blue-600" title="Copiar"><Copy size={14}/></button>
                                             </td>
                                         </tr>
                                     )
                                 })}
                             </tbody>
                         </table>
                     </div>
                 </div>
             </div>
        </div>
    );
  };
  
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div onClick={() => setView(AppView.MENU)} className="flex items-center gap-3 cursor-pointer">
             {appConfig.appLogo ? (
               <img src={appConfig.appLogo} alt="App Logo" className="h-10 w-10 object-contain rounded-md" />
             ) : (
               <div className="bg-orange-600 text-white p-2 rounded-lg"><Scale size={20} /></div>
             )}
             <h1 className="text-xl font-bold tracking-tight text-gray-900 hidden xs:block">Gestión de Pesaje <span className="text-orange-600">Avícola</span></h1>
          </div>
          <div className="flex items-center gap-4">
              <button onClick={() => setView(AppView.MENU)} className="text-gray-500 hover:text-orange-600 transition" title="Menu">
                   <LayoutGrid size={20} />
              </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === AppView.MENU && renderMainMenu()}
        {view === AppView.PROVIDERS && renderProvidersList()}
        {view === AppView.SETTINGS && renderSettings()}
        {view === AppView.GLOBAL_SUMMARY && renderGlobalSummary()}
        
        {view === AppView.DASHBOARD && renderDashboard()}
        {view === AppView.SALE_DETAIL && renderSaleDetail()}
        {view === AppView.SUMMARY && renderSummary()}
      </main>
      
      {renderTicketModal()}
      {renderWeightDetailModal()}
    </div>
  );
}