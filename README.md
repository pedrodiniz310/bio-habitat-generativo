# Bio-Habitat Generativo

Prototipo web em `Three.js` que transforma metricas diarias do `health-bot` em uma ilha flutuante 3D com 4 tiers visuais (radiante, normal, arido, critico).

## Como rodar localmente

### Modo dev (sem API — usa arquivo estatico)

```bash
python -m http.server 8000
```

Abra `http://localhost:8000`. O bio-habitat usa `data/sample-daily-metrics.json` como fonte de dados.

### Modo conectado (API do health-bot)

1. Copie `config.example.js` para `config.js` e preencha:

```js
window.__BIO_HABITAT_CONFIG__ = {
  apiUrl: "https://health-bot-pedro.fly.dev/metrics/today.json",
  apiToken: "seu-token-bearer-aqui",
  cacheStaleAfterMs: 86400000,
};
```

2. Rode o servidor (`python -m http.server 8000`). O bio-habitat fara fetch da API com fallback para `localStorage` cache e arquivo estatico.

## Deploy automatico no GitHub Pages

1. Habilite GitHub Pages no repositorio (Settings → Pages → Source: GitHub Actions).
2. Configure os secrets do repositorio (Settings → Secrets and variables → Actions):
   - `HABITAT_API_URL` — ex: `https://health-bot-pedro.fly.dev/metrics/today.json`
   - `HABITAT_API_TOKEN` — mesmo valor de `HABITAT_API_TOKEN` no Fly.io
3. Push para `main`: o workflow `.github/workflows/deploy-pages.yml` gera `config.js` a partir dos secrets e publica o site.

URL final: `https://<seu-usuario>.github.io/bio-habitat-generativo/`

## Setup do token no Fly.io (server)

```bash
cd health-bot
fly secrets set HABITAT_API_TOKEN=$(openssl rand -hex 32)
fly deploy
```

Use o mesmo valor em `HABITAT_API_TOKEN` (GitHub secret) e em `config.js` (dev local).

## Validacao automatizada

```bash
npm run verify
```

Roda Playwright em desktop e mobile validando: canvas renderiza, paineis nao sobrepoem, sem overflow horizontal, ilha dentro do viewport.

## Mapeamento visual

- `sleep_hours` — porte e altura da ilha + copa + flutuacao (zero = ilha afunda, animacao para)
- `water_liters` — lago, cascata, nevoa (critico = cascata seca, lago vira terra)
- `exercise_minutes` — atividade luminosa (fireflies) ao redor da ilha
- `screen_hours` — intensidade das correntes de vento + overlay toxico em estado critico

## Sistema de tiers

Curva quartica nao-linear (`dramatize()`) que empurra valores medios para os extremos.

| Tier | Score | Visual |
|---|---|---|
| Radiante | ≥ 0.78 | Cores vibrantes, brilho, animacao de respiracao |
| Normal | ≥ 0.50 | Visual neutro inicial |
| Arido | ≥ 0.25 | Dessaturado, sepia, tons de palha |
| Critico | < 0.25 | Roxo-cinza escuro, painel estatico, peso visual |

## Estrutura

```
app.js              # Cena Three.js + sistema de tiers + fetch da API
index.html          # Estrutura HTML + import map Three.js
styles.css          # Variaveis CSS por tier + overlays + animacoes
config.example.js   # Template de config (copiar para config.js)
data/               # JSON de exemplo
verify-render.mjs   # Validacao Playwright (desktop + mobile)
artifacts/          # Screenshots gerados pela verificacao
.github/workflows/  # CI/CD para deploy automatico no Pages
```
