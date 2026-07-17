Arquivo de continuidade do Codex neste repositorio. Nao confundir com notas do Claude nem com documentacao funcional do produto.

State:
PACK Reconstrucao do App ativo. Fatia 1 implementada e aguardando revisao de Anders: raiz/consentimento -> /assessment; shell clara de preparo; workspace ocular escura em ?workspace=live; /history na shell; alias /eye-tracking-test apenas para compatibilidade. HomeScreen antigo esta desligado do roteamento.

Next:
Revisar a fatia atual antes de abrir outra frente. Depois, Anders escolhe entre reconstruir outra secao da shell ou ativar persistencia duravel. Nao existe plano futuro ativo.

Context:
Fonte operacional: BACKLOG.md. Spec as-built: docs/superpowers/specs/2026-07-17-app-reconstruction-design.md. Persistencia real continua IndexedDB v3; SQLite/sync/Basic Auth/backup nao existem.

Validation:
2026-07-17: lint passou; testes 249/249; build APP_BASE_PATH=/gaze passou; smoke layout 95/95, validade 72/72 e assessment 7/7. real-tab-hidden ficou bloqueado pelo ambiente.
