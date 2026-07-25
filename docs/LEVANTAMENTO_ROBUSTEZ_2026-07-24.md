# Levantamento de robustez — Linha Fixa (24/07/2026)

> Documento de trabalho do Claude. Consolida três varreduras de código (engine
> ocular, backend/persistência, front sem backend) cruzadas com a auditoria do
> Codex de 20/07. Todos os achados foram verificados diretamente no código.
>
> **Escopo de uso definido por Anders nesta sessão: instrumento pessoal de
> autocontrole e baseline (single-user).** Isso reprioriza a auditoria do Codex:
> autenticação, quotas persistentes, coorte auditável e psicometria com N humano
> saem de escopo; comparabilidade da série própria entra como prioridade máxima.

## Estado da base

- `npm test`: **409/409** · `npm run lint` (`tsc --noEmit`): limpo
- `linhafixa.service` ativo; `/gaze/healthz` 200 local e público
- Árvore de código limpa; sem pendência de commit

A base é saudável. O que travou não foi qualidade técnica — foi **fila de gates
manuais**: cinco BUNDLEs implementados e verdes aguardando revisão física de
Anders (iPhone/iPad com câmera real), dos quais só o 60fps-ready foi aprovado.
Cada frente nova foi construída sobre base não confirmada.

---

## Achado central: o detector de eventos não é fps-invariante

`src/exercises/saccadeAnalysis.ts:106` calcula `velocity = |Δh| / dt` e compara
com um limiar **absoluto** de `0.0025 ratio/ms` (`saccadeAnalysis.ts:14`). Como
uma sacada real é sub-frame, toda a amplitude cai num único intervalo `dt`.

Amplitude mínima detectável por taxa de amostragem:

| fps | dt | amplitude mínima detectável |
|---|---|---|
| 24 | 41,7 ms | 0,104 |
| 30 | 33,3 ms | **0,083** |
| 45 | 22,2 ms | 0,056 |
| 60 | 16,7 ms | **0,042** |
| 120 | 8,3 ms | 0,040 (piso de `MIN_SACCADE_AMPLITUDE`) |

**Consequência:** a câmera passou de 30 → 60 fps no desktop (BUNDLE 60fps-ready,
aprovado em 22/07). O instrumento ficou **2× mais sensível**. `saccadeCount` sobe
e `meanFixationMs` cai sem que o comportamento ocular tenha mudado — quebra
silenciosa da comparabilidade da série histórica, que é justamente o valor do
projeto.

Agravante: o gate de `comparable` aceita 45–120 Hz
(`src/services/captureValidity.ts:37-38`), então capturas a 45 Hz e a 60 Hz são
ambas carimbadas "comparável" com ~33% de diferença de sensibilidade.

O BUNDLE 60fps-ready resolveu isso corretamente para o EMA
(`src/services/emaTiming.ts`, α = 1−exp(−dt/τ), com teste provando invariância a
fps). **A mesma disciplina não foi aplicada ao detector de eventos.**

### A série histórica é recuperável

Cada captura persiste tanto `sampleRateHz`
(`src/services/captureValidity.ts:50`) quanto o **sinal bruto**
(`samples: GazeSample[]`, `src/types.ts:240`). Portanto é possível corrigir o
detector e **reprocessar todas as capturas antigas** com o mesmo algoritmo,
produzindo uma série comparável de ponta a ponta. Nada do baseline se perde.

Outros itens fps-dependentes na mesma família:
- `fixationBreaks` sem debounce temporal (`src/exercises/oculomotorAnalysis.ts:52-55`)
- `inferenceMeter.ts:9` — α per-frame não migrado para τ
- `stimulusDistance.ts:33` — caminho legado α=0.15 ainda é o default (código morto: ambos os chamadores passam τ)

---

## Achados por frente

### 1. Engine ocular

