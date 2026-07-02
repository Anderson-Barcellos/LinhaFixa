Arquivo de continuidade do Codex neste repositorio. Nao confundir com notas do Claude nem com documentacao funcional do produto.

State:
Bundle "Geometria e consistencia desktop" publicado e refinado. Desktop agora usa superficie de diagnostico limitada/estavel; calibracao mira o retangulo real da superficie; diagnostico e calibracao mostram moldura rigida nomeada para deixar claro onde o teste acontece. Capturas salvam `environment` com layout, viewport, superficie, video, camera negociada e taxas medidas. 30 Hz calibrado e consistente nao e mais rebaixado automaticamente.

Next:
Teste manual recomendado no desktop real: Diagnostico -> iniciar camera -> calibrar -> captura. Conferir se a moldura "Area fixa de leitura e calibracao" coincide visualmente com "Area calibrada do teste" e se o relatorio mostra "Ambiente e camera" com camera negociada, FPS deteccao e taxa ocular separados.

Context:
Arquivos ativos: `src/screens/EyeTrackingTestScreen.tsx`, `src/components/CalibrationOverlay.tsx`, `src/types.ts`, `src/services/cameraTelemetry.ts`, `src/services/captureGeometry.ts`, `src/services/signalQuality.ts`, alem dos ajustes anteriores em `faceTracking`, `ExerciseCanvas` e `deviceProfile`. Plano do bundle em `docs/codex/plans/2026-07-01-geometria-consistencia-desktop.md`.

Validation:
Publicado em 2026-07-02: `linhafixa.service` ativo, bundle publico `/gaze/assets/index-Ct7H63IR.js`. Passaram `npx tsc --noEmit`, `node --import tsx --test $(rg --files -g '*.test.ts' src)` (71/71), `APP_BASE_PATH=/gaze npm run build`, `git diff --check`, curl publico `/gaze/` 200 com assets JS/CSS corretos e smoke Playwright/Chrome desktop com screenshots em `/tmp/gaze-diagnostic-frame.png` e `/tmp/gaze-calibration-frame.png`.
