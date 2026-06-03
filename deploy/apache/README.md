# Deploy — Apache 2 + Node (Linha Fixa)

Em produção, o app roda como um processo Node (`node dist/server.cjs`, porta **3000**).
Esse servidor Express já serve o SPA buildado (`dist/`), os endpoints `/api/*` e o
fallback de rota client-side (`app.get('*') -> index.html`). O Apache entra só como
**reverse proxy com HTTPS** na frente dele.

> 🎯 **Destino pretendido:** `https://ultrassom.ai/gaze` (o app montado sob o prefixo
> `/gaze` no domínio já existente). **Ainda não está no ar.** Ver a seção
> [Servir sob `/gaze`](#servir-sob-gaze-intenção) para o que falta. Enquanto isso, o
> deploy na raiz (ou em um subdomínio `gaze.ultrassom.ai`) já funciona sem mudanças
> no app.

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

## Servir sob `/gaze` (intenção)

> Status: **planejado, ainda não implementado.** O alvo é `https://ultrassom.ai/gaze`.

Como `ultrassom.ai` é um domínio já existente, o app fica sob o **prefixo de caminho
`/gaze`** (e não em um vhost próprio). Isso exige mudanças **no Apache _e_ no app** —
o prefixo é preservado de ponta a ponta (Apache → Node ambos enxergam `/gaze/...`).

**1. Apache** — adicionar o bloco `<Location "/gaze">` (em `linhafixa.conf`) dentro do
vhost `:443` existente do `ultrassom.ai`. Ele faz `ProxyPass http://127.0.0.1:3000/gaze`.

**2. App (a fazer)** — checklist para o subpath funcionar:

- [ ] `vite.config.ts`: definir `base: '/gaze/'` (assets passam a ser referenciados em
      `/gaze/assets/...`).
- [ ] `src/App.tsx`: `<BrowserRouter basename="/gaze">` (rotas client-side sob o prefixo).
- [ ] `server.ts`: montar o Express sob `/gaze` — `app.use('/gaze', express.static(dist))`,
      mover as rotas para `/gaze/api/...` e o fallback para `app.get('/gaze/*', …)`.
- [ ] Chamadas de API base-aware: trocar `fetch('/api/...')` por
      `fetch(\`${import.meta.env.BASE_URL}api/...\`)` (com `base`, `BASE_URL` vira
      `/gaze/`). Afeta `src/services/contentGenerator.ts` e os callers de plano/insight.
- [ ] `index.html`: ajustar referências absolutas de `public/` (ex.: `href="/manifest.json"`
      → `/gaze/manifest.json`) e os ícones do manifest.

Recomendação para evitar quebrar o deploy na raiz: introduzir um env `APP_BASE_PATH`
(padrão `/`) e derivar dele o `base` do Vite, o `basename` do Router e o mount do
Express — assim a mesma build serve raiz **ou** `/gaze`.

> Alternativa de menor atrito: usar um **subdomínio** `gaze.ultrassom.ai` (vhost próprio,
> app na raiz). Sem nenhuma das mudanças acima. Há um exemplo comentado em `linhafixa.conf`.

## Notas

- A rota `/eye-tracking-test` (e todas as outras) é resolvida pelo Node via fallback
  SPA; **não** é preciso `RewriteRule` no Apache.
- Para atualizar: `git pull && npm ci && npm run build && sudo systemctl restart linhafixa`.
- Secrets (`OPENAI_API_KEY`) ficam em `/etc/linhafixa.env`, fora do git.
