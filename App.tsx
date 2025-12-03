import React, { useState, useEffect, useRef } from 'react';
import { Plus, Users, ArrowLeft, FileText, Scale, Settings, Upload, Image as ImageIcon, Bluetooth, Printer, RefreshCw, LogOut, Home, Lock, Unlock, Trash2, Edit, AlertTriangle, LayoutGrid, PieChart, X, Calendar, Search, BarChart3, ClipboardList, Copy, Eye, Download, Smartphone, TrendingUp } from 'lucide-react';
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
const calculateSaleMetrics = (sale: Sale) => {
  const fullWeight = sale.fullCrates.reduce((a, b) => a + b.weight, 0);
  const fullCount = sale.fullCrates.reduce((a, b) => a + b.crateCount, 0);
  
  const emptyWeight = sale.emptyCrates.reduce((a, b) => a + b.weight, 0);
  const emptyCount = sale.emptyCrates.reduce((a, b) => a + b.crateCount, 0);
  
  const deadCount = sale.mortality.reduce((a, b) => a + b.count, 0);
  const deadWeight = sale.mortality.reduce((a, b) => a + b.weight, 0);

  const avgTare = emptyCount > 0 ? emptyWeight / emptyCount : 2.5;
  const totalTare = fullCount * avgTare;
  const netWeight = Math.max(0, fullWeight - totalTare - deadWeight);

  return { fullWeight, fullCount, emptyWeight, emptyCount, avgTare, totalTare, deadCount, deadWeight, netWeight };
};

