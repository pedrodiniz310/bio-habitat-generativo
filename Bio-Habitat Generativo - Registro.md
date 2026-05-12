# Bio-Habitat Generativo - Registro

## Ideia

Um ecossistema digital vivo alimentado por dados de saude do usuario. Em vez de graficos frios, o estado do dia vira uma ilha flutuante 3D: sono, hidratacao, exercicio e tempo de tela alteram forma, luz, agua, atividade e clima.

## Direcao visual atual

- Produto com cara limpa, inspirado em uma estetica Apple.
- Cinematografico leve, sem excesso dramatico.
- Cena 3D full-bleed, com interface sobreposta em paineis solidos.
- Ilha flutuante low-poly com copa, lago, cascata, nevoa, vento e pontos luminosos.
- Layout responsivo validado em desktop e mobile.

## Escolha tecnica

A versao atual usa HTML, CSS e JavaScript puro com Three.js.

Racional:

- O valor principal do prototipo esta na cena 3D, nao em uma UI complexa.
- Three.js e o framework robusto para a parte que realmente importa agora.
- React/Vue/Svelte fariam mais sentido quando houver multiplas telas, historico, login, controles de simulacao, edicao de parametros ou estado compartilhado maior.
- Manter simples agora reduz atrito para prototipar visualmente.

## Estrutura criada

Pasta principal:

```text
bio-habitat-generativo/
```

Arquivos principais:

- `index.html`: estrutura da pagina, import map do Three.js e paineis de interface.
- `styles.css`: layout responsivo, hierarquia visual, cards solidos e tipografia.
- `app.js`: cena 3D em Three.js, mapeamento dos dados para o habitat e animacoes.
- `data/sample-daily-metrics.json`: payload de exemplo consumido pela cena.
- `verify-render.mjs`: verificacao automatizada com Playwright.
- `package.json`: script `npm run verify`.
- `artifacts/desktop.png`: screenshot gerado pela verificacao.
- `artifacts/mobile.png`: screenshot gerado pela verificacao.

## Integracao com o health-bot

No `health-bot`, foram adicionados arquivos para preparar a exportacao de dados:

- `database.py`: adicionada tabela `daily_metrics`.
- `record_daily_metrics.py`: CLI para registrar metricas diarias manualmente.
- `export_daily_metrics.py`: exporta um JSON no formato esperado pelo habitat.

Tabela nova:

```text
daily_metrics
```

Campos:

- `user_id`
- `date`
- `sleep_hours`
- `water_liters`
- `exercise_minutes`
- `screen_hours`
- `updated_at`

## Formato do JSON

Exemplo de payload abaixo do normal usado para testar o comportamento visual:

```json
{
  "user_id": 123456789,
  "date": "2026-05-12",
  "metrics": {
    "sleep_hours": 4.2,
    "water_liters": 0.8,
    "exercise_minutes": 8,
    "screen_hours": 10.5
  },
  "scores": {
    "sleep": 0.525,
    "hydration": 0.267,
    "exercise": 0.178,
    "stress": 1.0
  },
  "state": {
    "plant_growth": 0.422,
    "mist_level": 0.733,
    "fauna_density": 0.178,
    "wind_intensity": 1.0
  },
  "sources": {
    "sleep_hours": "daily_metrics",
    "water_liters": "daily_metrics",
    "exercise_minutes": "daily_metrics",
    "screen_hours": "daily_metrics"
  }
}
```

## Mapeamento visual

- Sono baixo: ilha mais baixa, copa mais contida.
- Sono alto: ilha mais elevada, vegetacao mais densa.
- Hidratacao baixa: menos agua, mais atmosfera seca/nebulosa.
- Hidratacao alta: lago/cascata mais vivos e ambiente mais limpo.
- Exercicio baixo: pouca atividade luminosa no ar.
- Exercicio alto: mais pontos luminosos ao redor da ilha.
- Tempo de tela alto: correntes de vento mais fortes.

## Estados testados

### Estado bom

Payload inicial:

- Sono: `7.6h`
- Agua: `2.1L`
- Exercicio: `54min`
- Tela: `6.4h`

Resultado:

- Ilha em ascensao.
- Copa densa.
- Mais pontos luminosos.
- Cascata mais ativa.

### Estado abaixo do normal

Payload atual:

- Sono: `4.2h`
- Agua: `0.8L`
- Exercicio: `8min`
- Tela: `10.5h`

Resultado:

- Estado exibido: `Arquipelago rarefeito`.
- Ilha mais baixa e contida.
- Menos atividade luminosa.
- Menos agua percebida.
- Vento mais dominante.

## Ajustes feitos durante a iteracao visual

- O primeiro prototipo em p5.js ficou visualmente fraco.
- A base foi trocada para Three.js.
- A primeira versao 3D parecia um terrario.
- A direcao mudou para ilha flutuante.
- A interface foi refinada para parecer mais limpa e premium.
- A cena deixou de ficar dentro de um card e passou a ser full-bleed.
- Os textos passaram a ficar em paineis solidos para legibilidade.
- A camera foi ajustada porque as copas das arvores estavam sendo cortadas pelo topo do navegador.
- A escala da ilha foi reduzida e o enquadramento foi validado em desktop e mobile.

## Validacao

Comando usado:

```bash
npm run verify
```

O script verifica:

- Canvas renderizado e nao vazio.
- Variacao de pixels no centro da cena.
- Ausencia de sobreposicao entre paineis.
- Ausencia de overflow horizontal.
- Ilha inteira dentro do viewport, sem corte vertical.
- Screenshots desktop/mobile.

Resultado mais recente:

- Desktop: passou.
- Mobile: passou.

## Como rodar

Na pasta do prototipo:

```bash
cd bio-habitat-generativo
python -m http.server 8000
```

Abrir:

```text
http://localhost:8000
```

Verificar render:

```bash
npm run verify
```

## Como gerar JSON a partir do health-bot

Registrar dados manuais:

```bash
cd health-bot
python record_daily_metrics.py --user-id SEU_ID --date 2026-05-12 --sleep-hours 4.2 --water-liters 0.8 --exercise-minutes 8 --screen-hours 10.5
```

Exportar para o habitat:

```bash
python export_daily_metrics.py --user-id SEU_ID --date 2026-05-12 --output ..\bio-habitat-generativo\data\sample-daily-metrics.json
```

## Proximos passos

- Criar estados visuais mais contrastantes entre dia bom, medio e ruim.
- Adicionar transicao suave quando o JSON muda.
- Automatizar a exportacao diaria via webhook ou job do health-bot.
- Criar uma pagina privada hospedada junto ao bot ou em deploy separado.
- Adicionar historico semanal como pequenas ilhas em segundo plano.
- Integrar dados reais de sono e hidratacao quando a fonte estiver disponivel.
- Decidir se o projeto continua vanilla ou migra para React/Vite quando houver mais telas e controles.

## Observacao de seguranca

O arquivo `health-bot/anotações.md` aparenta conter credenciais reais de Google/Strava. Antes de subir o projeto para qualquer repositório remoto, e recomendavel remover esses segredos e rotacionar as chaves/tokens.
