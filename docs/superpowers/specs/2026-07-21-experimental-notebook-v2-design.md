# Caderno Experimental V2 — Design do Frontend

**Data:** 2026-07-21

**Status:** design aprovado por Anders; aguardando plano de implementacao

**Fonte operacional:** `BACKLOG.md`

**Contratos relacionados:** `2026-07-16-instrument-validity-design.md` e
`2026-07-17-app-reconstruction-design.md`

## Decisao

O frontend sera reconstruido como um caderno experimental pessoal, orientado a
uma unica tarefa primaria: iniciar, concluir e interpretar uma sessao de leitura
com mensuracao ocular e recall. A interface deixa de expor a estrutura tecnica
do sistema como arquitetura principal e passa a projetar os servicos existentes
como um fluxo experimental coerente.

Nao havera rewrite simultaneo do backend. Calibracao, captura, validade,
metricas, recall e persistencia continuam pertencendo aos servicos atuais; a
nova camada visual organiza esses contratos, torna os estados explicitos e
impede que limitacoes tecnicas sejam apresentadas como evidencia confiavel.

O produto e um instrumento longitudinal para uso pessoal de Anders. Nao e uma
plataforma clinica multiusuario, prontuario ou dispositivo medico validado.

## Fonte visual aprovada

Os conceitos sao referencias de hierarquia, composicao, densidade e linguagem
visual. A implementacao deve reutilizar os tokens semanticos, temas e componentes
funcionais do repositorio, aproximando-se dessas referencias sem substituir
controles reais por imagens.

| Classe | Referencia |
| --- | --- |
| Celular | [Conceito mobile](../assets/experimental-notebook-v2/mobile.png) |
| Tablet | [Conceito tablet](../assets/experimental-notebook-v2/tablet.png) |
| Desktop | [Conceito desktop](../assets/experimental-notebook-v2/desktop.png) |

A direcao visual aprovada e **Caderno Experimental**: azul-marinho profundo,
superficies claras de alta legibilidade, violeta como acento operacional,
tipografia direta, pouco ruido decorativo e um unico CTA dominante.

O dark mode ja existente permanece suportado por tokens semanticos. As imagens
definem hierarquia e contraste, nao cores rigidas que eliminem o tema atual.

## Objetivo e sinais de sucesso

A reconstrucao deve permitir que Anders:

- reconheca imediatamente a serie ativa e inicie uma nova sessao sem navegar por
  conceitos tecnicos;
- saiba se cada registro e comparavel, exploratorio ou invalido antes de
  interpreta-lo;
- compare apenas execucoes metodologicamente compativeis;
- recupere uma falha de captura, recall ou persistencia sem perder evidencia ja
  coletada;
- use a mesma experiencia em celular, tablet e desktop sem alterar a geometria
  de uma medicao em andamento.

O sucesso nao sera medido apenas por fidelidade visual. O frontend precisa
preservar a validade do instrumento, a proveniencia do dado, a honestidade do
salvamento e a acessibilidade do fluxo completo.

## Escopo do primeiro corte

O primeiro corte inclui:

- reconstruir `/assessment` como tela inicial do Caderno Experimental;
- apresentar a serie atual, o CTA `Nova sessao` e registros recentes reais;
- reduzir a navegacao principal a Hoje, Sessoes, Progresso e Ajustes;
- introduzir uma projecao de leitura que combina capturas, recalls e sessoes sem
  duplicar regras cientificas ou gravacao;
- extrair o controle da sessao para uma maquina de estados explicita;
- registrar e congelar a classe de dispositivo usada pela captura;
- entregar contratos responsivos de celular, tablet e desktop;
- manter a superficie de mensuracao escura, imersiva e sem navegacao global.

## Fora de escopo

Permanecem fora deste corte:

- SQLite, autenticacao, sincronizacao, contas, backup remoto ou troca do
  IndexedDB v3;
