# Validade do Instrumento — Design

**Data:** 2026-07-16

**Status:** implementado, publicado e aprovado por Anders em 2026-07-16

**Escopo:** contrato cientifico preservado como referencia; acompanhamento atual em
`BACKLOG.md`

> Este documento registra as decisoes do contrato de validade. Os planos de
> execucao foram removidos depois da entrega; qualquer texto prospectivo abaixo e
> contexto de design, nao uma tarefa ativa.

## Objetivo

Transformar calibração, continuidade de captura e comparabilidade temporal em
contratos explícitos e testáveis, sem reescrever a arquitetura atual do Gaze.
Uma medição insuficiente deve continuar consultável, mas nunca parecer mais
confiável do que a evidência permite.

O PACK cobre três problemas:

- calibrações podem ser ativadas sem um gate de erro, cobertura ou extrapolação;
- uma calibração do diagnóstico pode ser reutilizada numa superfície incompatível
  pelo player;
- capturas curtas, interrompidas ou temporalmente grosseiras podem receber um
  rótulo de comparabilidade excessivamente forte.

## Fora de escopo

- autenticação, rate limit e disclosure dos endpoints OpenAI;
- recuperação global do IndexedDB, importação e apagamento integral;
- paginação de recall, relatório mobile e demais refinamentos responsivos;
- calibração física de CSS px/cm;
- ativação do gate global de piscada;
- retuning clínico do detector I-VT ou dos thresholds posturais com dados reais.

Essas frentes permanecem separadas para que a validade do sinal possa ser
testada sem misturar segurança, UX ou alterações algorítmicas maiores.

## Decisão arquitetural

Será usada uma extensão incremental dos contratos existentes. Componentes React
continuam conduzindo câmera e fluxo; funções puras recebem fatos medidos e
retornam decisões com códigos estáveis. Não haverá máquina de estados global,
novo estado em Zustand ou refactor geral das telas.

As fronteiras são:

- `calibrationValidity`: avalia amostras por alvo, cobertura dos pontos, erro e
  extrapolação da validação;
- `captureValidity`: avalia duração, cobertura facial, fonte, FPS, gaps e
  interrupções da página;
- `ocularSignalContract`: continua dono da assinatura geométrica e passa a
  decidir se uma calibração pode ser reutilizada na superfície atual.

As telas não duplicam thresholds nem remontam razões. Relatório, exportação e
dashboard consomem o mesmo snapshot persistido.

## Gate de calibração

### Coleta

A grade continua com 9 alvos de ajuste e 5 pontos independentes de validação.
Cada alvo exige pelo menos 12 amostras válidas após os 450 ms de acomodação.

O timeout de 2.200 ms deixa de avançar com uma amostra parcial. Se o alvo não
alcançar 12 amostras, a tentativa termina rejeitada com razão específica. Se
nenhuma amostra chegar, a UI informa que rosto/olhos não foram detectados e
oferece nova tentativa ou continuação sem calibração.

### Aceitação

Uma calibração é aceita apenas quando satisfaz simultaneamente:

| Critério | Limite v1 |
|---|---:|
| Alvos de ajuste completos | 9/9 |
| Pontos de validação completos | 5/5 |
| Amostras mínimas por alvo/ponto | 12 |
| Erro médio de validação | `<= 5°` |
| Percentil 95 do erro de validação | `<= 8°` |
| Amostras de validação extrapoladas | `0` |

Erro médio e p95 são calculados sobre todas as amostras válidas dos cinco pontos
de validação, não sobre uma média de médias por ponto.

Os limites são conservadores para dinâmica ocular grosseira por webcam e ficam
centralizados numa versão de contrato. Alterá-los no futuro exige nova versão,
novos testes e reavaliação dos dados; não reclassifica silenciosamente registros
antigos.

O ridge pode existir transitoriamente para calcular a validação, mas
`isCalibrated()` só retorna `true` após a aceitação. Rejeição limpa o modelo
ativo, a assinatura e a âncora de distância.

### Resultado persistido

`CalibrationAssessment` contém:

- `contractVersion`, `id` e `createdAt`;
- `accepted` e `reasonCodes`;
- contagem de amostras por alvo de ajuste e validação;
- quantidade de pontos completos;
- erro médio, p95 e contagem de extrapolações;
- assinatura geométrica aceita, quando houver.

