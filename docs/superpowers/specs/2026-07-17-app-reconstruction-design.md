# Design — Reconstrucao do App Linha Fixa

**Data:** 2026-07-17

**Status:** Direcao aprovada por Anders; especificacao refinada com a estrategia de reconstrucao da fatia 1

**Escopo:** Reconstrucao estrutural do app publicado em `/gaze`, cobrindo layout, organizacao das secoes, fluxo de avaliacao/recall, persistencia duravel e reorganizacao da area de estatisticas.

## Contexto e motivacao

O estado atual do produto mistura tres preocupacoes num mesmo conjunto de telas:
medicao ocular, dashboard longitudinal e armazenamento local. O resultado funciona,
mas a arquitetura visual e tecnica ainda esta muito concentrada em poucos pontos,
principalmente `EyeTrackingTestScreen.tsx`, `DashboardScreen.tsx` e `storage.ts`.

O mockup aprovado de `Progresso` definiu a direcao desejada para o shell do app:
barra lateral clara, filtros no topo, metricas-resumo, aba `Meu progresso`,
aba `Qualidade da medicao`, bloco principal de leitura/recall e painel lateral de
contexto. A partir dele, a reconstrucao precisa deixar de ser um ajuste de tela e
passar a ser uma reorganizacao do produto inteiro.

## Objetivos

- Separar o produto em duas camadas claras:
  - shell claro para navegacao, historico, configuracoes e progresso;
  - superficie escura imersiva para calibracao, leitura, captura ocular e recall.
- Reorganizar as secoes principais em `Hoje`, `Treino`, `Avaliacao`, `Progresso`,
  `Historico` e `Configuracoes`.
- Transformar `Leitura + Recall` num fluxo dedicado, com estados explicitos e sem
  depender de modal improvisado dentro do diagnostico.
- Evoluir a persistencia de `IndexedDB` puro para `local-first + sync com SQLite`.
- Preservar a logica ocular-first de comparabilidade ja existente nas estatisticas.

## Nao objetivos

- Nao fazer hotfix isolado do widget antigo de Recall antes da reconstrucao.
- Nao substituir as rotas atuais de IA; elas permanecem separadas da persistencia.
- Nao criar sistema completo de contas/autenticacao nesta primeira fase.
- Nao alterar a semantica clinica das metricas oculares ja aprovadas sem nova frente
  especifica de validacao cientifica.

## Estrategia de reconstrucao

A reconstrucao desta frente nao sera um reskin das telas atuais nem um rewrite
integral do app e do backend ao mesmo tempo. A estrategia aprovada e um
`shell novo + camada de adaptacao`, em que a fachada do produto muda de forma
agressiva, mas os servicos centrais continuam como fonte de verdade.

### Abordagem aprovada

- o frontend novo nasce com shell, navegacao, hierarquia e estados novos;
- o backend e os servicos atuais continuam livres para evoluir, sem o frontend
  novo depender da costura visual antiga;
- a integracao entre os dois lados passa por uma camada fina de adaptacao,
  evitando que a UI nova converse diretamente com a complexidade atual de
  `EyeTrackingTestScreen.tsx`;
- a migracao acontece por fatias, e nao por troca completa de todo o app.

### Fatia 1 aprovada

A primeira fatia funcional da reconstrucao sera `Avaliacao/Leitura+Recall`.
`Progresso` continua sendo a referencia visual principal do shell e do design
system, mas nao e a primeira entrega navegavel. A intencao e atacar primeiro o
centro do uso clinico e deixar o dashboard como segunda camada da reconstrucao.

## Arquitetura de produto

### Shell do app

O app passa a ter uma espinha dorsal unica, clara e consistente, com sidebar fixa em
desktop e navegacao compacta em mobile. As secoes terao os seguintes papeis:

- `Hoje`: ponto de entrada operacional com status rapido, ultimo sync, proxima acao
  sugerida e atividade recente.
- `Treino`: sessao guiada e biblioteca de exercicios.
- `Avaliacao`: diagnostico, calibracao, captura ocular e fluxo de recall.
- `Progresso`: dashboard longitudinal.
- `Historico`: timeline de sessoes, capturas e testes de recall com drill-down.
- `Configuracoes`: perfil, distancia, preferencias de leitura, dados e backup.

### Superficie de avaliacao

O fluxo de avaliacao deixa de ser um conjunto de overlays dispersos e passa a seguir
uma maquina de estados visivel:

- preparo
- carregando texto
- texto pronto
- capturando
- gerando questoes
- questionario
- resultado

`Leitura + Recall` deixa de ser um modo encaixado dentro do diagnostico antigo e
passa a ser um fluxo nativo da experiencia. `Captura simples` continua existindo,
mas como variante do mesmo percurso, e nao como uma tela paralela com logica
propria.

Em desktop largo, a superficie principal ocupa a maior area util e o chrome lateral
fica subordinado a ela. Em mobile portrait, o fluxo empilha blocos. Em mobile
landscape curto, o espaco e priorizado para leitura e captura, com chrome minimo.

## Sistema de layout

O design system base sera extraido do mockup aprovado de `Progresso`.

### Principios

- shell claro para uso administrativo e leitura de historico;
- superficie escura para medicao;
- filtros e metricas no topo de `Progresso`;
- tipografia de interface separada da tipografia do estimulo visual;
- comparabilidade e auditoria tratadas como elementos de primeira classe.

### Modos responsivos obrigatorios

