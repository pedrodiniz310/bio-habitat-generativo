import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const state = {
  payload: null,
  random: () => 0.5,
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  island: null,
  islandBaseY: 0.48,
  islandSinkOffset: 0,
  waterfall: null,
  mist: null,
  fireflies: null,
  clouds: [],
  windBands: [],
  trees: [],
  vines: [],
  pond: null,
  scoresDramatized: null,
  tier: "normal",
  flags: {
    hydrationCritico: false,
    stressCritico: false,
    sleepCritico: false,
    exerciseCritico: false,
  },
  dataSource: "static",
  cachedAt: null,
  clock: new THREE.Clock(),
};

const host = document.getElementById("habitat-canvas");

const CACHE_KEY = "bio-habitat-payload-cache";
const FALLBACK_FILE = "./data/sample-daily-metrics.json";

// ─── Sistema de Tiers e curvas não-lineares ─────────────────────────────────
//
// ⚠️  ESTABILIDADE: este bloco (curva dramatize + thresholds dos 4 tiers +
// função classificarEstado) está CONGELADO. Não ajustar coeficientes,
// expoentes ou cortes até que o pipeline automático bot → bio-habitat
// esteja em produção e estável.
// Motivo: empilhar mais uma camada de não-linearidade (curva + tiers +
// modificadores DOM) torna intratável depurar "por que hoje a ilha tá árida
// se eu dormi bem". Mudar UM parâmetro aqui muda tudo downstream.
// Revisão prevista: após Tier 1 do roadmap (ver Obsidian).

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Curva quártica que empurra valores médios para os extremos.
 * dramatize(0)   = 0
 * dramatize(0.25)= 0.125  (puxa pra baixo)
 * dramatize(0.5) = 0.5
 * dramatize(0.75)= 0.875  (puxa pra cima)
 * dramatize(1)   = 1
 * Quanto maior `exp`, mais agressiva a separação dos extremos.
 */
function dramatize(t, exp = 2.4) {
  const c = clamp01(t);
  if (c < 0.5) return Math.pow(c * 2, exp) / 2;
  return 0.5 + (1 - Math.pow(2 - c * 2, exp)) / 2;
}

function computeOverallScore(scores) {
  const positives = (scores.sleep + scores.hydration + scores.exercise) / 3;
  const stressInverse = 1 - scores.stress;
  return clamp01(positives * 0.65 + stressInverse * 0.35);
}

function classificarEstado(scores) {
  const overall = dramatize(computeOverallScore(scores), 2.6);
  if (overall >= 0.78) return "radiante";
  if (overall >= 0.50) return "normal";
  if (overall >= 0.25) return "arido";
  return "critico";
}

function dramatizarScores(scores) {
  return {
    sleep: dramatize(scores.sleep),
    hydration: dramatize(scores.hydration),
    exercise: dramatize(scores.exercise),
    stress: dramatize(scores.stress, 2.2),
  };
}

function computarFlags(scores) {
  return {
    hydrationCritico: scores.hydration < 0.2,
    stressCritico: scores.stress > 0.85,
    sleepCritico: scores.sleep < 0.25,
    exerciseCritico: scores.exercise < 0.15,
  };
}

init().catch((error) => {
  console.error(error);
  document.getElementById("scene-title").textContent = "Falha ao carregar ilha";
  document.getElementById("scene-summary").textContent =
    "A cena 3D ou o JSON do dia não carregaram corretamente.";
});