Os códigos v1 incluem `calibration-insufficient-target-samples`,
`calibration-missing-fit-points`, `calibration-missing-validation-points`,
`calibration-high-mean-error`, `calibration-high-p95-error` e
`calibration-extrapolated-validation`.

## Compatibilidade diagnóstico → player

Antes de pular a calibração, o player consulta `ocularSignalContract` com a
assinatura salva e o contexto real do exercício: viewport, orientação, DPR,
retângulo da superfície e aspecto do vídeo.

- assinatura compatível: o player pode reutilizar o modelo;
- assinatura incompatível: o player oferece recalibração e mostra as razões;
- continuação sem recalibrar: o exercício segue em sinal bruto/exploratório;
- uma incompatibilidade nunca fica escondida como perda silenciosa de gaze.

A mesma decisão é usada por `ExerciseCanvas`; o player e o canvas não mantêm
critérios diferentes.

## Gate de captura

### Snapshot inicial

Ao iniciar uma captura, ficam congelados:

- condições declaradas de iluminação, postura e distância;
- assinatura e avaliação da calibração usada;
- geometria, orientação, DPR, vídeo e perfil temporal;
- instante monotônico inicial.

Alterar controles durante a janela não muda retroativamente a proveniência.

### Tiers temporais

| Tier | Taxa efetiva | Semântica v1 |
|---|---:|---|
| `high-temporal` | `>= 45 Hz` | pode ser comparável se todos os demais gates passarem |
| `coarse-temporal` | `>= 24 Hz` e `< 45 Hz` | sempre exploratório na v1 |
| `insufficient-temporal` | `< 24 Hz` ou ausente | inválido para dinâmica temporal |

O detector I-VT não será retunado neste PACK. Golden traces em 60, 50, 30 e
24 Hz documentam a sensibilidade atual. Só uma versão posterior, sustentada por
traces e dados reais, poderá promover o tier grosseiro a comparável.

### Decisão da captura

Para receber `comparable`, uma captura precisa cumprir simultaneamente:

| Critério | Limite v1 |
|---|---:|
| Duração monotônica real | `>= 20.000 ms` |
| Cobertura facial | `>= 80%` |
| Proporção da fonte selecionada | `>= 90%` |
| Fonte | calibrada e geometricamente compatível |
| Tier temporal | `high-temporal` |
| Interrupções de página | nenhuma |
| Gaps consecutivos acima de 200 ms | nenhum |

Os limites são inclusivos: exatamente 20 s, 80%, 90%, 24 Hz e 45 Hz seguem as
faixas descritas nas tabelas.

A decisão final possui três graus:

- `comparable`: todos os gates estritos passaram;
- `exploratory`: existe sinal utilizável, mas ao menos uma limitação impede
  comparação forte, como 24–44 Hz, fonte inconsistente, gap acima de 200 ms ou
  metadado legado;
- `invalid`: interrupção de página, duração abaixo de 20 s, taxa abaixo de 24 Hz,
  fonte indisponível ou ausência de evidência temporal suficiente.

`CaptureValiditySnapshot` persiste `contractVersion`, `assessedAt`, `grade`,
`reasonCodes`, duração, cobertura, fonte, proporção da fonte, taxa, tier,
contagem de gaps e interrupção. `ValidationCapture` também passa a guardar
`durationMs` e a referência da `CalibrationAssessment` usada.

## VC4 — ciclo de vida da página

Durante captura ativa:

- `visibilitychange` para estado diferente de `visible` interrompe a captura;
- `pagehide` interrompe a captura e impede retomada pelo mesmo estado;
- voltar à página nunca concatena amostras anteriores e posteriores;
- as razões persistidas são `page-hidden-during-capture` para ocultação e
  `pagehide-during-capture` para descarga/BFCache;
- uma captura interrompida permanece consultável como inválida quando o runtime
  continua vivo.

Em teardown definitivo, a persistência é best-effort: se o navegador encerrar a
página antes do IndexedDB concluir, o app não promete que o registro parcial foi
salvo. O requisito obrigatório é impedir que ele reapareça como captura válida.

## Métricas sem sentinela fisiológica

Ausência de evidência usa `null`, não zero:

- `meanFixationMs` é `null` quando nenhuma fixação pode ser estimada;
- amplitude média é `null` quando nenhum evento foi detectado;
- latência e ganho do ground truth interno são `null` sem eventos pareados.

