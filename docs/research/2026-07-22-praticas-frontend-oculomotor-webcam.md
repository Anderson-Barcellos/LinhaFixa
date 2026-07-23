# Práticas de frontend para apps oculomotores webcam

**Data:** 2026-07-22 · **Método:** `/pesquisa-light` — 5 finders (1 por ângulo) + 7 refutadores adversariais independentes. 12 agentes, 0 erros, 841k tokens.

**Pergunta:** Para apps web de exercício/rastreio oculomotor com webcam (sem chinrest, uso doméstico multi-dispositivo), quais práticas de apresentação de estímulo no frontend são consideradas inegociáveis pela comunidade?

**Legenda:** ✅ confirmado (claim refutado adversarialmente e sobreviveu) · ⚠️ `[não verificado]` (claim com fonte primária, mas sem passar pelo refutador — teto da rodada). 24 claims load-bearing ficaram sem refutação por corte de teto; estão marcados.

---

## Resposta curta

A comunidade tem **um único inegociável**: o estímulo precisa ser expresso em **graus de ângulo visual**, e ângulo visual exige **duas** grandezas físicas — tamanho físico do estímulo na tela (px/cm) **e** distância de visualização. Nenhuma das duas sozinha basta.

O corolário desconfortável: **não existe caminho legítimo que pule a calibração física px/cm**. As três ferramentas sérias (PsychoPy, jsPsych virtual-chinrest, Gorilla) todas exigem; o WebGazer/jsPsych-eye-tracking simplesmente **não aborda o problema** — e é por isso que a literatura de eye-tracking webcam reporta acurácia em ~4° e usa AOIs enormes pra compensar.

Pro Gaze isso significa: **o PACK px/cm é inegociável, não opcional.** Mas o Gaze já está do lado certo do segundo eixo (mede distância em tempo real via IPD/MediaPipe em vez de congelar 60 cm), o que é a abordagem *mais* rigorosa das três existentes.

---

## 1. Dimensionamento angular vs. absoluto — onde fica a linha

✅ **PsychoPy suporta `deg` como unidade, mas exige calibração física do monitor.** O Monitor Center precisa de largura da tela em cm, resolução em px e distância do observador em cm; só então o PsychoPy converte deg→px. A doc alerta explicitamente que se a distância mudar, o Monitor Center precisa ser atualizado.
→ https://psychopy.org/general/units.html
*(Nuance da doc: `deg` assume px/grau constante em toda a tela; `degFlat`/`degFlatPos` corrigem a distorção nas bordas — relevante pro Gaze se o estímulo percorrer muito a periferia.)*

✅ **O problema central dos experimentos online é declarado em termos idênticos aos nossos:** "a resolução e o tamanho do display são desconhecidos, impedindo o controle do tamanho e localização dos estímulos". O ângulo visual é o invariante que se busca preservar entre participantes — não uma constante natural, mas o alvo da calibração por dispositivo.
→ https://pmc.ncbi.nlm.nih.gov/articles/PMC6976612/

✅ **A documentação de eye tracking do jsPsych (WebGazer) NÃO discute ângulo visual nem dá qualquer orientação de dimensionamento de estímulo.** Só documenta seletores CSS para registrar `getBoundingClientRect()` de elementos DOM. Fetch independente confirmou a ausência.
→ https://www.jspsych.org/v8/overview/eye-tracking/

⚠️ `[não verificado]` **A fórmula operacional é `graus ≈ (57.3 × tamanho_físico) / distância`** — depende conjuntamente do tamanho físico na tela e da distância; nenhum dos dois sozinho determina o tamanho retiniano.
→ https://dl.acm.org/doi/fullHtml/10.1145/3517031.3529645

⚠️ `[não verificado]` **Sem conhecer a distância de visualização, não é possível converter coordenadas em pixels para graus, o que torna comparações entre sujeitos impossíveis.**
→ https://pmc.ncbi.nlm.nih.gov/articles/PMC6976612/

⚠️ `[não verificado]` **Padrão de implementação usado em experimentos online:** definir um sistema de coordenadas arbitrário onde o grau visual é explícito (ex.: 1° = 54,05 unidades de frame), com frame de apresentação fixo em graus (ex.: 29,6° × 16,65°), aplicando calibração por dispositivo para que o mesmo layout angular renderize em telas diferentes.
→ https://dl.acm.org/doi/fullHtml/10.1145/3517031.3529645

