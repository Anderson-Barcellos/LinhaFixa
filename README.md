# Linha Fixa

Aplicativo web para treino oculomotor, leitura assistida e análise experimental
de dinâmica ocular por webcam. Em produção, roda em:

- `https://ultrassom.ai/gaze/`
- serviço systemd `linhafixa.service`
- porta local `3060`
- diretório `/root/Gaze`

## Foco atual

O app deixou de tratar a webcam como promessa de "palavra exata olhada" e passou
a priorizar o que o hardware entrega melhor: dinâmica temporal de leitura.

Métricas principais:

- sacadas progressivas;
- regressões;
- duração média de fixação;
- amplitude horizontal relativa;
- cobertura facial e amostras válidas;
- estabilidade postural via Motion Assist no iPhone/Safari.

A calibração espacial continua disponível para posicionar o ponto na tela, mas é
camada de apoio. A leitura principal vem do movimento relativo, especialmente no
eixo horizontal.

## Limites honestos

Webcam comum não substitui equipamento clínico ou eye tracker dedicado. A análise
é experimental, depende de iluminação, distância, enquadramento, postura e FPS da
câmera. O sistema não detecta microssacadas e não faz diagnóstico médico.

## Rodar localmente

Pré-requisitos:

- Node.js 20+
- `npm ci`

Comandos:

```bash
npm ci
npm run dev
```

Variáveis opcionais:

- `OPENAI_API_KEY`: habilita geração de textos/planos via OpenAI.
- `OPENAI_MODEL`: padrão `gpt-4o-mini`.
- `APP_BASE_PATH`: use `/gaze` para build/runtime sob `ultrassom.ai/gaze`.
- `PORT`: padrão `3000`; em produção nesta máquina é `3060`.

Sem `OPENAI_API_KEY`, o app segue funcionando com conteúdo/plano fallback.

## Validação

```bash
node --import tsx --test $(rg --files -g '*.test.ts' src)
npm run lint
APP_BASE_PATH=/gaze npm run build
```

## Deploy nesta máquina

O deploy real usa Apache como proxy HTTPS e Node como servidor do SPA/API.
O mapa autoritativo de rotas da máquina fica em `/etc/apache2/APACHE.md`.

Fluxo de atualização:

```bash
APP_BASE_PATH=/gaze npm run build
systemctl restart linhafixa.service
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:3060/gaze/
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://ultrassom.ai/gaze/
```

Consulte [deploy/apache/README.md](deploy/apache/README.md) para detalhes de
systemd, Apache, permissões de câmera/sensores e checagens de produção.
