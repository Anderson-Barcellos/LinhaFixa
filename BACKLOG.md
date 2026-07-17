Arquivo operacional do Codex neste repositorio. Nao confundir com notas do Claude nem com documentacao funcional do produto.

# Estado do projeto

Atualizado em 2026-07-17. Este arquivo registra somente a frente ativa, os limites
atuais e as proximas frentes reais. O historico detalhado permanece no Git.

## PACK Reconstrucao do App Linha Fixa (active)

Direcao aprovada: fachada nova por fatias, preservando os contratos e servicos
oculares existentes. A experiencia usa shell claro para navegacao/preparo e
superficie escura imersiva para calibracao, leitura, captura e recall.

### BUNDLE Fatia 1 - Avaliacao primeiro (aguardando revisao do Anders)

Implementado no working tree atual:

- `/` e o aceite do consentimento encaminham para `/assessment`; a home visual
  antiga nao participa mais do fluxo principal.
- `/assessment` oferece preparo para Captura simples e Leitura + Recall; a variante
  `?workspace=live` incorpora o fluxo ocular real sem duplicar regra de negocio.
- `/history` consolida capturas e recalls salvos localmente na shell nova.
- `/eye-tracking-test` existe somente como alias de compatibilidade para a workspace
  ativa de avaliacao.
- adapter, contratos de fluxo, componentes de setup/resultado e smoke dedicado
  protegem a costura entre a fachada nova e os servicos existentes.

Validacao fresca da fatia:

- `npm run lint`: passou.
- `npm test`: 249/249.
- `APP_BASE_PATH=/gaze npm run build`: passou.
- `npm run smoke`: layout 95/95, validade 72/72 e assessment 7/7.
- capacidade automatizada `real-tab-hidden`: bloqueada pelo ambiente, sem falha
  funcional observada.

### Limites atuais

- Persistencia continua local em IndexedDB v3; SQLite, outbox, sync, Basic Auth e
  backup diario ainda nao foram implementados.
- Avaliacao e Historico usam a shell nova. Treino, Progresso e Configuracoes ainda
  apontam para telas funcionais anteriores dentro da navegacao comum.
- `HomeScreen.tsx` permanece no repositorio como codigo desligado; nao e importado
  nem roteado pelo app.
- A fatia ainda nao foi commitada nem marcada como fechada por Anders.

### Continuidade do PACK

Depois da revisao desta fatia, as frentes ainda abertas sao reconstruir as demais
secoes da shell e, separadamente, decidir a fase de persistencia duravel. Nenhum
plano detalhado dessas frentes fica ativo antes da escolha de Anders.

## Frentes estacionadas

- Performance Adaptativa: implementacao isolada na branch
  `feat/adaptive-loading-performance` e worktree correspondente; nao representa o
  estado da `main`.
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
