# Deploy do Linha Fixa

Documento operacional para o app publicado em `https://ultrassom.ai/gaze/`.
O mapa autoritativo de rotas, portas e headers do servidor e
`/etc/apache2/APACHE.md`.

## Runtime atual

| Item | Valor |
| --- | --- |
| Servico | `linhafixa.service` |
| Processo | `node dist/server.cjs` |
| Diretorio | `/root/Gaze` |
| Porta | `3060` |
| Prefixo | `/gaze` |
| Env local | `/etc/linhafixa.env` |

O Express serve o SPA, os assets e os endpoints de IA. O Apache fornece HTTPS,
proxy reverso e Permissions Policy para camera, acelerometro e giroscopio.

## Invariante do prefixo

`APP_BASE_PATH` precisa ter o mesmo valor no build e no processo Node:

- Vite grava `/gaze/` nos assets.
- React Router usa `/gaze` como basename.
- Express monta SPA e API sob `/gaze`.
- os clientes montam os endpoints a partir de `BASE_URL`.

Se build e runtime divergirem, a pagina pode abrir em branco ou os assets/API
podem retornar 404.

## Atualizacao

```bash
cd /root/Gaze
npm ci
APP_BASE_PATH=/gaze npm run build
systemctl restart linhafixa.service
systemctl is-active linhafixa.service
curl -fsS -o /dev/null http://127.0.0.1:3060/gaze/
curl -fsS -o /dev/null https://ultrassom.ai/gaze/
```

Antes de editar Apache, consulte `/etc/apache2/APACHE.md`. Mudancas de rota,
porta ou header exigem `apache2ctl configtest`, reload e atualizacao desse mapa.

## Rotas de verificacao

- `/gaze/`: redirecionamento do frontend para `/assessment` apos hidratacao.
- `/gaze/assessment`: entrada oficial da nova fachada.
- `/gaze/assessment?workspace=live`: avaliacao ocular imersiva.
- `/gaze/history`: historico local.
- `/gaze/eye-tracking-test`: alias legado para a avaliacao; nao e a entrada oficial.
- `/gaze/api/generateReadingContent`: API JSON, nunca HTML.

Rotas client-side retornam o HTML do SPA pelo fallback do Node; nao precisam de
RewriteRule individual no Apache.

## Segredos e seguranca

- `OPENAI_API_KEY` fica somente em `/etc/linhafixa.env`, com permissao restrita.
- variaveis `VITE_*` nao devem conter segredo.
- camera e Motion Assist precisam de HTTPS no navegador real.
- o app ainda nao possui Basic Auth nem sincronizacao SQLite.

## Gate recomendado

```bash
npm run lint
npm test
APP_BASE_PATH=/gaze npm run build
npm run smoke
systemctl restart linhafixa.service
```

Depois do restart, valide a URL local, a publica, os assets com hash e uma abertura
real da camera no iPhone quando a mudanca tocar captura, sensores ou layout.
