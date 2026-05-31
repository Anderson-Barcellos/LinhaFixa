import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/generateReadingContent", async (req, res) => {
    try {
      const { complexity } = req.body;
      const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
            headers: {
            'User-Agent': 'aistudio-build',
            }
        }
      });
      
      const difficultyRule = complexity === 'facil' 
        ? "Produza um texto mais fácil e ameno, com encadeamento de ideias direto, frases mais curtas e vocabulário cotidiano sobre programação/tecnologia."
        : "Produza um texto estruturalmente mais complexo, com encadeamento de ideias denso, orações subordinadas e jargão técnico sobre programação/tecnologia.";

      const prompt = `Gere um trecho de curiosidade sobre tecnologias e programação gerada por IA.
Requisito de Formatação/Complexidade: ${difficultyRule}
O texto deve servir para uma sessão curta de leitura (em torno de 30-50 palavras).
Apenas o texto, sem título, sem formatação markdown. Responda em português (pt-BR).`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "Você é um assistente criativo especializado em gerar textos curtos para testes de leitura sacádica em pacientes oftalmológicos ou neurológicos.",
          temperature: 0.7,
        }
      });

      res.json({ text: response.text });
    } catch (e) {
      console.error("Gemini Error:", e);
      res.status(500).json({ error: "Failed to generate reading content" });
    }
  });

  app.post("/api/generateInsight", async (req, res) => {
    try {
      const { sessionSummary } = req.body;
      const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
      
      const prompt = `Analise os seguintes dados agregados de sessões de controle oculomotor e leitura de um paciente:
${JSON.stringify(sessionSummary, null, 2)}

Produza um parágrafo avaliando o progresso da estabilidade de cabeça, cadência de leitura e relato de sintomas.
Seja cauteloso: você é um assistente de software, NÃO faça diagnósticos médicos, apenas aponte tendências observadas nos dados.
Aja de forma encorajadora e profissional, em português do Brasil (pt-BR).`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "Aponte tendências a partir de dados quantitativos com linguagem encorajadora, isentando-se de diagnóstico médico.",
          temperature: 0.3,
        }
      });

      res.json({ text: response.text });
    } catch (e) {
      console.error("Gemini Insight Error:", e);
      res.status(500).json({ error: "Failed to generate insight" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