| # | Achado | Local |
|---|---|---|
| E1 | Detector I-VT fps-dependente (acima) | `saccadeAnalysis.ts:14,106` |
| E2 | Duas fontes de distância divergentes: render usa tracker congelado, captura usa EMA vivo → o texto re-quebra no 1º frame da medida | `EyeTrackingTestScreen.tsx:488-491` vs `:788` |
| E3 | `screenDistanceTrackerRef` nunca resetado → geometria e drift vazam entre capturas da mesma sessão | `EyeTrackingTestScreen.tsx:482-487` |
| E4 | Cache global de detecção com bases de tempo divergentes (rVFC futuro vs `performance.now()`) → landmarks obsoletos sem sinalização | `faceTracking.ts:74-84` |
| E5 | `pose.yaw/pitch` crus (escalam com a distância) entram nas features da calibração | `faceTracking.ts:144-145,254` |
| E6 | Saturação silenciosa das razões de íris comprime amplitudes no caminho bruto | `faceTracking.ts:176` |
| E7 | `analyzePursuit.gain` = σ(gaze)/σ(target) é cego a correlação — ruído puro lê como ganho 1.0 | `oculomotorAnalysis.ts:174-176` |
| E8 | Fail-open composto: blink + distância + geometria todos abertos → dado sujo vira `exploratory`, não `invalid` | `faceTracking.ts:211`, `viewingGeometry.ts:80` |

**Constantes sem justificativa documentada:** a maior parte dos thresholds é
chute com racional em comentário. Exceções bem feitas: `emaTiming.ts` (derivado e
testado), `captureValidity.ts` (contrato versionado, 27 testes),
`deviceClass.ts:9-13` (única com fonte de literatura citada).

**Pior caso:** `src/services/visualSignal.ts:74-80` — fórmula de score com cinco
pesos mágicos (`×120`, `×0.35`, `×0.25`, `−35`, `−25`), nenhum documentado nem
testado individualmente.

### 2. Backend e persistência

| # | Achado | Local |
|---|---|---|
| P1 | **Dado de saúde identificável vai para a OpenAI**: `profile.name` + `context.venvanseTakenAt` + `sleepHours` + `mood` + histórico | `planner.ts:133`, `types.ts:9-40` |
| P2 | Consentimento não menciona esse envio e afirma que a câmera serve "exclusivamente para verificar se a cabeça está parada" | `ConsentScreen.tsx:38` |
| P3 | Export existe, **import não** — backup é one-way, não restaura nada | `DashboardScreen.tsx:142-153` |
| P4 | `storage.ts` sem nenhum teste; `upgrade()` não recebe `oldVersion` → v4 futura não migra dados | `storage.ts:36` |
| P5 | `server.ts` sem nenhum teste — zero cobertura de rotas, `APP_BASE_PATH`, cache headers, fallback SPA | — |
| P6 | `/api` desconhecido: GET devolve HTML da SPA com 200; POST devolve 404 em HTML | `server.ts:403-406` |
| P7 | `PLAN_SCHEMA` declara `number` sem `minimum`/`maximum` — faixas existem só no prompt | `server.ts:98-115` |
| P8 | Calibração **não é persistida** (variáveis de módulo) — recalibração do zero a cada reload | `gazeCalibration.ts:40-45` |
| P9 | `dotenv` no `package.json` mas nunca importado; `express.json()` sem `limit`; `listen` em `0.0.0.0` | `server.ts:140,409` |

`README.md:9` chama a entrada de "autenticada" — não existe autenticação nenhuma.

### 3. Front sem backend

