# Pré-processamento de imagem para MediaPipe FaceLandmarker — vale a pena?

**Data:** 2026-07-29 · **Método:** pesquisa-light (4 finders + 7 refutadores, 11 agentes) ·
**Pergunta:** pipelines de pré-processamento client-side (crop, brilho/contraste) comprovadamente
melhoram os landmarks do MediaPipe em webcam/browser, especialmente em iluminação ruim?

## TL;DR

1. **Crop manual antes do `detectForVideo()` é redundante** — CONFIRMADO por 3 claims
   independentes. O pipeline já é dois estágios (BlazeFace acha o rosto → modelo de landmarks
   roda só no ROI), e em modo vídeo o ROI vem dos landmarks do frame anterior. Não gastar
   tempo nisso.
2. **Não existe evidência quantitativa de que CLAHE/gamma/equalização melhore os landmarks
   do MediaPipe** — achado negativo CONFIRMADO por refutador independente. A literatura usa
   essas técnicas como etapa metodológica, mas ninguém publicou ablation com/sem.
3. **O caminho mais promissor é domar a câmera na fonte** (`applyConstraints` com
   `exposureMode`/`exposureTime`), não filtrar o frame depois — funciona no Chrome/Windows
   desde o Chrome 101, com gotchas documentados. `[não verificado — fonte única prática]`
4. **Iluminação física continua sendo o melhor "pré-processamento"**: o jeelizPupillometry
   (pipeline WebGL completo de pupilometria) recomenda explicitamente controle de luz físico
   em vez de enhancement por software. `[não verificado]`

## Confirmado (sobreviveu a refutação independente)

### Arquitetura do MediaPipe torna crop manual redundante

- O pipeline Face Mesh/FaceLandmarker é **dois estágios**: BlazeFace detecta o rosto na
  imagem inteira e o modelo de landmarks 3D opera apenas sobre o crop/ROI dessa detecção.
  ([wiki oficial](https://github.com/google-ai-edge/mediapipe/wiki/MediaPipe-Face-Mesh),
  confirmado em mirror independente chuoling.github.io)
- Em **modo vídeo/tracking**, o ROI é derivado dos landmarks do frame anterior; o detector
  só é reinvocado quando o rosto se perde. O pipeline já mantém um crop justo do rosto
  entre frames.
- A doc oficial afirma verbatim que o rosto acuradamente cropado "reduz drasticamente a
  necessidade de augmentations afins", dedicando a capacidade da rede à precisão de
  coordenadas — o benefício do crop já é capturado internamente.

**Implicação Gaze:** zoom/crop por canvas antes do `detectForVideo()` = custo sem ganho.

### Enhancement fotométrico: sem evidência quantitativa

- Papers de drowsiness/eye-tracking usam CLAHE, histogram equalization e gamma correction
  como etapa de robustez a iluminação (ex.: [arXiv 2001.05137](https://arxiv.org/pdf/2001.05137);
  [arXiv 2604.22479](https://arxiv.org/html/2604.22479v1) aplica CLAHE **depois** dos
  landmarks, nos crops de olho/boca) — mas é **uso metodológico, sem ablation controlada**
  medindo efeito na precisão dos landmarks.
- Busca dedicada + refutador independente **não encontraram** paper, benchmark ou issue com
  ablation com/sem pré-processamento sobre landmarks do MediaPipe em baixa luz. O que existe
  de quantitativo é para **detectores** de face (DSFD/RetinaFace + R2RNet, AP 17→34% em
  low-light) — modelo diferente, não transferível direto.

**Implicação Gaze:** implementar CLAHE/gamma seria aposta sem evidência publicada. Se um dia
fizer, medir na própria série (A/B com a métrica de qualidade de gaze do app) — a literatura
não responde por nós.

## Refutado (em parte)

- ~~"Issue #3208 do MediaPipe aberta sobre degradação em low-light"~~ — a issue **existe e a
  substância se confirma** (degradação significativa no escuro, usuário sugeriu histogram
  equalization, sem endosso de maintainer), mas está **fechada** (stale) e trata de **hand
  tracking**, não face/iris. Vale como sinal de que o problema é conhecido e sem fix oficial
  upstream, não como evidência específica de face landmarks.

## Não verificado (1 rodada só; teto de 7 refutadores — 13 claims ficaram sem refutação)

Plausíveis e citáveis com ressalva:

- **Modelos internos**: BlazeFace short-range tem entrada 128×128 e o model card lista
  sensibilidade a iluminação extrema; modelo de landmarks opera em 256×256 ou 128×128.
  Corolário interessante: com entrada 128×128 no detector, a resolução 1280×720 da nossa
  captura já é sobra — mais um argumento contra crop manual.
- **A Task API JS já faz resize/rotação/normalização de valores internamente** — mas **não**
  enhancement fotométrico (contraste/gamma). ([doc oficial](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js))
- **Controle de exposição via `applyConstraints`** ([webrtcHacks](https://webrtchacks.com/bad-lighting-fix-with-javascript-webcam-exposure/),
  única fonte prática com teste real Chrome+Windows):
  - `exposureMode`/`exposureTime` funcionam no Chrome/Windows desde o **Chrome 101**.
  - Gotcha: `exposureMode:'manual'` e `exposureTime` em **duas chamadas separadas** de
    `applyConstraints()` — juntos, o `exposureTime` é ignorado silenciosamente.
  - Configuração **persiste no hardware** da webcam após fechar o site — resetar em
    `beforeunload`.
  - `brightness`/`contrast`/`whiteBalanceMode`: constam na spec W3C mas **sem confirmação
    prática** de funcionarem em webcams comuns no Windows.
  - Conjunto real disponível varia por SO/driver/câmera — só `track.getCapabilities()` em
    runtime diz a verdade (Chrome usa IAMCameraControl/DirectShow no Windows).
- **Performance de pré-processar por canvas/WebGL**: WebGL ~1.66× mais rápido que canvas 2D
  por frame; operações per-pixel a 60fps em shader vs 5-10fps em CPU; readback GPU→CPU
  ~5ms num budget de 33ms — viável, mas é custo permanente por frame.
- **Achado negativo**: nenhum repo público encontrado combinando CLAHE/equalização
  client-side antes do MediaPipe em JS; WebGazer, jeeliz e afins não documentam estágio
  fotométrico. O jeelizPupillometry recomenda **controle físico de iluminação** em vez de
  software.

## Recomendação para o Gaze

1. **Não implementar crop/zoom** — redundante com o ROI interno (confirmado).
2. **Não implementar CLAHE/gamma agora** — sem evidência, custo por frame permanente, e
   nosso baseline pessoal (comparabilidade da série) sofreria com mudança de pipeline.
3. **Se o auto-exposure do Windows incomodar na prática** ("bêbado dirigindo em curva"):
   o experimento barato é `track.getCapabilities()` na webcam real do Anders e, se
   `exposureMode` manual existir, travar exposição via `applyConstraints` (duas chamadas,
   reset em `beforeunload`). Isso estabiliza o sinal na fonte sem tocar no pipeline de
   análise — preserva comparabilidade da série.
4. **Iluminação física** (luz frontal difusa, sem backlight) segue sendo a intervenção de
   maior ganho por esforço.

## Buracos desta rodada (1 rodada única, por design da pesquisa-light)

- 13 claims load-bearing ficaram sem refutação (teto de 7) — os principais estão na seção
  "não verificado".
- Não foi coberto: WebGPU compute para enhancement; comportamento do auto-exposure
  específico de modelos de webcam; MediaPipe Iris/blendshapes vs low-light em separado.
