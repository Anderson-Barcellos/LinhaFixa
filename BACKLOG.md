### 2026-06-18 19:05 - Linha Fixa em /gaze

Context:
Repositorio `LinhaFixa` clonado em `/root/Gaze`, instalado e publicado em `https://ultrassom.ai/gaze/` para uso de camera via HTTPS.

Details:
`npm ci`, `APP_BASE_PATH=/gaze npm run build` e `npm run lint` passaram. O `server.ts` foi ajustado para respeitar `PORT`; nesta maquina `/etc/linhafixa.env` define `APP_BASE_PATH=/gaze` e `PORT=3060` porque a porta 3000 ja pertence ao STT. O servico systemd ativo e `linhafixa.service`; Apache proxy em `/gaze` aponta para `127.0.0.1:3060/gaze` com `Permissions-Policy: camera=(self), microphone=()`.

Notes:
Antes de editar `/etc/apache2/sites-available/ultrassom.ai-optimized.conf`, remover temporariamente `chattr +i` e recolocar depois. `/etc/apache2/APACHE.md` foi atualizado para substituir o mapeamento antigo GazeReader por Linha Fixa em 3060.

### 2026-06-18 20:58 - Calibracao iPhone Pro Max landscape

Context:
Fluxo de camera/calibracao otimizado para Safari em iPhone Pro Max horizontal e para evitar nova permissao de camera ao voltar da calibracao para o diagnostico.

Details:
Foi criado `src/services/cameraStream.ts` para reusar um unico `MediaStream` com camera frontal, resolucao ideal 1280x720 e 30fps. `CalibrationOverlay`, `EyeTrackingTestScreen` e `ExerciseCanvas` passaram a compartilhar esse stream. `CalibrationOverlay` ganhou pontos afastados das bordas, layout `100dvw/100dvh` com safe areas, coleta por janela temporal em vez de 30 frames fixos, e opcao `keepCameraOnClose` para voltar ao diagnostico/exercicio sem parar a camera. `SettingsScreen` agora trata distancia como texto durante edicao e normaliza ao salvar/blur, permitindo digitar `40` sem travar no `4`.

Notes:
Foi corrigido tambem o deep link: `App.tsx` agora aguarda hidratacao de IndexedDB antes de redirecionar para consentimento. `faceTracking.ts` tenta GPU e cai para CPU se necessario, alem de proteger `detectForVideo` contra erro runtime de MediaPipe. Validado com `node --import tsx --test`, `npm run lint`, `APP_BASE_PATH=/gaze npm run build` e Playwright em viewport 932x430.

### 2026-06-19 00:15 - Motion Assist postural

Context:
Adicionado suporte inicial a sensores de movimento do Safari/iPhone como referencia postural para a calibracao ocular.

Details:
`src/services/motionSensor.ts` encapsula permissao `DeviceMotionEvent`/`DeviceOrientationEvent`, amostragem, baseline de calibracao, delta angular e classificacao `stable/moved/shaking`. A tela de diagnostico pede sensores junto com a camera, mostra `Posicao estavel/mudou/movimento alto`, delta desde a calibracao e confianca. `CalibrationOverlay` grava baseline ao concluir validacao. Apache `/gaze` agora envia `Permissions-Policy: camera=(self), microphone=(), accelerometer=(self), gyroscope=(self)`.

Notes:
V1 nao corrige automaticamente o ponto azul; ela apenas mede estabilidade e reduz confianca quando a posicao do iPhone muda. A compensacao matematica deve vir depois de coletar dados reais no iPhone Pro Max.

### 2026-06-19 14:02 - Reframing para dinamica ocular de leitura

Context:
Durante teste real no iPhone, o sinal horizontal por webcam mostrou boa correspondencia com sacadas/regressoes mesmo sem iluminacao ideal, enquanto a posicao textual exata continuou sendo a parte mais dependente de calibracao, fonte, distancia e postura.

Details:
Foi criado `src/exercises/readingDynamics.ts` com uma camada pequena de interpretacao por cima de `SaccadeMetrics`, sem alterar o detector I-VT de `saccadeAnalysis.ts`. `EyeTrackingTestScreen`, `ExercisePlayerScreen`, `SettingsScreen` e `CalibrationOverlay` foram ajustados para comunicar "dinamica ocular de leitura" e deixar claro que a calibracao espacial ajuda contexto, mas nao e a promessa central do app.

