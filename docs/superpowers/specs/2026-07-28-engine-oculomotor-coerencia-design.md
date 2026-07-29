# Coerência do Engine Oculomotor — Design

**Data:** 2026-07-28

**Status:** design apresentado e aprovado por Anders; aguardando revisão do spec escrito

**Contratos relacionados:** `2026-07-16-instrument-validity-design.md`

**Origem:** auditoria do pipeline oculomotor pedida por Anders após observar em uso
que "rejeição de pálpebra e filtro de movimentos indesejáveis estão desconfigurados".

## Decisão

O engine **não** será refundado. A auditoria mostrou que a fundação está correta:
`fixationDetection.ts` e `saccadesFromFixations.ts` implementam I-DT segundo
Salvucci & Goldberg (2000), são fps-invariantes por construção e estão bem
fundamentados. O defeito real é que a migração I-VT → I-DT (commit `01e48f5`)
parou no detector e deixou o resto do engine falando a língua velha.

Refundar jogaria fora a parte boa e quebraria a comparabilidade da série
histórica — que é P0 neste projeto. O trabalho é fechar a migração.

## Problema

Quatro incoerências, verificadas no código, com a suíte em 447/447 verde. Os
testes provam o que foi construído, não o contrato — nenhum cobre invariância de
taxa de amostragem no painel ao vivo nem purga de piscada nos buffers de medida.

### P1 — O painel ao vivo mede por amostra, não por tempo

`visualSignal.ts` nunca foi migrado. Três limiares são delta **por amostra**:

| Constante | Linha | Efeito a 60fps |
| --- | --- | --- |
| `FIXATION_VELOCITY = 0.00045` | `visualSignal.ts:33` | `fixationShare` cai: o ruído de amplitude fixa dividido por `dt` menor vira velocidade aparente maior |
| `LINE_RETURN_DH = -0.35` | `visualSignal.ts:35` | O retorno de linha **deixa de disparar**: o movimento se divide em dois deltas de ~-0.175 e nenhum cruza o corte |
| corte de sinal `0.01` em `directionChanges` | `visualSignal.ts:168` | Mais deltas viram sinal zero, menos oscilação é contada, `sensitivityScore` **infla** |

Ter régua própria neste arquivo **é deliberado** — `saccadeAnalysis.ts:52-53`
documenta que o hint ao vivo mantém seu próprio `LINE_RETURN_DH` e que a
classificação clínica é a fonte de verdade. O defeito não é a escala diferente,
é a dependência de taxa de amostragem, que não foi escolha de ninguém.

Este é o painel que Anders lê ao vivo para julgar se a captação está boa. É a
origem provável da percepção de "desconfigurado".

`summarizeFunctionalVisualSignal` alimenta apenas o estado `liveSignal`
(`EyeTrackingTestScreen.tsx:639`) e **nunca é persistido** — não há série
histórica a versionar aqui.

### P2 — A purga da borda de subida só protege o desenho

`purgeLeadingBlinkSamples` é chamado num único lugar
(`EyeTrackingTestScreen.tsx:463`), sobre `visualSignalSamplesRef` — o buffer de
traçado de 2,6 s. O comentário em `blinkGate.ts:5` promete remover a borda de
subida "from sample buffers", no plural. Na prática é singular, e é o buffer que
menos importa.

Os buffers que viram **medida** não recebem purga nenhuma:

- `captureCalSamplesRef` e `captureRawSamplesRef` (`useCaptureLifecycle.ts:189-190`) — são `GazeSample[]` com `t`, aceitam a purga existente direto;
- as amostras de ajuste em `gazeCalibration.ts:74` — guardam `{features, target}` **sem timestamp**, e por isso não têm como ser purgadas hoje.

A calibração é o alvo mais grave: uma amostra com pálpebra parcialmente baixa
ali não contamina uma medida, contamina **todas as medidas posteriores**, porque
treina o modelo de regressão.

### P3 — Zona morta entre os limiares e o olho real

`BLINK_REJECT_THRESHOLD = 0.5` (`faceTracking.ts:196`) e
`BLINK_EXIT_THRESHOLD = 0.25` (`blinkGate.ts:9`) são defaults herdados do
MediaPipe, nunca calibrados contra o sujeito. O baseline de repouso de Anders é
~0.29 — **entre os dois**. O `exit` nunca é cruzado, e toda saída de piscada
depende do `recoveryStableMs` de 120 ms, que foi o remendo do commit `09a2ddf`.

