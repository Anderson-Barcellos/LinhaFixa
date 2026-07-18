Arquivo operacional do Codex neste repositorio. Nao confundir com notas do Claude nem com documentacao funcional do produto.

# Estado do projeto

Atualizado em 2026-07-17. Este arquivo registra somente a frente ativa, os limites
atuais e as proximas frentes reais. O historico detalhado permanece no Git.

## PACK Reconstrucao do App Linha Fixa (active)

Direcao aprovada: fachada nova por fatias, preservando os contratos e servicos
oculares existentes. A experiencia usa shell claro para navegacao/preparo e
superficie escura imersiva para calibracao, leitura, captura e recall.

### BUNDLE Fatia 1 - Avaliacao primeiro (commitada em 2026-07-17; revisao visual do Anders pendente)

Implementado e commitado na `main` (`8066735` e anteriores):

- `/` e o aceite do consentimento encaminham para `/assessment`; a home visual
  antiga nao participa mais do fluxo principal.
- `/assessment` oferece preparo para Captura simples e Leitura + Recall; a variante
  `?workspace=live` incorpora o fluxo ocular real sem duplicar regra de negocio.
- `/history` consolida capturas e recalls salvos localmente na shell nova.
- `/eye-tracking-test` existe somente como alias de compatibilidade para a workspace
  ativa de avaliacao.
- adapter, contratos de fluxo, componentes de setup/resultado e smoke dedicado
  protegem a costura entre a fachada nova e os servicos existentes.

### Performance Adaptativa integrada (2026-07-17, merge `c5aee54`)

A frente de carregamento adaptativo foi mergeada da branch
`feat/adaptive-loading-performance` sobre a shell assessment-first e deployada:

- rotas lazy com recuperacao de chunk velho; `/assessment` permanece no bundle
  inicial (primeira pintura sem round trip extra) e a superficie ocular pesada
  carrega lazy dentro dele, aquecida por idle preload e intencao de camera;
- runtime MediaPipe single-flight com assets versionados e cache imutavel;
- orcamento de bundle dentro do `npm run build` (falha acima de 180 KB gzip);
- entry publico: 85 KB gzip (antes: monolito ~295 KB gzip).

Validacao fresca pos-merge (2026-07-17):

- `npm run lint`: passou.
- `npm test`: 276/276.
- `APP_BASE_PATH=/gaze npm run build`: passou, budget 85233/180000 gzip.
- `npm run smoke`: layout 95/95, validade 72/72, assessment 7/7, loading 43/43.
- capacidade automatizada `real-tab-hidden`: bloqueada pelo ambiente, sem falha
  funcional observada.
- publico: `https://ultrassom.ai/gaze/` 200, asset `immutable` e HTML `no-cache`
  atravessando o Apache.

Nota de flakiness: o smoke de layout ja abriu 93/95 numa rodada ("ponto de
calibracao — geometria indisponivel") e passou limpo em seguida; se repetir,
investigar race de timing na geometria de calibracao do workspace embutido.

### Limites atuais

- Persistencia continua local em IndexedDB v3; SQLite, outbox, sync, Basic Auth e
  backup diario ainda nao foram implementados.
- Avaliacao e Historico usam a shell nova. Treino, Progresso e Configuracoes ainda
  apontam para telas funcionais anteriores dentro da navegacao comum.
- `HomeScreen.tsx` permanece no repositorio como codigo desligado; nao e importado
  nem roteado pelo app.

### Continuidade do PACK

Depois da revisao desta fatia, as frentes ainda abertas sao reconstruir as demais
secoes da shell e, separadamente, decidir a fase de persistencia duravel. Nenhum
plano detalhado dessas frentes fica ativo antes da escolha de Anders.

## Frentes estacionadas

- Repetibilidade e Sanidade do Instrumento: analise teste-reteste e painel de
  sanidade aguardam ativacao.
- Deteccao de Pescoco PN4: thresholds finais dependem de capturas reais do iPhone.

## Fontes de verdade

- Operacao e arquitetura atual: `README.md`.
- Direcao e corte implementado da reconstrucao:
  `docs/superpowers/specs/2026-07-17-app-reconstruction-design.md`.
- Contrato cientifico de validade:
  `docs/superpowers/specs/2026-07-16-instrument-validity-design.md`.
- Deploy e prefixo: `deploy/apache/README.md` e `/etc/apache2/APACHE.md`.
