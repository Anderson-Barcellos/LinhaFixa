import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Optional sub-path mount (APP_BASE_PATH, e.g. /gaze). Must match the Vite `base`
// the client was built with and the Apache ProxyPass prefix. '' means root mount.
function basePrefix(): string {
  const v = process.env.APP_BASE_PATH;
  if (!v || v === '/') return '';
  return '/' + v.replace(/^\/+|\/+$/g, '');
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const base = basePrefix();
  const p = (route: string) => `${base}${route}`;

  app.use(express.json());

  app.post(p("/api/generateReadingContent"), async (req, res) => {
    try {
      const { complexity } = req.body;
      const client = getClient();

      const difficultyRule = complexity === 'facil'
        ? "Produza um texto mais fácil e ameno, com encadeamento de ideias direto, frases mais curtas e vocabulário cotidiano sobre programação/tecnologia."
        : "Produza um texto estruturalmente mais complexo, com encadeamento de ideias denso, orações subordinadas e jargão técnico sobre programação/tecnologia.";

      const prompt = `Gere um trecho de curiosidade sobre tecnologias e programação.
Requisito de Formatação/Complexidade: ${difficultyRule}
O texto deve servir para uma sessão curta de leitura (em torno de 30-50 palavras).
Apenas o texto, sem título, sem formatação markdown. Responda em português (pt-BR).`;

      const completion = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.7,
        messages: [
          { role: "system", content: "Você é um assistente criativo especializado em gerar textos curtos para testes de leitura sacádica em pacientes oftalmológicos ou neurológicos." },
          { role: "user", content: prompt }
        ]
      });

      res.json({ text: completion.choices[0]?.message?.content ?? "" });
    } catch (e) {
      console.error("OpenAI Error (reading content):", e);
      res.status(500).json({ error: "Failed to generate reading content" });
    }
  });

  app.post(p("/api/generateInsight"), async (req, res) => {
    try {
      const { sessionSummary } = req.body;
      const client = getClient();

      const prompt = `Analise os seguintes dados agregados de sessões de controle oculomotor e leitura de um paciente:
${JSON.stringify(sessionSummary, null, 2)}

Produza um parágrafo avaliando o progresso da estabilidade de cabeça, cadência de leitura e relato de sintomas.
Seja cauteloso: você é um assistente de software, NÃO faça diagnósticos médicos, apenas aponte tendências observadas nos dados.
Aja de forma encorajadora e profissional, em português do Brasil (pt-BR).`;

      const completion = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.3,
        messages: [
          { role: "system", content: "Aponte tendências a partir de dados quantitativos com linguagem encorajadora, isentando-se de diagnóstico médico." },
          { role: "user", content: prompt }
        ]
      });

      res.json({ text: completion.choices[0]?.message?.content ?? "" });
    } catch (e) {
      console.error("OpenAI Error (insight):", e);
      res.status(500).json({ error: "Failed to generate insight" });
    }
  });

  app.post(p("/api/generatePlan"), async (req, res) => {
    try {
      const { profile, symptoms, history } = req.body;
      const client = getClient();

      const prompt = `Você é um assistente que monta um plano de treino oculomotor curto e seguro.
Perfil do usuário: ${JSON.stringify(profile)}
Sintomas atuais (0-10): ${JSON.stringify(symptoms)}
Resumo do histórico recente: ${JSON.stringify((history || []).slice(-5))}

Monte um plano com 2 a 4 exercícios escolhidos APENAS entre estes IDs:
- "fixation" (fixação central, toque ao mudar de cor)
- "saccades" (alvo que pula; use amplitudeDeg entre 8 e 25)
- "smooth_pursuit" (perseguição suave; use speedDegPerSec entre 1 e 5 e amplitudeDeg entre 8 e 20)
- "assistedReading" (leitura guiada; defina textComplexity "facil" ou "dificil")

Adapte a dificuldade ao histórico e ao conforto (sintomas mais altos => mais leve e curto).
Responda SOMENTE com um objeto JSON com EXATAMENTE este formato:
{
  "sessionTitle": string,
  "safetyStatus": { "allowTraining": boolean, "reason": string, "recommendPause": boolean, "recommendProfessionalReview": boolean },
  "exercises": [
    {
      "exerciseId": "fixation" | "saccades" | "smooth_pursuit" | "assistedReading",
      "durationSec": number,
      "difficulty": number,
      "parameters": {
        "targetSizeMm": number,
        "speedDegPerSec": number,
        "amplitudeDeg": number,
        "lineSpacingMultiplier": number,
        "contrastMode": string,
        "durationSec": number,
        "textComplexity": "facil" | "dificil"
      },
      "rationalePtBR": string,
      "stopRules": string[]
    }
  ],
  "patientFeedbackPtBR": string,
  "clinicianSummaryPtBR": string
}
Todos os textos voltados ao usuário devem estar em português (pt-BR). Não inclua diagnóstico médico.`;

      const completion = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Você gera planos de treino oculomotor seguros e conservadores como assistente de software, sem fazer diagnóstico médico. Responda apenas com JSON válido." },
          { role: "user", content: prompt }
        ]
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      const plan = JSON.parse(raw);
      res.json({ plan });
    } catch (e) {
      console.error("OpenAI Error (plan):", e);
      res.status(500).json({ error: "Failed to generate plan" });
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
    // Serve static assets under the (optional) base prefix.
    app.use(base || '/', express.static(distPath));
    // Convenience: redirect the bare root to the mounted app when sub-pathed.
    if (base) app.get('/', (_req, res) => res.redirect(base + '/'));
    // SPA fallback: any other GET returns index.html (its asset URLs already carry
    // the base, baked in by Vite at build time).
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
