import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import { MEDIAPIPE_PUBLIC_ROOT } from "./config/mediapipe-assets.mjs";
import { HTML_CACHE_CONTROL } from "./config/static-cache.mjs";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function requireOpenAI(res: express.Response, feature: string) {
  const client = getClient();
  if (client) return client;
  res.status(503).json({
    error: "OPENAI_API_KEY_MISSING",
    message: `${feature} requer OPENAI_API_KEY configurada no serviço.`,
  });
  return null;
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
  const PORT = Number(process.env.PORT || 3000);
  const base = basePrefix();
  const p = (route: string) => `${base}${route}`;

  app.use(express.json());

  app.post(p("/api/generateReadingContent"), async (req, res) => {
    try {
      const { complexity } = req.body;
      const client = requireOpenAI(res, "Geracao de texto de leitura");
      if (!client) return;

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

  app.post(p("/api/generateRecallText"), async (_req, res) => {
    try {
      const client = requireOpenAI(res, "Geracao de texto de recall");
      if (!client) return;

      const domains = ['ciência', 'história', 'natureza', 'tecnologia', 'medicina', 'geografia', 'astronomia', 'cultura'];
      const topicHint = domains[Math.floor(Math.random() * domains.length)];

      const prompt = `Gere um texto expositivo em português (pt-BR) sobre uma curiosidade de ${topicHint}.
Requisitos:
- 150 a 250 palavras, prosa corrida, sem título e sem formatação markdown.
- Denso em fatos concretos e nomeáveis (nomes, datas, quantidades, causas e efeitos) — ele será usado para avaliar recall de leitura com perguntas objetivas.
- Autocontido: todas as informações necessárias devem estar no próprio texto.
Responda SOMENTE com um objeto JSON: { "topic": string curta com o tema, "text": string com o texto }.`;

      const completion = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Você gera textos expositivos factuais para testes de leitura e memória. Responda apenas com JSON válido." },
          { role: "user", content: prompt }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
      res.json({ topic: typeof parsed.topic === 'string' ? parsed.topic : topicHint, text: typeof parsed.text === 'string' ? parsed.text : "" });
    } catch (e) {
      console.error("OpenAI Error (recall text):", e);
      res.status(500).json({ error: "Failed to generate recall text" });
    }
  });

  app.post(p("/api/generateRecallQuestions"), async (req, res) => {
    try {
      const { text } = req.body;
      const client = requireOpenAI(res, "Geracao de questoes de recall");
      if (!client) return;

      const prompt = `Texto lido pelo usuário:
"""
${text}
"""
Gere EXATAMENTE 6 questões de múltipla escolha sobre o texto acima, cada uma com EXATAMENTE 5 alternativas.
Regras:
- Cada questão tem UMA alternativa correta e inequívoca, respondível apenas com o texto (sem exigir conhecimento externo).
- Distratores plausíveis, do mesmo domínio, de preferência derivados do próprio texto.
- Proibido "todas as anteriores", "nenhuma das anteriores" ou variações.
- Varie a posição da alternativa correta entre as questões.
Responda SOMENTE com JSON: { "questions": [ { "question": string, "options": [string, string, string, string, string], "correctIndex": number de 0 a 4, "rationale": string curta citando o trecho que fundamenta } ] }.`;

      const completion = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Você elabora questões objetivas de compreensão leitora, precisas e sem ambiguidade. Responda apenas com JSON válido." },
          { role: "user", content: prompt }
        ]
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      res.json(JSON.parse(raw));
    } catch (e) {
      console.error("OpenAI Error (recall questions):", e);
      res.status(500).json({ error: "Failed to generate recall questions" });
    }
  });

  app.post(p("/api/generateInsight"), async (req, res) => {
    try {
      const { sessionSummary } = req.body;
      const client = requireOpenAI(res, "Analise de evolucao");
      if (!client) return;

      const prompt = `Analise os seguintes dados agregados de sessões de controle oculomotor e leitura de um paciente:
${JSON.stringify(sessionSummary, null, 2)}

Produza um parágrafo avaliando o progresso da estabilidade de cabeça, dinâmica ocular de leitura (sacadas, regressões, fixações e cobertura do olhar) e relato de sintomas.
O campo "lineReturns", quando presente, conta voltas amplas do olhar para o início da próxima linha — é parte normal da leitura, não é regressão de releitura nem indica dificuldade.
Os campos "contextBefore"/"contextAfter", quando presentes, trazem o contexto rápido: venvanseTakenAt = horário da medicação (null se não tomou), sleepHours = horas de sono, e escalas 1-5 de mood (humor) e feeling (sensação subjetiva). Relacione tendências de leitura/estabilidade a esse contexto quando fizer sentido.
Se houver tempos de toque/avanço manual, trate-os apenas como contexto de navegação do texto, não como medida de sacada ou fixação.
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
      const { profile, context, history } = req.body;
      const client = requireOpenAI(res, "Geracao de plano de treino");
      if (!client) return;

      const prompt = `Você é um assistente que monta um plano de treino oculomotor curto e seguro.
Perfil do usuário: ${JSON.stringify(profile)}
Contexto de hoje: ${JSON.stringify(context)}
Campos do contexto: venvanseTakenAt = horário da medicação (lisdexanfetamina) hoje, null se não tomou; sleepHours = horas dormidas na última noite; mood = humor (1 péssimo .. 5 ótimo); feeling = sensação subjetiva agora (1 péssimo .. 5 afiado).
Pouco sono, humor baixo ou sensação baixa => sessão mais leve e mais curta.
Resumo do histórico recente: ${JSON.stringify((history || []).slice(-5))}

Monte um plano com 2 a 4 exercícios escolhidos APENAS entre estes IDs:
- "fixation" (fixação central, toque ao mudar de cor)
- "saccades" (alvo que pula; use amplitudeDeg entre 8 e 25)
- "smooth_pursuit" (perseguição suave; use speedDegPerSec entre 1 e 5 e amplitudeDeg entre 8 e 20)
- "assistedReading" (leitura guiada; defina textComplexity "facil" ou "dificil")

Adapte a dificuldade ao histórico e ao contexto relatado.
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
    app.use(p('/assets'), express.static(path.join(distPath, 'assets'), {
      immutable: true,
      maxAge: '1y',
    }));
    app.use(p('/assets'), (_req, res) => res.sendStatus(404));
    app.use(
      p(`/${MEDIAPIPE_PUBLIC_ROOT}`),
      express.static(path.join(distPath, MEDIAPIPE_PUBLIC_ROOT), {
        immutable: true,
        maxAge: '1y',
      }),
    );
    app.use(p(`/${MEDIAPIPE_PUBLIC_ROOT}`), (_req, res) => res.sendStatus(404));
    // The retired unversioned WASM URL is an asset path, never an SPA route.
    app.use(p('/vendor/mediapipe/wasm'), (_req, res) => res.sendStatus(404));
    // Serve static assets under the (optional) base prefix.
    app.use(base || '/', express.static(distPath, {
      setHeaders(res, filePath) {
        if (path.basename(filePath) === 'index.html') {
          res.setHeader('Cache-Control', HTML_CACHE_CONTROL);
        }
      },
    }));
    // Convenience: redirect the bare root to the mounted app when sub-pathed.
    if (base) app.get('/', (_req, res) => res.redirect(base + '/'));
    // SPA fallback: any other GET returns index.html (its asset URLs already carry
    // the base, baked in by Vite at build time).
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', HTML_CACHE_CONTROL);
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