Notes:
Manter o movimento horizontal como eixo principal para sacadas/regressoes. Nao reduzir ou descartar vertical/diagonal no algoritmo sem validacao real, pois pode carregar contexto util. O proximo pack separado sugerido e analise de pescoço/postura com face pose e/ou Motion Assist.

### 2026-06-19 14:18 - Docs e manutencao git

Context:
Depois do reframing para dinamica ocular de leitura, os documentos principais ainda misturavam template antigo do AI Studio, caminhos de deploy obsoletos e referencias a porta 3000.

Details:
`README.md` foi reescrito para descrever Linha Fixa, foco atual, limites honestos, validacao e deploy real em `https://ultrassom.ai/gaze/`. `deploy/apache/README.md`, `deploy/apache/linhafixa.conf` e `deploy/apache/linhafixa.service` foram alinhados ao estado atual: `/root/Gaze`, `APP_BASE_PATH=/gaze`, porta 3060, camera e sensores de movimento. `package.json` e `package-lock.json` agora usam o nome `linhafixa`.

Notes:
Nao houve mudanca nova em rota/porta real nesta manutencao, entao `/etc/apache2/APACHE.md` nao precisou ser alterado. Antes de fechar git, validar testes, TypeScript, build com `APP_BASE_PATH=/gaze` e health local/publico.

### 2026-06-20 - PACK 1 concluido: estabilidade cervical/postural

Context:
Primeiro pack do ROADPACK. Criado um indice separado de estabilidade cervical/postural a partir de `yaw/pitch/roll` da face (`estimateHeadPose`) e da flag de movimento do Motion Assist, sem tocar no detector ocular `saccadeAnalysis.ts`.

Details:
Novo `src/exercises/posturalStability.ts` com `summarizePosturalStability(samples, context)` espelhando o padrao de `readingDynamics.ts`: status (`stable`/`sustained-tilt`/`rotating`/`high-movement`/`insufficient`), `cervicalStability` 0-100, `sustainedTiltDeg`, `rotationRange`, `confidence` e textos prontos. `EyeTrackingTestScreen` bufferiza pose durante a captura, marca shaking do Motion Assist e mostra um bloco postural no relatorio de diagnostico. `ExerciseCanvas` acumula pose no loop e injeta `posturalStability` no `extraData` do `onFinish`, preservando os dados do exercicio. `ExercisePlayerScreen` mostra o indice postural por exercicio no resumo da sessao. Teste novo `posturalStability.test.ts` cobre os cinco status.

Notes:
Decisoes honestas: retorna `insufficient` quando faltam amostras (nao finge postura perfeita); roll neutro = 0 por enquanto, a compensacao matematica fica para depois de coletar dados reais no iPhone Pro Max; thresholds de jitter alinhados a regra `<5` que ja existia no `ExerciseCanvas`. Validado com `node --import tsx --test` (15/15), `tsc --noEmit`, `npm run lint` e `APP_BASE_PATH=/gaze npm run build`. Falta a validacao manual no iPhone (Anders) e eventual ajuste de thresholds com dado real.

### 2026-06-22 - PACK 2 concluido: validacao real guiada

Context:
Segundo pack do ROADPACK. A captura do diagnostico nao gravava nada (relatorio efemero). PACK 2 transforma cada captura num registro etiquetado e persistido, para acumular dado real e calibrar os thresholds do PACK 1.

Details:
Novos tipos em `types.ts` (`ValidationCapture`, `ValidationConditions`, `AxisSignalSummary`, enums de iluminacao/postura). `storage.ts` subiu para DB v2 com store `validationCaptures` (indice por data) + CRUD (`saveValidationCapture`, `getValidationCaptures` ordenado mais-recente-primeiro, `deleteValidationCapture`). Novo `src/services/validationCapture.ts` puro: `summarizeAxisSignal()` (dispersao H/V do sinal) e `serializeValidationExport()` (JSON auto-descritivo, recebe `exportedAt` do caller). `EyeTrackingTestScreen` ganhou seletor de condicao (luz/postura/distancia-do-perfil/nota), grava a captura no `finishCapture` com axis + amostras cruas, e um drawer "Capturas salvas" com lista comparavel (cobertura, sacadas, cervical %, H/V range), export JSON e delete. Teste novo `validationCapture.test.ts` com 3 casos.

