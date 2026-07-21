# Caderno Experimental V2 — Design do Frontend

**Data:** 2026-07-21

**Status:** design corrigido apos revisao de Anders; aguardando confirmacao final

**Fonte operacional:** `BACKLOG.md`

**Contratos relacionados:** `2026-07-16-instrument-validity-design.md` e
`2026-07-17-app-reconstruction-design.md`

## Decisao

O frontend sera reconstruido como um caderno experimental pessoal, com a sessao
de leitura, mensuracao ocular e recall como entrada primaria. Essa prioridade de
layout nao reduz o produto a uma unica feature: calibracao, validacao, captura,
treinos oculomotores, leitura assistida, planejamento, sintomas, postura,
historico, metricas, insights e exportacao permanecem funcionais.

A interface deixa de expor a estrutura tecnica do sistema como arquitetura
principal e passa a projetar todos os servicos existentes como jornadas
coerentes. Nenhuma capacidade desaparece por estar em nivel clinico,
pre-clinico ou experimental.

Nao havera rewrite simultaneo do backend. Calibracao, captura, validade,
metricas, recall e persistencia continuam pertencendo aos servicos atuais; a
nova camada visual organiza esses contratos, torna os estados explicitos e
impede que limitacoes tecnicas sejam apresentadas como evidencia confiavel.

O produto e um instrumento longitudinal de uso pessoal, com ambicao clinica e
contrato de evidencia explicito. O uso pessoal altera governanca, distribuicao e
tolerancia a features experimentais; nao autoriza remover capacidades clinicas.
Enquanto uma metrica ou feature nao atingir evidencia suficiente, ela continua
disponivel com rotulo experimental e limites de interpretacao visiveis. O app
nao se apresenta como prontuario, plataforma multiusuario ou dispositivo medico
regulatoriamente validado.

**Regra de preservacao:** com ou sem validacao clinica plena, todas as features
existentes permanecem. O nivel de evidencia controla rotulo, comparabilidade e
interpretacao; nunca a existencia ou acessibilidade da capacidade.

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
- alcance treinos, calibracao, biblioteca, planejamento, sintomas, postura,
  metricas, insights e exportacao sem perder funcionalidade do backend;
- use a mesma experiencia em celular, tablet e desktop sem alterar a geometria
  de uma medicao em andamento.

O sucesso nao sera medido apenas por fidelidade visual. O frontend precisa
preservar a validade do instrumento, a proveniencia do dado, a honestidade do
salvamento e a acessibilidade do fluxo completo.

## Escopo da reconstrucao V2

A reconstrucao inclui:

- reconstruir `/assessment` como tela inicial do Caderno Experimental;
- apresentar a serie atual, o CTA `Nova sessao` e registros recentes reais;
- reduzir a navegacao principal a Hoje, Sessoes, Progresso e Ajustes;
- reposicionar Biblioteca e Treino como ferramentas da pagina Hoje, preservando
  `/library`, `/player`, o plano gerado e os quatro exercicios existentes;
- reconstruir Sessoes, Progresso e Ajustes sobre os dados e servicos reais, sem
  substituir resultados por demonstracoes visuais;
- introduzir uma projecao de leitura que combina capturas, recalls e sessoes sem
  duplicar regras cientificas ou gravacao;
- extrair o controle da sessao para uma maquina de estados explicita;
- registrar e congelar a classe de dispositivo usada pela captura;
- entregar contratos responsivos de celular, tablet e desktop;
- manter as superficies de mensuracao e exercicio escuras, imersivas e sem
  navegacao global;
- preservar todos os endpoints atuais de geracao de conteudo, recall, plano e
  insight como capacidades alcancaveis pela nova interface.

## Fora de escopo

Permanecem fora deste corte:

- SQLite, autenticacao, sincronizacao, contas, backup remoto ou troca do
  IndexedDB v3;
- retuning dos algoritmos oculares, thresholds clinicos ou classificadores de
  validade;
- equivalencia estatistica entre classes de dispositivo;
- reinterpretacao automatica de registros antigos como comparaveis;
- sistema generico de experimentos, criacao arbitraria de protocolos ou suporte
  multiusuario.

Estar fora de escopo significa preservar o comportamento atual, nao remover a
feature. Se uma capacidade existente ainda nao receber a composicao visual final
na primeira fatia de implementacao, ela permanece acessivel e testada ate sua
fatia responsiva ser concluida.

## Principio backend-first

O backend e os servicos cientificos definem os fatos necessarios, as
pre-condicoes, os payloads e os resultados. O frontend tem quatro deveres:
coletar entradas completas, impedir execucao enganosa, manter a geometria do
estimulo e apresentar o resultado sem perder proveniencia.

