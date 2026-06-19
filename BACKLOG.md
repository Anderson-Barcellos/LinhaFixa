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
