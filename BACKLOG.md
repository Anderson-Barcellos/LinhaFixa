Arquivo operacional do Codex neste repositorio. Nao confundir com notas do Claude nem com documentacao funcional do produto.

# Estado do projeto

Atualizado em 2026-07-21. Este arquivo registra somente a frente ativa, os limites
atuais e as proximas frentes reais. O historico detalhado permanece no Git.

## PACK Reconstrucao do App Linha Fixa (active)

Direcao aprovada: fachada nova por fatias, preservando os contratos e servicos
oculares existentes. A experiencia usa shell claro para navegacao/preparo e
superficie escura imersiva para calibracao, leitura, captura e recall.

### BUNDLE Fatia 1 - Avaliacao primeiro (commitada em 2026-07-17; revisao visual do Anders pendente)

Implementado e commitado na `main` (`8066735` e anteriores):

- `/` e o aceite do consentimento encaminham para `/assessment`; a home visual
  antiga nao participa mais do fluxo principal.
- `/assessment` oferece preparo para Captura simples e Leitura + Recall; a variante
  `?workspace=live` incorpora o fluxo ocular real sem duplicar regra de negocio.
- `/history` consolida capturas e recalls salvos localmente na shell nova.
- `/eye-tracking-test` existe somente como alias de compatibilidade para a workspace
  ativa de avaliacao.
- adapter, contratos de fluxo, componentes de setup/resultado e smoke dedicado
  protegem a costura entre a fachada nova e os servicos existentes.

### Performance Adaptativa integrada (2026-07-17, merge `c5aee54`)

A frente de carregamento adaptativo foi mergeada da branch
`feat/adaptive-loading-performance` sobre a shell assessment-first e deployada:

- rotas lazy com recuperacao de chunk velho; `/assessment` permanece no bundle
  inicial (primeira pintura sem round trip extra) e a superficie ocular pesada
  carrega lazy dentro dele, aquecida por idle preload e intencao de camera;
- runtime MediaPipe single-flight com assets versionados e cache imutavel;
- orcamento de bundle dentro do `npm run build` (falha acima de 180 KB gzip);
- entry publico: 85 KB gzip (antes: monolito ~295 KB gzip).

Validacao fresca pos-merge (2026-07-17):

- `npm run lint`: passou.
- `npm test`: 276/276.
- `APP_BASE_PATH=/gaze npm run build`: passou, budget 85233/180000 gzip.
- `npm run smoke`: layout 95/95, validade 72/72, assessment 7/7, loading 43/43.
- capacidade automatizada `real-tab-hidden`: bloqueada pelo ambiente, sem falha
  funcional observada.
- publico: `https://ultrassom.ai/gaze/` 200, asset `immutable` e HTML `no-cache`
  atravessando o Apache.