| # | Achado | Local |
|---|---|---|
| F1 | **Plano "adaptativo" recebe histórico literalmente vazio** (`[]`), enquanto o prompt do servidor pede adaptação por histórico e a UI anuncia "protocolo adaptativo" | `ExercisePlayerScreen.tsx:197` |
| F2 | Opção "Contraste máximo" é inerte — `high-contrast` só existe no tipo e no `<option>`, todo o app testa `=== 'dark'` | `SettingsScreen.tsx:149` |
| F3 | Estágio "Validando sinal e contexto" só checa se a câmera ligou; 0% de rosto detectado passa na validação | `EyeTrackingTestScreen.tsx:690-699` |
| F4 | Clicar num registro em "Hoje" descarta o `record` e navega para a lista genérica | `AssessmentWorkspaceScreen.tsx:216` |
| F5 | "Analisar Meu Progresso" some após a 1ª execução; erro gravado em `insight` mata o botão de vez, sem retry | `DashboardScreen.tsx:136,187-191` |
| F6 | Exportar Histórico habilitado mesmo com zero sessões | `DashboardScreen.tsx:161-169` |
| F7 | PWA anunciada sem service worker; `manifest.json:8` pede `landscape`, que o app bloqueia no celular para medir | `index.html:8-13`, `PhonePortraitGate.tsx` |
| F8 | Campos do plano gerados e nunca exibidos: `stopRules`, `patientFeedbackPtBR`, `sessionTitle`, `difficulty`, `recommendPause`, `recommendProfessionalReview` | `planner.ts:34-35,51,85,114` |
| F9 | `distanceCm` exibido no Dashboard como fato da captura é o valor do **perfil**, não a distância medida por IPD | `DashboardScreen.tsx:388` |
| F10 | `/player` fora da shell nova, sem navegação de saída além de terminar ou abortar | `ExercisePlayerScreen.tsx` |

**Higiene confirmada (não são problema):** zero TODO/FIXME, zero endpoint
fantasma, zero `onClick` vazio, zero dado mockado exibido como métrica, fallback
do planner rotulado honestamente (`origin: 'local-fallback'`).

### Correções no BACKLOG.md

`BACKLOG.md:213-216` está desatualizado em ambas as afirmações:
- `HomeScreen.tsx` **já foi deletado** (commit `576e3ce`); zero referências no `src/`
- `/dashboard` e `/settings` **já usam** `AppShell`; o que resta legado é o miolo (recharts com cores hardcoded, `handleSubmit` que expulsa para `/`)

---

## Frentes propostas, em ordem

### Frente 1 — Comparabilidade temporal do instrumento — **ENTREGUE (24/07)**

Direção corrigida por Anders durante a sessão: não era "tornar o I-VT
fps-invariante", era **trocar o modelo de detecção**. Medir a velocidade interna
de uma sacada com 1-5 amostras é impossível por amostragem, não por ruído; a
normalização correta de uma grandeza irresolúvel continua irresolúvel. O modelo
certo é detectar **fixação por dispersão** (I-DT) e derivar as sacadas
matematicamente das transições entre fixações.

Implementado:
- `src/exercises/fixationDetection.ts` — I-DT (Salvucci & Goldberg): janela
  deslizante com extent incremental por eixo, duração mínima de 100ms, gap de
  rastreio nunca atravessado. Todo parâmetro é duração em ms ou extensão
  espacial — nenhum é por-frame, então a invariância é estrutural.
- `src/exercises/saccadesFromFixations.ts` — sacada = transição entre fixações
  consecutivas (amplitude entre centroides, janela entre o fim de uma e o início
  da outra) + limiar de dispersão auto-escalável derivado do span do próprio
  capture, para funcionar igual no sinal calibrado e no bruto.
- `src/exercises/saccadeAnalysis.ts` — miolo I-VT substituído; `medianFilter3`,
  line-return adaptativo, contrato `SaccadeMetrics` e `events` preservados
  integralmente.

Evidência: `npm test` **432/432** (409 anteriores + 23 novos), `npm run lint`
limpo, build prefixado **106459/180000** gzip, `npm run smoke` notebook 63/63,
layout 165/165, phone-portrait 14/14, validade 72/72, assessment 9/9, loading
43/43 (`real-tab-hidden` segue BLOCKED no headless, pré-existente).

**Testes reescritos com autorização explícita de Anders.** Oito testes de
`saccadeAnalysis.test.ts` codificavam o modelo antigo: usavam fixações de 20-40ms,
fisiologicamente implausíveis, que só faziam sentido para um detector que fechava
uma "fixação" com duas amostras. Foram reescritos com plateaus de 240ms
preservando a intenção de cada um. Dois casos merecem destaque:
- `golden plateau trace` **exigia** 1 evento a 60/50Hz e 0 eventos a 30/24Hz,
  batizando a dependência de fps de "pins event detection to the measured
  temporal tier" — o bug estava travado por teste. Agora exige o mesmo resultado
  nas quatro taxas.