**★ Insight:** a linha do aceitável não é "deg vs px" — é *se o app declara suas unidades*. Quem usa px sem calibração (WebGazer puro) não está errando a unidade, está renunciando à comparabilidade entre sessões e dispositivos. O Gaze, medindo fluxo temporal do olho e não posição absoluta, é menos vulnerável a isso do que um app de psicofísica clássica — mas velocidade em °/s ainda depende de graus.

---

## 2. Calibração de tela sem hardware — os métodos reais

✅ **Cartão de crédito na tela é o método padrão de facto.** O participante posiciona um cartão físico (largura padronizada 85,60 mm) contra a tela e redimensiona uma imagem até coincidir. `LPD = cardImageWidth / 85.60` dá pixels por milímetro daquele display.
→ https://pmc.ncbi.nlm.nih.gov/articles/PMC6976612/ · https://www.jspsych.org/v7/plugins/virtual-chinrest/

✅ **O plugin `virtual-chinrest` do jsPsych mede a distância pelo ponto cego** e ajusta a configuração dos estímulos pela distância individual. Implementa `resize_units` (cm/inch/deg).
→ https://www.jspsych.org/v7/plugins/virtual-chinrest/

✅ **Virtual Chinrest: erro absoluto médio de 3,25 cm** (sd 2,40) em displays de 13″–23″ e distâncias de 43/53/66 cm. Com chinrest físico o erro cai para 2,36 cm. Método usa o ponto cego assumido a ~13,5° temporal (medido: 13,59°, sd 0,96°).
→ https://www.nature.com/articles/s41598-019-57204-1

⚠️ `[não verificado]` **A tarefa do cartão + a estimativa de distância são descritas como "altamente recomendadas"** para conversão confiável entre predições de gaze e coordenadas de estímulo em setups online não supervisionados.
→ https://dl.acm.org/doi/fullHtml/10.1145/3517031.3529645

⚠️ `[não verificado]` **Validação prática:** o Virtual Chinrest replicou um achado laboratorial de crowding visual (que depende de cálculo angular preciso) com 1.153 participantes online.
→ https://pubmed.ncbi.nlm.nih.gov/31969579/

⚠️ `[não verificado]` **Variante de enforcement:** alguns trabalhos usam o ponto cego não só para *estimar* mas para *impor* uma distância de sessão (ex.: 50 cm ± 3,5 cm), rejeitando a sessão fora da faixa.
→ https://pure.mpg.de/rest/items/item_3386007_3/component/file_3477673/content

**★ Insight:** o erro de 3,25 cm do blind-spot vira ~5–7% de erro angular a 50 cm — aceitável pra psicofísica, e provavelmente melhor do que o Gaze consegue com IPD populacional (a variação de IPD entre adultos é ~±5 mm sobre ~63 mm, ou seja ~8%). Os dois métodos são da mesma ordem de erro; a diferença é que o blind-spot mede uma vez e o IPD mede continuamente.

---

## 3. Normalização por dispositivo — o que deve ser constante

⚠️ `[não verificado]` **O que DEVE ser constante é o tamanho angular**, obtido pela calibração física px/mm por display.
→ https://dl.acm.org/doi/fullHtml/10.1145/3517031.3529645

⚠️ `[não verificado]` **Sobre luminância, a boa notícia:** em Thaler et al., o *tamanho* do alvo afetou o comportamento oculomotor (percentual de microssacadas formando square-wave jerks caiu e o intervalo intersacádico aumentou com alvos maiores), mas a **luminância do alvo NÃO** teve efeito significativo sobre microssacadas ou SWJ. Os autores pedem que estudos reportem o tamanho do alvo para replicabilidade.
→ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3628898/

⚠️ `[não verificado]` **Contraste ambiental:** protocolos clínicos de smooth pursuit rodam em ambiente escuro com o monitor como única fonte de luz, para maximizar contraste alvo–fundo e minimizar distratores.
→ https://www.nature.com/articles/s41598-022-12630-6

⚠️ `[não verificado]` **Limite duro do meio webcam:** WebGazer tem acurácia espacial média de ~4° de ângulo visual (~175–210 px de erro vs. tracker comercial); precisão online é pior que em lab (~18% do tamanho da tela). Isso obriga AOIs maiores.
→ https://www.cambridge.org/core/journals/judgment-and-decision-making/article/webcambased-online-eyetracking-for-behavioral-research/B726E77B68A76577F9BC6BB8F1EBC6E4

