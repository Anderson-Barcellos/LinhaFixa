## PACK Layout Mobile — Gaveta de Diagnóstico (aguardando revisão do Anders — 2026-07-04)

Contexto: no iPhone o painel fixo de 42vh espremia a superfície de leitura/calibração; chrome da calibração (badge + contador W×H + guia de 2 linhas) consumia área útil do rect pequeno. Design aprovado pelo Anders (brainstorm 2026-07-04): gaveta colapsável OVERLAY — expandir consulta métricas SEM redimensionar o canvas, então a assinatura de calibração nunca diverge por causa da UI. Spec: `docs/superpowers/specs/2026-07-04-mobile-calibration-drawer-design.md`; plano: `docs/superpowers/plans/2026-07-04-mobile-calibration-drawer.md`.
Bundles:
- [x] BUNDLE MD1 — Gaveta + chrome enxuto. FEITO 2026-07-04 (pronto p/ revisão, via TDD no helper): `diagnosticsDrawerLayout.ts` (helper puro; invariante testado: root/strip idênticos nos 2 estados = overlay-não-reflow) + `DiagnosticsDrawer.tsx` (casca burra controlada pelo screen; `<aside>` raiz, testids/aria = contrato com o smoke). `EyeTrackingTestScreen`: portrait = faixa 56px no rodapé (sheet, painel sobe até 60vh), landscape = coluna 48px à direita (side, painel 320px; chips viram StatusDots — 48px não comporta texto); Calibrar/Capturar viraram botões-ícone na faixa colapsada; `setDrawerExpanded(false)` em beginCalibration/startCapture (cinto de segurança). `CalibrationOverlay` ganhou `compactChrome` opt-in (badge/contador ocultos, guia de 1 linha fora do rect quando há folga) — Settings/ExercisePlayer intactos (default false). Desktop 100% intocado (branch `isDesktopDiagnosticsLayout`). Superfície portrait: 390×727 (antes dividia com 42vh). Smoke estendido: 55/55 — inclui gate automatizado do invariante (canvas não move 1px ao expandir) e alinhamento dos cartões no painel (spread 0.0px; risco grid-cols-2 no side de 320px NÃO se materializou). Frame/overlay de calibração agora localizados por testid no smoke (os textos antigos são o que o mobile oculta). Gate: tsc, 130/130, build `/gaze`, deploy 3060 via `linhafixa.service`, smoke 55/55. Commits `69c70e2`, `439cb74`, `1272491`, `aef6339`, `d3e60c1`.
- [x] BUNDLE D2 — Acordeão com resumo vivo no painel da gaveta. FEITO 2026-07-05 (pronto p/ revisão, via TDD no helper): `diagnosticsAccordion.ts` (`toggleSection` pura: um aberto por vez, tocar no aberto fecha) + `DiagnosticsAccordion.tsx` (cabeçalho `<button aria-expanded>` com título + resumo vivo truncável + chevron; `data-testid="accordion-<id>"` = contrato com o smoke). `EyeTrackingTestScreen`: `diagnosticsCards` quebrado em consts (metricsGrid/signalCard/interpretBody/conditionsCard) + `diagnosticsSections` — desktop recompõe verbatim (pixel igual, interpret segue `<details>`); gaveta usa o acordeão (ordem: Métricas → Captação → Condição → Como interpretar; modeSwitch/aviso/capturas/parar fixos fora). Resumos derivam de estado existente: `30fps · H +0.42`, `78% · calibrado`, `Normal · Reta` (LIGHTING/POSTURE_OPTIONS extraídos p/ módulo, reusados nos botões). Estado do acordeão reseta a cada abertura da gaveta (painel só renderiza expandido — D1). Smoke: +5 checks por perfil mobile (colapsado inicial, exclusividade, fecha no retoque, canvas estável durante toques). Gate: tsc, 133/133 (3 novos), build. Spec `2026-07-05-drawer-expandable-cards-design.md`; plano `2026-07-05-drawer-expandable-cards.md`. Commits `b4cd6e4`, `3e25fa4`, `76dae17`, `44922b2`. DEPLOY PENDENTE (classifier barrou sem aval explícito; smoke novo roda pós-deploy, esperado 65/65).
Notas: validação pendente no iPhone Pro Max (portrait + landscape, zoom natural): faixa colapsada legível, puçador, calibração com guia novo; D2: resumo vivo legível em 390px, toque nos cards, rotação com card aberto mantém estado. Fallback mapeado se faixa/resumo apertarem em 390px: encurtar rótulos. Risco D2 monitorado: re-render por frame do cabeçalho com gaveta aberta — plano B é throttle se houver jank no iPhone. Higiene 2026-07-04: checkpoint `f4c8ff7` commitou o pendente das sessões anteriores (D1 line-return + recall + smoke + PN1-3); worktree `quirky-euclid-a4dd5e` e branch removidos (conteúdo era rascunho obsoleto do design de 20s, já superado na main).

## PACK Detecção de Pescoço v2 (active — 2026-07-03, aberto pelo Anders)

