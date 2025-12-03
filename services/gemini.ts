import { GoogleGenAI } from "@google/genai";
import { Sale, InventoryState } from "../types";

const createAIClient = () => {
  if (!process.env.API_KEY) {
    console.error("API_KEY is missing");
    return null;
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const generateDailyReport = async (inventory: InventoryState, sales: Sale[]) => {
  const ai = createAIClient();
  if (!ai) return "Error: API Key no configurada.";

  const salesSummary = sales.map(s => {
    const totalFullWeight = s.fullCrates.reduce((acc, c) => acc + c.weight, 0);
    const totalFullCrates = s.fullCrates.reduce((acc, c) => acc + c.crateCount, 0);
    const totalEmptyWeight = s.emptyCrates.reduce((acc, c) => acc + c.weight, 0);
    const totalEmptyCrates = s.emptyCrates.reduce((acc, c) => acc + c.crateCount, 0);
    const deadCount = s.mortality.reduce((acc, c) => acc + c.count, 0);
    const deadWeight = s.mortality.reduce((acc, c) => acc + c.weight, 0);
    
    // Avg tare
    const avgTare = totalEmptyCrates > 0 ? totalEmptyWeight / totalEmptyCrates : 2.5; 
    const totalTare = totalFullCrates * avgTare;
    
    // Net weight now subtracts mortality weight
    const netWeight = totalFullWeight - totalTare - deadWeight;

    return `
      Cliente: ${s.clientName}
      - Jabas Llevadas: ${totalFullCrates}
      - Peso Bruto: ${totalFullWeight.toFixed(2)} kg
      - Tara Total: ${totalTare.toFixed(2)} kg
      - Peso Muertos: ${deadWeight.toFixed(2)} kg (${deadCount} und)
      - Peso Neto Final: ${netWeight.toFixed(2)} kg
    `;
  }).join("\n");

  const prompt = `
    Actúa como un experto en logística avícola. Genera un breve reporte ejecutivo en texto plano basado en los siguientes datos del día.
    
    Datos Generales:
    - Proveedor Principal: ${inventory.mainClient}
    - Stock Inicial Jabas: ${inventory.initialFullCrates}
    
    Ventas (Nota: El Peso Neto ya tiene descontado la tara y el peso de los pollos muertos):
    ${salesSummary}
    
    Por favor provee:
    1. Un resumen del total vendido (peso neto y cantidad de jabas) vs stock inicial.
    2. Análisis de mermas (pollos muertos y su impacto en el peso).
    3. Una conclusión breve sobre la eficiencia del día.
    Mantén el tono profesional.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "No se pudo generar el reporte en este momento.";
  }
};