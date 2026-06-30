# AGENTS.md - Regras Locais do Codex para /root/Gaze

Este arquivo descreve convencoes locais do Codex neste repositorio.

## Progresso do projeto

O acompanhamento oficial do progresso do projeto fica em `BACKLOG.md`.
Quando houver duvida entre memoria antiga e estado atual do repo, `BACKLOG.md`
vence como fonte local de andamento.

## Cabecalho obrigatorio para arquivos do Codex

Sempre que o Codex criar ou mantiver um sistema proprio de acompanhamento,
handoff, notas operacionais ou continuidade neste repo, o arquivo deve comecar
com um cabecalho curto deixando explicito que:

- o arquivo e do Codex
- o arquivo nao e documentacao funcional do produto
- o arquivo nao e o sistema de continuidade do Claude

Exemplo de intencao do cabecalho:
"Arquivo de continuidade do Codex neste repositorio. Nao confundir com notas do
Claude nem com documentacao do produto."

## Separacao de papeis

- `BACKLOG.md`: progresso e packs/bundles ativos do projeto
- `.codex_remember/remember.md`: handoff curto do Codex, se necessario
- `AGENTS.md`: instrucoes locais do Codex para este repo

O Codex nao deve sobrescrever arquivos do Claude apenas para manter sua propria
continuidade, e deve preferir arquivos claramente identificados como seus.