Contexto: lembrete pós-PACK Leitura & Recall. Diagnóstico Claude: dois sistemas independentes — check absoluto `|yaw|<5 && |pitch|<5` em `ExerciseCanvas.tsx:180` (unidade = landmark normalizado ×100, escala com distância da câmera; pitch tem viés anatômico pois nariz fica abaixo da linha dos olhos → check contra zero é enviesado) vs `posturalStability.ts` (baseline-relativo, honesto, mas jitter = std cru de yaw/pitch — deriva lenta e natural de pitch na leitura longa/janela portrait alta infla o std e derruba a estabilidade cervical de leitura saudável). `estimateHeadPose` já retorna `scale` (largura do rosto) e a calibração de gaze é in-memory por sessão, mas yaw/pitch cru são features do modelo (`faceTracking.ts:227-231`) — NÃO mudar a escala na fonte; normalizar na camada postural.
Bundles:
- [x] BUNDLE PN1 — Sinal postural invariante à distância. FEITO 2026-07-03 (pronto p/ revisao, via TDD): `toPosturalSample(pose)` reescala yaw/pitch por `REFERENCE_FACE_SCALE=0.3 / pose.scale` (roll fica em graus; scale degenerado <0.02 → fallback cru); aplicado nos 3 pontos de amostragem (CalibrationOverlay:132, ExerciseCanvas, EyeTrackingTestScreen:571). `estimateHeadPose` intocado — features do gaze preservadas.
- [x] BUNDLE PN2 — Jitter com detrend. FEITO 2026-07-03 (pronto p/ revisao, via TDD): jitter = hypot(std(detrend(yaw)), std(detrend(pitch))) — fit linear removido; teste: deriva de pitch 0→20 em 200 amostras (leitura longa) agora dá estabilidade cervical 100 (antes ~77). `rotationRange` segue peak-to-peak cru (semântica de 'rotating' preservada, teste de regressão verde).
- [x] BUNDLE PN3 — Aviso ao vivo baseline-relativo. FEITO 2026-07-03 (pronto p/ revisao, via TDD): `createLiveStabilityTracker` substitui o `|yaw|<5 && |pitch|<5` absoluto em ExerciseCanvas — baseline da calibração quando existe, senão mediana das 30 primeiras amostras do próprio exercício (sem aviso durante warmup); desvio hypot com histerese ENTER=6/EXIT=3.5 + debounce de 5 frames consecutivos (aviso não pisca a 60Hz). Viés anatômico do pitch (~+12 neutro) deixa de disparar o aviso. `headStillnessScore` herda o check novo.
- [ ] BUNDLE PN4 — Recalibração dos thresholds com dados reais do Anders (STEADY_JITTER=3, MAX_JITTER=15, ENTER=6, EXIT=3.5 são provisórios — marcados no código). Precisa: export do idb + sessões de leitura/exercício com o sinal novo no ar.
Notas: gate 2026-07-03 — tsc limpo, 126/126 testes (6 novos), build `/gaze`, restart `linhafixa.service` HTTP 200, smoke 45/45. Commitado no checkpoint `f4c8ff7` (2026-07-04). Revisão manual junto com o PACK Leitura & Recall (decisão do Anders: "checo tudo junto").

## PACK Leitura & Recall (aguardando revisão do Anders — 2026-07-03)

Contexto: 4 pedidos do Anders para a experiencia desktop (monitor vertical) e um teste novo. Plano completo em `/root/.claude/plans/meu-velho-sobre-o-goofy-porcupine.md`. Decisoes: recall integrado a captura ocular; SymptomScale substituido de vez; janela portrait automatica.
Bundles:
- [x] BUNDLE B — "Terminei de ler" encerra a captura. FEITO 2026-07-03 (pronto p/ revisao): `CAPTURE_MS` 20s → `CAPTURE_SAFETY_CAP_MS` 120s (teto apenas); botao primario emerald "Terminei de ler (Xs)" com tempo decorrido; `finishCapture`/analise intactos. Gate: tsc, 112/112, build `/gaze`, restart, smoke 45/45.
- [x] BUNDLE A — Janela portrait-aware. FEITO 2026-07-03 (pronto p/ revisao, via TDD): `computeDiagnosticsSurface` com branch portrait (`availableWidth < availableHeight`) — sem aspecto 16:9, altura ate `DESKTOP_MAX_HEIGHT_PORTRAIT=1280`; landscape intacto (teste de regressao). Smoke ganhou viewport `desktop-portrait` 1077×1436 (superficie 737×1276, era 741×420). Gate: idem acima.
- [x] BUNDLE C — Contexto rapido pre/pos substitui SymptomScale. FEITO 2026-07-03 (pronto p/ revisao): tipos `PreTestContext` (venvanseTakenAt HH:MM|null, sleepHours, mood 1-5, feeling 1-5) e `PostTestContext` (feeling, fatigue, mood); `QuickContextForm.tsx` (Pre/PostContextForm, tone light/dark, prefill do dia via `getTodayPreContext()`); `checkContextSafety` bloqueia so feeling=1 (teste table-driven); planner/server recebem `context`; player usa PRE_CONTEXT/POST_CONTEXT; tela de diagnostico pede o form antes da 1a captura e persiste `ValidationCapture.context` (DECISAO: diagnostico nao bloqueia por feeling — e validacao de instrumento, contexto vira proveniencia); Dashboard/statisticsSummary com secao "Bem-estar" (delta de feeling) + fallback legado p/ sessoes antigas (`symptomsBefore/After` agora opcionais, sem migracao idb); SymptomScale.tsx removido, `currentSymptoms` morto removido do store. Gate: tsc, 116/116, build `/gaze`, restart, smoke 45/45.
- [x] BUNDLE D — Modo "Leitura + Recall". FEITO 2026-07-03 (pronto p/ revisao): server `POST /api/generateRecallText` (JSON {topic,text}, 150-250 palavras, dominio sorteado, denso em fatos) e `POST /api/generateRecallQuestions` (JSON 6 questoes ×5 alternativas + correctIndex + rationale, temp 0.2); `recallService.ts` com `isValidRecallQuestions` (shape estrito) + `shuffleQuestionOptions` (remapeia correctIndex) + testes; `RecallQuiz.tsx` (1 questao por vez sem feedback intermediario → revisao com correcao e rationale); toggle "Captura simples | Leitura + Recall" no painel do diagnostico — modo recall troca o texto do canvas, captura gaze durante a leitura, "Terminei de ler" salva a captura e abre o quiz; resultado persistido em idb DB v3 store `recallTests` ({...answers, score, readingDurationMs, captureId→ValidationCapture, context}); relatorio da captura ganha card "Recall X/6"; texto novo gerado apos cada rodada (releitura inflaria recall). Falha de IA nas questoes nao perde a captura. Gate: tsc, 120/120, build `/gaze`, restart, smoke 45/45, endpoints validados ao vivo (texto 185 palavras + 6 MCQs shape valido).
Notas: lembrete pos-PACK do Anders — rever deteccao de movimento de pescoco (posturalStability + threshold yaw/pitch <5 em ExerciseCanvas) quando este PACK fechar. PACK Validade de Captura pausado com VC4 pendente (ver abaixo). Frentes futuras: listagem/serie de recall no Dashboard; texto recall longo pode estourar o canvas no iPhone landscape (sem scroll — ok no desktop portrait, revisar se incomodar no iPhone).

