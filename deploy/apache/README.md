# Deploy — Apache 2 + Node (Linha Fixa)

Em produção, o app roda como um processo Node (`node dist/server.cjs`, porta **3000**).
Esse servidor Express já serve o SPA buildado (`dist/`), os endpoints `/api/*` e o
fallback de rota client-side (`app.get('*') -> index.html`). O Apache entra só como
**reverse proxy com HTTPS** na frente dele.

> 🎯 **Destino pretendido:** `https://ultrassom.ai/gaze` (o app montado sob o prefixo
> `/gaze` no domínio já existente). O suporte a sub-path **já está implementado** via a
> env **`APP_BASE_PATH`** — a MESMA base de código serve na raiz (padrão) ou sob `/gaze`.
> Ver [Servir sob `/gaze`](#servir-sob-gaze-via-app_base_path). Falta apenas publicar
> (apontar o DNS/vhost do `ultrassom.ai` e ligar a env).

> ⚠️ **HTTPS é obrigatório**: a tela de diagnóstico usa `getUserMedia` (câmera), que
> os navegadores só liberam em contexto seguro. Em `http://` a câmera é bloqueada no
> iPhone/Safari.

## 1. Build da aplicação no servidor

```bash
cd /var/www/linhafixa        # onde você clonou o repo
npm ci
npm run build                # gera dist/ e dist/server.cjs
```

## 2. Manter o Node rodando (systemd)

```bash
echo "OPENAI_API_KEY=sk-..." | sudo tee /etc/linhafixa.env
sudo chmod 600 /etc/linhafixa.env
sudo cp deploy/apache/linhafixa.service /etc/systemd/system/linhafixa.service
sudo systemctl daemon-reload
sudo systemctl enable --now linhafixa
curl -I http://127.0.0.1:3000   # deve responder
```

## 3. Apache: módulos + vhost

```bash
sudo a2enmod proxy proxy_http ssl headers rewrite
sudo cp deploy/apache/linhafixa.conf /etc/apache2/sites-available/linhafixa.conf
# edite o arquivo e substitua <DOMAIN> e os caminhos de certificado
sudo a2ensite linhafixa
sudo apache2ctl configtest
sudo systemctl reload apache2
```

## 4. Certificado HTTPS (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d linhafixa.seudominio.com
```

O certbot preenche os caminhos de certificado automaticamente. Depois disso, acesse
`https://linhafixa.seudominio.com/eye-tracking-test` no iPhone (landscape) e a câmera
deve pedir permissão normalmente.

## Servir sob `/gaze` via `APP_BASE_PATH`

> Status: **implementado.** O alvo é `https://ultrassom.ai/gaze`.

A env **`APP_BASE_PATH`** controla onde o app é montado. Vazia ou `/` = raiz (padrão).
`/gaze` = tudo (SPA, assets, `/api`) sob o prefixo `/gaze`, preservado de ponta a ponta
(Apache → Node ambos enxergam `/gaze/...`). Um único valor alimenta os três pontos:

| Onde | Como usa `APP_BASE_PATH` |
|------|--------------------------|
| `vite.config.ts` | vira o `base` do Vite (`/gaze/`) → assets em `/gaze/assets/...` |
| `src/App.tsx`     | vira o `basename` do React Router (`/gaze`) |
| `server.ts`       | prefixa rotas `/api`, o `express.static` e o fallback SPA |
| client (`apiUrl`) | `src/services/apiBase.ts` usa `import.meta.env.BASE_URL` nos `fetch` |

> ⚠️ **Crítico:** `APP_BASE_PATH` precisa ser igual no **build** (assa o `base` no
> client) **e** no **runtime** do Node. Se divergirem, os assets 404 ou o `/api` quebra.

### Passos (deploy sob /gaze)

```bash
# 1) Build COM a base (assa /gaze/ nos assets do client)
cd /var/www/linhafixa
APP_BASE_PATH=/gaze npm run build

# 2) Runtime: a MESMA env no serviço Node. Em /etc/linhafixa.env:
echo "APP_BASE_PATH=/gaze" | sudo tee -a /etc/linhafixa.env
sudo systemctl restart linhafixa

# 3) Apache: colar o bloco <Location "/gaze"> (linhafixa.conf) no vhost :443 do ultrassom.ai
sudo apache2ctl configtest && sudo systemctl reload apache2
```

### Verificação (local, antes do Apache)

```bash
APP_BASE_PATH=/gaze NODE_ENV=production node dist/server.cjs &   # porta 3000
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://127.0.0.1:3000/            # 302 -> /gaze/
curl -s -o /dev/null -w "%{http_code} %{content_type}\n"   http://127.0.0.1:3000/gaze/        # 200 text/html
curl -s -o /dev/null -w "%{http_code} %{content_type}\n"   http://127.0.0.1:3000/gaze/eye-tracking-test  # 200 text/html
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" -X POST \
  -H 'Content-Type: application/json' -d '{"complexity":"facil"}' \
  http://127.0.0.1:3000/gaze/api/generateReadingContent        # JSON (200 com key; 500 sem key) — nunca HTML
```

### Voltar para a raiz

Basta **não** definir `APP_BASE_PATH` (ou `=/`), rebuildar e reiniciar. Nada mais muda.

> Alternativa de menor atrito ainda: subdomínio `gaze.ultrassom.ai` (vhost próprio, app
> na raiz, `APP_BASE_PATH` vazio). Exemplo de vhost comentado em `linhafixa.conf`.

### Pendência conhecida (PWA)

O `index.html` é reescrito pelo Vite (o `href="/manifest.json"` vira `/gaze/manifest.json`
automaticamente). Mas os caminhos **internos** do `public/manifest.json` (ex.: `start_url`,
`icons[].src`) não são processados pelo Vite — se forem absolutos (`/...`), ficam fora do
`/gaze`. Ajustar quando o PWA/instalação for relevante; não bloqueia a navegação nem a câmera.

## Notas

- A rota `/eye-tracking-test` (e todas as outras) é resolvida pelo Node via fallback
  SPA; **não** é preciso `RewriteRule` no Apache.
- Para atualizar: `git pull && npm ci && npm run build && sudo systemctl restart linhafixa`.
- Secrets (`OPENAI_API_KEY`) ficam em `/etc/linhafixa.env`, fora do git.