| Necessidade do backend/engine | Responsabilidade do frontend |
| --- | --- |
| perfil, contexto e historico | coletar uma vez, reutilizar quando valido e permitir correcao |
| permissao, camera e sensor de movimento | pedir no gesto correto, mostrar estado real e liberar recursos no teardown |
| viewport, superficie, DPR, video e orientacao | medir antes, congelar durante e interromper se o contrato mudar |
| calibracao e assinatura compativel | validar antes da captura e oferecer recalibracao ou modo exploratorio explicito |
| qualidade, FPS, cobertura e fonte do sinal | mostrar prontidao e persistir os fatos usados pela classificacao |
| complexidade, duracao e texto de leitura | enviar valores validados e manter o estimulo inalterado durante a execucao |
| texto de recall e seis questoes validas | preservar o texto lido, validar o shape e associar a resposta a captura correta |
| plano de treino seguro | enviar perfil, contexto e historico; distinguir plano de IA do fallback deterministico |
| resumo para insight | enviar somente agregados honestos e grupos metodologicamente compativeis |
| confirmacao do IndexedDB | declarar salvamento apenas depois do sucesso e oferecer retry/exportacao na falha |

O frontend nao inventa valores para completar payload, nao converte ausencia em
zero, nao recalcula thresholds cientificos e nao descarta campos que o backend
ou os engines precisam para auditoria. Sempre que houver fallback legitimo, sua
origem e consequencia ficam visiveis.

## Arquitetura de informacao

### Navegacao principal

| Destino | Papel |
| --- | --- |
| Hoje | serie ativa, nova sessao, registros recentes, Biblioteca e Treino |
| Sessoes | historico cronologico, filtros e auditoria dos registros |
| Progresso | tendencias somente entre chaves de comparacao compativeis |
| Ajustes | protocolo, classe de dispositivo, preferencias e diagnostico tecnico |

No celular, os quatro destinos usam barra inferior respeitando safe areas. No
tablet, usam rail lateral compacto. No desktop, usam sidebar persistente com
rotulo e icone. O destino ativo precisa permanecer perceptivel sem depender
somente de cor.

Biblioteca e Treino aparecem em Hoje depois do bloco primario do caderno. Eles
nao competem visualmente com `Nova sessao`, mas permanecem entradas funcionais e
recebem a mesma qualidade responsiva nas respectivas fatias da V2.

### Rotas

| Rota | Contrato V2 |
| --- | --- |
| `/` | redireciona usuarios consentidos para `/assessment` |
| `/assessment` | pagina Hoje do Caderno Experimental |
| `/assessment?workspace=live` | alias de compatibilidade para entrada na sessao ativa |
| `/eye-tracking-test` | alias legado, sem identidade visual propria |
| `/library` | Biblioteca de Fixacao, Sacadas, Perseguicao suave e Leitura assistida |
| `/player` | plano gerado ou exercicio avulso em superficie focada |
| `/history` | pagina Sessoes |
| `/dashboard` | pagina Progresso, metricas, insights e exportacao |
| `/statistics` | alias legado para `/dashboard` |
| `/settings` | pagina Ajustes |

A URL de compatibilidade pode continuar existindo, mas o inicio normal de uma
sessao deve ser comandado pelo controlador e nao por logica cientifica codificada
em query parameters.

### Capacidades do backend na nova fachada

| Capacidade existente | Superficie V2 |
| --- | --- |
| calibracao, validacao e captura ocular | Nova sessao em Hoje |
| texto e perguntas de recall | etapa de leitura e recall da sessao |
| Fixacao, Sacadas, Perseguicao suave e Leitura assistida | Biblioteca e Player |
| plano, pre-contexto, seguranca e pos-contexto | fluxo de Treino no Player |
| sessoes, capturas e recalls persistidos | Sessoes e detalhes de auditoria |
| tendencias, sintomas, postura e diagnosticos | Progresso |
| insight gerado e exportacao JSON | Progresso |
| camera, tema, preferencias e classe do dispositivo | Ajustes e preflight |

Os endpoints `/api/generateReadingContent`, `/api/generateRecallText`,
`/api/generateRecallQuestions`, `/api/generatePlan` e `/api/generateInsight`
permanecem conectados aos fluxos correspondentes. O frontend pode melhorar
preparo, feedback e recuperacao, mas nao substitui nem oculta essas capacidades.

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

### Executar treino ou exercicio avulso

Hoje oferece acesso ao plano recomendado e a Biblioteca. O Player preserva o
pre-contexto, o gate de seguranca, a geracao ou fallback do plano, a verificacao
de calibracao, camera e movimento, os quatro exercicios registrados, o
pos-contexto e a gravacao da sessao. A nova composicao reduz etapas redundantes,
mas nao pula entradas necessarias ao planner ou aos engines.

Durante o exercicio, a navegacao global desaparece e `ExerciseCanvas` conserva a
geometria do estimulo. Ao final, resultado, interrupcao voluntaria e dados
parciais seguem os contratos atuais e reaparecem em Sessoes e Progresso.

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

### Superficies clinicas preservadas

`ExerciseLibraryScreen` continua projetando o registry real de Fixacao, Sacadas,
Perseguicao suave e Leitura assistida. `ExercisePlayerScreen`, `ExerciseCanvas`,
planner, safety gate, calibracao e sensores continuam donos do fluxo de treino.
Eles recebem a linguagem visual e o contrato responsivo da V2 por decomposicao
incremental, sem serem absorvidos pelo `AssessmentSessionController`.