- retuning dos algoritmos oculares, thresholds clinicos ou classificadores de
  validade;
- equivalencia estatistica entre classes de dispositivo;
- redesign funcional do Treino, que continua acessivel como entrada secundaria;
- reinterpretacao automatica de registros antigos como comparaveis;
- sistema generico de experimentos, criacao arbitraria de protocolos ou suporte
  multiusuario.

## Arquitetura de informacao

### Navegacao principal

| Destino | Papel |
| --- | --- |
| Hoje | serie ativa, nova sessao, registros recentes e acesso secundario ao Treino |
| Sessoes | historico cronologico, filtros e auditoria dos registros |
| Progresso | tendencias somente entre chaves de comparacao compativeis |
| Ajustes | protocolo, classe de dispositivo, preferencias e diagnostico tecnico |

No celular, os quatro destinos usam barra inferior respeitando safe areas. No
tablet, usam rail lateral compacto. No desktop, usam sidebar persistente com
rotulo e icone. O destino ativo precisa permanecer perceptivel sem depender
somente de cor.

O Treino continua funcional durante a migracao, mas aparece em Hoje abaixo do
primeiro viewport. Ele nao compete com `Nova sessao` e seu restyling nao integra
este corte.

### Rotas

| Rota | Contrato V2 |
| --- | --- |
| `/` | redireciona usuarios consentidos para `/assessment` |
| `/assessment` | pagina Hoje do Caderno Experimental |
| `/assessment?workspace=live` | alias de compatibilidade para entrada na sessao ativa |
| `/eye-tracking-test` | alias legado, sem identidade visual propria |
| `/history` | pagina Sessoes |
| `/progress` | pagina Progresso |
| `/settings` | pagina Ajustes |

A URL de compatibilidade pode continuar existindo, mas o inicio normal de uma
sessao deve ser comandado pelo controlador e nao por logica cientifica codificada
em query parameters.

## Jornadas principais

### Abrir o caderno

O carregamento de `/assessment` le o IndexedDB, produz a projecao da serie atual
e renderiza imediatamente o estado conhecido. Um indicador discreto distingue
carregamento de estado vazio. Ausencia de registros nao usa dados demonstrativos:
explica que ainda nao existe sessao e mantem `Nova sessao` como acao dominante.

### Iniciar e concluir uma sessao

`Nova sessao` abre o preparo, confirma o protocolo e a classe de dispositivo e
executa o preflight. Ao entrar em calibracao, validacao ou captura, a shell global
desaparece. A superficie escura mostra somente canvas, instrucao necessaria,
progresso e sinais de qualidade que possam ser lidos sem deslocar a geometria.

Depois da captura ocular, o recall pode ser gerado e respondido sem colocar o
registro ocular em risco. O resultado confirma separadamente validade e estado
de persistencia. Ao voltar ao caderno, a projecao e relida da fonte persistida.

### Consultar um registro

Cada linha recente mostra grau, classe de dispositivo, taxa/tier relevante e
horario. O detalhe explica os fatos medidos, as razoes estaveis de validade, o
recall associado e o status de salvamento. Linguagem humana vem antes dos codigos
tecnicos; estes permanecem disponiveis numa area expansivel de auditoria.

## Contrato responsivo

### Caderno

| Faixa funcional | Composicao |
| --- | --- |
| Celular | uma coluna; cabecalho, card da serie e lista em sequencia; navegacao inferior |
| Tablet | rail estreito; card da serie acima da lista; largura de leitura controlada |
| Desktop | sidebar; card da serie e painel de sessoes lado a lado; altura visual equilibrada |

As faixas sao decisoes de composicao, nao fonte da classe cientifica do
dispositivo. Breakpoints nunca reclassificam uma sessao.

O layout deve funcionar em 320 x 568, 390 x 844, 834 x 1194, 1024 x 768,
1366 x 768 e 1440 x 1024, alem das rotacoes aplicaveis. Em 200% a 400% de zoom,
conteudo e controles continuam acessiveis por fluxo, sem sobreposicao obrigatoria
nem rolagem bidimensional da pagina.