Nota de flakiness: o smoke de layout ja abriu 93/95 numa rodada ("ponto de
calibracao — geometria indisponivel") e passou limpo em seguida; se repetir,
investigar race de timing na geometria de calibracao do workspace embutido.

### BUNDLE Layout Mobile (commitado em 2026-07-19; revisao visual do Anders pendente)

Escopo: chrome mobile compacto na shell e header unico no workspace embedded.
Plano em `docs/plans/2026-07-18-mobile-layout.md`. Implementado em 2026-07-18 e
commitado em 2026-07-19 com autorizacao de Anders; a revisao visual dele no
iPhone segue pendente como gate final do BUNDLE.

- Workspace embedded (100dvh): chrome duplicado eliminado — o
  `AssessmentSessionSurface` nao renderiza card/header no modo
  `constrainedHeight`; o header unico do `EyeTrackingTestScreen` mostra o titulo
  do estagio via `SESSION_TITLES` (agora exportado). O canvas comeca a ~37px
  (antes ~100px) e a superficie ocupa >= 75% do viewport.
- Sidebar mobile compacta (`AppSidebar`): marca slim (linha "Navegacao clinica"
  e card explicativo so em md:+), nav densa; `AppShell` com titulo `text-2xl` no
  mobile e `text-3xl` em md:+.
- `/assessment` mobile-first (`AssessmentWorkspaceScreen`): card escuro com
  headline `text-xl` no mobile (`data-testid="workspace-headline"`), paddings e
  gaps escalonados. O h1 do main comeca a <= 160px no viewport 390x844 (antes
  ~330px).
- Smokes ajustados: `smoke-layout.mjs` com 13 checks novos de chrome mobile;
  `smoke-assessment-workflow.mjs` e `smoke-loading.mjs` atualizados para o
  heading novo (titulo de estagio em vez de "Sessao de avaliacao").

Validacao fresca (2026-07-18):

- `npm run lint`: passou.
- `npm test`: 276/276.
- `APP_BASE_PATH=/gaze npm run build`: passou, budget 85382/180000 gzip.
- `npm run smoke`: layout 108/108 (95 antigos + 13 novos), validade 72/72,
  assessment 7/7, loading 43/43.
- capacidade automatizada `real-tab-hidden`: bloqueada pelo ambiente
  (pre-existente), sem falha funcional observada.
- Deploy ja no ar: `linhafixa.service` restartado; `https://ultrassom.ai/gaze/`
  200 (prod e localhost:3060).

### BUNDLE Caderno Experimental V2 (implementado; revisao de Anders pendente)

Implementado e integrado na `main` em 2026-07-21 pelos commits `a724569`,
`bce5ab3`, `1b34020`, `ecc8147`, `057910a`, `5c35f28`, `3038635`, `fb892e3`
e `680b8e5`:

- `/assessment` agora e o Caderno Experimental responsivo, com quatro destinos
  primarios, launcher para Captura simples e Leitura + Recall, Biblioteca e plano
  preservados e projecao somente dos registros reais do IndexedDB.
- classe de dispositivo confirmada participa da chave de comparacao; registros
  sugeridos ou legados ficam no baseline/auditoria sem promocao silenciosa.
- controlador explicito governa preflight, calibracao, validacao, captura, recall,
  salvamento, retry e interrupcao. Falhas dos cinco endpoints aparecem na UI sem
  remover fallback, exportacao ou exercicios existentes.
- a superficie de medicao congela altura e geometria; resize ou rotacao acima da
  tolerancia interrompe a execucao em vez de misturar amostras incompatíveis.
- entrada SPA volta ao topo e o launcher limita a propria altura, mantendo o
  controle de fechamento acessivel inclusive em 320 x 568.

Evidencia fresca da arvore integrada e do runtime:

- `npm test`: 393/393; `npm run lint`: passou.
- `APP_BASE_PATH=/gaze npm run build`: passou; bundle inicial
  105372/180000 bytes gzip.
- `npm run smoke`: notebook 63/63, layout 198/198, validade 72/72,
  assessment 9/9 e loading 43/43 (385/385 no total).
- `real-tab-hidden` segue bloqueado pelo Chromium headless; o check independente
  de `pagehide` passou e invalidou a captura sem retomada/concatenacao.
- `linhafixa.service`: ativo; localhost:3060 e publico `/gaze/`: 200 `text/html`.
- smoke do Caderno no endpoint publico: 63/63, sem erro de runtime ou overflow.

Ledger visual referencia + render:

- copia e ordem acima da dobra coincidem; somente a data usa o locale real do
  navegador (`21 de jul. de 2026`).
- celular empilha serie e sessoes com barra inferior; tablet usa rail e pilha;
  desktop usa sidebar e duas colunas, conforme os tres conceitos aprovados.
- gradiente violeta, CTA branco dominante, tipografia direta, bordas e raios
  mantem a hierarquia da referencia com tokens semanticos do tema existente.
- o estado vazio permanece real e explicito; nenhum registro demonstrativo foi
  criado apenas para reproduzir as imagens-conceito.
- 320 x 568 e equivalentes de zoom 200%/400% ficaram sem overflow horizontal,
  erros de console ou controle obrigatorio inacessivel.

Gate manual ainda aberto para a revisao de Anders: Safari real em iPhone e iPad
com permissao de camera, rotacao durante captura, variacao de `VisualViewport` e
safe areas. O BUNDLE nao deve ser marcado como fechado antes dessa revisao.

Ajuste da revisao fisica de 2026-07-21 (iPhone landscape):

- causa reproduzida: a altura visual congelada em portrait (844 px no perfil de
  teste) permanecia apos a rotacao para 390 px, deixando o documento rolavel;
- a altura continua imune ao abre/fecha da barra do Safari na mesma orientacao,
  mas agora e recalculada quando portrait/landscape realmente muda;
- somente o perfil fisico `phone` em landscape troca a engine por um gate curto
  de rotacao. Ao voltar a portrait, a mesma sessao retoma automaticamente;
- tablet e desktop nao recebem o gate; o iPad continua com a engine completa em
  landscape. Nao houve copia nem bifurcacao do motor ocular;
- TDD: novo smoke falhou em 7/14 antes da correcao e passou 14/14 depois. Gate
  completo: `npm test` 395/395, `npm run lint`, build prefixado com bundle inicial
  106283/180000 bytes gzip e `npm run smoke` com notebook 63/63, layout 165/165,
  phone-portrait 14/14, validade 72/72,
  assessment 9/9 e loading 43/43. `real-tab-hidden` segue BLOCKED no headless.
- correcao commitada em `5c4e3f2` e publicada no `linhafixa.service`; localhost e
  `https://ultrassom.ai/gaze/` responderam 200, e o smoke phone-portrait publico
  passou 14/14 (iPhone sem scroll + retomada; iPad landscape preservado).

Ajuste da revisao fisica de 2026-07-21 (filtro de palpebra e fit):

- causa confirmada no source e por teste vermelho: `BLINK_REJECT_GATE_ENABLED`
  estava `false`, portanto score alto de piscada era exibido na telemetria mas nao
  descartava a amostra em calibracao, validacao, captura ou exercicios;
- comparacao historica mostrou que o engine mais solido de `0f524c1` rejeitava a
  piscada antes do ridge fit. A regressao matematica atual (z-score, ridge, modelo
  pendente e ativacao por evidencia) foi preservada; somente a limpeza de entrada
  foi restaurada em `d7ea5e1`;
- o gate voltou a ser ativo por padrao com threshold estrito `> 0.5`. Ausencia de
  blendshape continua fail-open; baseline anormalmente alto produz rejeicao finita
  da calibracao, em vez de treinar silenciosamente um modelo contaminado;
- evidencia fresca: teste de regressao falhou antes da mudanca e passou depois;
  `npm test` 395/395, `npm run lint`, build prefixado 106285/180000 bytes gzip e
  smokes notebook 63/63, layout 165/165, phone-portrait 14/14, validade 72/72,
  assessment 9/9 e loading 43/43. `real-tab-hidden` segue BLOCKED no headless;
- `linhafixa.service` reiniciado e ativo; localhost `/gaze/` e `/gaze/healthz`,
  alem do endpoint publico, responderam 200. O HTML publico entrega o bundle novo
  `index-vZzk2Bbj.js`, e o smoke phone-portrait publico passou 14/14.

Gate manual remanescente: Anders confirmar no Safari fisico que o aviso ocupa a
tela sem rolagem em landscape, que a sessao reaparece ao retornar a portrait e
que o indicador/tracado deixa de aceitar amostras durante o fechamento palpebral.

BUNDLE 60fps-ready (2026-07-22, plano `docs/plans/2026-07-22-60fps-ready.md`):

- contexto: camera passou a entregar 60fps no desktop (constraint `ideal: 60` de
  `9fda6d0` finalmente honrada) e expos tres defeitos: EMA do trilho ambar ingerindo
  frames de piscada (`if (gaze)` sem `!blinking` — o dot calibrado anda nesse trilho
  via renderY), alphas de EMA por-frame dobrando a responsividade a 60fps, e gate de
  piscada binario (0.5) deixando passar 2x mais frames de borda por segundo;
- entregue: `emaTiming.ts` (alpha = 1−exp(−dt/τ); τ 1650ms trilho, 200ms distancia —
  reproduzem os alphas legados a 30fps), `blinkGate.ts` (histerese entra 0.5/sai 0.25,
  hold temporal 100ms, purge retroativo 80ms da borda de subida), fiacao nos tres
  loops (useCameraPipeline com reset por sessao, ExerciseCanvas, CalibrationOverlay),
  `stimulusDistance` com `emaTauMs` opcional (legado preservado), e fonte estavel no
  EyeTrackingTestScreen (congela via stimulusDistance apos convergir; deteccao ao vivo
  so alimenta o check de tolerancia — adendo de Anders 22/07: texto "respirando" com a
  deteccao e inutilizavel);
- evidencia fresca: TDD red→green nas tasks 1, 2 e 7 (o teste de equivalencia 30/60fps
  do stimulusDistance precisou de janela de 200ms para discriminar o alpha legado);
  `npm test` 407/407 (395 previos + 12 novos), lint limpo, build prefixado
  106290/180000 bytes gzip, smokes layout 165/165, loading 43/43, notebook 63/63,
  phone-portrait 14/14. `real-tab-hidden` segue BLOCKED no headless (pre-existente);
- `linhafixa.service` reiniciado e ativo; endpoint publico 200 servindo o bundle novo
  `index-DqrD3ly7.js`.

Gate manual do BUNDLE: **APROVADO por Anders em 2026-07-22** (teste no desktop
60fps — "o gate deu certo"). BUNDLE fechado. Commit ainda nao autorizado (repo
segue ahead do origin); calibracao fisica px/cm segue fora de escopo, PACK futuro
(a pesquisa `/pesquisa-light` das Frentes estacionadas informa essa decisao).

### Limites atuais

- Persistencia continua local em IndexedDB v3; SQLite, outbox, sync, Basic Auth e
  backup diario ainda nao foram implementados.
- Avaliacao e Historico usam a shell nova. Treino, Progresso e Configuracoes ainda
  apontam para telas funcionais anteriores dentro da navegacao comum.
- `HomeScreen.tsx` permanece no repositorio como codigo desligado; nao e importado
  nem roteado pelo app.

### Continuidade do PACK

Depois da revisao desta fatia, as frentes ainda abertas sao reconstruir as demais
secoes da shell e, separadamente, decidir a fase de persistencia duravel. Nenhum
plano detalhado dessas frentes fica ativo antes da escolha de Anders.

### BUNDLE Coerencia do Engine Oculomotor (implementado em 2026-07-28; deploy e revisao de Anders pendentes)

Spec `docs/superpowers/specs/2026-07-28-engine-oculomotor-coerencia-design.md`,
plano `docs/superpowers/plans/2026-07-28-engine-oculomotor-coerencia.md`. Fecha a
migracao I-VT → I-DT que parou no detector (`01e48f5`): baseline de eyeBlink
medido no settle da calibracao deriva enter/exit do proprio olho (fallback nos
fixos), purga da borda de subida cobre buffers de captura e amostras de fit da
calibracao (nao so o tracado), e o painel ao vivo (`visualSignal`) roda o mesmo
detector fixacao-primeiro do clinico — invariancia 30↔60fps provada por teste.
Commits `9ed81a4..60a14a8`; `npm test` 463/463, lint limpo, build 107932/180000.

Pendencias reais do BUNDLE:

- Reancoragem empirica dos cortes de status do painel ao vivo (bloco "Limiares
  de APRESENTACAO" no topo de `src/services/visualSignal.ts`): `fixationShare`
  mudou de fracao de intervalos para fracao de tempo — os cortes atuais foram
  mantidos, mas precisam de sessao de Anders lendo o painel com o engine novo.
- Smoke fisico com camera: primeira calibracao pos-deploy confirma coleta do
  baseline no settle e saida de piscada pelo exit derivado (host e headless).
- Decisao adiada por Anders (spec, fora de escopo): trilho EMA de 1,65s do ponto
  azul calibrado (`EyeTrackingTestScreen.tsx` renderY) — o que se ve nao e a
  predicao medida; display-only documentado.

## Frentes estacionadas

- Repetibilidade e Sanidade do Instrumento: analise teste-reteste e painel de
  sanidade aguardam ativacao.
- Deteccao de Pescoco PN4: thresholds finais dependem de capturas reais do iPhone.
- Pesquisa frontend oculomotor (2026-07-22): rodar `/pesquisa-light` sobre
  práticas inegociáveis de apresentação de estímulo em apps webcam sem chinrest
  (angular vs. absoluto, calibração px/cm sem hardware, normalização por
  dispositivo, alvo de fixação, distância variável). Pergunta + 5 ângulos
  anotados na memória `gaze-pesquisa-frontend-oculomotor`; resultado decide o
  PACK de calibração física px/cm. Relatório destino: `docs/research/`.

## Fontes de verdade

- Operacao e arquitetura atual: `README.md`.
- Direcao e corte implementado da reconstrucao:
  `docs/superpowers/specs/2026-07-17-app-reconstruction-design.md`.
- Contrato cientifico de validade:
  `docs/superpowers/specs/2026-07-16-instrument-validity-design.md`.
- Deploy e prefixo: `deploy/apache/README.md` e `/etc/apache2/APACHE.md`.