async function loadPayload() {
  const config = (typeof window !== "undefined" && window.__BIO_HABITAT_CONFIG__) || {};
  const apiUrl = config.apiUrl;
  const apiToken = config.apiToken;

  // 1) Tentar API se configurada
  if (apiUrl && apiToken && apiToken !== "REPLACE_WITH_YOUR_READ_TOKEN") {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${apiToken}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        savePayloadCache(data);
        return { data, source: "api" };
      }
      console.warn(`[bio-habitat] API respondeu ${res.status}, usando fallback`);
    } catch (err) {
      console.warn("[bio-habitat] Falha na API:", err.message);
    }
  }

  // 2) Cache localStorage (se houver)
  const cached = loadPayloadCache();
  if (cached) {
    return {
      data: cached.payload,
      source: "cache",
      cachedAt: cached.timestamp,
    };
  }

  // 3) Arquivo estático (dev local ou sem config)
  const res = await fetch(FALLBACK_FILE);
  const data = await res.json();
  return { data, source: "static" };
}

function savePayloadCache(payload) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ payload, timestamp: Date.now() }),
    );
  } catch (e) {
    // localStorage indisponível (modo privado/quota) — segue sem cachear
  }
}

function loadPayloadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function init() {
  const { data, source, cachedAt } = await loadPayload();
  state.payload = data;
  state.dataSource = source;
  state.cachedAt = cachedAt;
  state.random = createSeededRandom(`${state.payload.user_id}-${state.payload.date}`);

  // Classificação de estado + dramatização não-linear das métricas
  state.tier = classificarEstado(state.payload.scores);
  state.scoresDramatized = dramatizarScores(state.payload.scores);
  state.flags = computarFlags(state.payload.scores);
  state.islandSinkOffset = state.flags.sleepCritico ? -0.55 : 0;

  // Aplica tier no documento (CSS reage via [data-estado])
  document.documentElement.dataset.estado = state.tier;
  document.body.classList.toggle("flag-hydration-critico", state.flags.hydrationCritico);
  document.body.classList.toggle("flag-stress-critico", state.flags.stressCritico);
  document.body.classList.toggle("flag-sleep-critico", state.flags.sleepCritico);
  document.body.classList.toggle("flag-exercise-critico", state.flags.exerciseCritico);

  createScene();
  buildIslandScene();
  syncPanel();
  animate();
  window.addEventListener("resize", onResize);
}

function createScene() {
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color("#f7f9f6");
  state.scene.fog = new THREE.Fog("#f7f9f6", 12, 30);

  state.camera = new THREE.PerspectiveCamera(34, host.clientWidth / host.clientHeight, 0.1, 100);
  state.camera.position.set(12.2, 6.1, 12.7);

  state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.renderer.setSize(host.clientWidth, host.clientHeight);
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = 1.14;
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(state.renderer.domElement);

  state.controls = new OrbitControls(state.camera, state.renderer.domElement);
  state.controls.enableDamping = true;
  state.controls.enablePan = false;
  state.controls.minDistance = 7;
  state.controls.maxDistance = 16;
  state.controls.minPolarAngle = 0.95;
  state.controls.maxPolarAngle = 1.42;
  state.controls.target.set(0, 1.75, 0);
  state.controls.update();

  const hemi = new THREE.HemisphereLight("#ffffff", "#9daaa0", 1.75);
  state.scene.add(hemi);

  const sun = new THREE.DirectionalLight("#fff2d2", 2.65);
  sun.position.set(9, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 30;
  state.scene.add(sun);

  const fill = new THREE.PointLight("#cae7e5", 1.25, 24);
  fill.position.set(-6, 5.2, -5);
  state.scene.add(fill);

  const groundShadow = new THREE.Mesh(
    new THREE.CircleGeometry(7.5, 64),
    new THREE.MeshBasicMaterial({
      color: "#9cab9f",
      transparent: true,
      opacity: 0.1,
    }),
  );
  groundShadow.rotation.x = -Math.PI / 2;
  groundShadow.position.y = -3.45;
  state.scene.add(groundShadow);

  addBackdrop();
}

function addBackdrop() {
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 48),
    new THREE.MeshBasicMaterial({
      color: "#f8ebbf",
      transparent: true,
      opacity: 0.9,
    }),
  );
  sun.position.set(5.8, 8, -8);
  state.scene.add(sun);

  const sunGlow = new THREE.Mesh(
    new THREE.CircleGeometry(2.5, 48),
    new THREE.MeshBasicMaterial({
      color: "#fff4d4",
      transparent: true,
      opacity: 0.24,
    }),
  );
  sunGlow.position.copy(sun.position);
  state.scene.add(sunGlow);

  for (let i = 0; i < 6; i++) {
    const cloud = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 24),
      new THREE.MeshStandardMaterial({
        color: "#fbfcfb",
        transparent: true,
        opacity: 0.74,
        roughness: 1,
        metalness: 0,
        depthWrite: false,
      }),
    );
    cloud.scale.set(1.5 + rand() * 1.8, 0.48 + rand() * 0.25, 0.7 + rand() * 0.45);
    cloud.position.set(-8 + i * 3.2, 5.6 + rand() * 2.2, -6.5 - rand() * 4);
    state.scene.add(cloud);
    state.clouds.push(cloud);
  }
}