- desktop largo com sidebar fixa;
- mobile portrait com fluxo empilhado;
- mobile landscape curto com prioridade total para a area de medicao.

## Persistencia e backend

### Estrategia geral

- `IndexedDB` continua sendo a fonte imediata e offline.
- `SQLite` entra como espelho duravel no servidor.
- O contrato e `local-first`, com outbox local e sincronizacao assincrona.
- a reconstrucao do frontend nao deve impor restricoes artificiais ao backend;
  quanto mais liberdade os contratos reais preservarem, melhor.

### Camada de adaptacao do frontend

O shell novo nao deve importar comportamento diretamente da tela antiga.
Aprovamos uma camada pequena de `view-models` e `actions` para expor ao frontend
novo somente os estados que ele precisa enxergar, como:

- sessao pronta
- captura ativa
- quiz disponivel
- resultado salvo
- erro recuperavel

Essa camada faz a ponte entre a UI nova e os servicos reais de armazenamento,
captura, calibracao e recall, sem duplicar regra de negocio.

### Modelagem

Todo registro novo persistido para sync deve carregar envelope versionado:

- `id` (UUID)
- `schemaVersion`
- `createdAt`
- `updatedAt`
- `deviceId`
- `revision`
- `syncStatus`

Regras de dominio:

- `ValidationCapture` e `RecallTestResult` sao imutaveis.
- perfil, preferencias e consentimento sao mutaveis/versionados.
- sync falho nao pode esconder dado local nem invalidar evidencia de captura.

### Contratos de sync

Primeira fase com:

- endpoint de `push` idempotente;
- endpoint de `pull` incremental por cursor/revisao;
- outbox local;
- metadados de reconciliacao e tombstone quando necessario.

### Seguranca e recuperacao

- rota publicada protegida por `Apache Basic Auth` na primeira fase duravel;
- backup diario do SQLite;
- export manual JSON/CSV continua disponivel como caminho adicional de recuperacao.

## Estatisticas

`Progresso` passa a ter duas abas principais:

### Meu progresso

- sessoes concluidas
- sessoes comparaveis
- recall medio
- tempo de leitura
- tendencias de leitura + recall
- dinamica ocular resumida
- contexto recente como dado descritivo

### Qualidade da medicao

- validade de captura
- cobertura e perda de sinal
- extrapolacao
- consistencia de fonte
- comparabilidade por dispositivo, orientacao e fonte

### Regras de implementacao

- manter a logica atual de comparabilidade e resumos puros em
  `statisticsSummary.ts`;
- incluir `recallTests` na montagem do dashboard e nos filtros;
- registros nao comparaveis continuam visiveis em auditoria, mas nao contaminam
  tendencias.

## Fases de implementacao aprovadas

### Fase A — Fundacao de dados e sync

- envelopes versionados
- outbox local
- sync com SQLite
- endpoints de push/pull
- backup diario

### Fase B — Shell do app

- navegacao
- hierarquia das secoes
- design system base
- responsividade estrutural

### Fase C — Avaliacao e Recall

- superficie dedicada
- estados explicitos
- leitura, captura, geracao de questoes e resultado
- shell claro fora da sessao e superficie escura imersiva durante a sessao
- fluxo unico para `Captura simples` e `Leitura + Recall`

## Ordem de implementacao da fatia 1

### Bloco 1 — Shell novo + rota de Avaliacao

- criar a nova fachada base;
- introduzir a rota nova de `Avaliacao`;
- estabelecer a composicao shell claro + superficie escura.

### Bloco 2 — Fluxo visual de preparo, texto e captura

- transformar a entrada da sessao em percurso guiado;
- separar claramente `preparo`, `texto pronto` e `captura em andamento`;
- reduzir o chrome durante a medicao.

### Bloco 3 — Quiz e resultado

- integrar `gerando questoes`, `questionario` e `resultado` como sequencia unica;
- absorver o recall no fluxo principal, sem modal improvisado;
- consolidar leitura, qualidade da captura e desfecho do recall na mesma narrativa.

### Bloco 4 — Adaptacao real ao legado tecnico

- substituir os pontos mais criticos hoje concentrados em `EyeTrackingTestScreen.tsx`;
- usar a camada de adaptacao como contrato entre UI nova e servicos atuais;
- manter persistencia local e comportamento central intactos.

### Fase D — Progresso

- aba `Meu progresso`
- aba `Qualidade da medicao`
- filtros comparaveis
- integracao de recall

### Fase E — Historico e Configuracoes

- timeline consolidada
- drill-down por evento
- export e recuperacao

## Gates da reconstrucao

- o frontend novo so avanca quando conseguir usar os servicos atuais sem duplicar
  regra de negocio;
- a persistencia local nao pode quebrar nem perder evidencias de captura;
- a reconstrucao nao pode reespalhar estado visual na tela antiga;
- a fachada nova precisa parecer produto novo, mas continuar apoiada no backend e
  nos servicos reais que ja funcionam.

## Assumptions travadas

- o mockup aprovado de `Progresso` e a referencia visual principal do shell e do dashboard;
- `Progresso` orienta o design system, mas a primeira entrega funcional sera
  `Avaliacao/Leitura+Recall`;
- a primeira fase duravel usa `Basic Auth`, nao contas;
- a primeira fase duravel usa `sync + backup diario`;
- o bug atual do Recall sera absorvido pela reconstrucao do fluxo, nao por hotfix isolado;
- a reconstrucao do frontend segue por `shell novo + camada de adaptacao`, e nao
  por rewrite completo nem por reskin incremental das telas atuais.
