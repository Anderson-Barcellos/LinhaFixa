# Deploy — Apache 2 + Node (Linha Fixa)

Em produção, o app roda como um processo Node (`node dist/server.cjs`, porta **3000**).
Esse servidor Express já serve o SPA buildado (`dist/`), os endpoints `/api/*` e o
fallback de rota client-side (`app.get('*') -> index.html`). O Apache entra só como
**reverse proxy com HTTPS** na frente dele.

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

## Notas

- A rota `/eye-tracking-test` (e todas as outras) é resolvida pelo Node via fallback
  SPA; **não** é preciso `RewriteRule` no Apache.
- Para atualizar: `git pull && npm ci && npm run build && sudo systemctl restart linhafixa`.
- Secrets (`OPENAI_API_KEY`) ficam em `/etc/linhafixa.env`, fora do git.