function buildIslandScene() {
  const { sleep, hydration, exercise, stress } = state.scoresDramatized;
  state.island = new THREE.Group();
  state.island.position.y = state.islandBaseY + state.islandSinkOffset;
  state.island.scale.setScalar(0.66);
  state.scene.add(state.island);

  // Lushness amplificada pela dramatização (já vem dos scores dramatizados)
  const lushness = sleep * 0.58 + hydration * 0.42;
  const islandHeight = THREE.MathUtils.lerp(2.5, 4.1, lushness);
  const topRadius = THREE.MathUtils.lerp(2.2, 3.1, sleep * 0.7 + hydration * 0.3);
  const bottomRadius = THREE.MathUtils.lerp(0.7, 1.4, hydration * 0.6 + sleep * 0.4);

  // Cor da rocha varia por tier: pedra-clara → terra-seca → cinza-roxo
  const rockColor = state.tier === "critico" ? "#52495c"
    : state.tier === "arido" ? "#a89070"
    : state.tier === "radiante" ? "#d8d0bc"
    : "#c8c0b0";

  const rock = new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius, bottomRadius, islandHeight, 12, 12),
    new THREE.MeshStandardMaterial({
      color: rockColor,
      roughness: 0.98,
      metalness: 0.01,
      flatShading: false,
    }),
  );
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.position.y = 0.8;
  rock.rotation.y = Math.PI / 8;
  state.island.add(rock);

  // Grama: verde-vivo (radiante) → palha (árido) → marrom-escuro (crítico)
  const grassPalette = {
    radiante: ["#5b9a4e", "#48c576"],
    normal: ["#6d7d5e", "#5a8f55"],
    arido: ["#9a8852", "#7d6938"],
    critico: ["#3d3a3f", "#2e2932"],
  }[state.tier] || ["#6d7d5e", "#5a8f55"];

  const grass = new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius + 0.16, topRadius + 0.08, 0.34, 40),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().lerpColors(
        new THREE.Color(grassPalette[0]),
        new THREE.Color(grassPalette[1]),
        lushness,
      ),
      roughness: 1,
    }),
  );
  grass.position.y = islandHeight / 2 + 0.84;
  grass.receiveShadow = true;
  state.island.add(grass);

  addCliffDetails(islandHeight, topRadius, bottomRadius, hydration);
  addWaterfall(islandHeight, topRadius, hydration);
  addPond(islandHeight, hydration);
  addTrees(islandHeight, topRadius, sleep, hydration);
  addVines(islandHeight, bottomRadius, hydration);

  // Modificador: exercício zero/crítico apaga as fireflies completamente
  if (!state.flags.exerciseCritico) {
    addFireflies(islandHeight, topRadius, exercise);
  }

  addWind(stress, islandHeight);
  addMist(islandHeight, hydration);
}