### Superficie de mensuracao

A superficie ativa usa geometria congelada no inicio da etapa de medicao. Mudanca
de orientacao, viewport, visibilidade, camera ou retangulo calibrado interrompe a
execucao; a UI nao tenta preservar comparabilidade por reflow silencioso.

A altura deve usar uma referencia estavel, baseada no menor viewport confiavel ou
num snapshot de `VisualViewport`, e nao reagir continuamente ao chrome movel. A
abertura de diagnosticos, teclado, paineis ou mensagens nao pode redimensionar o
canvas calibrado. Mensagens transitam em overlays reservados e acessiveis.

## Fronteiras de componentes

### `ExperimentNotebookScreen`

Componente visual puro. Recebe uma projecao pronta e callbacks de navegacao. Nao
le IndexedDB, nao calcula validade e nao inicia camera.

### `ExperimentNotebookProjection`

Funcao ou hook de adaptacao que combina `validationCaptures`, `recallTests` e
`sessions` em uma estrutura de leitura:

- serie atual e protocolo;
- registros recentes;
- grupos comparaveis;
- baselines exploratorios;
- tentativas invalidas para auditoria;
- estado de associacao entre captura e recall.

A projecao reutiliza `captureValidity`, `statisticsSummary` e contratos de
persistencia. Nao mantem thresholds proprios e nao grava dados.

### `AssessmentSessionController`

Controlador explicito da jornada. Concentra transicoes atualmente dispersas na
tela ocular extensa e coordena servicos existentes sem absorver seus algoritmos.
Uma union discriminada com reducer e suficiente; nao sera adicionada biblioteca
de estado apenas para esta extracao.

Estados previstos:

`setup`, `checking-readiness`, `calibrating`, `validating`, `ready`, `capturing`,
`generating-recall`, `quiz`, `saving`, `result`, `interrupted` e `save-failed`.

Cada estado declara os eventos aceitos e os efeitos permitidos. Transicao ilegal
e falha de desenvolvimento observavel, nao no-op silencioso.

### `MeasurementSurface`

Renderiza canvas, instrucao, progresso e sinalizacao da etapa atual. Recebe
geometria congelada e snapshots do controlador. Nao acessa persistencia, nao
calcula comparabilidade e nao controla a navegacao global.

## Fluxo de dados

```text
IndexedDB v3
  -> ExperimentNotebookProjection
  -> ExperimentNotebookScreen
  -> AssessmentSessionController
  -> servicos oculares e de recall existentes
  -> persistencia existente
  -> releitura da projecao
```

O frontend nao usa estado otimista para declarar uma sessao salva. O resultado
em memoria pode ser exibido imediatamente, mas so entra no historico persistido
depois da confirmacao do IndexedDB.

## Classe de dispositivo e comparabilidade

### Novo metadado

Novas capturas incluem:

```text
deviceClass: 'phone' | 'tablet' | 'desktop'
deviceClassSource: 'confirmed' | 'suggested' | 'legacy-inferred'
```

A classe e confirmada uma vez no preparo do dispositivo e armazenada como
preferencia local. O app pode sugerir um valor por capacidades e dimensoes, mas
nao usa somente a largura atual do viewport. Anders pode corrigi-lo em Ajustes.
No inicio da sessao, o valor e congelado no `CaptureEnvironment`; rotacao ou
resize nao o altera retroativamente.

Para capturas comparaveis, `deviceClassSource` precisa ser `confirmed`. Uma
sugestao ainda nao confirmada permite execucao exploratoria, com consequencia
explicita antes do inicio.

### Chave longitudinal

A chave minima de comparacao passa a ser:

```text
deviceClass | orientation | temporalTier | signalSource
```