Interfaces exibem “não estimável”. Séries e médias ignoram `null`; não o
convertem em zero. Registros legados preservam o payload original, mas não usam
zero legado como prova de medida válida.

## Consumidores e UX

### Calibração

Rejeição mostra o motivo principal e ações “Tentar novamente” e “Continuar sem
calibração”. Não existe avanço eterno no primeiro ponto nem sucesso sem gate.

### Player

Incompatibilidade explica que a superfície ou configuração mudou. A pessoa pode
recalibrar ou continuar em modo bruto, com a consequência visível.

### Relatório diagnóstico

Um selo principal mostra `Comparável`, `Exploratória` ou `Inválida`. Abaixo dele
aparecem razões objetivas e os fatos medidos. Captura interrompida usa a mensagem
“Captura não utilizável — a página perdeu visibilidade”.

### Dashboard

Somente capturas `comparable` alimentam tendências comparáveis. O dashboard não
mistura tiers temporais, fontes ou orientações na mesma série. Exploratórias e
inválidas continuam listadas numa área separada para auditoria.

### Persistência

Falha ao salvar mantém o relatório em memória, marca “não salvo” e oferece nova
tentativa. A UI não declara sucesso antes da confirmação do IndexedDB.

## Compatibilidade com dados antigos

Não haverá migração destrutiva. Registros sem `CaptureValiditySnapshot` recebem
em leitura a razão `legacy-unassessed` e grau `exploratory`. Exportações mantêm o
shape anterior e acrescentam os novos campos quando disponíveis.

O contrato versionado garante que mudanças futuras de thresholds não alterem o
significado histórico de um snapshot já persistido.

## Estratégia de testes

### Unidades puras

- limites exatos de 5°, 8°, 12 amostras, 20 s, 80%, 90%, 24 Hz e 45 Hz;
- alvo incompleto, ponto ausente, extrapolação e modelo rejeitado;
- tiers temporais e combinações de razões;
- legado sem snapshot;
- compatibilidade e incompatibilidade de superfície, orientação, DPR e vídeo;
- métricas sem eventos retornando `null`;
- golden traces caracterizam a mesma transição em 60, 50, 30 e 24 Hz: a v1
  protege a detecção no tier alto e documenta a perda esperada no tier grosseiro.

### Ciclo de vida e integração

- captura ativa interrompida por `visibilitychange`;
- captura ativa interrompida por `pagehide`;
- retorno à página sem retomada/concatenação;
- diagnóstico calibrado seguido de player com superfície incompatível;
- timeout de calibração sem rosto e com amostras insuficientes;
- falha de persistência sem mensagem de sucesso.

### Smoke visual

Playwright cobre desktop, monitor vertical, iPhone portrait e iPhone landscape:
calibração rejeitada, convite de recalibração, captura interrompida e selos do
relatório. O smoke existente de geometria continua obrigatório.

### Gate de entrega

- suíte completa de testes;
- `npx tsc --noEmit`;
- `APP_BASE_PATH=/gaze npm run build`;
- `git diff --check`;
- restart de `linhafixa.service`;
- smoke local e público de `/gaze/`;
- revisão manual de Anders no iPhone/Safari.

Nenhum bundle é marcado como fechado sem a revisão de Anders.

## Execução multiagente

A implementação usará `superpowers:subagent-driven-development` após um plano
TDD aprovado:

- um implementador novo por unidade isolada;
- commit próprio e autorrevisão por implementador;
- revisor independente de spec e qualidade após cada unidade;
- correções retornam ao implementador e passam por nova revisão;
- um revisor final avalia o PACK completo;
- o agente principal mantém arquitetura, integração, verificação e deploy.

Implementadores não editam o monorepo em paralelo. O isolamento vem do contexto
focado e da revisão independente, evitando conflitos em telas compartilhadas.

## Critérios de aceite do PACK

O PACK estará pronto para revisão quando:

- calibração rejeitada não ativa `isCalibrated()`;
- player nunca reutiliza silenciosamente uma assinatura incompatível;
- captura perde validade imediatamente ao ocultar ou descarregar a página;
- a classificação v1 aplica todos os limites nas fronteiras exatas;
- métricas ausentes aparecem como “não estimável”, nunca zero fisiológico;
- dashboard separa graus, tiers, fontes e orientações;
- legado continua legível e é explicitamente exploratório;
- testes, TypeScript, build, smoke e runtime publicado passam;
- nenhuma frente fora de escopo foi incorporada por conveniência.