function addCliffDetails(islandHeight, topRadius, bottomRadius, hydration) {
  for (let i = 0; i < 7; i++) {
    const shard = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.18 + rand() * 0.24, 0),
      new THREE.MeshStandardMaterial({
        color: "#b1a58f",
        roughness: 1,
        flatShading: true,
      }),
    );
    const angle = (i / 9) * Math.PI * 2;
    const radius = THREE.MathUtils.lerp(bottomRadius * 0.8, topRadius * 0.7, rand());
    shard.position.set(
      Math.cos(angle) * radius,
      -0.25 + rand() * (islandHeight - 0.4),
      Math.sin(angle) * radius,
    );
    shard.scale.set(1.2, 1.8 + rand() * 1.4, 1.05);
    shard.castShadow = true;
    state.island.add(shard);
  }

  const mossCount = Math.round(THREE.MathUtils.lerp(4, 14, hydration));
  for (let i = 0; i < mossCount; i++) {
    const moss = new THREE.Mesh(
      new THREE.SphereGeometry(0.14 + rand() * 0.2, 14, 14),
      new THREE.MeshStandardMaterial({
        color: "#6f935d",
        roughness: 1,
      }),
    );
    const angle = rand() * Math.PI * 2;
    const y = rand() * islandHeight * 0.7;
    const radius = THREE.MathUtils.lerp(bottomRadius + 0.08, topRadius - 0.4, y / islandHeight);
    moss.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    moss.scale.y = 0.55;
    state.island.add(moss);
  }
}

function addWaterfall(islandHeight, topRadius, hydration) {
  const dry = state.flags.hydrationCritico;
  const waterfallHeight = THREE.MathUtils.lerp(1.6, 3.2, hydration);
  state.waterfall = new THREE.Mesh(
    new THREE.PlaneGeometry(0.65, dry ? waterfallHeight * 0.32 : waterfallHeight, 1, 20),
    new THREE.MeshStandardMaterial({
      color: dry ? "#9c7a4e" : "#bfe8ea",
      emissive: dry ? "#000000" : "#8edbe3",
      emissiveIntensity: dry ? 0 : 0.12 + hydration * 0.28,
      transparent: true,
      opacity: dry ? 0.20 : 0.64,
      roughness: dry ? 1 : 0.08,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );
  state.waterfall.position.set(topRadius - 0.38, islandHeight / 2 + 0.2, 0.24);
  state.waterfall.rotation.y = -0.35;
  state.island.add(state.waterfall);

  // Em estado seco, sem splash (a água nem chega no fundo)
  if (dry) return;

  const splash = new THREE.Mesh(
    new THREE.CircleGeometry(0.6 + hydration * 0.45, 32),
    new THREE.MeshBasicMaterial({
      color: "#f5ffff",
      transparent: true,
      opacity: 0.18 + hydration * 0.12,
    }),
  );
  splash.rotation.x = -Math.PI / 2;
  splash.position.set(topRadius - 0.68, -1.28, 0.18);
  state.island.add(splash);
}

function addPond(islandHeight, hydration) {
  const dry = state.flags.hydrationCritico;
  const radius = dry ? 0.6 : 0.95 + hydration * 0.45;
  const material = dry
    ? new THREE.MeshStandardMaterial({
        color: "#8a6d44",
        roughness: 1,
        metalness: 0,
        flatShading: true,
      })
    : new THREE.MeshPhysicalMaterial({
        color: new THREE.Color().lerpColors(
          new THREE.Color("#8ba6a1"),
          new THREE.Color("#79d5ce"),
          hydration,
        ),
        transparent: true,
        opacity: 0.92,
        roughness: 0.14,
        transmission: 0.2,
        thickness: 0.3,
        ior: 1.33,
      });

  state.pond = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), material);
  state.pond.rotation.x = -Math.PI / 2;
  state.pond.position.set(-0.25, islandHeight / 2 + 1.02, 0.15);
  state.island.add(state.pond);
}