// --- Simple Chart Components ---
const SimpleLineChart = ({ data, color = "#2563eb" }: { data: number[], color?: string }) => {
    if (data.length < 2) return <div className="h-32 flex items-center justify-center text-gray-400 text-xs">Insuficientes datos para gráfica</div>;
    
    const max = Math.max(...data, 1);
    const min = 0;
    const height = 100;
    const width = 100;
    
    const points = data.map((val, idx) => {
        const x = (idx / (data.length - 1)) * width;
        const y = height - ((val - min) / (max - min)) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="w-full h-32 relative">
             <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                 <polyline 
                    fill="none" 
                    stroke={color} 
                    strokeWidth="2" 
                    points={points} 
                    vectorEffect="non-scaling-stroke"
                 />
                 {data.map((val, idx) => {
                     const x = (idx / (data.length - 1)) * width;
                     const y = height - ((val - min) / (max - min)) * height;
                     return <circle key={idx} cx={x} cy={y} r="3" fill="white" stroke={color} vectorEffect="non-scaling-stroke" />
                 })}
             </svg>
             {/* Tooltip hint could go here */}
        </div>
    );
};

const SimpleBarChart = ({ data, labels }: { data: number[], labels: string[] }) => {
    const max = Math.max(...data, 1);
    return (
        <div className="flex items-end justify-between h-40 gap-2 pt-4">
            {data.map((val, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="text-[10px] font-bold text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity mb-1">{val.toFixed(0)}</div>
                    <div 
                        className="w-full bg-indigo-500 rounded-t-md hover:bg-indigo-600 transition-all relative" 
                        style={{ height: `${(val / max) * 100}%`, minHeight: '4px' }}
                    ></div>
                    <div className="text-[10px] text-gray-400 truncate w-full text-center">{labels[idx]}</div>
                </div>
            ))}
        </div>
    );
};


export default function App() {
  const [view, setView] = useState<AppView>(AppView.MENU);
  
  // Persistent Config (App Logo & Providers)
  const [appConfig, setAppConfig] = useState<AppConfig>({});
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  
  // Current Session derived state
  const currentProvider = providers.find(p => p.id === selectedProviderId);
  const currentSales = currentProvider?.sales || [];
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  
  // Form State for Adding Provider
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
    if (savedLogo) setAppConfig({ appLogo: savedLogo });
    
    const savedProviders = localStorage.getItem('polloControl_providers');
    if (savedProviders) {
        try {
            setProviders(JSON.parse(savedProviders));
        } catch (e) {
            console.error("Error loading providers", e);
        }
    }

    // PWA Install Prompt Listener
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
    if (window.confirm("¿Eliminar este proveedor y todo su historial?")) {
        setProviders(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleDeleteSale = (saleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedProviderId) return;
    
    if (window.confirm("¿Está seguro de ELIMINAR este cliente? Se borrarán todas sus pesas.")) {
        const updatedSales = currentSales.filter(s => s.id !== saleId);
        handleUpdateProviderSales(selectedProviderId, updatedSales);
        
        // If we were viewing details of this sale, close them
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

  // --- Bluetooth Connection Logic ---
  const connectScale = async () => {
    try {
      // Intentar conectar con UUIDs de puerto serial comunes (usados por balanzas chinas y adaptadores RS232)
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: false,
        filters: [
            { namePrefix: 'HC' }, 
            { namePrefix: 'BT' }, 
            { namePrefix: 'Scale' },
            { services: ['0000ffe0-0000-1000-8000-00805f9b34fb'] } // HM-10 Default
        ],
        optionalServices: [
            '00001800-0000-1000-8000-00805f9b34fb', 
            '0000ffe0-0000-1000-8000-00805f9b34fb', // Serial genérico
            '00001101-0000-1000-8000-00805f9b34fb'  // SPP
        ]
      });
      
      const server = await device.gatt?.connect();
      if (!server) throw new Error("No se pudo conectar al servidor GATT");

      // Buscar servicio serial
      let service;
      try {
        service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
      } catch (e) {
          console.warn("Service FFE0 not found, trying generic access");
          // Fallback logic could go here
      }

      if (service) {
          const characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
          await characteristic.startNotifications();
          characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
              const value = event.target.value;
              const decoder = new TextDecoder('utf-8');
              const text = decoder.decode(value);
              console.log("Scale Data:", text);
              // Aquí podríamos actualizar un estado global de "peso actual"
          });
          setScaleChar(characteristic);
      }
      
      setScaleDevice(device);
      alert(`Balanza conectada: ${device.name}`);

    } catch (err) {
      console.error(err);
      alert("Error conectando balanza: " + err);
      // Fallback visual para simulación
      setScaleDevice({ id: 'simulated', name: 'Simulador' } as BluetoothDevice);
    }
  };

  const readScaleWeight = async () => {
    // Intenta leer de la característica real si existe
    if (scaleChar && scaleChar.value) {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(scaleChar.value);
        // Intentar parsear número del string (ej: "ST,GS,+  10.50kg")
        const match = text.match(/[\d]+(\.[\d]+)?/);
        if (match) return parseFloat(match[0]);
    }
    
    // Si no hay lectura real, simular (para desarrollo/pruebas)
    return parseFloat((Math.random() * 20 + 10).toFixed(2));
  };

  const connectPrinter = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: false,
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }], // Servicio estándar impresora
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
      console.error(err);
      alert("Error conectando impresora (Usando modo simulación).");
      setPrinterDevice({ id: 'simulated', name: 'Simulador' } as BluetoothDevice);
    }
  };

  const openTicketPreview = (text: string) => {
    setTicketContent(text);
    setTicketModalOpen(true);
  };

  const printText = async (text: string) => {
    // Codificar texto
    const encoder = new TextEncoder();
    // Comandos ESC/POS básicos: Init, Texto, Saltos, Cortar
    const data = encoder.encode(COMMANDS.INIT + text + '\n\n\n' + COMMANDS.CUT);

    if (printerDevice && printerChar) {
        try {
            // Dividir en chunks si es necesario (Bluetooth tiene límite de MTU ~20 bytes a veces, pero modernamente 512)
            await printerChar.writeValue(data);
            alert("Enviado a impresora Bluetooth");
            return;
        } catch (e) {
            console.error("Fallo impresión BT", e);
            alert("Error enviando datos al dispositivo");
        }
    } else {
        console.log("IMPRIMIENDO (Simulado):\n" + text);
        alert("Enviado a impresora (Modo Simulado - Revisar Consola)");
    }
  };

  // --- Reports ---
  const generateTicket = (sale: Sale, providerName: string) => {
    const m = calculateSaleMetrics(sale);
    const date = new Date(sale.createdAt).toLocaleString();
    return `
${COMMANDS.CENTER}POLLO CONTROL PRO
PROVEEDOR: ${providerName.toUpperCase()}
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
--------------------------------
`;
  };

  const generateProviderSummary = () => {
    if (!currentProvider) return '';
    const totals = currentSales.reduce((acc, sale) => {
      const m = calculateSaleMetrics(sale);
      return {
        fc: acc.fc + m.fullCount,
        fw: acc.fw + m.fullWeight,
        ec: acc.ec + m.emptyCount,
        tt: acc.tt + m.totalTare,
        dc: acc.dc + m.deadCount,
        dw: acc.dw + m.deadWeight,
        nw: acc.nw + m.netWeight
      };
    }, { fc:0, fw:0, ec:0, tt:0, dc:0, dw:0, nw:0 });

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
--------------------------------
`;
  };

  const copySaleDetailsToClipboard = (sale: Sale) => {
      const m = calculateSaleMetrics(sale);
      let text = `*📋 DETALLE DE PESAJE - ${sale.clientName.toUpperCase()}*\n`;
      text += `Proveedor: ${currentProvider?.name}\n`;
      text += `Fecha: ${new Date(sale.createdAt).toLocaleDateString()}\n`;
      text += `--------------------------------\n`;

      text += `📦 *JABAS LLENAS* (${m.fullCount} und)\n`;
      sale.fullCrates.forEach((e, i) => {
          text += `${i+1}. ${e.weight.toFixed(2)} kg (${e.crateCount}j)\n`;
      });
      text += `> Total Bruto: ${m.fullWeight.toFixed(2)} kg\n\n`;

      text += `♻️ *JABAS VACÍAS* (${m.emptyCount} und)\n`;
      sale.emptyCrates.forEach((e, i) => {
          text += `${i+1}. ${e.weight.toFixed(2)} kg (${e.crateCount}j)\n`;
      });
      text += `> Tara Prom: ${m.totalTare.toFixed(2)} kg\n\n`;

      text += `💀 *MORTALIDAD* (${m.deadCount} und)\n`;
      sale.mortality.forEach((e, i) => {
          text += `${i+1}. ${e.weight.toFixed(2)} kg (${e.count}u)\n`;
      });
      text += `> Peso Muerto: ${m.deadWeight.toFixed(2)} kg\n`;
      
      text += `--------------------------------\n`;
      text += `*⚖️ PESO NETO FINAL: ${m.netWeight.toFixed(2)} KG*`;

      navigator.clipboard.writeText(text).then(() => {
          alert("¡Reporte del cliente copiado al portapapeles!");
      }).catch(err => {
          console.error('Error al copiar: ', err);
      });
  };

  const copyProviderSummaryToClipboard = () => {
    if (!currentProvider) return;
    
    let text = `*📊 REPORTE GENERAL - ${currentProvider.name.toUpperCase()}*\n`;
    text += `Fecha: ${new Date().toLocaleDateString()}\n`;
    text += `-----------------------------------\n`;
    text += `CLIENTE | BRUTO | TARA | MUERTOS | NETO\n`;
    text += `-----------------------------------\n`;

    let gTotal = { fw: 0, tt: 0, dw: 0, nw: 0, fc: 0 };

    currentSales.forEach(sale => {
      const m = calculateSaleMetrics(sale);
      gTotal.fw += m.fullWeight;
      gTotal.tt += m.totalTare;
      gTotal.dw += m.deadWeight;
      gTotal.nw += m.netWeight;
      gTotal.fc += m.fullCount;

      text += `${sale.clientName.padEnd(10).slice(0,10)} | ${m.fullWeight.toFixed(1)} | ${m.totalTare.toFixed(1)} | ${m.deadWeight.toFixed(1)} | *${m.netWeight.toFixed(1)}*\n`;
    });

    text += `-----------------------------------\n`;
    text += `*TOTALES GENERALES*\n`;
    text += `Jabas Vendidas: ${gTotal.fc}\n`;
    text += `Peso Bruto:     ${gTotal.fw.toFixed(2)} kg\n`;
    text += `Tara Total:     ${gTotal.tt.toFixed(2)} kg\n`;
    text += `Peso Muertos:   ${gTotal.dw.toFixed(2)} kg\n`;
    text += `*PESO NETO:*    *${gTotal.nw.toFixed(2)} KG*\n`;

    navigator.clipboard.writeText(text).then(() => {
        alert("¡Reporte del proveedor copiado al portapapeles!");
    }).catch(err => {
        console.error('Error al copiar: ', err);
    });
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

    // VALIDATION: Check Global Stock
    if (type === 'FULL') {
        const totalSoldGlobal = currentSales.reduce((acc, s) => {
            return acc + s.fullCrates.reduce((sum, c) => sum + c.crateCount, 0);
        }, 0);
        
        if (totalSoldGlobal + count > currentProvider.initialFullCrates) {
            alert(`¡Error! Stock insuficiente. Restante: ${currentProvider.initialFullCrates - totalSoldGlobal}`);
            return;
        }

        // VALIDATION: Check Client Limit
        const currentClientCount = currentSale.fullCrates.reduce((sum, c) => sum + c.crateCount, 0);
        if (currentClientCount + count > currentSale.targetFullCrates) {
             alert(`¡Alto! El límite para ${currentSale.clientName} es de ${currentSale.targetFullCrates} jabas. Llevas ${currentClientCount}.`);
             return;
        }
    }

    // VALIDATION: Check Empty Crates vs Full Crates
    if (type === 'EMPTY') {
        const totalFullCrates = currentSale.fullCrates.reduce((sum, c) => sum + c.crateCount, 0);
        const totalEmptyCrates = currentSale.emptyCrates.reduce((sum, c) => sum + c.crateCount, 0);

        if (totalEmptyCrates + count > totalFullCrates) {
            alert(`¡Restricción! No puede devolver más jabas vacías (${totalEmptyCrates + count}) que las jabas llenas vendidas (${totalFullCrates}).`);
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
      reader.onloadend = () => {
        const result = reader.result as string;
        setAppConfig({ appLogo: result });
        localStorage.setItem('polloControl_appLogo', result);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- View Renderers ---

  const renderTicketModal = () => {
    if (!ticketModalOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Printer size={18} /> Vista Previa de Ticket
            </h3>
            <button onClick={() => setTicketModalOpen(false)} className="p-1 hover:bg-gray-200 rounded-full transition">
              <X size={20} className="text-gray-500" />
            </button>
          </div>
          <div className="p-6 bg-gray-100 overflow-y-auto flex-1">
             <div className="bg-white p-4 shadow-sm border border-gray-200 font-mono text-sm whitespace-pre-wrap text-gray-800 mx-auto max-w-[300px]">
                {ticketContent.replace(/\x1b/g, '').replace(/\x1d/g, '')}
             </div>
          </div>
          <div className="p-4 border-t bg-white flex gap-3">
            <button onClick={() => setTicketModalOpen(false)} className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition">
              Cancelar
            </button>
            <button onClick={() => { printText(ticketContent); setTicketModalOpen(false); }} className="flex-1 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold shadow-md transition flex justify-center items-center gap-2">
              <Bluetooth size={16} /> Imprimir
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderWeightDetailModal = () => {
    if (!detailSale) return null;
    const m = calculateSaleMetrics(detailSale);

    // Prepare arrays for single-table view
    const maxRows = Math.max(detailSale.fullCrates.length, detailSale.emptyCrates.length, detailSale.mortality.length);
    const rows = Array.from({ length: maxRows }, (_, i) => ({
        full: detailSale.fullCrates[i],
        empty: detailSale.emptyCrates[i],
        mort: detailSale.mortality[i]
    }));

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full flex flex-col max-h-[90vh]">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center rounded-t-xl">
                    <div>
                        <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
                            <ClipboardList className="text-blue-600" /> Cuadro de Pesas Unificado
                        </h3>
                        <p className="text-xs text-gray-500">{detailSale.clientName} - {new Date(detailSale.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => setDetailSale(null)} className="p-2 hover:bg-red-100 hover:text-red-500 rounded-full transition">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="p-4 overflow-y-auto bg-gray-100 flex-1">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-800 text-white text-xs uppercase">
                                <tr>
                                    <th className="px-2 py-3 text-center w-12">#</th>
                                    <th className="px-4 py-3 text-center bg-blue-900 border-r border-blue-700">Jabas Llenas (Bruto)</th>
                                    <th className="px-4 py-3 text-center bg-slate-700 border-r border-slate-600">Jabas Vacías (Tara)</th>
                                    <th className="px-4 py-3 text-center bg-red-900">Mortalidad (Mermas)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {rows.map((row, i) => (
                                    <tr key={i} className="hover:bg-gray-50">
                                        <td className="px-2 py-2 text-center text-gray-400 font-mono text-xs">{i+1}</td>
                                        {/* FULL */}
                                        <td className="px-4 py-2 border-r border-gray-100">
                                            {row.full ? (
                                                <div className="flex justify-between items-center text-blue-800">
                                                    <span className="text-xs text-gray-500 bg-blue-50 px-1 rounded">{row.full.crateCount}j</span>
                                                    <span className="font-bold font-mono text-base">{row.full.weight.toFixed(2)}</span>
                                                </div>
                                            ) : <div className="h-6"></div>}
                                        </td>
                                        {/* EMPTY */}
                                        <td className="px-4 py-2 border-r border-gray-100">
                                            {row.empty ? (
                                                <div className="flex justify-between items-center text-slate-800">
                                                    <span className="text-xs text-gray-500 bg-slate-100 px-1 rounded">{row.empty.crateCount}j</span>
                                                    <span className="font-bold font-mono text-base">{row.empty.weight.toFixed(2)}</span>
                                                </div>
                                            ) : null}
                                        </td>
                                        {/* MORTALITY */}
                                        <td className="px-4 py-2">
                                            {row.mort ? (
                                                <div className="flex justify-between items-center text-red-800">
                                                    <span className="text-xs text-gray-500 bg-red-50 px-1 rounded">{row.mort.count}u</span>
                                                    <span className="font-bold font-mono text-base">{row.mort.weight.toFixed(2)}</span>
                                                </div>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                                {rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-gray-400">Sin registros</td></tr>}
                            </tbody>
                            <tfoot className="bg-gray-100 border-t-2 border-gray-300 font-bold text-gray-800">
                                <tr className="text-xs uppercase text-gray-500">
                                    <td className="py-2 text-center">TOT</td>
                                    <td className="px-4 py-2 text-right border-r">{m.fullCount} jabas</td>
                                    <td className="px-4 py-2 text-right border-r">{m.emptyCount} jabas</td>
                                    <td className="px-4 py-2 text-right">{m.deadCount} unid</td>
                                </tr>
                                <tr className="text-base">
                                    <td className="py-2 text-center bg-gray-200">KG</td>
                                    <td className="px-4 py-2 text-right text-blue-700 bg-blue-50 border-r border-blue-100">{m.fullWeight.toFixed(2)}</td>
                                    <td className="px-4 py-2 text-right text-slate-700 bg-slate-50 border-r border-slate-200">{m.totalTare.toFixed(2)} <span className="text-[10px] text-gray-400 font-normal">(Calc)</span></td>
                                    <td className="px-4 py-2 text-right text-red-700 bg-red-50">{m.deadWeight.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <div className="p-4 border-t bg-white rounded-b-xl flex justify-between items-center">
                     <div className="flex flex-col">
                        <span className="text-xs text-gray-500 uppercase font-bold">Peso Neto Final</span>
                        <span className="text-2xl font-black text-blue-600">{m.netWeight.toFixed(2)} KG</span>
                     </div>
                     <div className="flex gap-3">
                         <button onClick={() => setDetailSale(null)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg font-medium transition">
                             Cerrar
                         </button>
                         <button onClick={() => copySaleDetailsToClipboard(detailSale)} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm transition">
                             <Copy size={18} /> Copiar para Cliente
                         </button>
                     </div>
                </div>
            </div>
        </div>
    );
  };

  const renderMainMenu = () => (
    <div className="max-w-4xl mx-auto pt-10 px-4 animate-fade-in">
       <div className="text-center mb-12">
          {appConfig.appLogo ? (
            <img src={appConfig.appLogo} alt="Logo" className="h-32 w-32 object-contain mx-auto mb-4 rounded-xl shadow-lg bg-white p-2" />
          ) : (
            <div className="h-32 w-32 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
               <Scale size={64} />
            </div>
          )}
          <h1 className="text-3xl font-bold text-gray-800">Gestión de Pesaje de Pollos</h1>
          <p className="text-gray-500 mt-2">Seleccione una opción para comenzar</p>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button onClick={() => setView(AppView.PROVIDERS)} className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-xl hover:border-orange-500 transition-all flex flex-col items-center text-center">
              <div className="bg-orange-50 p-4 rounded-full text-orange-600 mb-4 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                 <Users size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-800">Proveedores</h3>
              <p className="text-sm text-gray-500 mt-2">Gestionar pesaje por lotes y proveedores</p>
          </button>

          <button onClick={() => setView(AppView.GLOBAL_SUMMARY)} className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-xl hover:border-blue-500 transition-all flex flex-col items-center text-center">
              <div className="bg-blue-50 p-4 rounded-full text-blue-600 mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                 <PieChart size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-800">Resumen General</h3>
              <p className="text-sm text-gray-500 mt-2">Estadísticas mensuales y diarias</p>
          </button>

          <button onClick={() => setView(AppView.SETTINGS)} className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-xl hover:border-slate-500 transition-all flex flex-col items-center text-center">
              <div className="bg-slate-50 p-4 rounded-full text-slate-600 mb-4 group-hover:bg-slate-600 group-hover:text-white transition-colors">
                 <Settings size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-800">Configuración</h3>
              <p className="text-sm text-gray-500 mt-2">Ajustes de aplicación y dispositivos</p>
          </button>
       </div>
    </div>
  );

  const renderSettings = () => (
    <div className="max-w-2xl mx-auto animate-fade-in">
        <button onClick={() => setView(AppView.MENU)} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-6 font-medium">
             <ArrowLeft size={20} /> Volver al Menú
        </button>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
             <div className="p-6 border-b">
                 <h2 className="text-xl font-bold flex items-center gap-2"><Settings className="text-gray-400" /> Configuración</h2>
             </div>
             
             <div className="p-6 space-y-8">
                 {installPrompt && (
                   <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-blue-800">
                         <Smartphone size={24} />
                         <div>
                            <p className="font-bold">Instalar Aplicación</p>
                            <p className="text-xs text-blue-600">Agregar a pantalla de inicio para modo offline</p>
                         </div>
                      </div>
                      <button onClick={handleInstallClick} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-blue-700 transition">
                         Instalar Ahora
                      </button>
                   </div>
                 )}

                 <div>
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
                     <h3 className="font-medium text-gray-900 mb-4">Dispositivos Externos (Bluetooth)</h3>
                     <p className="text-xs text-gray-500 mb-4">Asegúrese de que el dispositivo esté encendido y no conectado a otro celular.</p>
                     <div className="flex gap-4">
                        <button onClick={connectScale} className={`flex-1 py-3 px-4 rounded-lg border border-gray-200 flex items-center justify-center gap-2 font-medium ${scaleDevice ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                           <Bluetooth size={18} /> {scaleDevice ? 'Balanza Conectada' : 'Conectar Balanza'}
                        </button>
                        <button onClick={connectPrinter} className={`flex-1 py-3 px-4 rounded-lg border border-gray-200 flex items-center justify-center gap-2 font-medium ${printerDevice ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                           <Printer size={18} /> {printerDevice ? 'Impresora Conectada' : 'Conectar Impresora'}
                        </button>
                     </div>
                 </div>

                 <div className="border-t pt-6">
                     <h3 className="font-medium text-red-600 mb-4">Zona de Peligro</h3>
                     <button onClick={() => { if(confirm("¿Borrar todos los datos?")) { localStorage.clear(); window.location.reload(); }}} className="text-red-600 hover:bg-red-50 px-4 py-2 rounded border border-red-200 text-sm font-medium">
                         Restablecer Fábrica (Borrar Todo)
                     </button>
                 </div>
             </div>
        </div>
    </div>
  );

  const renderGlobalSummary = () => {
     // Prepare data for Monthly and Daily stats
     const monthlyStats: Record<string, { count: number, weight: number, sales: number }> = {};
     const dailyStats: Record<string, { count: number, weight: number, sales: number }> = {};
     
     // Mortality Stats by Provider
     const providerMortality: {name: string, count: number, weight: number}[] = [];

     providers.forEach(p => {
        let pDeadCount = 0;
        let pDeadWeight = 0;

        p.sales.forEach(s => {
            const date = new Date(s.createdAt);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
            const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
            const m = calculateSaleMetrics(s);

            // Aggregate Monthly
            if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { count: 0, weight: 0, sales: 0 };
            monthlyStats[monthKey].count += m.fullCount;
            monthlyStats[monthKey].weight += m.netWeight;
            monthlyStats[monthKey].sales += 1;

            // Aggregate Daily
            if (!dailyStats[dayKey]) dailyStats[dayKey] = { count: 0, weight: 0, sales: 0 };
            dailyStats[dayKey].count += m.fullCount;
            dailyStats[dayKey].weight += m.netWeight;
            dailyStats[dayKey].sales += 1;

            pDeadCount += m.deadCount;
            pDeadWeight += m.deadWeight;
        });

        if (pDeadCount > 0) {
            providerMortality.push({ name: p.name, count: pDeadCount, weight: pDeadWeight });
        }
     });

     // Calculate max for bar chart scaling
     const maxMortality = Math.max(1, ...providerMortality.map(p => p.count));

     // Sort keys descending
     const sortedMonths = Object.keys(monthlyStats).sort().reverse();
     const sortedDays = Object.keys(dailyStats).sort(); // Sort ASC for line chart

     // Prepare data for charts
     const chartDataMonthly = sortedMonths.slice(0, 6).reverse().map(k => monthlyStats[k].weight); // Last 6 months
     const chartLabelsMonthly = sortedMonths.slice(0, 6).reverse().map(k => k.split('-')[1]);
     
     const chartDataDaily = sortedDays.slice(-14).map(k => dailyStats[k].weight); // Last 14 days
     const chartLabelsDaily = sortedDays.slice(-14).map(k => k.split('-')[2]);

     const globalStats = providers.reduce((acc, p) => {
         const pTotal = p.sales.reduce((sAcc, s) => {
             const m = calculateSaleMetrics(s);
             return {
                 sold: sAcc.sold + m.fullCount,
                 weight: sAcc.weight + m.netWeight,
                 deadCount: sAcc.deadCount + m.deadCount
             };
         }, { sold: 0, weight: 0, deadCount: 0 });
         
         return {
             providers: acc.providers + 1,
             totalStock: acc.totalStock + p.initialFullCrates,
             totalSold: acc.totalSold + pTotal.sold,
             totalWeight: acc.totalWeight + pTotal.weight,
             totalDead: acc.totalDead + pTotal.deadCount
         };
     }, { providers: 0, totalStock: 0, totalSold: 0, totalWeight: 0, totalDead: 0 });

     return (
         <div className="max-w-6xl mx-auto animate-fade-in pb-12">
             <button onClick={() => setView(AppView.MENU)} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-6 font-medium">
                 <ArrowLeft size={20} /> Volver al Menú
             </button>
             <h2 className="text-2xl font-bold text-gray-800 mb-6">Resumen General Global</h2>
             
             {/* Totals Cards */}
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                 <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-orange-500">
                     <p className="text-gray-500 text-sm font-bold uppercase">Proveedores</p>
                     <p className="text-3xl font-bold text-gray-800 mt-1">{globalStats.providers}</p>
                 </div>
                 <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-blue-500">
                     <p className="text-gray-500 text-sm font-bold uppercase">Stock Total</p>
                     <p className="text-3xl font-bold text-gray-800 mt-1">{globalStats.totalStock}</p>
                 </div>
                 <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-green-500">
                     <p className="text-gray-500 text-sm font-bold uppercase">Vendido (Jabas)</p>
                     <p className="text-3xl font-bold text-gray-800 mt-1">{globalStats.totalSold}</p>
                 </div>
                 <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-purple-500">
                     <p className="text-gray-500 text-sm font-bold uppercase">Peso Neto Total</p>
                     <p className="text-3xl font-bold text-gray-800 mt-1">{globalStats.totalWeight.toFixed(2)} kg</p>
                 </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* Mortality Chart */}
                <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
                         <div className="flex items-center gap-2 font-bold text-gray-700">
                            <BarChart3 size={18} /> Mortalidad
                         </div>
                         <div className="text-sm font-bold text-red-600">{globalStats.totalDead} u</div>
                    </div>
                    <div className="p-6 overflow-y-auto max-h-[300px]">
                        {providerMortality.length === 0 ? (
                            <div className="text-center text-gray-400 py-8">No hay registros</div>
                        ) : (
                            <div className="space-y-4">
                                {providerMortality.map((p, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <div className="w-24 text-xs font-medium text-gray-600 truncate text-right">{p.name}</div>
                                        <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-red-500 rounded-full"
                                                style={{ width: `${(p.count / maxMortality) * 100}%` }}
                                            ></div>
                                        </div>
                                        <div className="w-10 text-xs text-gray-800 text-right font-bold">{p.count}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* VISUAL CHARTS */}
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Bar Chart Monthly */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold text-gray-700 flex items-center gap-2"><Calendar size={18}/> Ventas Mensuales</h3>
                            <span className="text-xs text-gray-400">(Kg Neto)</span>
                        </div>
                        <SimpleBarChart data={chartDataMonthly} labels={chartLabelsMonthly} />
                    </div>

                     {/* Line Chart Daily */}
                     <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold text-gray-700 flex items-center gap-2"><TrendingUp size={18}/> Tendencia Diaria</h3>
                            <span className="text-xs text-gray-400">(Últimos 14 días)</span>
                        </div>
                        <SimpleLineChart data={chartDataDaily} color="#ec4899" />
                        <div className="flex justify-between mt-2 px-1">
                            <span className="text-[10px] text-gray-400">{chartLabelsDaily[0]}</span>
                            <span className="text-[10px] text-gray-400">{chartLabelsDaily[chartLabelsDaily.length-1]}</span>
                        </div>
                    </div>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Monthly Stats Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b bg-gray-50 flex items-center gap-2 font-bold text-gray-700">
                        <Calendar size={18} /> Detalle Mensual
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                <tr>
                                    <th className="px-4 py-2 text-left">Mes</th>
                                    <th className="px-4 py-2 text-right">Jabas</th>
                                    <th className="px-4 py-2 text-right">Peso Neto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedMonths.map(month => {
                                    const [y, m] = month.split('-');
                                    const dateStr = new Date(parseInt(y), parseInt(m)-1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
                                    const stats = monthlyStats[month];
                                    return (
                                        <tr key={month} className="border-b last:border-0 hover:bg-gray-50">
                                            <td className="px-4 py-3 capitalize font-medium">{dateStr}</td>
                                            <td className="px-4 py-3 text-right">{stats.count}</td>
                                            <td className="px-4 py-3 text-right font-bold text-blue-600">{stats.weight.toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                                {sortedMonths.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Sin datos registrados</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
             </div>
         </div>
     )
  };

  const renderProvidersList = () => (
    <div className="space-y-8 animate-fade-in">
        <div className="flex items-center gap-4 mb-4">
             <button onClick={() => setView(AppView.MENU)} className="p-2 hover:bg-gray-200 rounded-full transition"><ArrowLeft /></button>
             <h2 className="text-2xl font-bold text-gray-800">Proveedores Activos</h2>
        </div>

        <div className="flex justify-end">
            <button onClick={() => setShowProviderForm(true)} className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 shadow-lg transition transform hover:-translate-y-0.5">
                <Plus size={20} /> Nuevo Proveedor
            </button>
        </div>

        {showProviderForm && (
            <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-orange-500 animate-slide-up">
                <h3 className="font-bold text-lg mb-4 text-gray-800">Registrar Nuevo Proveedor / Lote</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="col-span-2">
                         <label className="block text-sm font-medium text-gray-600 mb-1">Nombre del Proveedor</label>
                         <input autoFocus className="w-full p-2 border rounded focus:ring-2 focus:ring-orange-500 outline-none" placeholder="Ej. Avícola San Juan" value={newProvider.name} onChange={e => setNewProvider({...newProvider, name: e.target.value})}/>
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-gray-600 mb-1">Total de Jabas Llenas (Stock)</label>
                         <input type="number" className="w-full p-2 border rounded focus:ring-2 focus:ring-orange-500 outline-none" placeholder="0" value={newProvider.initialFullCrates || ''} onChange={e => setNewProvider({...newProvider, initialFullCrates: parseInt(e.target.value)})}/>
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-gray-600 mb-1">Pollos por Jaba</label>
                         <input type="number" className="w-full p-2 border rounded focus:ring-2 focus:ring-orange-500 outline-none" value={newProvider.chickensPerCrate} onChange={e => setNewProvider({...newProvider, chickensPerCrate: parseInt(e.target.value)})}/>
                     </div>
                     <div className="col-span-2 flex justify-end gap-2 mt-2">
                         <button onClick={() => setShowProviderForm(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded">Cancelar</button>
                         <button onClick={handleCreateProvider} className="px-6 py-2 bg-orange-600 text-white rounded font-medium hover:bg-orange-700">Guardar</button>
                     </div>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {providers.map(p => {
                const totalSold = p.sales.reduce((acc, s) => acc + s.fullCrates.reduce((sum, c) => sum + c.crateCount, 0), 0);
                const remaining = p.initialFullCrates - totalSold;
                
                return (
                    <div key={p.id} onClick={() => { setSelectedProviderId(p.id); setView(AppView.DASHBOARD); }} className="group bg-white rounded-xl shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-xl hover:border-orange-300 transition-all relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <div className="bg-orange-50 p-3 rounded-full text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                                <Users size={24} />
                            </div>
                            <button onClick={(e) => handleDeleteProvider(p.id, e)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={16} /></button>
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-1">{p.name}</h3>
                        <p className="text-xs text-gray-400 mb-4">Creado: {new Date(p.createdAt).toLocaleDateString()}</p>
                        
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm text-gray-600">
                                <span>Ventas Realizadas</span>
                                <span className="font-bold">{p.sales.length}</span>
                            </div>
                            <div className="flex justify-between text-sm text-gray-600">
                                <span>Stock Restante</span>
                                <span className={remaining < 10 ? 'text-red-600 font-bold' : 'text-blue-600 font-bold'}>{remaining} / {p.initialFullCrates}</span>
                            </div>
                            <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                <div className={`h-full ${remaining < 10 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${(remaining / p.initialFullCrates) * 100}%` }}></div>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    </div>
  );

  const renderDashboard = () => {
    if (!currentProvider) return null;
    const totalSoldCrates = currentSales.reduce((acc, sale) => acc + sale.fullCrates.reduce((s, c) => s + c.crateCount, 0), 0);
    const remainingCrates = currentProvider.initialFullCrates - totalSoldCrates;

    return (
      <div className="space-y-6 animate-fade-in">
        {/* Nav to Home */}
        <div className="flex items-center gap-4 mb-4">
             <button onClick={() => { setView(AppView.PROVIDERS); setSelectedProviderId(null); }} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200 transition">
                 <ArrowLeft size={16} /> Volver
             </button>
             <div className="h-6 w-px bg-gray-300"></div>
             <span className="font-bold text-gray-700">{currentProvider.name}</span>
        </div>

        {/* Device Status Bar */}
        <div className="flex flex-wrap gap-2 justify-end mb-2">
          {scaleDevice ? <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">⚖️ Balanza OK</div> : null}
          {printerDevice ? <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">🖨️ Impresora OK</div> : null}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between relative overflow-hidden">
            <div className="z-10">
              <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Proveedor Actual</h3>
              <p className="text-xl font-bold text-gray-900 mt-1">{currentProvider.name}</p>
              <p className="text-xs text-gray-400 mt-1">Lote iniciado: {new Date(currentProvider.createdAt).toLocaleDateString()}</p>
            </div>
            <Users className="absolute right-4 bottom-4 text-gray-100 w-16 h-16" />
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Control de Stock</h3>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${remainingCrates <= 0 ? 'text-red-600' : 'text-blue-600'}`}>{remainingCrates}</span>
              <span className="text-sm text-gray-400">disp. de {currentProvider.initialFullCrates}</span>
            </div>
            <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
              <div className={`h-full transition-all duration-500 ${remainingCrates <= 0 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, (remainingCrates / currentProvider.initialFullCrates) * 100)}%` }}></div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Clientes Atendidos</h3>
              <p className="text-3xl font-bold text-gray-900 mt-1">{currentSales.length}</p>
            </div>
            <button onClick={() => setView(AppView.SUMMARY)} className="p-3 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition shadow-sm">
              <FileText size={24} />
            </button>
          </div>
        </div>

        {/* Sales List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-100 bg-gray-50">
             <form onSubmit={handleCreateSale} className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                   <label className="text-xs text-gray-500 mb-1 block">Cliente</label>
                   <input name="clientName" type="text" placeholder="Nombre..." className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" required />
                </div>
                <div className="w-full md:w-32">
                   <label className="text-xs text-gray-500 mb-1 block">Jabas (Límite)</label>
                   <input name="crateLimit" type="number" placeholder="Cant." className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" required min="1" />
                </div>
                <button type="submit" disabled={remainingCrates <= 0} className="w-full md:w-auto bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white px-6 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition shadow-md whitespace-nowrap">
                    <Plus size={20} /> Crear
                </button>
            </form>
            {remainingCrates <= 0 && <p className="text-red-500 text-xs mt-2 font-bold">⚠️ Stock Agotado. No se pueden crear nuevas ventas.</p>}
          </div>
          
          <div className="p-6 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {currentSales.length === 0 && <div className="col-span-full text-center py-12 text-gray-400">Sin ventas en este lote.</div>}
            {currentSales.map(sale => {
              const metrics = calculateSaleMetrics(sale);
              return (
                <div key={sale.id} onClick={() => { setCurrentSaleId(sale.id); setView(AppView.SALE_DETAIL); }} className={`group bg-white border rounded-xl p-4 hover:shadow-lg transition cursor-pointer relative ${sale.isCompleted ? 'border-l-4 border-l-gray-400 bg-gray-50' : 'border-l-4 border-l-green-500 border-gray-200'}`}>
                   <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg text-gray-800">{sale.clientName}</h3>
                      <div className="flex items-center gap-2">
                           <button onClick={(e) => handleDeleteSale(sale.id, e)} className="text-gray-300 hover:text-red-500 p-1" title="Eliminar Cliente"><Trash2 size={16}/></button>
                           {sale.isCompleted ? <Lock size={14} className="text-gray-400" /> : <span className="w-2 h-2 rounded-full bg-green-500"></span>}
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-y-1 text-sm text-gray-600 mb-3">
                      <span>Jabas: <b className="text-gray-900">{metrics.fullCount} / {sale.targetFullCrates}</b></span>
                      <span className="text-right text-blue-600 font-bold">{metrics.netWeight.toFixed(2)} kg</span>
                   </div>
                   {/* Mini Progress bar for limit */}
                   <div className="w-full h-1 bg-gray-100 rounded-full mb-2 overflow-hidden">
                       <div className={`h-full ${metrics.fullCount >= sale.targetFullCrates ? 'bg-red-500' : 'bg-green-500'}`} style={{width: `${Math.min(100, (metrics.fullCount / sale.targetFullCrates)*100)}%`}}></div>
                   </div>

                   <div className="border-t pt-2 flex justify-between items-center">
                      <span className="text-xs text-orange-600 font-medium group-hover:underline">{sale.isCompleted ? 'Ver Detalles' : 'Gestionar Pesas'}</span>
                      <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); setDetailSale(sale); }} className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50">
                              <ClipboardList size={16} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); openTicketPreview(generateTicket(sale, currentProvider.name)); }} className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-200">
                            <Printer size={16} />
                          </button>
                      </div>
                   </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderSaleDetail = () => {
    if (!currentProvider) return null;
    const activeSale = currentSales.find(s => s.id === currentSaleId);
    if (!activeSale) return null;
    const metrics = calculateSaleMetrics(activeSale);
    
    const limitReached = metrics.fullCount >= activeSale.targetFullCrates;
    
    // Calculate allowable empty crates
    const remainingEmptyAllowed = metrics.fullCount - metrics.emptyCount;

    return (
      <div className="h-[calc(100vh-100px)] flex flex-col animate-fade-in">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => setView(AppView.DASHBOARD)} className="p-2 hover:bg-gray-100 rounded-full transition"><ArrowLeft className="text-gray-600" /></button>
            <div>
              <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-900">{activeSale.clientName}</h2>
                  {activeSale.isCompleted && <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold uppercase">Cerrado</span>}
              </div>
              <div className="flex items-center gap-2 mt-1">
                 <button onClick={() => setDetailSale(activeSale)} className="text-xs flex items-center gap-1 bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 text-gray-600"><ClipboardList size={12}/> Detalle Pesos</button>
                 <button onClick={() => openTicketPreview(generateTicket(activeSale, currentProvider.name))} className="text-xs flex items-center gap-1 bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 text-gray-600"><Printer size={12}/> Imprimir Ticket</button>
                 <span className="text-xs text-gray-400">|</span>
                 {scaleDevice && <button onClick={async () => { const w = await readScaleWeight(); if(w) addWeight('FULL', w, 5); }} className="text-xs flex items-center gap-1 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 text-blue-600"><Bluetooth size={12}/> Leer Balanza</button>}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-1">
               <div className="text-xs text-gray-500 font-medium">Progreso de Carga</div>
               <div className="flex items-center gap-2">
                   <div className="w-32 h-3 bg-gray-200 rounded-full overflow-hidden">
                       <div className={`h-full ${limitReached ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, (metrics.fullCount / activeSale.targetFullCrates) * 100)}%` }}></div>
                   </div>
                   <span className={`text-sm font-mono font-bold ${limitReached ? 'text-red-600' : 'text-gray-700'}`}>
                       {metrics.fullCount}/{activeSale.targetFullCrates}
                   </span>
               </div>
          </div>
          
          <div className="flex items-center gap-4">
              <div className="hidden md:flex gap-6 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="text-right"><div className="text-gray-400 text-[10px] uppercase font-bold">Bruto</div><div className="font-mono font-bold text-gray-700">{metrics.fullWeight.toFixed(2)}</div></div>
                <div className="text-right"><div className="text-gray-400 text-[10px] uppercase font-bold">Tara</div><div className="font-mono font-medium text-amber-600">-{metrics.totalTare.toFixed(2)}</div></div>
                <div className="text-right"><div className="text-gray-400 text-[10px] uppercase font-bold">Muertos</div><div className="font-mono font-medium text-red-600">-{metrics.deadWeight.toFixed(2)}</div></div>
                <div className="text-right pl-4 border-l border-gray-200"><div className="text-blue-500 text-[10px] uppercase font-bold">Neto Final</div><div className="font-mono font-bold text-blue-600 text-xl">{metrics.netWeight.toFixed(2)} kg</div></div>
              </div>
              
              <div className="flex flex-col gap-1">
                 <button 
                     onClick={() => toggleSaleLock(activeSale.id)} 
                     className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold transition shadow-sm ${activeSale.isCompleted ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-green-600 text-white hover:bg-green-700'}`}
                 >
                     {activeSale.isCompleted ? <><Unlock size={18}/> Abrir</> : <><Lock size={18}/> Cerrar</>}
                 </button>
                 <button onClick={(e) => handleDeleteSale(activeSale.id, e)} className="text-xs text-red-400 hover:text-red-600 hover:underline text-center">Eliminar Cliente</button>
              </div>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
          <WeighingPanel disabled={activeSale.isCompleted || (limitReached && activeSale.isCompleted === false)} type="FULL" entries={activeSale.fullCrates} onAdd={(w, c) => addWeight('FULL', w, c)} onDelete={(id) => deleteEntry('FULL', id)} />
          <WeighingPanel disabled={activeSale.isCompleted} maxAllowed={remainingEmptyAllowed} type="EMPTY" entries={activeSale.emptyCrates} onAdd={(w, c) => addWeight('EMPTY', w, c)} onDelete={(id) => deleteEntry('EMPTY', id)} />
          <WeighingPanel disabled={activeSale.isCompleted} type="MORTALITY" entries={activeSale.mortality} onAdd={(w, c) => addWeight('MORTALITY', w, c)} onDelete={(id) => deleteEntry('MORTALITY', id)} />
        </div>
      </div>
    );
  };

  const renderSummary = () => {
    if (!currentProvider) return null;
    const totals = currentSales.reduce((acc, sale) => {
      const m = calculateSaleMetrics(sale);
      return {
        fullCount: acc.fullCount + m.fullCount, fullWeight: acc.fullWeight + m.fullWeight,
        emptyCount: acc.emptyCount + m.emptyCount, totalTare: acc.totalTare + m.totalTare,
        deadCount: acc.deadCount + m.deadCount, deadWeight: acc.deadWeight + m.deadWeight,
        netWeight: acc.netWeight + m.netWeight
      };
    }, { fullCount: 0, fullWeight: 0, emptyCount: 0, totalTare: 0, deadCount: 0, deadWeight: 0, netWeight: 0 });

    const inventoryStateForGemini: InventoryState = {
        mainClient: currentProvider.name,
        initialFullCrates: currentProvider.initialFullCrates,
        chickensPerCrate: currentProvider.chickensPerCrate
    };

    return (
      <div className="space-y-6 pb-12 animate-fade-in">
         <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button onClick={() => setView(AppView.DASHBOARD)} className="p-2 hover:bg-gray-100 rounded-full transition bg-white shadow-sm"><ArrowLeft className="text-gray-600" /></button>
              <h2 className="text-2xl font-bold text-gray-800">Resumen del Lote</h2>
            </div>
            <div className="flex gap-2">
                <button onClick={copyProviderSummaryToClipboard} className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm hover:bg-green-700 shadow-md">
                   <Copy size={16} /> Copiar Reporte
                </button>
                <button onClick={() => openTicketPreview(generateProviderSummary())} className="bg-gray-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm hover:bg-gray-900 shadow-md">
                   <Printer size={16} /> Imprimir Cierre
                </button>
            </div>
          </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <div>
              <h3 className="font-bold text-gray-800 text-lg">{currentProvider.name}</h3>
              <p className="text-xs text-gray-500">Reporte detallado de ventas por cliente</p>
            </div>
            <button onClick={async () => { setLoadingReport(true); setAiReport(await generateDailyReport(inventoryStateForGemini, currentSales)); setLoadingReport(false); }} disabled={loadingReport} className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
              {loadingReport ? <span className="animate-spin">⌛</span> : <span>✨ Análisis IA</span>}
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3">Cliente</th>
                  <th className="px-4 py-3 text-right">Solicitado</th>
                  <th className="px-4 py-3 text-right">Jabas Llenas</th>
                  <th className="px-4 py-3 text-right">Peso Bruto</th>
                  <th className="px-4 py-3 text-right">Jabas Vacías</th>
                  <th className="px-4 py-3 text-right">Tara</th>
                  <th className="px-4 py-3 text-right text-red-600">Muertos</th>
                  <th className="px-6 py-3 text-right bg-blue-50 text-blue-800">Neto</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {currentSales.map(sale => {
                  const m = calculateSaleMetrics(sale);
                  return (
                    <tr key={sale.id} className="border-b hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium flex items-center gap-2">
                          {sale.isCompleted && <Lock size={12} className="text-gray-400"/>}
                          {sale.clientName}
                      </td>
                      <td className="px-4 py-4 text-right text-gray-400">{sale.targetFullCrates}</td>
                      <td className="px-4 py-4 text-right font-medium">{m.fullCount}</td>
                      <td className="px-4 py-4 text-right">{m.fullWeight.toFixed(2)}</td>
                      <td className="px-4 py-4 text-right">{m.emptyCount}</td>
                      <td className="px-4 py-4 text-right text-amber-600">{m.totalTare.toFixed(2)}</td>
                      <td className="px-4 py-4 text-right text-red-600">{m.deadCount} ({m.deadWeight.toFixed(2)})</td>
                      <td className="px-6 py-4 text-right bg-blue-50 font-bold text-blue-700">{m.netWeight.toFixed(2)}</td>
                      <td className="px-4 py-4 text-center">
                          <button onClick={() => setDetailSale(sale)} className="text-gray-400 hover:text-blue-600 transition" title="Ver Detalle Completo">
                              <Eye size={18} />
                          </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 font-bold text-gray-900 border-t-2 border-gray-300">
                <tr>
                  <td className="px-6 py-4">TOTAL LOTE</td>
                  <td className="px-4 py-4 text-right">-</td>
                  <td className="px-4 py-4 text-right">{totals.fullCount}</td>
                  <td className="px-4 py-4 text-right">{totals.fullWeight.toFixed(2)}</td>
                  <td className="px-4 py-4 text-right">{totals.emptyCount}</td>
                  <td className="px-4 py-4 text-right text-amber-700">{totals.totalTare.toFixed(2)}</td>
                  <td className="px-4 py-4 text-right text-red-700">{totals.deadCount} ({totals.deadWeight.toFixed(2)})</td>
                  <td className="px-6 py-4 text-right text-blue-800 text-lg">{totals.netWeight.toFixed(2)}</td>
                  <td className="px-4 py-4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {aiReport && (
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-xl border border-indigo-100 shadow-sm animate-fade-in">
             <h3 className="text-indigo-900 font-bold mb-3">📊 Análisis Inteligente (Gemini)</h3>
             <pre className="whitespace-pre-wrap text-sm text-indigo-800 font-sans leading-relaxed">{aiReport}</pre>
          </div>
        )}
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