O gate funciona pelo caminho de exceção, não pelo caminho projetado.

### P4 — Critério não uniforme entre as instâncias do gate

Três instâncias independentes: `useCameraPipeline.ts:120`,
`CalibrationOverlay.tsx:256`, `ExerciseCanvas.tsx:246`.

Elas rodam em contextos que **não coexistem** (a calibração suspende o loop do
pipeline), então instâncias separadas são corretas — estado compartilhado
vazaria entre contextos. O defeito é que os limiares e a purga não são
uniformes entre elas: só o pipeline participa da purga, e nenhuma delas conhece
o baseline medido.

## Arquitetura

Quatro unidades com fronteiras claras. A ordem de implementação é A → B → C → D:
D é a maior mudança de comportamento observável e se beneficia de A/B/C prontos.

### Unidade A — `src/services/blinkBaseline.ts` (novo)

Mede o baseline de `eyeBlink` do próprio sujeito e deriva `enter`/`exit`.

**Janela de coleta:** os `SETTLE_MS` (450 ms) de cada um dos 9 pontos de
calibração — o intervalo em que o olho está pousando e nenhuma amostra de ajuste
é coletada. São ~4 s de sinal hoje descartado, sem adicionar fluxo nem UI. O
score `eyeBlink` não depende de para onde o olho olha, então o settle é janela
válida.

**Derivação:** piscadas são picos raros e curtos; o repouso é o corpo da
distribuição. Sobre os scores coletados:

- `baseline` = mediana (p50) — robusta aos picos de piscada dentro da janela;
- `spread` = p90 − p50 — largura da oscilação de repouso;
- `exit` = `baseline + max(spread, EXIT_MIN_MARGIN)` — **acima** do baseline, que é a correção direta de P3;
- `enter` = `max(exit + ENTER_GAP, ENTER_FLOOR)` — bem acima do repouso, com piso absoluto para nunca ficar permissivo demais.

**Constantes de derivação:**

- `EXIT_MIN_MARGIN = 0.05` — margem mínima acima do baseline; abaixo disso a oscilação de repouso reentraria no estado de piscada;
- `ENTER_GAP = 0.15` — separação mínima entre exit e enter, preservando a histerese que motivou o gate;
- `ENTER_FLOOR = 0.45` — o enter nunca fica abaixo disso; um enter permissivo demais rejeitaria olhar válido como piscada.

**Limites duros:** `exit` fechado em `[0.10, 0.45]`, `enter` fechado em
`[0.45, 0.75]`, sempre com `enter − exit ≥ ENTER_GAP`. Para o baseline medido de
Anders (~0.29, p90 estimado ~0.34): `exit = 0.34`, `enter = 0.49` — o exit passa
para **cima** do repouso, que é a correção de P3, e o enter fica próximo do 0.5
atual, que nunca foi o problema. Um teste por fronteira no plano.

**Fallback:** amostras insuficientes, distribuição degenerada (spread não
finito) ou derivação fora das faixas → mantém `BLINK_REJECT_THRESHOLD` e
`BLINK_EXIT_THRESHOLD` atuais. O fallback é o comportamento de hoje, então a
unidade nunca piora o estado atual.

**Interface:** um medidor com `observe(score, tMs)`, `derive()` retornando
`{ enter, exit } | null`, e `reset()`. Puro, sem MediaPipe, testável isolado.

### Unidade B — critério uniforme entre os gates

`createBlinkGateTracker` já aceita `enterThreshold`/`exitThreshold` por opção.
A mudança é passar a alimentá-los de uma fonte única com os valores derivados na
Unidade A, persistidos junto ao resto do estado de calibração, e expor a
transição de borda de subida (hoje detectada por comparação com
`prevBlinkingRef` dentro da tela) como parte do contrato do gate.

Cada contexto segue com sua instância e seu relógio. O que passa a ser
compartilhado é o critério, não o estado.

### Unidade C — purga onde a medida mora