Notes:
Decisoes honestas: distancia vem do perfil (nao inventa); export tenta clipboard primeiro (Safari iOS instavel com download de Blob) e cai para download de arquivo, reportando a rota usada; cada captura guarda `samples` crus para analise H/V/diagonal offline. Nada toca `saccadeAnalysis.ts`. Validado com `node --import tsx --test` (18/18), `tsc --noEmit`, `npm run lint` e `APP_BASE_PATH=/gaze npm run build`. Falta a validacao manual no iPhone (Anders): rodar capturas variando condicao e ver se os numeros separam bem os cenarios.

### 2026-06-22 - Kickoff da proxima conversa

Context:
PACKs 1 e 2 concluidos e aprovados no gate; falta a validacao manual no iPhone (idealmente usar o PACK 2 para coletar o dado que calibra o PACK 1). O acompanhamento principal segue no `BACKLOG.md`; nao existe `AGENTS.md` no repo neste momento.

Details:
ROADPACK restante:

- PACK 1: Pescoço/postura. CONCLUIDO em 2026-06-20 (`src/exercises/posturalStability.ts` + consumidores). Pendente so validacao manual e possivel ajuste de thresholds com dado real.
- PACK 2: Validacao real guiada. CONCLUIDO em 2026-06-22 (`src/services/validationCapture.ts`, store `validationCaptures` em `storage.ts`, captura etiquetada + drawer/export em `EyeTrackingTestScreen`). Pendente coletar capturas reais no iPhone.
- PACK 3: Refinamento visual do relatorio (recomendado como proximo). Melhorar hierarquia de resultado para destacar dinamica ocular, confianca temporal, leitura funcional e o indice postural. Decisao de design pendente: este pack mexe so na apresentacao (relatorio de captura + resumo de sessao + drawer de capturas) — confirmar com Anders escopo visual antes de codar.
- PACK 4: Exportacao/clinica. Definir formato enxuto de historico para acompanhamento longitudinal, sem diagnostico e sem prometer precisao laboratorial. Parte do encanamento (export JSON) ja existe do PACK 2; aqui seria o formato clinico enxuto.