### 2026-07-02 08:56 - Dot azul com vertical travado (display-only)

Context:
Anders observou que a bolinha ambar (sinal bruto) parece "presa" no eixo horizontal e acompanha bem o olhar, enquanto a azul calibrada flutua verticalmente sobre o texto e atrapalha a leitura durante o proprio teste. Levantamento confirmou: o canal vertical bruto e quase morto por anatomia (iris entre palpebras que acompanham o olhar), e a analise clinica (`analyzeSaccades`) ja consome apenas `s.h` — o vertical da azul era ruido cosmetico no display.

Details:
Em `EyeTrackingTestScreen`, o dot azul calibrado agora renderiza com `renderY = gaze.v * cssH` (mesmo canal vertical bruto do dot ambar), ficando visualmente estavel na vertical. Mudanca exclusivamente de renderizacao: `captureSamplesRef` (dados de analise) e `visualSignalSamplesRef` (traçado + `summarizeFunctionalVisualSignal`, que usa `v` nas metricas ao vivo) seguem recebendo a predicao 2D verdadeira. `ExerciseCanvas.latestGazePoint` nao foi tocado (e dado consumido pelos exercicios).

Notes:
Validado com `npx tsc --noEmit`, suite completa `node --import tsx --test $(rg --files -g '*.test.ts' src)` (79/79), `APP_BASE_PATH=/gaze npm run build`, restart de `linhafixa.service`, `/gaze/` publico 200 com bundle `index-AfZvCa7I.js`. Pendente: teste manual do Anders no iPhone confirmando que o dot azul parou de flutuar sobre o texto. NAO commitado.

Follow-up 2026-07-02 (trilho fixo):
Anders confirmou o horizontal-only mas refinou a intencao: a azul deve andar num trilho fixo — a linha de repouso da laranja — sem a deriva lenta nem os mergulhos de piscada do `v` bruto instantaneo. Trocado `renderY` para EMA lento (~1.5s, alpha 0.02) do `gaze.v` bruto (`rawVEmaRef`), aplicado so ao dot calibrado; ambar segue com `v` instantaneo e os caminhos de dados continuam com a predicao 2D verdadeira. Gate verde: tsc, 79/79, build `/gaze`, restart `linhafixa.service`, bundle `index-BSQVxmyd.js` no ar. Anders aprovou no iPhone; commitado em `be9b4ba`.

### 2026-07-02 — Auditoria cega Codex (triagem Claude)

Context:
Anders pediu auditoria cega ao Codex (15 achados) e Claude cruzou com o historico de decisoes. Relatorio cru em `/root/.codex/attachments/8fdf3a5d-1d49-4c15-a892-677b760e7835/pasted-text.txt`.

Bugs novos confirmados no codigo (candidatos a PACK Validade de Captura):
- #1 `EyeTrackingTestScreen.tsx:523-527` — captura mistura coordenadas calibradas e razoes brutas na mesma serie; 1 amostra calibrada rotula tudo `calibrated-mediapipe`; transicoes criam sacadas falsas. O MAIS GRAVE: contamina dados da Fase 0 se nao corrigir antes.
- #9 `oculomotorAnalysis.ts:18,140-146` — `mean([])` retorna 0: latencia media 0ms (impossivel) quando nenhuma latencia valida.
- #6 `gazeCalibration.ts:177-178` — `predictNorm` clampa [0,1]; extrapolacao vira ponto de borda "valido".
- #10 — sem listener de `visibilitychange/pagehide`; Safari em background corrompe captura silenciosamente.

Redescobertas de decisoes conscientes (nao acao imediata): #2 blink gate off (aguarda dados Fase 0), #7 tolerancia permissiva (comentada no codigo), #12 renderY (pedido do Anders), #4 px/cm CSS (pixels-not-angles, Glass) — mitigacao barata single-user: perfil com px/cm real do iPhone do Anders. #3 unidades/subamostragem: conhecido em espirito; ideia de tiers (evento grosso a 30Hz vs metrica temporal) e boa articulacao.

Convergencia: #14 do Codex e literalmente o PACK GT ja implementado no worktree — validacao independente do design.

