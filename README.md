# Linha Fixa

Aplicativo web para avaliacao oculomotora, leitura assistida, recall e treino
visual por webcam. A aplicacao e experimental, nao realiza diagnostico medico e
nao substitui eye tracker dedicado ou avaliacao profissional.

## Estado atual

A entrada autenticada do produto e a nova fachada de Avaliacao. O aceite do
consentimento e a raiz `/` encaminham para `/assessment`; a home visual anterior
esta desligada do roteamento.

| Rota | Papel atual |
| --- | --- |
| `/assessment` | Shell clara, preparo, resumo local e entrada da avaliacao |
| `/assessment?workspace=live` | Superficie imersiva de calibracao, captura e recall |
| `/history` | Linha do tempo local de capturas e recalls |
| `/player` | Treino guiado existente |
| `/dashboard` | Progresso e qualidade da medicao existentes |
| `/settings` | Perfil, preferencias e calibracao |
| `/eye-tracking-test` | Alias legado; redireciona para a avaliacao ativa |

A shell nova usa uma camada fina de adaptacao sobre os servicos atuais. Captura,
calibracao, validade, recall e persistencia nao foram reimplementados dentro dos
componentes visuais.

## Dados e limites

Os dados continuam `local-first` no IndexedDB `linhafixa_db` v3, com stores para
perfil, consentimento, sessoes, capturas de validacao e testes de recall. Nao ha
SQLite, sincronizacao com servidor, contas ou backup automatico implementados.

As metricas priorizam dinamica temporal horizontal, cobertura, taxa medida,
consistencia de fonte, validade da calibracao e estabilidade postural. Webcam
comum nao mede microssacadas nem garante posicao exata de palavra.

## Desenvolvimento

Requisitos: Node.js 20+ e dependencias instaladas com `npm ci`.

```bash
npm run dev
npm run lint
npm test
APP_BASE_PATH=/gaze npm run build
npm run smoke
```

Variaveis:

- `APP_BASE_PATH`: `/gaze` no build e runtime de producao.
- `PORT`: `3060` no servico desta maquina.
- `OPENAI_API_KEY`: necessaria para geracao de textos, recall, plano e insight.
- `OPENAI_MODEL`: modelo usado pelos endpoints do servidor.

Sem chave OpenAI, os recursos locais e dados salvos continuam acessiveis, mas os
endpoints de geracao respondem `503 OPENAI_API_KEY_MISSING`.

## Producao

- URL: `https://ultrassom.ai/gaze/`
- Servico: `linhafixa.service`
- Porta local: `3060`
- Diretorio: `/root/Gaze`
- Mapa autoritativo do host: `/etc/apache2/APACHE.md`

O build e o runtime devem receber o mesmo `APP_BASE_PATH=/gaze`. Consulte
[deploy/apache/README.md](deploy/apache/README.md) para o procedimento operacional.

## Documentacao

O estado e a continuidade ficam em [BACKLOG.md](BACKLOG.md). A direcao da fachada
esta em
[docs/superpowers/specs/2026-07-17-app-reconstruction-design.md](docs/superpowers/specs/2026-07-17-app-reconstruction-design.md);
o contrato de validade permanece em
[docs/superpowers/specs/2026-07-16-instrument-validity-design.md](docs/superpowers/specs/2026-07-16-instrument-validity-design.md).