`HistoryScreen` permanece o consumidor cronologico de sessoes, capturas e
recalls. `DashboardScreen` continua consumindo `statisticsSummary`, qualidade do
sinal, insight e exportacao. `SettingsScreen` continua controlando perfil,
camera, tema e preferencias, acrescentando somente a confirmacao de classe de
dispositivo necessaria a comparabilidade.

## Fluxo de dados

```text
Avaliacao:
IndexedDB -> NotebookProjection -> NotebookScreen -> SessionController
  -> calibracao/captura/recall -> persistencia -> releitura da projecao

Treino:
perfil/contexto/historico -> safety/planner -> Player/ExerciseCanvas
  -> resultados/pos-contexto -> persistencia -> Sessoes e Progresso

Analise:
sessoes/capturas/recalls -> statisticsSummary/grupos compativeis
  -> Dashboard -> insight opcional/exportacao
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

### Falha dos endpoints auxiliares

Falha ao gerar texto de leitura mantem o fluxo no preparo, sem iniciar estimulo
vazio, e oferece retry. Falha no planner preserva o safety gate deterministico e
pode usar o plano padrao existente, identificado como fallback local. Falha no
insight nao altera, bloqueia ou reclassifica os dados que o alimentariam.

Offline, rate limit, credencial indisponivel, payload invalido e erro interno
recebem mensagens e acoes distintas quando a resposta permitir identifica-los.
O frontend respeita `Retry-After`, invalida respostas fora do contrato e nao
repete automaticamente uma requisicao que possa duplicar efeitos.

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
- falhas de recall e persistencia sem perda do resultado ocular;
- payloads dos cinco endpoints sem omissao de campos necessarios;
- plano de IA, fallback local e safety gate com origens distinguiveis.

### Integracao

- leitura real dos stores do IndexedDB e estado vazio;
- inicio pelo caderno, preparo, captura, salvamento e releitura da projecao;
- retry idempotente de persistencia;
- recall indisponivel com captura salva;
- interrupcao de geometria/visibilidade sem retomada da mesma execucao;
- baseline explicitamente escolhido sem contaminacao da tendencia;
- Biblioteca abrindo cada um dos quatro exercicios no Player;
- plano gerado ou fallback, pre/pos-contexto e sessao salva em Sessoes;
- Progresso lendo dados reais, gerando insight e exportando o historico completo.

### Smoke e QA visual

O smoke cobre consentimento, caderno, preparo, calibracao, captura, resultado e
retorno ao historico. Tambem percorre Hoje -> Biblioteca -> Player -> resultado,
Sessoes, Progresso, insight, exportacao e Ajustes, provando que nenhuma
capacidade ficou orfa na nova navegacao. Os viewports obrigatorios sao
320 x 568, 390 x 844, 834 x 1194, 1024 x 768, 1366 x 768 e 1440 x 1024, com
rotacao, safe areas, zoom de 200% a 400% e movimento reduzido quando aplicavel.

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
- `/library` e `/player` permanecem alcancaveis durante toda a migracao e recebem
  sua composicao responsiva sem trocar registry, planner ou engine;
- Sessoes reutiliza o historico persistido; Progresso recebe apenas grupos
  comparaveis; Ajustes incorpora a confirmacao de classe;
- uma tela ou adapter antigo so e removido depois que todas as capacidades que
  expunha estiverem mapeadas, integradas e cobertas por smoke na V2.

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
| redesign esconder feature existente | matriz backend-first e smoke por rota/capacidade |
| formulario omitir entrada do engine | contrato de payload testado antes da composicao visual |

## Criterios de aceite do corte

O corte estara pronto para revisao quando:

- Hoje reproduzir a hierarquia aprovada nas tres classes de dispositivo;
- `Nova sessao` conduzir o fluxo real completo sem expor navegacao global durante
  a mensuracao;
- cada captura ocular aparecer exatamente em comparavel, baseline ou auditoria;
- nenhuma tendencia misturar chaves de comparacao ou dados inferidos do legado;
- Biblioteca, Player, quatro exercicios, planner, pre/pos-contexto, safety gate,
  Sessoes, Progresso, insight, exportacao e Ajustes permanecerem funcionais;
- os cinco endpoints atuais receberem os campos esperados e exporem falha,
  fallback e retry sem perda de dados;
- falhas de preflight, interrupcao, recall e salvamento seguirem os contratos de
  recuperacao;
- a geometria permanecer estavel ate a conclusao ou interrupcao explicita;
- testes, TypeScript, build, smokes e comparacao visual passarem;
- Anders revisar o resultado em Safari real no iPhone e no iPad.

## Gate de implementacao

Este documento fecha o design, nao autoriza mudanca funcional isolada. O proximo
artefato e um plano TDD com tarefas pequenas, paths exatos, pontos de acoplamento
e verificacoes por fatia. Cada tarefa parte do contrato do backend ou engine que
precisa ser servido e so depois define a composicao visual correspondente.

A implementacao deve seguir em agente principal unico, conforme a escolha de
Anders, usando a skill Build Web Apps para fidelidade responsiva e QA visual,
sem delegar decisoes arquiteturais a subagentes.