⚠️ `[não verificado]` **Latência temporal webcam é de ~200 ms a >1000 ms**, ordens acima de trackers de lab.
→ mesma fonte

**★ Insight:** a hierarquia que emerge é **tamanho angular (obrigatório) > contraste (importante, controlável) > luminância absoluta (dispensável)**. Isso é uma boa notícia operacional: o Gaze não precisa resolver calibração de brilho de tela, que seria impossível na web.

---

## 4. Design do alvo de fixação

⚠️ `[não verificado]` **Thaler et al. (2013, Vision Research): o alvo combinado bullseye + crosshair (o "ABC"/CCP — círculo + cruz + ponto central) é o melhor**, produzindo simultaneamente baixa taxa de microssacadas e baixa dispersão espacial durante a fixação.
→ https://pubmed.ncbi.nlm.nih.gov/23099046/

⚠️ `[não verificado]` **Tamanho recomendado: ~0,6° de ângulo visual** (valor amplamente citado do Thaler).
→ https://www.sciencedirect.com/science/article/pii/S0042698912003380

⚠️ `[não verificado]` **Replicação 2025 com eye-tracking retiniano:** diâmetro externo dos alvos (incl. a combinação CCP) de 1,02° e ponto central de 0,21°; testados em preto-sobre-cinza e branco-sobre-preto.
→ https://pmc.ncbi.nlm.nih.gov/articles/PMC12630294/

⚠️ `[não verificado]` **Velocidade de pursuit — a faixa útil:** smooth pursuit tipicamente < 30 °/s; acima disso a perseguição deteriora e o sujeito recorre a sacadas de catch-up (embora alguns indivíduos cheguem a 100 °/s).
→ https://www.tobii.com/resource-center/learn-articles/types-of-eye-movements

⚠️ `[não verificado]` **Protocolo clínico de pursuit:** alvo em velocidades crescentes até 20–40 °/s horizontal; velocidade média máxima do olho tipicamente mantida abaixo de 25 °/s (em geral < 50 °/s).
→ https://link.springer.com/article/10.1186/s43163-025-00895-3

⚠️ `[não verificado]` **Sacadas:** duração média 20–40 ms, correlacionada linearmente com a amplitude (relação da main sequence).
→ https://www.tobii.com/resource-center/learn-articles/types-of-eye-movements

**★ Insight:** o alvo de 0,6° é *menor* do que a acurácia do próprio tracker webcam (~4°) — o que confirma que o alvo pequeno serve pra **estabilizar o olho do usuário**, não pra ser resolvido pelo tracker. São funções separadas: o alvo controla o comportamento, a AOI controla a medida.

---

## 5. Distância variável sem chinrest — as três estratégias

⚠️ `[não verificado]` **Estratégia A (congelar):** WebGazer mapeia features do olho direto pra coordenadas de tela via calibração por interação e **não mede distância física alguma**; os participantes são simplesmente instruídos a sentar diante do display e os estudos adotam 50–70 cm (60 cm como referência).
→ https://cs.brown.edu/people/apapouts/papers/ijcai2016webgazer.pdf

⚠️ `[não verificado]` **Estratégia B (medir uma vez):** blind-spot / virtual chinrest, com enforcement opcional de faixa (50 cm ± 3,5 cm).
→ https://pure.mpg.de/rest/items/item_3386007_3/component/file_3477673/content

⚠️ `[não verificado]` **Estratégia C (medir continuamente — o caminho do Gaze):** sistemas de câmera frontal computam distância usuário–tela em tempo real a partir de features faciais como a distância interpupilar (IPD): mede-se a distância em pixels entre os olhos na imagem, combina-se com os intrínsecos da câmera e a IPD conhecida, e deriva-se a distância.
→ https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11849153

⚠️ `[não verificado]` **Por que a estratégia C importa:** estimação de gaze appearance-based (deep learning) é fortemente degradada pela variabilidade de pose da cabeça e distância usuário–câmera — o obstáculo central pra estimadores genéricos em ambientes não controlados.
→ https://arxiv.org/pdf/1901.10906