function addTrees(islandHeight, topRadius, sleep, hydration) {
  const count = Math.round(THREE.MathUtils.lerp(8, 18, sleep * 0.72 + hydration * 0.28));
  const canopyRadius = topRadius * 0.72;
  const palette = ["#547454", "#688d5d", "#8fb06d"];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.34;
    const radius = 0.35 + rand() * canopyRadius;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const trunkHeight = THREE.MathUtils.lerp(0.45, 1.65, sleep) * (0.7 + rand() * 0.75);
    const crownSize = 0.3 + rand() * 0.34 + hydration * 0.16;

    const tree = new THREE.Group();
    tree.position.set(x, islandHeight / 2 + 1.0, z);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, trunkHeight, 10),
      new THREE.MeshStandardMaterial({ color: "#6d5748", roughness: 1 }),
    );
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    tree.add(trunk);

    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(crownSize, 0),
      new THREE.MeshStandardMaterial({
        color: palette[i % palette.length],
        roughness: 0.95,
        flatShading: true,
      }),
    );
    crown.position.y = trunkHeight + crownSize * 0.8;
    crown.scale.set(1.1 + rand() * 0.35, 1.15 + rand() * 0.42, 1.05 + rand() * 0.28);
    crown.castShadow = true;
    tree.add(crown);

    state.island.add(tree);
    state.trees.push(tree);
  }
}

function addVines(islandHeight, bottomRadius, hydration) {
  const count = Math.round(THREE.MathUtils.lerp(2, 8, hydration));
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.5;
    const startX = Math.cos(angle) * (bottomRadius + 0.55);
    const startZ = Math.sin(angle) * (bottomRadius + 0.55);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(startX, islandHeight / 2 + 0.55, startZ),
      new THREE.Vector3(startX * 0.92, 0.6 + rand() * 0.35, startZ * 0.92),
      new THREE.Vector3(startX * 0.72, -0.55 - rand() * 0.45, startZ * 0.72),
      new THREE.Vector3(startX * 0.5, -1.25 - rand() * 0.9, startZ * 0.5),
    ]);
    const vine = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 36, 0.018 + rand() * 0.01, 8, false),
      new THREE.MeshStandardMaterial({
        color: "#64845c",
        roughness: 1,
      }),
    );
    state.island.add(vine);
    state.vines.push(vine);
  }
}

function addFireflies(islandHeight, topRadius, exercise) {
  const count = Math.round(THREE.MathUtils.lerp(4, 80, exercise));
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = rand() * topRadius * 0.95;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = islandHeight / 2 + 1.15 + rand() * 1.85;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: "#f5efaa",
    size: 0.09,
    transparent: true,
    opacity: 0.3 + exercise * 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  state.fireflies = new THREE.Points(geometry, material);
  state.island.add(state.fireflies);
}

function addWind(stress, islandHeight) {
  const count = Math.round(THREE.MathUtils.lerp(1, 7, stress));
  for (let i = 0; i < count; i++) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.2, islandHeight / 2 + 0.9 + i * 0.22, -1.5 + i * 0.2),
      new THREE.Vector3(-1.2, islandHeight / 2 + 1.25 + i * 0.18, 0.4),
      new THREE.Vector3(1.1, islandHeight / 2 + 1.05 + i * 0.18, -0.2),
      new THREE.Vector3(3.1, islandHeight / 2 + 1.2 + i * 0.2, 1.35),
    ]);
    const band = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 60, 0.012 + stress * 0.024, 10, false),
      new THREE.MeshStandardMaterial({
        color: "#dce4df",
        transparent: true,
        opacity: 0.06 + stress * 0.2,
        roughness: 0.45,
      }),
    );
    state.scene.add(band);
    state.windBands.push(band);
  }
}

function addMist(islandHeight, hydration) {
  state.mist = new THREE.Mesh(
    new THREE.SphereGeometry(2.7, 28, 28),
    new THREE.MeshStandardMaterial({
      color: "#f6f8f5",
      transparent: true,
      opacity: THREE.MathUtils.lerp(0.24, 0.06, hydration),
      depthWrite: false,
      roughness: 1,
    }),
  );
  state.mist.scale.set(1.15, 0.34, 1.15);
  state.mist.position.y = islandHeight / 2 + 0.85;
  state.island.add(state.mist);
}