- Buffers de captura: aplicar `purgeLeadingBlinkSamples` na borda de subida, exatamente como a tela já faz com o buffer de traçado.
- Amostras de calibração: passam a carregar `t`, e ganham purga equivalente na borda de subida.

O acréscimo de `t` em `gazeCalibration.ts` é interno ao módulo; o payload
persistido do modelo calibrado não muda.

### Unidade D — `visualSignal` sobre o detector clínico

`summarizeFunctionalVisualSignal` passa a rodar `detectFixations` +
`saccadesFromFixations` sobre a janela de 2,6 s, com o limiar de dispersão vindo
de `dispersionThresholdFor` aplicado à extensão do próprio sinal.

| Campo | Antes | Depois |
| --- | --- | --- |
| `fixationShare` | fração de **intervalos** abaixo de uma velocidade | fração de **tempo** dentro de fixações detectadas |
| `lineReturnCandidate` | um delta por amostra ≤ −0.35 | sacada derivada para a esquerda acima do limiar adaptativo |
| `directionChangeRate` | alternância de sinal entre **amostras** | alternância de sinal entre **sacadas** |
| `continuityPct`, `horizontalRange`, `verticalRange`, `sampleRateHz` | — | inalterados (já são por tempo ou por extensão) |

A invariância de taxa de amostragem vem de graça: o detector já é
fps-invariante por construção, provado em `fixationDetection.test.ts`.

O formato de `FunctionalVisualSignalSummary` não muda — só a semântica de três
campos. A UI que o consome (`EyeTrackingTestScreen.tsx:1797` e o painel) segue
intacta.

## Risco conhecido

`fixationShare` muda de significado, e os cortes de status
(`sensitivityScore >= 55`, `continuityPct >= 70`, `USEFUL_HORIZONTAL_RANGE`,
`LOW_HORIZONTAL_RANGE`, os pesos do `sensitivityScore`) foram sintonizados
contra a régua antiga. Eles **vão** precisar de reancoragem, e isso não é
possível só com teste unitário — exige uma sessão de Anders olhando o painel com
o engine novo.

**Mitigação:** todos esses cortes ficam agrupados e nomeados num único bloco de
constantes no topo de `visualSignal.ts`, com comentário explícito de que são
limiares de apresentação sujeitos a reancoragem empírica, não medidas.

`REVISÃO SUGERIDA:` sessão de calibração dos cortes de status após a Unidade D,
com Anders lendo o painel ao vivo. Até lá, os cortes ficam nos valores atuais.

## Fora de escopo

- **Refundação do engine.** Rejeitada com fundamento acima.
- **O trilho visual do ponto azul** (`EyeTrackingTestScreen.tsx:594`): o ponto calibrado é desenhado sobre um EMA de 1,65 s do sinal bruto vertical, não sobre a predição medida. É `display-only` e documentado; a captura guarda o valor verdadeiro. Anders decidiu tratar depois. Registrado aqui porque é a razão pela qual o que se vê na tela não é evidência direta do que o engine mede.
- **Versionamento de `visualSignal`.** Desnecessário: o resumo nunca é persistido.
- **Alteração de `saccadeAnalysis.ts`.** Está correto, versionado (`GAZE_ANALYZER_VERSION = 2`) e com reprocessamento automático via `captureReprocess.ts`.

## Critérios de aceite

1. Replay do mesmo movimento ocular sintético amostrado a 30 fps e a 60 fps produz `lineReturnCandidate` idêntico, `directionChangeRate` idêntico e `fixationShare` com diferença ≤ 5 pontos percentuais (a discretização das bordas de fixação desloca no máximo um intervalo de amostra por borda). Hoje o `lineReturnCandidate` diverge categoricamente entre as taxas.
2. Um sujeito com baseline de repouso 0.29 sai do estado de piscada pelo cruzamento do `exit` derivado, não pelo backstop de `recoveryStableMs`.
3. Baseline não medido ou fora das faixas mantém exatamente os limiares de hoje.
4. Uma borda de subida de piscada durante captura remove as amostras dos últimos `BLINK_LEADING_PURGE_MS` dos dois buffers de captura, não só do buffer de traçado.
5. Uma borda de subida durante a calibração remove as amostras correspondentes antes do ajuste do modelo.
6. A suíte inteira segue verde, e cada unidade entra com teste que falha antes da implementação.