Somente capturas `comparable` com a mesma chave alimentam a mesma tendencia.
Baseline exploratorio nunca e ponto de tendencia; tentativa invalida nunca e
baseline. A interface pode mostrar esses registros ao lado da serie, mas precisa
preservar a diferenca semantica.

### Legado

Registros antigos podem receber `legacy-inferred` apenas quando ambiente,
layout e viewport apontarem de forma consistente para uma classe. A inferencia
serve para organizacao e auditoria, nunca promove o grau cientifico nem autoriza
entrada automatica na tendencia principal. Ambiguidade produz `deviceClass: null`
na projecao e mantem o registro fora das series comparaveis.

Nao existe migracao destrutiva: o payload original permanece intacto e a
inferencia pode ser refeita por versao da projecao.

## Graus e linguagem visual

| Grau | Rotulo principal | Uso |
| --- | --- | --- |
| `comparable` | Sessao valida | serie longitudinal da mesma chave |
| `exploratory` | Baseline exploratorio | contexto pessoal, fora da tendencia |
| `invalid` | Tentativa nao utilizavel | auditoria tecnica, nunca tendencia |

Cor, icone e texto comunicam o grau em conjunto. `Sessao valida` e um rotulo de
uso longitudinal dentro do contrato do app, nao afirmacao de validade clinica
externa.

## Falhas e recuperacao

### Preflight insuficiente

Uma insuficiencia impede classificacao comparavel, mas Anders pode escolher
explicitamente `Executar como baseline exploratorio`. O motivo e a consequencia
aparecem antes da acao. Nao ha downgrade silencioso.

### Interrupcao durante a medicao

Mudanca de geometria, orientacao, visibilidade, camera ou assinatura encerra a
execucao atual como invalida. Dados parciais sao preservados quando o runtime
permitir. Uma nova tentativa exige novo preflight e, quando aplicavel, nova
validacao/calibracao; amostras anteriores e posteriores nunca sao concatenadas.

### Falha ao salvar

O resultado permanece em memoria, recebe o estado `Nao salvo` e oferece
`Tentar salvar novamente` e exportacao local. Sair com resultado ainda nao salvo
exige aviso explicito. A interface nao anuncia sucesso antes da confirmacao.

### Falha do recall

Falha de geracao, rede ou resposta invalida do recall nao descarta a captura
ocular. O resultado ocular pode ser salvo sem recall, e a associacao permanece
ausente de forma explicita. Uma nova tentativa de recall nao duplica a captura.

### Mensagens

Toda falha mostra primeiro causa em linguagem simples e proxima acao. Codigos,
metadados e detalhes de diagnostico ficam em divulgacao progressiva. Nao existem
fallbacks silenciosos, mensagens de sucesso antecipadas ou zeros usados como
substitutos para valores nao estimaveis.

## Acessibilidade e interacao

- controles primarios mantem alvo minimo de 44 x 44 CSS px e ordem de foco
  coerente com a ordem visual;
- navegacao, estados e dialogs funcionam por teclado sem exigir gesto ou hover;
- foco permanece visivel em temas claro e escuro e retorna ao acionador ao
  fechar overlays;
- atualizacoes de etapa, interrupcao e salvamento usam anuncios apropriados sem
  narrar cada frame da mensuracao;
- movimento decorativo respeita `prefers-reduced-motion` e nunca comunica
  validade sozinho;
- safe areas, tamanho dinamico de fonte e contraste sao gates do layout, nao
  refinamentos posteriores.

## Estrategia de testes

### Unidade

- projecao de captura, recall e sessao em comparavel, baseline e auditoria;
- resolucao, confirmacao e congelamento de `deviceClass`;
- chave de comparacao com todas as quatro dimensoes;
- legado ambiguo fora da tendencia;
- reducer do controlador, eventos aceitos e transicoes ilegais;
- falhas de recall e persistencia sem perda do resultado ocular.

### Integracao