function syncPanel() {
  const payload = state.payload;
  const metrics = payload.metrics;
  document.getElementById("metric-date").textContent = payload.date;
  document.getElementById("scene-title").textContent = buildSceneTitle(payload.scores);
  document.getElementById("scene-summary").textContent = buildSummary(payload.scores);

  const tierLabel = {
    radiante: "Radiante",
    normal: "Estável",
    arido: "Árido",
    critico: "Crítico",
  }[state.tier] || "Estável";
  const tierChip = document.getElementById("tier-chip");
  if (tierChip) {
    tierChip.textContent = tierLabel;
    tierChip.dataset.tier = state.tier;
  }

  syncDataSourceBadge();

  const items = [
    ["Sono", formatMetric(metrics.sleep_hours, "h"), state.flags.sleepCritico],
    ["Hidratação", formatMetric(metrics.water_liters, "L"), state.flags.hydrationCritico],
    ["Exercício", formatMetric(metrics.exercise_minutes, "min"), state.flags.exerciseCritico],
    ["Tela", formatMetric(metrics.screen_hours, "h"), state.flags.stressCritico],
  ];

  document.getElementById("metrics-list").innerHTML = items
    .map(
      ([label, value, isCrit]) =>
        `<div class="metric-row${isCrit ? " is-critico" : ""}"><dt>${label}</dt><dd>${value}</dd></div>`,
    )
    .join("");
}

function syncDataSourceBadge() {
  const badge = document.getElementById("data-source-badge");
  if (!badge) return;

  badge.classList.remove("is-visible", "is-stale", "is-error");

  if (state.dataSource === "api") {
    // dado fresco: badge oculto
    return;
  }

  if (state.dataSource === "cache" && state.cachedAt) {
    const dt = new Date(state.cachedAt);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const hh = String(dt.getHours()).padStart(2, "0");
    const mi = String(dt.getMinutes()).padStart(2, "0");
    badge.textContent = `Cache · ${dd}/${mm} ${hh}:${mi}`;
    badge.classList.add("is-visible", "is-stale");
    return;
  }

  if (state.dataSource === "static") {
    badge.textContent = "Dados de exemplo";
    badge.classList.add("is-visible", "is-stale");
    return;
  }
}

function formatMetric(value, suffix) {
  if (value === null || value === undefined) {
    return "sem dado";
  }
  return `${value}${suffix}`;
}

function buildSceneTitle(scores) {
  // Título principal segue o tier classificado, com nuance secundária
  if (state.tier === "radiante") {
    return scores.exercise > 0.7 ? "Ilha em ascensão plena" : "Ilha florescente";
  }
  if (state.tier === "critico") {
    if (state.flags.hydrationCritico) return "Ilha em colapso árido";
    if (state.flags.stressCritico) return "Ilha sufocada por correntes";
    return "Ilha em decomposição";
  }
  if (state.tier === "arido") {
    return state.flags.hydrationCritico ? "Arquipélago rarefeito" : "Habitat ressequido";
  }
  // normal
  if (scores.stress > 0.72) return "Ilha sob correntes tensas";
  return "Ecossistema suspenso";
}

function buildSummary(scores) {
  const parts = [];
  parts.push(
    scores.sleep > 0.72
      ? "O sono elevou a massa da ilha e adensou a copa."
      : "O descanso curto deixou a ilha mais baixa e contida.",
  );
  parts.push(
    scores.hydration > 0.62
      ? "A água abriu uma cascata mais viva e limpou a névoa."
      : "A pouca água secou a atmosfera e encurtou a queda d'água.",
  );
  parts.push(
    scores.exercise > 0.65
      ? "O treino trouxe fauna luminosa ao redor do topo."
      : "Com pouco movimento, o céu da ilha ficou mais silencioso.",
  );
  parts.push(
    scores.stress > 0.68
      ? "As correntes visíveis denunciam tensão acumulada de tela."
      : "O vento segue leve e o conjunto parece estável.",
  );
  return parts.join(" ");
}

