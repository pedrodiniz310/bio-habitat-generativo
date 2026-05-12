import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.BIO_HABITAT_URL || "http://localhost:8000";
const viewports = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];

await mkdir("artifacts", { recursive: true });

const browser = await chromium.launch();
const results = [];

try {
  for (const target of viewports) {
    const page = await browser.newPage({
      viewport: target.viewport,
      deviceScaleFactor: 1,
    });

    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("canvas");
    await page.waitForTimeout(1800);

    const checks = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const hero = document.querySelector(".hero-panel").getBoundingClientRect();
      const metrics = document.querySelector(".metrics-panel").getBoundingClientRect();
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");

      const sampleWidth = Math.min(180, gl.drawingBufferWidth);
      const sampleHeight = Math.min(180, gl.drawingBufferHeight);
      const x = Math.floor((gl.drawingBufferWidth - sampleWidth) / 2);
      const y = Math.floor((gl.drawingBufferHeight - sampleHeight) / 2);
      const pixels = new Uint8Array(sampleWidth * sampleHeight * 4);
      gl.readPixels(x, y, sampleWidth, sampleHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      const ranges = [
        { min: 255, max: 0 },
        { min: 255, max: 0 },
        { min: 255, max: 0 },
        { min: 255, max: 0 },
      ];
      let opaque = 0;

      for (let i = 0; i < pixels.length; i += 4) {
        for (let channel = 0; channel < 4; channel++) {
          const value = pixels[i + channel];
          ranges[channel].min = Math.min(ranges[channel].min, value);
          ranges[channel].max = Math.max(ranges[channel].max, value);
        }
        if (pixels[i + 3] > 8) {
          opaque += 1;
        }
      }

      const overlap = !(
        hero.right <= metrics.left ||
        metrics.right <= hero.left ||
        hero.bottom <= metrics.top ||
        metrics.bottom <= hero.top
      );

      const islandBounds = window.__bioHabitatDebug?.getIslandViewportBounds?.();

      return {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        opaqueRatio: opaque / (sampleWidth * sampleHeight),
        colorRange: ranges[0].max - ranges[0].min + ranges[1].max - ranges[1].min + ranges[2].max - ranges[2].min,
        panelsOverlap: overlap,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        islandBounds,
      };
    });

    if (checks.canvasWidth < 300 || checks.canvasHeight < 300) {
      throw new Error(`${target.name}: canvas is too small`);
    }
    if (checks.opaqueRatio < 0.9) {
      throw new Error(`${target.name}: canvas appears transparent or blank`);
    }
    if (checks.colorRange < 32) {
      throw new Error(`${target.name}: canvas central pixels have too little variation`);
    }
    if (checks.panelsOverlap) {
      throw new Error(`${target.name}: interface panels overlap`);
    }
    if (checks.scrollWidth > checks.clientWidth + 1) {
      throw new Error(`${target.name}: horizontal overflow detected`);
    }
    if (!checks.islandBounds) {
      throw new Error(`${target.name}: island bounds are unavailable`);
    }
    if (checks.islandBounds.top < 8 || checks.islandBounds.bottom > checks.islandBounds.height - 8) {
      throw new Error(`${target.name}: island is clipped vertically ${JSON.stringify(checks.islandBounds)}`);
    }

    await page.screenshot({
      path: `artifacts/${target.name}.png`,
      fullPage: true,
    });

    results.push({ viewport: target.name, ...checks });
    await page.close();
  }
} finally {
  await browser.close();
}

console.table(results);
