# Reconstrucao do App Linha Fixa

**Data:** 2026-07-17

**Status:** fatia 1 implementada no working tree e aguardando revisao de Anders

**Fonte operacional:** `BACKLOG.md`

## Decisao

A reconstrucao e incremental: fachada nova e camada fina de adaptacao sobre os
servicos atuais. Nao e um reskin da home antiga nem um rewrite simultaneo do
frontend e backend.

O produto separa:

- shell clara para navegacao, preparo, historico e leitura de resultados;
- superficie escura imersiva para calibracao, leitura, captura ocular e recall.

As regras de captura, calibracao, validade, recall e persistencia permanecem nos
servicos existentes. Componentes visuais consomem contratos derivados, sem
duplicar regra de negocio.

## Corte implementado

### Entrada e rotas

| Rota | Contrato |
| --- | --- |
| `/` | Redireciona usuarios consentidos para `/assessment` |
| `/consent` | Salva o aceite local e abre `/assessment` |
| `/assessment` | Shell clara e preparo da avaliacao |
| `/assessment?workspace=live` | Superficie ocular imersiva |
| `/assessment?workspace=live&mode=recall` | Leitura + Recall |
| `/history` | Timeline local de capturas e recalls |
| `/eye-tracking-test` | Alias legado para a workspace ativa |

`HomeScreen` nao e importado por `App.tsx` e nao participa do roteamento.

### Shell

`AppShell` e `AppSidebar` estabelecem a navegacao responsiva compartilhada. As
secoes expostas sao Hoje, Treino, Avaliacao, Progresso, Historico e
Configuracoes. Nesta fatia, Avaliacao e Historico receberam telas novas; Treino,
Progresso e Configuracoes continuam usando as telas funcionais anteriores.

### Avaliacao

`AssessmentWorkspaceScreen` possui dois estados de composicao:

- launcher claro com `AssessmentSetupPanel`, resumo do ultimo registro e escolha
  entre Captura simples e Leitura + Recall;
- workspace live que incorpora `EyeTrackingTestScreen` em modo `embedded`, com
  altura restrita e saida de volta para o launcher.

`AssessmentSessionSurface` fornece a moldura da sessao e
`AssessmentResultPanel` apresenta o desfecho sem alterar o contrato salvo.

### Camada de adaptacao

`assessmentFlow.ts` define estados e acoes derivados.
`assessmentAdapter.ts` converte capturas e recalls existentes em snapshot da
workspace e centraliza as rotas live/legada. Essa camada nao grava dados e nao
controla camera.

### Historico

`HistoryScreen` le `validationCaptures` e `recallTests`, combina os registros
por timestamp e os apresenta em timeline. Historico e Progresso permanecem
conceitos distintos: um mostra eventos; o outro agrega tendencias e auditoria.

## Responsividade

- desktop: sidebar fixa e conteudo em colunas;
- mobile portrait: navegacao horizontal e fluxo empilhado;
- mobile landscape curto: workspace live prioriza o canvas e usa gaveta lateral
  de diagnostico sem reflow;
- expandir a gaveta nao pode alterar a geometria da superficie calibrada.

## Dados e backend reais

A fonte local continua sendo IndexedDB v3:

- `profile`;
- `consent`;
- `sessions`;
- `validationCaptures`;
- `recallTests`.

Os endpoints Express geram texto, questoes, plano e insight via OpenAI. A fachada
nova nao altera esses contratos.

Nao implementado:

- SQLite;
- outbox ou sincronizacao;
- envelopes de revisao/tombstone;
- Basic Auth;
- backup diario;
- sistema de contas.

Esses itens sao direcao futura, nao estado atual.

## Gates da fatia

- raiz e consentimento devem terminar na nova Avaliacao;
- o layout antigo nao pode aparecer no fluxo principal;
- `/eye-tracking-test` deve apenas redirecionar;
- captura e recall devem continuar persistindo no IndexedDB existente;
- mobile portrait, mobile landscape e desktops devem manter geometria valida;
- nenhum componente novo pode duplicar regra clinica ou de persistencia.

Evidencia fresca de 2026-07-17:

- TypeScript limpo;
- 249/249 testes;
- build com `APP_BASE_PATH=/gaze`;
- smoke layout 95/95;
- smoke de validade 72/72;
- smoke de avaliacao 7/7.

## Fora desta fatia

A reconstrucao das telas Hoje, Treino, Progresso e Configuracoes e a persistencia
duravel permanecem abertas. Elas so recebem plano detalhado quando Anders escolher
a proxima frente, evitando que documentos futuros sejam confundidos com codigo
implementado.