function onResize() {
  state.camera.aspect = host.clientWidth / host.clientHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(host.clientWidth, host.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);
  const elapsed = state.clock.getElapsedTime();
  const { hydration, exercise, stress } = state.scoresDramatized;
  const sleepFrozen = state.flags.sleepCritico;
  const dryFountain = state.flags.hydrationCritico;

  if (state.island) {
    if (sleepFrozen) {
      // Sleep crítico: ilha pesada, flutuação suprimida, rotação reduzida
      state.island.position.y = state.islandBaseY + state.islandSinkOffset;
      state.island.rotation.y = elapsed * 0.04;
    } else {
      state.island.position.y =
        state.islandBaseY + state.islandSinkOffset + Math.sin(elapsed * 0.72) * 0.08;
      state.island.rotation.y = elapsed * 0.12;
    }
  }

  if (state.waterfall) {
    if (dryFountain) {
      // Cascata seca: opacidade baixa e estática
      state.waterfall.material.opacity = 0.16 + Math.sin(elapsed * 1.0) * 0.02;
    } else {
      state.waterfall.material.opacity = 0.35 + hydration * 0.38 + Math.sin(elapsed * 2.8) * 0.04;
      state.waterfall.position.y = 1.2 + Math.sin(elapsed * 1.8) * 0.04;
    }
  }

  if (state.mist) {
    // Crítico aumenta a névoa mesmo com hidratação dramatizada
    const baseMist = state.tier === "critico"
      ? 0.42
      : THREE.MathUtils.lerp(0.24, 0.06, hydration);
    state.mist.material.opacity = baseMist + Math.sin(elapsed * 1.4) * 0.01;
  }

  state.trees.forEach((tree, index) => {
    tree.rotation.z = Math.sin(elapsed * 0.9 + index * 0.5) * 0.012 * (0.4 + stress);
  });

  state.vines.forEach((vine, index) => {
    vine.rotation.z = Math.sin(elapsed * 0.7 + index) * 0.03;
  });

  state.clouds.forEach((cloud, index) => {
    cloud.position.x += 0.0018 + index * 0.00012;
    if (cloud.position.x > 11) {
      cloud.position.x = -11;
    }
  });

  if (state.fireflies) {
    const positions = state.fireflies.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += Math.sin(elapsed * (0.8 + exercise) + i) * 0.0012;
      positions[i + 1] += Math.cos(elapsed * (1.1 + exercise) + i) * 0.0016;
    }
    state.fireflies.geometry.attributes.position.needsUpdate = true;
  }

  state.windBands.forEach((band, index) => {
    band.position.x = Math.sin(elapsed * 0.8 + index * 0.6) * 0.22 * (0.25 + stress);
  });

  state.controls.update();
  state.renderer.render(state.scene, state.camera);
}

function rand() {
  return state.random();
}

function createSeededRandom(seedText) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

window.__bioHabitatDebug = {
  getIslandViewportBounds() {
    if (!state.island || !state.camera || !state.renderer) {
      return null;
    }

    state.scene.updateMatrixWorld(true);
    state.camera.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(state.island);
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];

    const rect = state.renderer.domElement.getBoundingClientRect();
    const points = corners.map((corner) => {
      const projected = corner.project(state.camera);
      return {
        x: ((projected.x + 1) / 2) * rect.width,
        y: ((1 - projected.y) / 2) * rect.height,
      };
    });

    return {
      left: Math.min(...points.map((point) => point.x)),
      right: Math.max(...points.map((point) => point.x)),
      top: Math.min(...points.map((point) => point.y)),
      bottom: Math.max(...points.map((point) => point.y)),
      width: rect.width,
      height: rect.height,
    };
  },
};
