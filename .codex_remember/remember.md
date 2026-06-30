Arquivo de continuidade do Codex neste repositorio. Nao confundir com notas do Claude nem com documentacao funcional do produto.

State:
PACK R1, R2a, R2 postural e Bundle R3 foram implementados. O diagnostico tem medidor de captacao visual funcional; a postura usa baseline da calibracao; e o motor ocular agora valida assinatura de calibracao, converte viewport->canvas antes de usar gaze calibrado e limpa a janela real da leitura assistida.

Next:
Proximo ponto recomendado: validar no iPhone/Safari se apos calibrar o ponto/sinal funcional segue ativo em landscape, se mudanca de viewport/orientacao derruba corretamente o uso do ponto calibrado, e se leituras finalizadas por tempo ainda aparecem com metricas oculares. Depois seguir para R4 line-aware quando Anders quiser mexer na contagem de regressao/retorno de linha.

Context:
Arquivos centrais recentes: `src/services/ocularSignalContract.ts`, `src/services/videoFrameLoop.ts`, `src/services/gazeCalibration.ts`, `src/exercises/assistedReading.ts`, `src/services/signalQuality.ts`, `src/components/CalibrationOverlay.tsx`, `src/components/ExerciseCanvas.tsx`, `src/screens/EyeTrackingTestScreen.tsx`, alem de `visualSignal.ts`, `posturalStability.ts` e `motionSensor.ts` dos bundles anteriores.

Validation:
Ultimo estado publicado: bundle `index-B01PRDLw.js`, `linhafixa.service` reiniciado, 60/60 testes passaram, `npx tsc --noEmit`, `npm run lint`, `APP_BASE_PATH=/gaze npm run build` e `git diff --check` passaram. Smokes: local/publico `/gaze/` 200, JS `application/javascript`, CSS `text/css`, `/gaze/dashboard` e `/gaze/eye-tracking-test` 200; Playwright com consentimento aceito carregou `Estatísticas` e `Dinâmica ocular de leitura` sem erro de console e confirmou `Iniciar captura` desabilitado quando captura nao pode iniciar.
