# Design — Carregamento e performance adaptativos

**Data:** 2026-07-17

**Status:** Desenho aprovado por Anders; especificação escrita aguardando revisão final

**Escopo:** Entrega do frontend, aquecimento oportunista da câmera, cache e gates de performance do Gaze em `/gaze`.

## Contexto e baseline

O código-fonte é modular, mas `src/App.tsx` importa todas as telas estaticamente. O build
atual entrega quase toda a aplicação em um único `index-*.js` de aproximadamente 973 KB
minificado e 295 KB gzip. Esse pacote inicial inclui telas nunca visitadas na sessão, o
Dashboard com Recharts e o carregador JavaScript do MediaPipe.

O modelo facial (~3,76 MB) e o WASM do MediaPipe (~10,5–11,2 MB por variante) continuam
separados e só são buscados durante a inicialização do rastreamento. O Apache já comprime
JavaScript com gzip, mas os assets públicos de `/gaze` respondem atualmente com
`Cache-Control: public, max-age=0`, inclusive quando o nome contém hash de conteúdo.

## Objetivos

- Fazer consentimento e início aparecerem sem transferir ou analisar código de telas pesadas.
- Aquecer recursos de câmera por oportunidade e intenção, sem bloquear a interface.
- Evitar baixar modelo/WASM numa sessão que não usa câmera.
- Tornar cache e orçamento de bundle contratos verificáveis, não ajustes informais.
- Preservar integralmente o comportamento clínico e visual já aprovado.

## Não objetivos

- Alterar calibração, detector, thresholds, captura, métricas, persistência clínica ou layout.
- Criar service worker, PWA ou promessa de funcionamento offline.
- Fazer refatoração geral de componentes sem relação direta com as fronteiras de carregamento.
- Executar o futuro PACK de repetibilidade e sanidade do instrumento nesta frente.

## Arquitetura de entrega

### Núcleo inicial

O entrypoint mantém somente o necessário para hidratação, consentimento, roteamento e tela
inicial. `ConsentScreen` e `HomeScreen` permanecem prontas no carregamento inicial; as demais
telas passam a fronteiras assíncronas com `React.lazy` e um fallback visual neutro.

As fronteiras funcionais serão:

- núcleo: store, hidratação, consentimento, início e navegação;
- exercícios: biblioteca e player;
- estatísticas: Dashboard e suas dependências Recharts/Redux/D3;
- diagnóstico: tela de eye tracking, calibração e componentes de câmera;
- runtime facial: `@mediapipe/tasks-vision`, isolado atrás de `import()` dinâmico.

Separar rotas não autoriza duplicar módulos comuns. O build deve extrair dependências
compartilhadas quando houver ganho real, sem configurar chunks manuais que voltem a ser
precarregados no HTML inicial.

### Runtime facial

`faceTracking.ts` preservará sua API pública e suas decisões clínicas. A dependência de
`@mediapipe/tasks-vision` deixa de ser um import de runtime estático e passa a ser obtida por
um loader interno assíncrono. Uma promessa compartilhada representa cada tentativa ativa,
impedindo downloads ou criações simultâneas do `FaceLandmarker`.

Os estados operacionais serão `idle`, `loading`, `ready` e `failed`. Falha em aquecimento
limpa a promessa rejeitada para permitir nova tentativa quando houver demanda real. O
fallback existente GPU → CPU permanece exatamente no ponto de criação do detector.

## Aquecimento adaptativo em dois níveis

### Nível 1 — código leve durante ociosidade

Depois de hidratação e consentimento, o orquestrador aguarda a aba estar visível e o browser
estar ocioso. Então antecipa somente o chunk funcional de câmera; não importa o runtime
MediaPipe, não baixa modelo/WASM e não solicita permissão de câmera.

`requestIdleCallback` será usado quando disponível. Safari recebe fallback por timer curto,
sempre rechecando visibilidade antes de iniciar. Se a aba ficar oculta, o trabalho ainda não
iniciado é cancelado e reavaliado quando ela voltar.

### Nível 2 — runtime pesado diante de intenção

Intenção explícita de abrir diagnóstico ou exercício com câmera antecipa o runtime facial,
WASM e modelo. Eventos de intenção podem incluir `pointerdown`, foco/ativação do controle e a
própria navegação. A entrada efetiva na tela chama a mesma função compartilhada, portanto não
duplica a inicialização se o aquecimento já estiver em curso.

