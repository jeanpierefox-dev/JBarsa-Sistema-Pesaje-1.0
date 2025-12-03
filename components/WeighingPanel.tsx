import React, { useState, useEffect } from 'react';
import { WeightEntry, MortalityEntry } from '../types';
import { Plus, Trash2, Package, PackageOpen, Skull, Lock, AlertCircle } from 'lucide-react';

interface WeighingPanelProps {
  type: 'FULL' | 'EMPTY' | 'MORTALITY';
  entries: (WeightEntry | MortalityEntry)[];
  onAdd: (weight: number, count: number) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
  maxAllowed?: number; // New prop for limiting input
}

export const WeighingPanel: React.FC<WeighingPanelProps> = ({ type, entries, onAdd, onDelete, disabled = false, maxAllowed }) => {
  // Default values based on requirements
  const defaultCount = type === 'FULL' ? 5 : type === 'EMPTY' ? 10 : 1;
  
  const [count, setCount] = useState<string>(defaultCount.toString());
  const [weight, setWeight] = useState<string>('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Reset default when type switches
    setCount(type === 'FULL' ? '5' : type === 'EMPTY' ? '10' : '1');
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [type, disabled]);

  const currentCountVal = parseFloat(count);
  const isOverLimit = maxAllowed !== undefined && !isNaN(currentCountVal) && currentCountVal > maxAllowed;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    if (isOverLimit) return;

    const w = parseFloat(weight);
    const c = parseFloat(count);
    
    if (!isNaN(w) && !isNaN(c) && w > 0 && c > 0) {
      onAdd(w, c);
      setWeight('');
      // Keep the count as is, users usually repeat the same batch size
      inputRef.current?.focus();
    }
  };

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  const totalCount = entries.reduce((sum, e) => {
    if ('crateCount' in e) return sum + e.crateCount;
    if ('count' in e) return sum + e.count;
    return sum;
  }, 0);

  const getColor = () => {
    switch (type) {
      case 'FULL': return 'blue';
      case 'EMPTY': return 'slate';
      case 'MORTALITY': return 'red';
    }
  };

  const color = getColor();

  return (
    <div className={`flex flex-col h-full bg-white rounded-lg shadow-sm border border-${color}-200 ${disabled ? 'opacity-80' : ''}`}>
      {/* Header */}
      <div className={`p-4 border-b border-${color}-100 bg-${color}-50 flex items-center justify-between rounded-t-lg relative overflow-hidden`}>
        {disabled && (
          <div className="absolute inset-0 bg-gray-100/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
             <span className="flex items-center gap-1 text-gray-500 font-bold text-xs uppercase border border-gray-300 bg-white px-2 py-1 rounded-full shadow-sm">
                <Lock size={10} /> Sección Bloqueada
             </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {type === 'FULL' && <Package className={`text-${color}-600`} />}
          {type === 'EMPTY' && <PackageOpen className={`text-${color}-600`} />}
          {type === 'MORTALITY' && <Skull className={`text-${color}-600`} />}
          <h3 className={`font-bold text-${color}-800`}>
            {type === 'FULL' ? 'Jabas Llenas' : type === 'EMPTY' ? 'Jabas Vacías' : 'Pollos Muertos'}
          </h3>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Total Acumulado</div>
          <div className={`font-mono font-bold text-${color}-700`}>
            {totalCount} {type === 'MORTALITY' ? 'und' : 'jabas'} / {totalWeight.toFixed(2)} kg
          </div>
        </div>
      </div>

      {/* Input Form */}
      {!disabled && (
        <form onSubmit={handleSubmit} className="p-4 grid grid-cols-12 gap-2 bg-gray-50 border-b relative">
          <div className="col-span-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {type === 'MORTALITY' ? 'Cantidad' : 'Jabas'}
            </label>
            <input
              type="number"
              step="1"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 outline-none font-mono text-center disabled:bg-gray-100 ${isOverLimit ? 'border-red-500 focus:ring-red-200 text-red-600 bg-red-50' : 'focus:ring-blue-500'}`}
              required
              disabled={disabled}
            />
          </div>
          <div className="col-span-6">
            <label className="block text-xs font-medium text-gray-500 mb-1">Peso (kg)</label>
            <input
              ref={inputRef}
              type="number"
              step="0.01"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-mono text-lg disabled:bg-gray-100"
              required
              disabled={disabled}
            />
          </div>
          <div className="col-span-3 flex items-end">
            <button
              type="submit"
              disabled={disabled || isOverLimit}
              className={`w-full py-2 ${isOverLimit ? 'bg-gray-400 cursor-not-allowed' : `bg-${color}-600 hover:bg-${color}-700`} disabled:bg-gray-400 text-white rounded-md flex justify-center items-center transition-colors shadow-sm`}
            >
              <Plus size={20} />
            </button>
          </div>
          {maxAllowed !== undefined && (
            <div className="col-span-12 flex justify-between items-center text-[10px] mt-1">
                <span className="text-gray-500">Permitido: <span className="font-bold">{maxAllowed}</span> pendientes</span>
                {isOverLimit && <span className="text-red-600 font-bold flex items-center gap-1"><AlertCircle size={10}/> Excede el límite de jabas llenas</span>}
            </div>
          )}
        </form>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[400px]">
        {entries.slice().reverse().map((entry, idx) => (
          <div key={entry.id} className="flex items-center justify-between p-3 bg-white border rounded-md shadow-sm hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 font-mono">#{entries.length - idx}</span>
              <div>
                <span className="font-bold text-gray-800 text-lg">{entry.weight.toFixed(2)}</span>
                <span className="text-xs text-gray-500 ml-1">kg</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
               <span className={`text-xs px-2 py-1 rounded-full bg-${color}-100 text-${color}-800 font-medium`}>
                 {'crateCount' in entry ? entry.crateCount : entry.count} {'crateCount' in entry ? 'jabas' : 'und'}
               </span>
              {!disabled && (
                <button
                  onClick={() => onDelete(entry.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            {disabled ? 'Cerrado sin registros' : 'Sin registros'}
          </div>
        )}
      </div>
    </div>
  );
};