Notes:
Na retomada, comecar pelo PACK 3 salvo acima. Como e um pack visual, abrir com brainstorming/decisao de escopo com Anders (o que destacar, hierarquia, antes/depois) — `superpowers:brainstorming` + `frontend-design` aplicam. Reaproveitar os dados ja existentes: `posturalStability` (PACK 1) e `ValidationCapture`/`summarizeAxisSignal` (PACK 2). Nao alterar `saccadeAnalysis.ts` sem pedido explicito de Anders. Rodar o Pos-Sprint Protocol ao fechar (rotacao do KICKOFF como item #1).

### 2026-06-25 - PACK G ativado: geometria & padronizacao (BUNDLE G1 pronto p/ revisao)

Context:
Antes do PACK 3 visual, Anders questionou tres fundamentos: a camera frontal do iPhone fica lateral em landscape (degrada gaze?), o texto de leitura sai desproporcional, e faltaria uma geometria/distancia padrao pra testes comparaveis (portrait melhor?). Brainstorm com literatura (Consensus/PubMed) confirmou as tres: camera fora do eixo otico deforma features do olho (Narcizo 2021), acuracia cai na periferia (Kaduk 2023, Pijpaert 2025); webcam opera em 2-5° (nao distingue letra); ~55 char/linha e otimo de leitura (landscape estoura). Decisoes do Anders: geometria ANTES do visual; portrait primario no celular (camera topo-centro), desktop escala por angulo visual; distancia estimada via MediaPipe (sem friccao). Plano completo em `/root/.claude/plans/meu-velho-deixa-te-zazzy-lovelace.md`.

Details:
Principio mestre: operar em angulo visual, nao em pixels. Novo `src/services/viewingGeometry.ts` (puro): `interpupillaryPx` (IPD em px das iris 468/473), `estimateDistanceCm` (pinhole, distancia ∝ 1/IPD ancorada na calibracao), `cssPxPerDeg`/`readingFontCssPx` (angulo↔px), preferencias small/normal/large/huge viram angulos-alvo (1.0/1.2/1.5/1.8°, reproduzem os px antigos a 40cm). `faceTracking.ts` expoe `getLastLandmarks`. `CalibrationOverlay` grava `DistanceAnchor` (mediana de IPD na distancia do perfil) ao validar. `EyeTrackingTestScreen` dimensiona a fonte por angulo+distancia estimada por frame (EMA), pede PORTRAIT no mobile (invertido) e empilha o painel como faixa inferior (`flex-col md:flex-row`, fim do `w-72` fixo). Nao toca `saccadeAnalysis.ts`. Gate: `node --import tsx --test` 28/28, `tsc --noEmit` limpo, `APP_BASE_PATH=/gaze build` ok.

Notes:
Pendente: validacao manual no iPhone (portrait + texto estavel ao aproximar/afastar). Limitacao honesta: sem calibracao de cartao, px/mm fisico e aproximado por ~96dpi CSS → comparabilidade ENTRE dispositivos e parcial (solida DENTRO do aparelho/sessoes); virtual chinrest fica como upgrade futuro. Proximos do PACK G (alto nivel, nao detalhar ate ativar): G2 = registrar `orientation`+`distanceEstimatedCm` na ValidationCapture pra comparar portrait×landscape; G3 = normalizar/anotar confianca do sinal por excentricidade (camada de apresentacao, nunca saccadeAnalysis). PACK 3 visual segue em espera.

### 2026-06-27 - BUNDLE G-Landscape: reversao para paisagem + achado base-path + auditoria feita

Context:
Teste real no iPhone Pro Max reverteu a decisao "portrait primario" do G1 (2026-06-25). A hipotese da literatura (camera off-axis degrada gaze; landscape estoura ~55char) cedeu ao dado de campo: o alvo clinico e o FLUXO temporal do olho, NAO a posicao exata, entao camera lateral em landscape e aceitavel; e a sacada de leitura e horizontal, entao a linha curta do portrait (3-4 palavras) gera return-sweeps que poluem o eixo H. Diretriz duravel em automemory `gaze-flow-over-position`. Sintese: a fonte grande-por-angulo do G1 + landscape (~932px do Pro Max) aproxima ~55char/linha (otimo tipografico) — os dois packs se completam, nao se anulam. O sistema esta PRECISO hoje (calib ~4.9°, cobertura 100%, FPS 54); "fluxo > posicao" e prioridade de metrica, nao atestado de imprecisao.

Details:
`EyeTrackingTestScreen.tsx`: removido o lock-overlay que exigia portrait (bloqueava landscape, ~L789), invertido para nudge GENTIL nao-bloqueante em portrait ("Gire para paisagem"). Layout side-by-side ja existia via `md:flex-row` (ativa em ~932px). Comentarios obsoletos ("portrait centraliza camera = melhor") corrigidos. Gate: `tsc --noEmit` limpo, `APP_BASE_PATH=/gaze build` ok. Nao commitado (revisao junto com G1).

Tambem diagnosticado o "tudo esticado/gigante em TODAS as telas" relatado pelo Anders: MISMATCH de APP_BASE_PATH — build com /gaze + server SEM a base → o fallback SPA (`server.ts:164`) devolve `index.html` no lugar do CSS (HTTP 200 text/html) → app sem Tailwind. Reproduzido via curl (com /gaze: 200 text/css; sem: 200 text/html). FIX operacional: subir o server SEMPRE com APP_BASE_PATH=/gaze.

Notes:
Auditoria de robustez (frente paralela) FEITA com 5 agentes em paralelo — sintetizada, ainda NAO atacada. 4 criticos reais no `.remember/remember.md` (ancora: deteccao MediaPipe amarrada ao rAF do display 60/120Hz vs video 30fps → fix por `requestVideoFrameCallback`). 2 achados foram REBAIXADOS na reverificacao de fato binario (migracao IndexedDB v1→v2 funciona; "3 detects/frame" e 1 detect + 2 reusos de cache). Fonte/progressao de leitura ficaram de FORA do G-Landscape de proposito: testar se landscape sozinho ja faz o texto caber antes de mexer. Self-paced ("pressionar e o texto acompanha") = modo futuro.

## KICKOFF

Proxima sessao sugerida: AUDITORIA DO PIPELINE OCULAR, nao nova feature de estatisticas.
Objetivo: vasculhar se a implementacao esta coerente de ponta a ponta e se algum trecho herdado/feito pelo Claude esta conceitualmente errado.
Ler primeiro: `BACKLOG.md` desta secao ate o fim; depois `src/exercises/saccadeAnalysis.ts`, `src/exercises/readingDynamics.ts`, `src/services/statisticsSummary.ts`, `src/screens/DashboardScreen.tsx`, `src/screens/EyeTrackingTestScreen.tsx`, `src/components/ExerciseCanvas.tsx`.
Validar caminho real: captura do olhar -> `SaccadeMetrics`/fixacoes -> persistencia em `sessions` e `validationCaptures` -> `buildStatisticsSummary()`/`buildOcularReadingSeries()` -> dashboard.
Atencao conceitual: toque na leitura e apenas avanco manual; nao usar como sacada/fixacao. Sacadas, regressoes e fixacoes devem vir do sinal ocular.
Estado publicado: `APP_BASE_PATH=/gaze npm run build` + restart de `linhafixa.service`; ultimo bundle confirmado `index-DE5cHAmy.js`; rota publica `/gaze/dashboard`.
Validacao recente: 34/34 testes, `npm run lint`, build prod, smoke Playwright com dados temporarios mostrando graficos de sacadas/regressoes e fixacao media.
Risco conhecido: Recharts emite warning de dimensao no primeiro calculo headless, mas os graficos renderizam. Nao tratar como bloqueio antes de reproduzir em browser real.
Trabalho em aberto do PACK G ainda existe em paralelo (G1/G-Landscape nao commitados, teste de campo no iPhone pendente), mas a proxima conversa pedida por Anders deve priorizar auditoria de coerencia antes de seguir feature nova.

### 2026-06-28 - Estatisticas com resumos reais (pronto p/ revisao)

Context:
Anders apontou que a area de estatisticas nao resumia o que foi analisado: os baloes/secoes nao traziam dados interpretados e os textos ficavam repetidos.

Details:
Adicionado `src/services/statisticsSummary.ts` para gerar resumos locais a partir de `sessions` + `validationCaptures`: treino, sintomas, leitura, capturas diagnosticas e postura. `DashboardScreen.tsx` agora carrega capturas diagnosticas, mostra cinco baloes com insights calculados, lista capturas recentes, troca textos estaticos por resumos reais e envia esse payload enriquecido para a analise por IA. Export JSON agora inclui sessoes e capturas diagnosticas. Teste novo `statisticsSummary.test.ts`.

Notes:
Validado com `node --import tsx --test $(rg --files src -g '*.test.ts')` (33/33), `npm run lint`, `APP_BASE_PATH=/gaze npm run build`, `systemctl is-active linhafixa.service` e curl publico em `/gaze/` + CSS novo `text/css`. Bundle pronto para revisao visual do Anders; nao mexeu em `saccadeAnalysis.ts`.

Follow-up 2026-06-28:
Corrigido travamento de loading no dashboard quando alguma leitura local do IndexedDB falha (ex.: banco antigo sem `validationCaptures`): `DashboardScreen` agora usa `Promise.allSettled`, sai do loading e mostra o que estiver disponivel. Tambem criado alias `/gaze/statistics` -> `/gaze/dashboard`. Rebuild + restart de `linhafixa.service` feitos; smoke em Playwright confirmou `/dashboard`, `/statistics` e caso de IndexedDB quebrado sem loading preso.

Follow-up 2026-06-28 (leitura ocular):
Corrigido o peso conceitual da estatistica de leitura: tempos de toque/avanco manual nao sao mais valor principal do balao. `statisticsSummary` agora prioriza sacadas, regressoes e fixacao media pelo olhar; toque aparece so como contexto auxiliar quando existir. O grafico foi renomeado para "Avanco manual da leitura" e o prompt de IA foi ajustado para nao tratar toque como sacada/fixacao. Rebuild + restart feitos com bundle `index-MxBjvpRd.js`.

Follow-up 2026-06-28 (graficos oculares):
Adicionados dois acompanhamentos visuais no dashboard: "Sacadas e regressoes pelo olhar" (barras) e "Fixacao media pelo olhar" (linha). Nova funcao pura `buildOcularReadingSeries()` agrega metricas oculares de exercicios de leitura e capturas diagnosticas em ordem cronologica; teste cobre a extracao. Validado com 34/34 testes, `npm run lint`, `APP_BASE_PATH=/gaze npm run build`, restart de `linhafixa.service` e smoke Playwright com dados temporarios confirmando os dois graficos. Bundle atual: `index-DE5cHAmy.js`. Nota: Recharts ainda emite warning de dimensao no primeiro calculo headless, mas os blocos renderizam e ficam visiveis.

### 2026-06-28 18:52 - Kickoff auditoria pipeline ocular: taxa temporal alta

Context:
Kickoff executado como auditoria do pipeline ocular, sem abrir feature nova. Caminho lido: captura do olhar -> `analyzeSaccades()`/`summarizeReadingDynamics()` -> persistencia em `sessions` e `validationCaptures` -> `buildStatisticsSummary()`/`buildOcularReadingSeries()` -> dashboard.

Details:
Revisao do Anders durante o kickoff: a amostragem em 60/120Hz era intencional para reduzir aliasing temporal na deteccao de sacadas; tratar isso como duplicacao foi uma premissa errada. A correcao aplicada foi remover o gate `latestGazeSampleId`/teste associado e atacar o ponto real encontrado na auditoria: `cameraStream.ts` ainda capava a camera em `frameRate: { ideal: 30, max: 30 }`. Agora a camera frontal mira `ideal: 60` com `max: 120`.

Notes:
Nao alterou `saccadeAnalysis.ts`. Toque continua sendo apenas avanco manual; sacadas, regressoes e fixacao media continuam vindo do sinal ocular. Teste de `cameraStream` atualizado para proteger a intencao 60/120Hz. Validado com `node --import tsx --test $(rg --files src -g '*.test.ts')` (34/34), `npx tsc --noEmit`, `npm run lint`, `APP_BASE_PATH=/gaze npm run build`, restart de `linhafixa.service`, curl publico em `/gaze/`, assets CSS/JS, `/gaze/dashboard` e `/gaze/statistics`. Bundle atual: `index-CmPn9aln.js`. Smoke Playwright com consentimento aceito confirmou `/gaze/dashboard` renderizando `Estatísticas` sem erro de console. Proximo dado real a coletar: `MediaStreamTrack.getSettings().frameRate` no iPhone/Safari para saber a taxa efetiva negociada pelo dispositivo.

### 2026-06-28 19:20 - Leitura: sacadas calibradas e IA obrigatoria

Context:
Anders confirmou duas decisoes do kickoff: a progressao da leitura segue por toque na tela, mas sacadas/regressoes/fixacao devem vir do olhar; e os textos do teste de leitura devem ser realmente gerados por IA, sem fallback fixo silencioso.

Details:
`assistedReading` agora coleta amostras para sacadas somente de `latestGazePoint` calibrado (MediaPipe + calibracao). O sinal bruto `latestGaze` nao entra mais na metrica de leitura. `SaccadeMetrics` ganhou metadados opcionais `signalSource` e `sampleRateHz`; `analyzeSaccades()` continua puro e nao importa MediaPipe diretamente. `getReadingContent()` agora falha explicitamente quando a API nao retorna texto, em vez de devolver texto fallback repetido. `server.ts` retorna `OPENAI_API_KEY_MISSING` com status 503 quando a chave nao esta configurada. A chave existente do ambiente foi reutilizada em `/etc/linhafixa.env` sem expor valor.

Notes:
Validado com `node --import tsx --test $(rg --files src -g '*.test.ts')` (40/40), `npx tsc --noEmit`, `npm run lint`, `APP_BASE_PATH=/gaze npm run build`, restart de `linhafixa.service`, curl publico em `/gaze/` e assets. Endpoint `/gaze/api/generateReadingContent` respondeu 200 com texto real; duas chamadas seguidas tiveram tamanhos/hashes diferentes, confirmando que nao caiu no fallback fixo. Bundle atual: `index-DSEIjFH3.js`.

### 2026-06-28 19:39 - PACK R1: qualidade e proveniencia do sinal

Context:
Depois da auditoria com agentes, Anders ativou o primeiro pack de robustez: tornar visivel se a metrica ocular e comparavel, exploratoria ou baixo sinal, sem mexer ainda na heuristica de sacadas.

Details:
Novo `src/services/signalQuality.ts` classifica `SaccadeMetrics` em `comparavel`, `exploratorio` ou `baixo-sinal` usando fonte (`calibrated-mediapipe`/`raw-mediapipe`/`unavailable`), amostras, taxa efetiva e cobertura quando disponivel. `readingDynamics` agora carrega esse objeto no resumo. `statisticsSummary` propaga `signalQuality`, fonte e `sampleRateHz` para a serie ocular; o balao de leitura informa quantos pontos sao comparaveis. `EyeTrackingTestScreen` grava captura como calibrada ou bruta conforme as amostras reais coletadas, mostra fonte/taxa/selo no relatorio e nas capturas salvas, e remove texto fixo de `~30Hz`. `ExercisePlayerScreen` nao passa mais cobertura ficticia de 100% para leitura. `DashboardScreen` mostra qualidade/fonte/taxa nos tooltips e cards de capturas, e envia essa proveniencia no payload da IA.

Notes:
Decisao: dado bruto ou legado sem proveniencia fica como `exploratorio`, nao e descartado; dado sem tracking/amostras/cobertura minima vira `baixo-sinal`; so sinal calibrado com amostra/cobertura/taxa adequadas vira `comparavel`. Validado com `node --import tsx --test $(rg --files src -g '*.test.ts')` (43/43), `npx tsc --noEmit`, `npm run lint`, `APP_BASE_PATH=/gaze npm run build`, restart de `linhafixa.service`, curl local/publico em `/gaze/`, asset JS novo e rotas `/gaze/dashboard` + `/gaze/statistics`. Bundle atual: `index-BmNXVMIT.js`.

### 2026-06-29 17:14 - Bundle R2a: medidor de captacao visual funcional

Context:
Anders esclareceu que a bolinha azul da calibracao parecia prometer posicao exata na tela, mas o objetivo atual e mostrar se o sistema esta captando movimento ocular util para dinamica de leitura: varredura horizontal, fixacoes, continuidade e possivel retorno de linha.

Details:
Novo `src/services/visualSignal.ts` resume uma janela curta de `GazeSample` em status (`sem-sinal`, `baixo`, `adequado`, `ruidoso`), score de sensibilidade, amplitude horizontal/vertical, continuidade, taxa da janela, proporcao de fixacao e `lineReturnCandidate`. Teste novo `src/services/visualSignal.test.ts` cobre sinal esparso, varredura horizontal util e retorno amplo de linha. `EyeTrackingTestScreen` agora mantem uma janela movel de amostras calibradas/brutas, mostra painel "Captacao funcional" com score/evento/fonte e desenha um traco horizontal discreto no rodape do canvas; a bolinha de gaze foi reduzida para apoio tecnico, nao feedback principal.

Notes:
Este bundle ainda nao altera `analyzeSaccades()` nem a contagem clinica de regressao. O retorno amplo de linha e apenas marcado como candidato visual/diagnostico para orientar o futuro PACK R4 line-aware. Validado com `node --import tsx --test $(rg --files src -g '*.test.ts')` (46/46), `npx tsc --noEmit`, `npm run lint`, `APP_BASE_PATH=/gaze npm run build`, restart de `linhafixa.service`, `git diff --check`, curl local/publico em `/gaze/`, asset JS novo, `/gaze/eye-tracking-test` e `/gaze/dashboard`. Bundle atual: `index-CaslxlED.js`.

### 2026-06-29 17:22 - R2 postural completo: baseline e Motion Assist robusto

Context:
Depois do medidor funcional, a frente R2 fechou a confiabilidade postural: a captura ocular precisa saber se cabeca/celular permaneceram comparaveis ao momento de calibracao, sem tratar toda mudanca do aparelho como tremor.

Details:
`src/exercises/posturalStability.ts` ganhou `PosturalBaseline`, helpers de sessao (`summarizePosturalBaseline`, `set/get/resetPosturalBaseline`) e metadados opcionais no `PosturalStabilityMetrics`: baseline aplicado, yaw/pitch/roll de referencia, offsets relativos, status/delta/confianca do Motion Assist, duracao, taxa postural e cobertura facial. Novo status `position-changed` separa "posicao mudou" de `high-movement`. `CalibrationOverlay` agora coleta baseline postural durante a calibracao e o salva junto do baseline do Motion Assist. `EyeTrackingTestScreen` e `ExerciseCanvas` passam baseline + Motion Assist para `summarizePosturalStability`; `ExercisePlayerScreen` e `DashboardScreen` exibem baseline/delta postural. `motionSensor.ts` ganhou reset explicito e inicio de sessao limpo para nao herdar baseline/amostras antigos. Testes cobrem baseline, posicao movida sem shaking, copias defensivas e reset/inicio fresco do Motion Assist.

Notes:
Compatibilidade: campos novos em `PosturalStabilityMetrics` sao opcionais para capturas antigas. Nao alterou `saccadeAnalysis.ts`. Validado com `node --import tsx --test $(rg --files src -g '*.test.ts')` (51/51), `npx tsc --noEmit`, `npm run lint`, `APP_BASE_PATH=/gaze npm run build`, restart de `linhafixa.service`, `git diff --check`, curl local/publico em `/gaze/`, asset JS novo, `/gaze/eye-tracking-test` e `/gaze/dashboard`. Bundle atual: `index-DjzUY_He.js`.

### 2026-06-29 20:28 - Bundle R3: contrato de calibracao e leitura limpa

Context:
Anders pediu uma revisao/robustez do motor ocular depois do brainstorm tecnico: a calibracao espacial deveria ser usada com assinatura valida, o diagnostico nao deveria manter loops concorrentes durante calibracao, e a leitura assistida nao poderia contaminar sacadas com loading, timeout ou viewport divergente.

Details:
Novo `src/services/ocularSignalContract.ts` define o contrato entre ponto normalizado no viewport, superficie local do canvas/leitura e assinatura de calibracao (viewport, orientacao, DPR, superficie e aspecto do video). `CalibrationOverlay` grava essa assinatura ao validar; `EyeTrackingTestScreen` e `ExerciseCanvas` so usam ponto calibrado se a assinatura ainda combina e projetam viewport->canvas antes de desenhar/coletar. `videoFrameLoop` passou a evitar reprocessar o mesmo frame no fallback rAF. `assistedReading` agora limpa amostras ao receber texto real, ignora loading/erro, e `getResultData` preserva metricas oculares quando o exercicio termina por timeout. `signalQuality` ficou mais rigoroso: sem cobertura/taxa medidas, o dado calibrado vira exploratorio em vez de comparavel.

Notes:
Nao alterou `saccadeAnalysis.ts` nem usou toque como sacada; toque segue apenas como avanco manual. Risco consciente: a assinatura valida o contexto global da calibracao, mas o ajuste fino de retorno de linha ainda fica para o futuro R4 line-aware/funcional. Revisao isolada encontrou risco de salvar leitura/captura sem texto IA; corrigido marcando timeout sem texto como resultado invalido/incompleto e bloqueando captura diagnostica ate o texto real estar pronto. Validado com `node --import tsx --test $(rg --files src -g '*.test.ts')` (60/60), `npx tsc --noEmit`, `npm run lint`, `APP_BASE_PATH=/gaze npm run build`, `git diff --check`, restart de `linhafixa.service`, curl local/publico em `/gaze/`, JS/CSS com MIME correto, `/gaze/dashboard`, `/gaze/eye-tracking-test` e smoke Playwright com consentimento aceito. Bundle atual: `index-B01PRDLw.js`.
