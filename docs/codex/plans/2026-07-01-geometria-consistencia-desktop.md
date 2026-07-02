# Plano Codex: Geometria e Consistencia Desktop

Arquivo de planejamento do Codex neste repositorio. Nao confundir com notas do Claude nem com documentacao funcional do produto.

## Objetivo

Tornar a captura ocular mais comparavel sem exigir FPS fixo: o app deve pedir o melhor sinal que camera/browser permitirem, manter a superficie de leitura/captura geometricamente estavel, registrar metadados reais do ambiente e reorganizar o relatorio para julgar consistencia entre capturas.

## Decisoes aprovadas

- FPS nao sera gate duro: 30 Hz pode ser valido quando cobertura, calibracao, continuidade e movimento horizontal fizerem sentido.
- O layout decide na pratica: desktop ganha superficie estavel; mobile/touch segue acessivel em modo compacto, sem texto proibitivo.
- Nao reabrir `saccadeAnalysis.ts` neste bundle.
- Nao prometer palavra exata, microssacadas ou precisao laboratorial.

## Escopo do bundle

### 1. Telemetria de camera e pipeline

Adicionar uma leitura centralizada de metadados do stream/video:

- camera negociada: largura, altura, frameRate de `MediaStreamTrack.getSettings()`
- capacidade declarada quando disponivel: `getCapabilities().frameRate`, width e height
- video real carregado: `video.videoWidth` e `video.videoHeight`
- taxa de deteccao: loop recente do MediaPipe/video frame
- taxa ocular efetiva: amostras validas usadas em `analyzeSaccades()`

Resultado esperado: a UI diferencia "camera negociada", "deteccao" e "taxa ocular", evitando tratar 30 Hz como falha automatica.

### 2. Superficie de leitura/captura estavel

Criar uma unidade pura para calcular a geometria recomendada da superficie em desktop:

- largura minima e maxima
- altura minima e maxima
- proporcao alvo ou faixa aceitavel
- fallback compacto para touch/viewport pequeno

Integrar em `EyeTrackingTestScreen` sem refatorar a tela inteira. A superficie deve continuar responsiva, mas nao deve crescer/encolher a ponto de mudar radicalmente a calibracao.

### 3. Assinatura de captura

Persistir junto de cada `ValidationCapture` um resumo de ambiente suficiente para comparar capturas:

- viewport e devicePixelRatio
- retangulo da superficie de leitura/captura
- video/camera negociados
- modo de layout efetivo
- orientacao

Resultado esperado: duas capturas podem ser comparadas sabendo se foram feitas em geometria semelhante.

### 4. Qualidade do sinal mais honesta

Ajustar `signalQuality` para nao exigir `>=45 Hz` como condicao absoluta de comparavel.

Regra sugerida:

- `baixo-sinal`: poucas amostras, baixa cobertura, fonte indisponivel ou movimento funcional insuficiente
- `exploratorio`: sinal presente, mas sem calibracao ou geometria/metadados incompletos
- `comparavel`: calibrado, cobertura boa, amostras suficientes, geometria registrada e taxa ocular efetiva minimamente aceitavel

O limiar de taxa deve aceitar 30 Hz como comparavel quando o restante do contexto for forte.

### 5. Relatorio por consistencia

Reorganizar o relatorio de captura em secoes:

- Consistencia: classificacao geral, motivo, comparabilidade com capturas anteriores quando houver
- Dinamica ocular: sacadas, regressoes, fixacao media, amplitude, varredura horizontal
- Ambiente/camera: camera negociada, deteccao, taxa ocular, fonte, cobertura
- Postura: estabilidade cervical, baseline, yaw/pitch/delta aparelho
- Dados brutos resumidos: amostras, H/V range, continuidade, eixo dominante

Manter linguagem curta e operacional. O relatorio deve ajudar Anders a decidir se a captura "serve para comparar", nao apenas mostrar numeros.

## Arquivos provaveis

- `src/services/cameraStream.ts`
- `src/services/videoFrameLoop.ts`
- `src/services/ocularSignalContract.ts`
- `src/services/signalQuality.ts`
- `src/services/visualSignal.ts`
- `src/services/validationCapture.ts`
- `src/services/deviceProfile.ts`
- `src/screens/EyeTrackingTestScreen.tsx`
- `src/types.ts`
- testes novos ou ajustados em `src/services/*.test.ts`

## Validacao planejada

- Testes unitarios das unidades puras de geometria, telemetria e qualidade do sinal.
- Suite completa de testes TypeScript.
- Build com `APP_BASE_PATH=/gaze`.
- Smoke manual/browser da tela de diagnostico em desktop, confirmando que o relatorio mostra camera negociada, deteccao e taxa ocular separadas.

## Fora do escopo

- Mudar o detector de sacadas.
- Fazer calibracao nova baseada em outro modelo.
- Tornar iPhone caminho primario de captura.
- Criar relatorio clinico longitudinal completo.