Permissão e stream de câmera continuam sendo solicitados apenas dentro do fluxo visível da
tela. Nenhum preload em segundo plano pode abrir câmera, acender seu indicador ou começar
detecção facial.

## Cache HTTP

- HTML: `no-cache, must-revalidate`, para sempre descobrir o build atual.
- Assets com hash em `/gaze/assets/`: `public, max-age=31536000, immutable`.
- MediaPipe: arquivos publicados sob caminho que inclua a versão fixada da dependência e,
  por isso, seguros para `public, max-age=31536000, immutable`.
- API e dados pessoais: nenhuma ampliação de cache.
- Compressão gzip atual do Apache: preservada e verificada no deploy.

A política deve ser aplicada no menor escopo possível ao Gaze. Se a implementação tocar o
servidor Express ou Apache, `/etc/apache2/APACHE.md` deve registrar a política operacional
efetiva depois da validação pública.

## Contrato de performance

O orçamento inicial é de no máximo **180 KB gzip de JavaScript bloqueante**. O cálculo soma
o entrypoint e todos os imports estáticos transitivos requisitados pelo HTML; dividir um
arquivo em vários chunks ainda eager não reduz artificialmente a métrica.

Também são invariantes:

- Recharts/Redux/D3 não são transferidos antes da abertura do Dashboard;
- modelo e WASM não são transferidos antes de intenção explícita de câmera;
- o período ocioso pode baixar código leve de câmera, mas não iniciar o detector;
- cada recurso e cada inicialização pesada têm no máximo uma tentativa concorrente;
- a primeira entrada numa tela aquecida não pode repetir download nem recriar o detector.

Se a primeira implementação correta ficar acima de 180 KB, o gate continua vermelho. O peso
remanescente deve ser analisado; o limite não será aumentado apenas para fazer o build passar.

## Falhas e atualização de versão

Falha de preload é silenciosa e não bloqueia navegação. A demanda real repete a tentativa e,
se falhar, usa a apresentação de indisponibilidade já existente na câmera.

Uma aba antiga pode tentar importar um chunk removido depois de novo deploy. O carregador
de rota detectará falha compatível com chunk obsoleto e oferecerá uma única recuperação
controlada por recarga, protegida por marcador de sessão para não criar loop. Não haverá
recarga automática durante captura ou diante de erro clínico genérico.

## Testes e gates

1. Testes unitários cobrem estado/promessa única, cancelamento por aba oculta, fallback de
   ociosidade e retry depois de preload falho.
2. Um gate de bundle lê o manifest do Vite, soma entrypoint + imports estáticos transitivos em
   gzip e aplica o orçamento de 180 KB.
3. Smoke de rede observa abertura, liberação do período ocioso e intenção de câmera; comprova
   quando cada chunk e cada asset MediaPipe podem aparecer.
4. As rotas lazy são abertas diretamente sob o basename `/gaze`, incluindo refresh, fallback
   de carregamento e Dashboard.
5. Fechamento mantém suite completa, TypeScript, build `/gaze`, smokes existentes, restart de
   `linhafixa.service`, headers local/público e `apache2ctl configtest` quando aplicável.

## Critérios de conclusão

- JavaScript bloqueante inicial em até 180 KB gzip pelo gate transitivo.
- Entrada pública continua funcional e visualmente equivalente.
- Dashboard e MediaPipe comprovadamente ausentes do carregamento bloqueante inicial.
- Aquecimento leve ocorre somente em aba visível e ociosa; aquecimento pesado exige intenção.
- Câmera real continua respeitando permissão, fallback GPU → CPU e lifecycle atual.
- Cache público corresponde à política por classe de recurso, sem ampliar cache de API/dados.
- Nenhuma regressão nos gates funcionais, de validade ou de layout já existentes.

## Sequenciamento posterior

Após Anders revisar esta especificação, o próximo artefato desta frente será o plano de
implementação. O **PACK Repetibilidade e Sanidade do Instrumento** fica enfileirado para uma
sessão posterior, quando esta frente for fechada; ele reunirá repetibilidade teste–reteste,
telemetria de sanidade e calibração orientada pelos dados reais do iPhone, sem antecipar seus
bundles neste documento.