- `detectorValidation` injetava uma flick espúria de 80ms; o modelo novo
  corretamente a ignora (80ms é o olho passando, não parando). A fixture foi
  alongada para 200ms para seguir exercitando o contador de falsos positivos.

**Versionamento e reprocessamento da série — autorizados e entregues (24/07):**
- `SaccadeMetrics.analyzerVersion` carimba toda medição.
  `GAZE_ANALYZER_VERSION = 2`; ausente = versão 1 (I-VT, dependente de fps).
  Valores de versões diferentes não são comparáveis, e agora isso é legível no
  dado em vez de ser conhecimento tácito.
- `src/services/captureReprocess.ts` — re-mede uma captura a partir do seu
  `samples: GazeSample[]` persistido. Idempotente; só toca registros com sinal
  bruto e versão desatualizada.
- `ValidationCapture.legacyMetrics` guarda a medição original, escrita **uma
  única vez** na primeira elevação e nunca sobrescrita. Nada que já foi medido
  é destruído, e a operação é auditável e reversível.
- `storage.reprocessStoredCaptures()` eleva a série inteira numa transação
  (tudo ou nada), acionada no boot em `App.tsx`. Falha nunca bloqueia o app —
  na pior hipótese as capturas permanecem na versão em que foram gravadas.

Verificação de integração real (`scripts/smoke-reprocess.mjs`, agora no gate):
uma captura legada semeada num IndexedDB de verdade é remedida no boot —
`saccadeCount` 99 → **2**, `meanFixationMs` 42 → **240**, `legacyMetrics`
preservando o 99, sinal bruto intocado (39 amostras) e idempotência confirmada
entre boots. 7/7.

Gate após esta entrega: `npm test` **442/442**, lint limpo, build prefixado
**107894/180000** gzip, `npm run smoke` notebook 63/63, layout 165/165,
phone-portrait 14/14, validade 72/72, assessment 9/9, loading 43/43,
**reprocess 7/7** (`real-tab-hidden` segue BLOCKED no headless, pré-existente).

Pendente desta frente:
- `fixationBreaks` (`oculomotorAnalysis.ts:52-55`) segue sem debounce temporal;
- resíduo legado de `stimulusDistance.ts:33` (α por-frame como default) e
  `inferenceMeter.ts:9`;
- a UI ainda não distingue visualmente série remedida de série original
  (`legacyMetrics` está no dado, mas nenhuma tela o mostra).

### Frente 2 — Proteger o baseline
Import do backup (o export já existe), teste de `storage.ts`, e `upgrade()` com
`oldVersion` para permitir migração real. Persistir a calibração (E8/P8) entra
aqui como ganho de atrito diário.

### Frente 3 — Honestidade do contrato
Consentimento que descreve o uso real da câmera e o envio de dados derivados;
minimização do payload que vai para a OpenAI (dropar nome, converter horário de
medicação em "há X horas"); corrigir "autenticada" no README; `/api` falhando em
JSON.

### Frente 4 — Religar promessas soltas do front
F1 (histórico vazio — uma linha), F3 (validação que não valida), F2, F4, F5, F6.
São quebras diretas de expectativa, todas baratas.

### Frente 5 — Rede de segurança de testes
`server.ts` e `storage.ts` — as duas camadas com zero cobertura, sendo que uma
guarda todo o histórico. Teste de integração de pipeline injetando série
sintética de landmarks (hoje cada estágio é testado isolado, as interfaces entre
eles não).

### Fora de escopo (definido nesta sessão)
Autenticação, quotas persistentes, request IDs, banco no servidor, sync,
coorte auditável, equating psicométrico. O PACK de calibração física px/cm (C1)
permanece parado por decisão anterior e é informado pela pesquisa em
`docs/research/`.
