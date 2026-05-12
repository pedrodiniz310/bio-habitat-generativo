/**
 * Configuração do bio-habitat. Copie este arquivo para `config.js` (gitignored)
 * e preencha com a URL da sua API e o token Bearer.
 *
 * Em deploy (GitHub Pages), gere config.js via GitHub Actions a partir de secrets.
 * Sem este arquivo, o habitat usa data/sample-daily-metrics.json como fallback.
 */
window.__BIO_HABITAT_CONFIG__ = {
  // URL completa do endpoint de métricas do dia atual
  apiUrl: "https://health-bot-pedro.fly.dev/metrics/today.json",

  // Bearer token configurado em HABITAT_API_TOKEN no Fly.io
  apiToken: "REPLACE_WITH_YOUR_READ_TOKEN",

  // Tempo de cache aceitável no localStorage (ms). 24h = 86400000
  cacheStaleAfterMs: 86_400_000,
};
