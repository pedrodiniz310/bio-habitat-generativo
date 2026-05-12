# Bio-Habitat Generativo

Prototipo web em `Three.js` que transforma metricas diarias do `health-bot` em uma ilha flutuante 3D.

## Como usar

1. Gere um JSON a partir do bot:

```bash
cd health-bot
python export_daily_metrics.py --date 2026-05-11 --output ..\bio-habitat-generativo\data\sample-daily-metrics.json
```

2. Sirva a pasta do prototipo:

```bash
cd ..\bio-habitat-generativo
python -m http.server 8000
```

3. Abra `http://localhost:8000`.

## Escolha tecnica

O nucleo robusto aqui e o `Three.js`, porque o valor do produto esta na cena 3D, na composicao visual e no mapeamento dos dados. Um framework de UI como React ou Vue passa a fazer mais sentido quando houver multiplas telas, controles de simulacao, historico, login, edicao de parametros ou estado compartilhado mais complexo.

## Mapeamento visual

- `sleep_hours`: porte da ilha, copa e sensacao de luz
- `water_liters`: lago, cascata e densidade da nevoa
- `exercise_minutes`: atividade luminosa ao redor da ilha
- `screen_hours`: intensidade das correntes de vento

## Estado atual

- O exportador ja consulta `exercise_minutes` do Strava quando esse valor nao existir na tabela local.
- `sleep_hours`, `water_liters` e `screen_hours` ainda dependem de preenchimento na tabela `daily_metrics`.
- O esquema JSON foi pensado para virar payload de webhook depois, sem refazer o front.