⚠️ `[não verificado]` **Mas C não é bala de prata:** um método de regressão que resolve o sistema de coordenadas 3D do gaze (sem assumir distância fixa) ainda degradou fortemente sob movimento lateral do corpo de ±100 mm — ~60 mm / 4° RMSE contra ~10 mm / 0,6° do Tobii. Os autores afirmam que a calibração exige posição estável da cabeça.
→ https://pmc.ncbi.nlm.nih.gov/articles/PMC11019238/

⚠️ `[não verificado]` **O teto atingível hoje:** combinando calibração de dispositivo (tela + distância), calibração de gaze e o melhor modelo deep-learning, um estudo online chegou a **2,58°** de acurácia — melhora sobre acurácias online anteriores.
→ https://pmc.ncbi.nlm.nih.gov/articles/PMC11133145/

**★ Insight:** o achado mais acionável de todos é o do movimento lateral ±100 mm degradando 4° — isso diz que **compensar distância (eixo Z) sem compensar posição lateral (eixo X/Y) resolve metade do problema**. O Gaze mede distância via IPD; vale checar se o pipeline também usa a posição do rosto no frame pra corrigir off-axis.

---

## Aplicação direta ao Gaze

**1. O PACK px/cm é inegociável — mas por um motivo diferente do esperado.**
Não é rigor acadêmico: sem px/cm, o `readingFontCssPx` de 1,2° e o `stimulusDistance` **não são 1,2° nem distância nenhuma** — são px vestidos de graus. A conversão atual assume um DPI que o navegador não garante (e o desktop do Anders com dpr 1,3375 é exatamente o caso patológico). Método recomendado: **cartão de crédito** (85,60 mm), que é o padrão de facto, tem implementação de referência no jsPsych e não depende de tarefa perceptual.

**2. A medição contínua de distância via IPD é a abordagem mais rigorosa das três — manter.**
O Gaze está na estratégia C enquanto o WebGazer (dominante) está na A. Isso é vantagem competitiva real, não overengineering. Erro esperado da mesma ordem do blind-spot (~5–8%).

**3. Verificar se o pipeline compensa deslocamento lateral, não só Z.**
O achado dos ±100 mm → 4° RMSE sugere que compensar só distância deixa erro na mesa. Como o Gaze já tem landmarks do MediaPipe, a posição do rosto no frame é informação disponível.

**4. Alvo de fixação: adotar Thaler CCP se ainda não for o caso.**
Bullseye + crosshair + ponto central, ~0,6° externo. Baixa dispersão + baixa taxa de microssacada = sinal mais limpo, e o custo de implementação é um SVG.

**5. Velocidade de pursuit: teto de 30 °/s, alvo em 20–25 °/s.**
Acima disso o usuário começa a fazer catch-up saccades — o que polui exatamente a métrica de fluxo temporal que o Gaze mede. Se o app hoje define velocidade em px/s, ela varia entre dispositivos e alguns usuários já estão sendo empurrados pra faixa sacádica sem que a medida saiba.

**6. Contraste sim, luminância não.**
Fundo escuro com alvo de alto contraste é prática clínica estabelecida. Já calibração de brilho absoluto pode ser abandonada sem culpa — Thaler mostrou que luminância do alvo não afeta o comportamento oculomotor medido.

---

## Buracos desta rodada (rodada única, por design)

- **24 claims load-bearing ficaram sem refutação adversarial** por teto de 12 agentes. Os mais consequentes para decisão são: a fórmula `57.3 × tamanho / distância`, o tamanho de 0,6° do Thaler, o teto de 30 °/s do pursuit, e a degradação de 4° sob movimento lateral. Se algum desses virar fundamento de decisão irreversível, vale uma rodada dirigida.
- **Nenhuma fonte encontrada trata especificamente de *exercício* oculomotor** (uso terapêutico repetido) — toda a literatura é de *medição* (psicofísica e diagnóstico). A transferência das normas de medição para exercício é uma suposição não testada desta pesquisa.
- **Gorilla e Labvanced não retornaram fontes primárias** — os finders cobriram PsychoPy, jsPsych, WebGazer e literatura acadêmica. Se a prática dessas duas plataformas importar, é uma busca dirigida separada.
- **Nada sobre mobile/tablet especificamente.** Toda a literatura de calibração assume desktop; o cartão de crédito num celular ocupa fração muito maior da tela, e as consequências disso não apareceram em nenhuma fonte.