Frentes novas de alto nivel (sem bundles ainda): repetibilidade teste-reteste com dados ja salvos (#13); painel "sanidade do instrumento" — dt p50/p95, % blink, IQR IPD, % extrapolacao (#15); refinamentos menores #5/#8/#11.

Decisao (2026-07-02): Anders assinou a ordem proposta = (1) mergear/deployar PACK GT (feito em `c613990`, revisao iPhone pendente), (2) PACK Validade de Captura (#1,#9,#6,#10) — PACK ativo abaixo, (3) so entao Fase 0 no iPhone.

## PACK Validade de Captura (pausado 2026-07-03 — VC4 pendente; Anders priorizou o PACK Leitura & Recall)

Contexto: 4 bugs confirmados da auditoria cega Codex que corrompem a validade dos dados capturados; o #1 contamina a Fase 0 se nao morrer antes.
Bundles:
- [x] BUNDLE VC1 — #1: captura sem mistura de coordenadas. FEITO 2026-07-02 (pronto p/ revisao): dois buffers separados (calibrado/bruto) no loop de captura; `selectCaptureSeries()` pura em `validationCapture.ts` escolhe o buffer MAJORITARIO como serie de analise (empate favorece calibrado; ambos vazios = `unavailable`) — nunca concatena, fim dos saltos de unidade e do rotulo "calibrada" com 1 amostra. `ValidationCapture` ganhou `calibratedSampleCount`/`rawSampleCount` (proveniencia persistida); relatorio e drawer mostram "Calibrada (92%)" via `sourceConsistencyLabel`. Sem tocar `saccadeAnalysis.ts` nem o tipo `signalSource` (sem valor `mixed` — serie nunca mistura). Gate: 93/93 testes (6 novos), tsc, lint, build `/gaze`; deployado bundle `index-CnswrC_y.js`. Commitado em `10f4ba2`.
- [x] BUNDLE VC2 — #9: latencia sem sentinela. FEITO 2026-07-03 (pronto p/ revisao, via TDD): criado `oculomotorAnalysis.test.ts` (12 testes — fixacao/sacada/pursuit sinteticos com latencia/ganho/dispersao conhecidos; caso vermelho: gaze respondendo em 40ms, abaixo do piso de 60ms, expunha `mean([])`=0ms). Fix: `SaccadeTaskMetrics.meanLatencyMs: number | null` + `validLatencyCount`; `ExercisePlayerScreen` mostra "sem latencia valida" quando null. Registros idb antigos com 0ms ficam como estao (single-user, sem migracao). Gate: tsc, 107/107, build `/gaze`, restart, smoke 35/35.
- [x] BUNDLE VC3 — #6: extrapolacao visivel. FEITO 2026-07-03 (pronto p/ revisao, via TDD): `predictNorm` retorna `{x, y, extrapolated}` — raw fora de [0,1] em qualquer eixo marca a flag; ponto segue clampado p/ display. Consumidores rejeitam: `EyeTrackingTestScreen` (dot azul cai pro ambar, mesmo caminho de assinatura/bounds/distancia) e `ExerciseCanvas` (`latestGazePoint = null`, metricas oculomotoras nao ingerem borda fabricada). Captura conta frames rejeitados em `ValidationCapture.extrapolatedSampleCount` (persistido + export; relatorio mostra "Extrapolacao rejeitada" quando >0) — semente do painel de sanidade #15. `CalibrationOverlay` intocado (targets de validacao vivem dentro da grade calibrada; erro clampado permanece piso conservador). DECISAO: rejeitar-para-raw em vez de so marcar — com a regra majoritaria do VC1, captura dominada por extrapolacao seleciona honestamente a serie bruta. Gate: tsc, 108/108, build `/gaze`, restart, smoke 35/35.
- [ ] BUNDLE VC4 — #10: visibilitychange/pagehide invalida ou marca captura em background (Safari).
Notas: frentes futuras fora deste PACK: repetibilidade teste-reteste (#13), painel sanidade do instrumento (#15), px/cm real do iPhone (#4-mitigacao), tiers de metrica (#3), refinamentos #5/#8/#11; harness de regressao restante (golden traces de leitura p/ readingDynamics, safety.ts table-driven, round-trip storage/idb).

### 2026-07-03 — Smoke Playwright roteirizado (`npm run smoke`)

Context:
Panorama de cobertura mostrou que os bugs mais graves (Codex #1/#10, layout) moravam na camada React sem teste; os smokes pos-deploy eram ad-hoc. Anders aprovou converter em gate repetivel.

Details:
`scripts/smoke-layout.mjs` (+ script `npm run smoke`, playwright declarado em devDependencies): percorre consent → diagnostico em 3 viewports (iPhone portrait/landscape touch, desktop 1440) e checa 35 invariantes — modo de layout por dispositivo, preview de camera e selo px desktop-only, alinhamento dos cartoes do painel (spread esq/dir ≤1.5px, pega "cartao estreitando"), canvas nao-nulo, overlay de calibracao com dot dentro da moldura e moldura dentro do viewport, sem requests externos (allowlist: Google Fonts; pega MediaPipe voltando pra CDN) e sem erros de console (filtra glog INFO/WARNING do MediaPipe). Camera fake por `addInitScript` com `canvas.captureStream(30)` — flag `--use-fake-device-for-media-capture` parou de registrar devices no Chrome 149 headless; o stream injetado e deterministico e exercita attachStream/videoFrameLoop/MediaPipe com frames reais. Roda contra o servico deployado (default `localhost:3060/gaze`; aceita baseUrl como arg).

Notes:
35/35 contra o deploy corrente. Mesmo dia: preview de camera e selo px ocultados no layout compacto (iPhone) e scrollbar gutter `-mr-4 pr-4` na secao rolavel do painel desktop — a causa provavel do "cartao estreitando" relatado pelo Anders (scrollbar classica no Windows estreitava os cartoes internos vs fileiras pinadas); confirmacao visual no iPhone pendente. NAO commitado.

### 2026-07-01 21:21 - Geometria e consistencia desktop

Context:
Anders confirmou que no desktop os indicadores de movimento ocular fazem sentido mesmo quando a camera fica em 30 Hz, e aprovou deixar o layout decidir na pratica: desktop com superficie mais estavel; mobile/touch ainda acessivel em modo compacto, sem texto proibitivo.

Details:
Criados `src/services/cameraTelemetry.ts` e `src/services/captureGeometry.ts` com testes. A tela de diagnostico agora calcula uma superficie desktop limitada/estavel, descontando painel lateral, padding e gap; a calibracao pode receber o retangulo real dessa superficie e grava a assinatura usando esse alvo, em vez de assumir sempre viewport inteiro. Cada `ValidationCapture` pode salvar `environment` com layout, viewport/DPR/orientacao, superficie, video, camera negociada e taxas medidas. O relatorio de captura ganhou secao "Ambiente e camera" separando camera negociada, video recebido, FPS camera, FPS deteccao e taxa ocular. `signalQuality` deixou de exigir 45 Hz como gate duro: capturas calibradas e consistentes a 30 Hz podem ser `Comparavel`.

Notes:
Nao alterou `saccadeAnalysis.ts`. Validado com `npx tsc --noEmit`, `node --import tsx --test $(rg --files -g '*.test.ts' src)` (71/71), `APP_BASE_PATH=/gaze npm run build`, restart de `linhafixa.service`, `/gaze/` publico 200 com bundle `index-BCxKpD76.js` e CSS `index-BYOuQ-L6.css`, assets com MIME correto, `git diff --check` limpo, smoke Playwright/Chrome desktop confirmando tela de diagnostico montada com canvas `1028x577` dentro do viewport e painel lateral `288x684`.

Follow-up 2026-07-02 (moldura de calibracao):
Anders apontou que nao ficava claro qual area seria calibrada e que o layout de calibracao parecia solto. `EyeTrackingTestScreen` agora mostra uma moldura rigida nomeada ("Area fixa de leitura e calibracao"), cantos de referencia e dimensao da superficie. `CalibrationOverlay` mostra a mesma moldura como "Area calibrada do teste" e instrui a seguir o ponto azul dentro dela. Publicado com bundle `index-Ct7H63IR.js` e CSS `index-dVU1oPdu.css`; smoke Chrome confirmou rótulos no diagnostico e na calibracao, com ponto azul dentro da area marcada. Validado com `npx tsc --noEmit`, suite completa 71/71, build `/gaze`, restart de `linhafixa.service`, assets com MIME correto e `git diff --check`.

### 2026-07-01 09:56 - Diagnostico separado iPhone/touch vs desktop

Context:
Anders observou que a bolinha azul calibrada sumia frequentemente no iPhone, enquanto a linha/bolinha laranja bruta acompanhava quase tao bem. A causa mais provavel no codigo era geometrica: em iPhone landscape o breakpoint `md` ativava layout desktop (`canvas + painel lateral`), reduzindo o canvas para ~644px de largura apesar da calibracao/projecao operar em viewport inteiro; pontos calibrados fora do canvas eram descartados, fazendo o azul desaparecer.

Details:
Criado `src/services/deviceProfile.ts` com `diagnosticsLayoutMode()`: dispositivos touch/iPhone ficam em modo `compact`; desktop lateral so entra para viewport largo sem touch (`>=1024px`). `EyeTrackingTestScreen` agora usa esse perfil para escolher layout: iPhone/touch empilha canvas em largura total e painel embaixo; desktop largo preserva painel lateral. O listener de resize/orientacao foi consolidado para atualizar largura, orientacao e rewrap do texto sem duplicidade.

Notes:
Validado com teste novo `deviceProfile.test.ts`, `npm run lint`, suite completa `node --import tsx --test $(rg --files -g '*.test.ts' src)` (67/67), `APP_BASE_PATH=/gaze npm run build`, restart de `linhafixa.service`, `/gaze/` publico 200 com bundle `index-CXDr7TU4.js`, medicao Playwright confirmando iPhone landscape touch com canvas `932px` + painel abaixo e desktop `1366px` com canvas `1078px` + painel lateral `288px`. Smoke iPhone fake carregou MediaPipe local sem CDN externo. Falta teste manual no iPhone/Safari com calibracao real para confirmar se a bolinha azul para de sumir.

### 2026-06-30 17:04 - Fallback direto sem gate duro de piscada

Context:
Anders reportou regressao perceptivel no iPhone: a bolinha azul calibrada nao acompanhava mais apos o hardening ocular A/E. Hipotese operacional mais forte: o novo gate `eyeBlink* > 0.5` podia estar rejeitando frames demais no Safari/iPhone, fazendo o feedback ao vivo e a leitura parecerem mortos apesar de haver sinal de olhar.

Details:
Mantido `isBlinking()` como medidor testavel, mas criado `shouldDropGazeForBlink()` com gate desligado por padrao (`BLINK_REJECT_GATE_ENABLED=false`). `EyeTrackingTestScreen` e `ExerciseCanvas` agora usam esse gate, voltando ao fallback direto sem filtro duro de piscada. O caminho continua reversivel: quando houver dado real de blink score no iPhone, o gate pode ser reativado/tunado sem reescrever consumidores.

Notes:
Validado com teste vermelho/verde em `faceTracking.test.ts`, depois `node --import tsx --test $(rg --files -g '*.test.ts' src)` (65/65), `npm run lint`, `APP_BASE_PATH=/gaze npm run build`, restart de `linhafixa.service`, `/gaze/` publico 200 com bundle `index-BliLTDbA.js`, e smoke Playwright no diagnostico com camera fake carregando MediaPipe apenas de `/gaze/vendor/mediapipe/...`. Precisa teste manual no iPhone/Safari com camera real; se a bolinha azul ainda nao acompanhar, proxima frente e separar assinatura/layout iPhone vs desktop e revisar z-score/calibracao.

### 2026-06-30 16:21 - Hardening ocular A/E puxado e publicado

Context:
Rodada da nuvem `claude/eye-detection-review-jtcde2` foi mergeada em `origin/main` e puxada localmente preservando a nota Codex do incidente `/gaze`.

Details:
Commit publicado localmente: `78b927d` (`Merge pull request #3 ... Harden ocular signal pipeline`). Confere com o plano: gate de piscada (`getBlinkScore`/`isBlinking`), z-score no ridge de `gazeCalibration`, `@mediapipe/tasks-vision` pinado em `0.10.35`, wasm copiado por `scripts/copy-mediapipe.mjs`, modelo `face_landmarker.task` vendorizado e URLs MediaPipe locais via `import.meta.env.BASE_URL`.

Notes:
Validado em produção com 64/64 testes (`node --import tsx --test $(rg --files -g '*.test.ts' src)`), `npm run lint`, `APP_BASE_PATH=/gaze npm run build`, restart de `linhafixa.service`, `/gaze/` público 200, `/gaze/vendor/mediapipe/face_landmarker.task` 200, wasm 200, `dist` sem strings `cdn.jsdelivr`/`storage.googleapis`, e smoke Playwright com câmera fake no diagnóstico carregando MediaPipe apenas de `/gaze/vendor/mediapipe/...`. Resta validação manual no iPhone/Safari com câmera real e calibração.

### 2026-06-30 14:14 - Incidente publico /gaze restaurado

Context:
Anders reportou que o app Gaze estava sem acesso. O backend `linhafixa.service` estava ativo em `3060`, mas `https://ultrassom.ai/gaze/` retornava `404` direto do Apache.

Details:
Causa raiz: o bloco `ProxyPass /gaze -> 127.0.0.1:3060/gaze` tinha sumido da config principal `/etc/apache2/sites-available/ultrassom.ai-optimized.conf` apesar de ainda existir no backup `ultrassom.ai-optimized.conf.bak.vertex3-20260630`. O bloco foi restaurado, `apachectl configtest` passou, Apache foi recarregado e a trava `chattr +i` foi recolocada. Em seguida foi corrigido o segundo sintoma: o build em `dist/index.html` apontava assets para `/assets/...`; foi refeito `APP_BASE_PATH=/gaze npm run build` e reiniciado `linhafixa.service`.

Notes:
Validado com `npm run lint`, `APP_BASE_PATH=/gaze npm run build`, `systemctl restart linhafixa.service`, `curl https://ultrassom.ai/gaze/` retornando 200, HTML referenciando `/gaze/assets/...` e JS/CSS públicos retornando 200 com MIME correto. Smoke com Playwright usando Chrome do sistema confirmou React montado no consentimento (`#root` com conteúdo). `/etc/apache2/APACHE.md` atualizado para registrar a restauração do proxy.

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

Rotacionado em 2026-07-05 apos entrega do BUNDLE D2 (acordeao da gaveta). Working tree LIMPA, tudo commitado ate `44922b2`. ATENCAO: D2 implementado mas DEPLOY PENDENTE de aval explicito do Anders — a 3060 ainda serve o build do MD1; smoke novo (esperado 65/65) so roda pos-deploy.

Grande fila de VALIDACAO NO IPHONE do Anders (acumulada, pode fazer numa tacada so em https://ultrassom.ai/gaze):
- BUNDLE MD1 (gaveta mobile, PACK novo no topo): faixa colapsada + pucador em portrait E landscape, calibracao com guia de 1 linha.
- BUNDLE D2 (apos deploy): acordeao na gaveta expandida — resumo vivo legivel em 390px, um card por vez, rotacao com card aberto mantem estado.
- PACK GT (`c613990`): exercicio de sacadas → bloco "Validacao interna do detector" vira baseline do instrumento.
- PACK Validade de Captura VC1-VC3 (commitados): "Calibrada (92%)" no relatorio; latencia sem 0ms fantasma; extrapolacao rejeitada.
- PACK Leitura & Recall + Pescoco v2 (checkpoint `f4c8ff7`): "checo tudo junto" — decisao do Anders.

Frentes de codigo prontas pra ativar depois da validacao:
- BUNDLE VC4 — #10: listener `visibilitychange`/`pagehide` invalida ou marca captura em background (Safari corrompe silenciosamente). Ultimo bundle do PACK Validade de Captura.
- BUNDLE PN4 — recalibrar thresholds posturais com dados reais do iPhone.
- Fase 0 (capturas etiquetadas manuais) SO depois do VC4 fechar — senao os dados nascem contaminados.

Ler primeiro na retomada: esta secao; PACK Layout Mobile (topo); `.remember/now.md`.
Validacao padrao: `npm run test`, `npx tsc --noEmit`, `APP_BASE_PATH=/gaze npm run build`; deploy = `systemctl restart linhafixa.service` + `npm run smoke` (65 checks pos-D2, cobre gaveta/acordeao/calibracao nos 4 viewports). NAO usar vitest (41 fails falsos). Servico e `linhafixa.service` (nao "gaze"); env em `/etc/linhafixa.env` (NAO ler o arquivo — classifier bloqueia, conteudo relevante ja documentado: PORT=3060, APP_BASE_PATH=/gaze).

### 2026-07-02 - PACK GT: ground truth interno do detector I-VT (pronto p/ revisao)

Context:
Fase 1 do KICKOFF. Anders aprovou o plano compacto (incluindo liberacao explicita pra tocar `saccadeAnalysis.ts` de forma aditiva) e deixou a sessao rodar autonoma. Ideia-mestra: o exercicio de sacadas ja e um experimento controlado — cada pulo do alvo (a cada 1500ms, amplitude conhecida) e verdade-terreno; parear os pulos com os eventos do detector I-VT da a barra de erro do instrumento sem hardware externo ("chinrest estatistico").

Details:
GT1 — `analyzeSaccades` ganhou `collectEvents?: boolean` (opt-in): quando ligado, retorna `events: SaccadeEvent[]` ({tStart, tEnd, amplitude assinada, kind saccade/regression/line-return}), tipo novo em `types.ts`. Convencao de timestamp: tStart = ultima amostra ANTES do cruzamento de velocidade (consistente com as metricas agregadas). Off por default → payloads persistidos de SaccadeMetrics inalterados; teste de regressao garante agregados identicos com/sem eventos. GT2 — novo `src/exercises/detectorValidation.ts` (puro): `ocSamplesToGazeSamples` (canvas px → h/v normalizado), `extractTargetJumps` (mesmo criterio >1px do `analyzeSaccadeTask`), `validateSaccadeDetector` pareia salto↔evento (janela -50..1000ms, direcao obrigatoria, greedy cronologico, kind IGNORADO de proposito — salto grande pra esquerda e "line-return" na taxonomia de leitura mas e deteccao correta aqui) → `DetectorValidationMetrics`: detectionRate, falsePositives(/min), medianLatencyMs + IQR, meanAmplitudeGain. GT3 — `saccadeExercise.getResultData` injeta `detectorValidation` no extraData (persiste via saveSession, da o "por sessao/condicao"); `ExercisePlayerScreen` mostra bloco "Validacao interna do detector (instrumento, nao usuario)" no card de Sacadas.

Notes:
Honestidade do metodo: deteccao perdida pode ser falha do detector OU o usuario nao ter feito a sacada — o agregado ainda limita a sensibilidade do instrumento nas condicoes da sessao. Validado com `node --import tsx --test` (87/87; 79 do main + 8 novos), `npx tsc --noEmit`, `npm run lint`, `APP_BASE_PATH=/gaze npm run build`. Commitado em `b3fffec`, mergeado no main em `c613990` e deployado em 2026-07-02 (bundle `index-CyptVrBX.js`). Pendente na revisao do Anders: rodar o exercicio de sacadas no iPhone e conferir o bloco novo no resumo da sessao; numeros reais de detectionRate/latencia viram baseline do instrumento.

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

### 2026-06-30 - Rodada Claude: gate de piscada, ridge z-score e auto-host MediaPipe

Context:
Entrada do Claude (segunda opiniao sobre o motor do olhar a pedido do Anderson). Brainstorm priorizou duas frentes de baixo risco/alto ganho para esta rodada: rejeitar amostras durante piscadas e estabilizar o modelo de calibracao, alem de remover a dependencia de CDN em runtime. Nota de papel: entrada escrita pelo Claude; nao e continuidade do Codex.

Details:
Frente A (quick wins) — `faceTracking.ts` agora expoe `getBlinkScore()` (max de `eyeBlinkLeft/eyeBlinkRight` do frame corrente) e o helper puro `isBlinking()` com `BLINK_REJECT_THRESHOLD=0.5`. O gate descarta a amostra de olhar durante piscada mantendo a contagem de cobertura: aplicado em `EyeTrackingTestScreen` (push de visualSignal e de captura) e em `ExerciseCanvas` (anulando `latestGaze`/`latestGazePoint` a montante, sem tocar nos exercicios). `gazeCalibration.ts` passou a padronizar features (z-score) em `fitCalibration`/`predictNorm`, guardando `featureMean/featureStd`, corrigindo o mal-condicionamento causado pelo `yaw/pitch ×100`; `GAZE_FEATURE_LENGTH` inalterado. Frente E (infra) — `@mediapipe/tasks-vision` fixado em `0.10.35` (sem `^`); wasm copiado do pacote pinado por `scripts/copy-mediapipe.mjs` via `predev`/`prebuild` para `public/vendor/mediapipe/wasm/` (gitignored); modelo `face_landmarker.task` vendorizado (commitado) em `public/vendor/mediapipe/`; `faceTracking.ts` carrega ambos via `import.meta.env.BASE_URL` (funciona em `/` e `/gaze/`). Fim das requisicoes a `cdn.jsdelivr.net`/`storage.googleapis.com` em runtime.

Notes:
Nao alterou `saccadeAnalysis.ts` nem a contagem clinica de regressao (frente estrutural de pose 3D + descontar cabeca, e robustez I-VT/selos, ficaram para rodada futura). Decisao de design: piscada descarta a amostra (nao interpola). Novos testes: `faceTracking.test.ts` (isBlinking) e caso de recuperacao z-score com feature em escala ×100 em `gazeCalibration.test.ts`. Validado com `node --import tsx --test $(rg --files -g '*.test.ts' src)` (64/64), `npm run lint` (tsc --noEmit) e `APP_BASE_PATH=/gaze npm run build` com assets MediaPipe presentes em `dist/vendor/mediapipe/` e base `/gaze/` embutido. Smoke no navegador (camera/calibracao + Network sem CDN) recomendado no deploy.

### 2026-07-02 - PACK V: validade do sinal ocular (pronto p/ revisao)

Context:
Segunda opiniao profunda do Claude a pedido do Anders (auditoria completa do pipeline). Achado central: fugas de VALIDADE, nao de capacidade — return sweeps inflando regressionCount (~+1 por linha lida), calibracao contaminada por piscada na coleta, layout mudando dentro/entre medicoes, drift de distancia invisivel ao contrato. Anders liberou `saccadeAnalysis.ts` explicitamente e aprovou plano em 4 bundles (plan: `na-verdade-meu-velho-witty-rainbow.md`). Decisoes dele: return sweep vira contador proprio; drift >15% INVALIDA ponto calibrado (cai pra bruto); normalizacao postural por scale fica pra proxima rodada.

Details:
V1 (detector) — `saccadeAnalysis.ts`: filtro mediano de 3 amostras no canal H (mata spike isolado de landmark), sacada esquerda com |amp|>=0.35 vira `lineReturnCount` (fora de regressionCount/amplitudes; threshold alinhado ao LINE_RETURN_DH do visualSignal, recalibravel com dado PACK 2), fixacao contendo gap dt>200ms descartada (nao infla meanFixationMs). `SaccadeMetrics.lineReturnCount` opcional (capturas legadas ok). readingDynamics mostra retornos no insight; EyeTrackingTestScreen exibe no relatorio e no drawer. V2 (calibracao) — CalibrationOverlay: blink gate na coleta (fit, validacao e IPD; postural mantida), acuracia agora e media dos erros POR AMOSTRA (antes: erro da media das predicoes, otimista por cancelamento de ruido). V3 (layout) — fontPx congelada durante a captura de 20s (geometria do estimulo fixa na janela de medicao); assistedReading migrou de px fixos (26/32/40/48) para angulo visual via `degToPx(readingFontAngleDeg(pref))` + margem proporcional — metricas do exercicio e do diagnostico agora com o mesmo gain. V4 (distancia/proveniencia) — `distanceWithinAnchorTolerance()` em viewingGeometry (15%, inputs inuteis = true, mesma politica do blink gate); gate de drift nos dois consumidores de ponto calibrado (EyeTrackingTestScreen + ExerciseCanvas com EMA local); ValidationCapture ganhou `distanceEstimatedCm` (mediana de estimados IPD-reais, sem fallback fake), `pxPerDegAtCapture`, `canvasWidthPx`, `orientation` — amplitude normalizada vira grau offline (destrava PACK 4). Corrigido de brinde: closure velha de `conditions` no auto-finish da captura (etiqueta podia sair defasada) via conditionsRef.

Notes:
Validado com `node --import tsx --test` (72/72; 64 antigos + 8 novos), `npx tsc --noEmit`, `npm run lint`, `APP_BASE_PATH=/gaze npm run build`. Teste sintetico de 4 linhas de leitura limpa: 20 sacadas progressivas, 0 regressoes (antes: 3 falsas), 3 retornos de linha. Trabalho feito em worktree `quirky-euclid-a4dd5e`, NAO commitado — aguarda revisao do Anders. Pendente validacao manual no iPhone: calibrar piscando de proposito (acuracia nao deve degradar; numero exibido pode subir um pouco por ser agora honesto), capturar aproximando/afastando (texto nao re-flui durante captura; >15% derruba bolinha pra ambar), conferir campos geometricos no export JSON. Fora de escopo registrado: normalizacao yaw/pitch postural por scale, protocolo de validacao interna via sacadas guiadas (ground truth do detector), PACK 3 visual.

Follow-up 2026-07-02 (merge + deploy):
Anders aprovou o PACK V; commit `0f524c1` na branch do worktree. Ao preparar o deploy, o main tinha o bundle Codex "Geometria e consistencia desktop" JA PUBLICADO mas nao commitado — Anders decidiu: commitar o Codex verbatim (`67f58e1`, preserva estado de producao) e mergear o PACK V por cima (`a1c0ecd`). Duas resolucoes semanticas no merge: (1) erro de validacao por amostra agora compara predicao com `targetAbs` (alvo projetado na superficie do Codex), nao com o alvo relativo; (2) POLITICA DE BLINK unificada — os tres consumidores (CalibrationOverlay, EyeTrackingTestScreen, ExerciseCanvas) usam `shouldDropGazeForBlink()` atras do kill-switch `BLINK_REJECT_GATE_ENABLED=false` do Codex (baseline alto de eyeBlink travaria a calibracao no ponto 1 e mataria sinal fluindo); apos tunar com dado real, UMA flag ativa o gate em todo lugar. Gate pos-merge: 79/79 testes (64 base + 7 Codex + 8 PACK V), tsc, lint, build. Publicado: restart `linhafixa.service`, bundle `index-N1c8cMnW.js`, curl local/publico 200, JS/CSS com MIME correto, MediaPipe vendor 200. Pendencias inalteradas: smoke manual do Anders (iPhone + desktop com moldura), ground truth via sacadas guiadas como proxima frente sugerida.