- leitura real dos stores do IndexedDB e estado vazio;
- inicio pelo caderno, preparo, captura, salvamento e releitura da projecao;
- retry idempotente de persistencia;
- recall indisponivel com captura salva;
- interrupcao de geometria/visibilidade sem retomada da mesma execucao;
- baseline explicitamente escolhido sem contaminacao da tendencia.

### Smoke e QA visual

O smoke cobre consentimento, caderno, preparo, calibracao, captura, resultado e
retorno ao historico. Os viewports obrigatorios sao 320 x 568, 390 x 844,
834 x 1194, 1024 x 768, 1366 x 768 e 1440 x 1024, com rotacao, safe areas,
zoom de 200% a 400% e movimento reduzido quando aplicavel.

A verificacao visual compara cada referencia aprovada com o frontend renderizado
no mesmo viewport. Screenshot isolado nao constitui aceite: diferencas de
hierarquia, recorte, espacamento, tipografia, borda, contraste e densidade devem
ser julgadas lado a lado.

Safari real em iPhone e iPad permanece gate manual final, especialmente para
camera, `VisualViewport`, orientacao, safe areas e chrome dinamico.

### Gate tecnico

- testes unitarios e de integracao do projeto;
- TypeScript sem erro;
- build com `APP_BASE_PATH=/gaze` dentro do budget gzip existente;
- smokes de layout, validade, avaliacao e carregamento;
- `git diff --check`;
- runtime local e publico em `/gaze/` apos restart controlado;
- nenhuma serie mistura classe, orientacao, tier ou fonte.

## Migracao e compatibilidade

A implementacao sera incremental sobre a shell assessment-first existente:

- a projecao nasce pura e testada antes da troca visual;
- o controlador passa a envolver os servicos oculares existentes sem reescrever
  seus algoritmos;
- `/assessment` recebe o caderno e preserva aliases atuais;
- Sessoes reutiliza o historico persistido; Progresso recebe apenas grupos
  comparaveis; Ajustes incorpora a confirmacao de classe;
- o codigo antigo so e removido depois que nenhuma rota ou smoke depender dele.

Nao havera migracao destrutiva do IndexedDB. Campos novos sao aditivos e leitores
permanecem tolerantes ao shape anterior.

## Riscos controlados

| Risco | Controle de design |
| --- | --- |
| beleza visual mascarar baixa qualidade | grau e razoes aparecem antes de tendencias |
| responsividade alterar a medicao | geometria congelada e interrupcao explicita |
| heuristica confundir classe de dispositivo | confirmacao persistida e override em Ajustes |
| refactor da tela ocular mudar algoritmo | controlador coordena servicos existentes |
| falha de IA apagar dado ocular | persistencia e recall desacoplados |
| legado contaminar series | inferencia conservadora e exclusao da tendencia |

## Criterios de aceite do corte

O corte estara pronto para revisao quando:

- Hoje reproduzir a hierarquia aprovada nas tres classes de dispositivo;
- `Nova sessao` conduzir o fluxo real completo sem expor navegacao global durante
  a mensuracao;
- cada registro real aparecer exatamente em comparavel, baseline ou auditoria;
- nenhuma tendencia misturar chaves de comparacao ou dados inferidos do legado;
- falhas de preflight, interrupcao, recall e salvamento seguirem os contratos de
  recuperacao;
- a geometria permanecer estavel ate a conclusao ou interrupcao explicita;
- testes, TypeScript, build, smokes e comparacao visual passarem;
- Anders revisar o resultado em Safari real no iPhone e no iPad.

## Gate de implementacao

Este documento fecha o design, nao autoriza mudanca funcional isolada. O proximo
artefato e um plano TDD com tarefas pequenas, paths exatos, pontos de acoplamento
e verificacoes por fatia. A implementacao deve seguir em agente principal unico,
conforme a escolha de Anders, usando a skill Build Web Apps para fidelidade
responsiva e QA visual, sem delegar decisoes arquiteturais a subagentes.
