// API живе на тому самому origin, що й фронтенд (бекенд сам роздає HTML/CSS/JS).
// Відносний шлях працює і локально, і на Render — не треба міняти при деплої.
const API_BASE_URL = "";

// Global error log to surface issues in WebView
window.onerror = function(msg, src, line, col, err){
  try {
    console.error('[GLOBAL ERROR]', msg, src, line, col, err);
    const el = document.getElementById('error-detail');
    if (el) {
      el.textContent = String(msg || err?.message || 'Unknown error');
      document.getElementById('error-screen')?.classList.remove('hidden');
    }
  } catch {}
};

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

function applyTelegramTheme() {
  const p = tg.themeParams;
  if (!p) return;
  document.documentElement.style.setProperty("--tg-bg", p.bg_color || "#ffffff");
  document.documentElement.style.setProperty("--tg-text", p.text_color || "#000000");
  document.documentElement.style.setProperty("--tg-hint", p.hint_color || "#999999");
  document.documentElement.style.setProperty("--tg-button", p.button_color || "#56c596");
  document.documentElement.style.setProperty("--tg-button-text", p.button_text_color || "#ffffff");
  document.documentElement.style.setProperty("--tg-secondary-bg", p.secondary_bg_color || "#f0f0f0");
  tg.setHeaderColor(p.bg_color || "#ffffff");
  tg.setBackgroundColor(p.bg_color || "#ffffff");
}
applyTelegramTheme();
tg.onEvent("themeChanged", applyTelegramTheme);

if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();

function hapticTap() {
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
}

const loadingScreen = document.getElementById("loading");
const profileScreen = document.getElementById("profile-screen");
const errorScreen = document.getElementById("error-screen");
const planetScreen = document.getElementById("planet-screen");
const planetCanvas = document.getElementById("planet-canvas");
const planetBackBtn = document.getElementById("planet-back-btn");

let currentProfile = null;

function showScreen(screen) {
  [loadingScreen, profileScreen, errorScreen, planetScreen].forEach((s) => s.classList.add("hidden"));
  screen.classList.remove("hidden");
}

async function initProfile() {
  try {
    const initData = tg.initData;

    if (!initData) {
      document.getElementById("error-detail").textContent =
        "Відкрий цей застосунок через кнопку в Telegram-боті, а не напряму в браузері.";
      showScreen(errorScreen);
      return;
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: initData }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Помилка сервера: ${response.status}`);
    }

    const profile = await response.json();
    renderProfile(profile);
  } catch (err) {
    document.getElementById("error-detail").textContent = err.message;
    showScreen(errorScreen);
  }
}

function renderProfile(profile) {
  currentProfile = profile;

  const avatarImg = document.getElementById("avatar-img");
  const createAvatarBtn = document.getElementById("create-avatar-btn");

  avatarImg.src = profile.avatar_url.startsWith("data:")
    ? profile.avatar_url
    : `${API_BASE_URL}${profile.avatar_url}`;

  createAvatarBtn.textContent = profile.has_3d_avatar ? "🧑‍🎨 Змінити аватар" : "🧑‍🎨 Створити аватар";

  document.getElementById("display-name").textContent = profile.display_name;

  const title = document.getElementById("welcome-title");
  const subText = document.getElementById("sub-text");

  if (profile.is_new) {
    title.textContent = "Твій острів створено!";
    subText.textContent = "Це твій профіль. Спробуй зібрати собі власного персонажа!";
  } else {
    title.textContent = "З поверненням!";
    subText.textContent = "Твій профіль уже готовий.";
  }

  showScreen(profileScreen);
}

let planetInitialized = false;
let THREE_SCENE = null, THREE_CAMERA = null, THREE_RENDERER = null, THREE_GLOBE = null;
let drag = { active: false, x: 0, y: 0 };

function initPlanet() {
  if (planetInitialized) return;
  const w = (planetScreen && planetScreen.clientWidth) ? planetScreen.clientWidth : window.innerWidth;
  const h = (planetScreen && planetScreen.clientHeight) ? planetScreen.clientHeight : window.innerHeight;
  console.log("[3D] initPlanet with size", w, h);

  THREE_SCENE = new THREE.Scene();
  THREE_CAMERA = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
  THREE_CAMERA.position.set(0, 0, 3);

  try {
    THREE_RENDERER = new THREE.WebGLRenderer({ canvas: planetCanvas, antialias: true, alpha: true });
  } catch (err) {
    console.error("[3D] WebGL unavailable:", err);
    document.getElementById("error-detail").textContent =
      "3D-графіка не підтримується тут. Спробуй оновити Telegram або відкрити застосунок в іншому клієнті.";
    showScreen(errorScreen);
    return;
  }
  THREE_RENDERER.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  THREE_RENDERER.setSize(w, h);
  // sRGB-кодування: без нього JPEG-текстура завантажиться як Linear і
  // Земля виглядає сірою/тьмяною замість яскравою з сушами та океанами.
  if (THREE.sRGBEncoding) THREE_RENDERER.outputEncoding = THREE.sRGBEncoding;

  // Lights
  // Освітлення: достатньо яскраве, щоб суходоли та океани були чітко видно
  const amb = new THREE.AmbientLight(0xffffff, 0.65);
  THREE_SCENE.add(amb);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(5, 3, 5);
  THREE_SCENE.add(sun);

  // Текстури Землі вендорені локально (vendor/) — надійно працюють у Telegram
  // WebView без зовнішніх CDN. map підставляємо лише коли файл завантажився.
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0.0,
  });
  const loader = new THREE.TextureLoader();
  // sRGB-кодування для кольорових текстур — без нього суша зливається з океаном
  loader.load("vendor/earth_atmos_2048.jpg", (t) => {
    t.encoding = THREE.sRGBEncoding;
    material.map = t;
    material.needsUpdate = true;
  });
  loader.load("vendor/earth_normal_2048.jpg", (t) => { material.normalMap = t; material.needsUpdate = true; });
  loader.load("vendor/earth_specular_2048.jpg", (t) => { material.specularMap = t; material.needsUpdate = true; });

  THREE_GLOBE = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), material);
  THREE_SCENE.add(THREE_GLOBE);

  // Шар хмар — напівпрозора сфера трохи більшого радіуса
  const cloudsMat = new THREE.MeshPhongMaterial({
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  loader.load("vendor/earth_clouds_1024.png", (t) => {
    t.encoding = THREE.sRGBEncoding;
    cloudsMat.map = t;
    cloudsMat.needsUpdate = true;
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 64), cloudsMat);
  THREE_SCENE.add(clouds);

  // Зірки навколо — щоб замість чорного фону був космос
  const starsPositions = [];
  for (let i = 0; i < 500; i++) {
    const r = 9 + Math.random() * 12;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starsPositions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );
  }
  const starsGeo = new THREE.BufferGeometry();
  starsGeo.setAttribute("position", new THREE.Float32BufferAttribute(starsPositions, 3));
  THREE_SCENE.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.04 })));

  // Атмосферне світіння (ефект Френеля) — блакитна оболонка навколо Землі,
  // що робить її впізнаваною з космосу.
  const atmoMat = new THREE.ShaderMaterial({
    vertexShader: [
      "varying vec3 vNormal;",
      "void main(){",
      "  vNormal = normalize(normalMatrix * normal);",
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);",
      "}"
    ].join("\n"),
    fragmentShader: [
      "varying vec3 vNormal;",
      "void main(){",
      "  float intensity = pow(0.65 - dot(vNormal, vec3(0,0,1.0)), 2.5);",
      "  gl_FragColor = vec4(0.3,0.6,1.0,1.0) * intensity;",
      "}"
    ].join("\n"),
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
  });
  THREE_SCENE.add(new THREE.Mesh(new THREE.SphereGeometry(1.12, 64, 64), atmoMat));

  // Simple drag-to-rotate and wheel-zoom controls
  function onPointerDown(e){
    drag.active = true;
    drag.x = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    drag.y = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;
  }
  function onPointerMove(e){
    if (!drag.active) return;
    const nx = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    const ny = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;
    const dx = (nx - drag.x) / (planetScreen.clientWidth || window.innerWidth);
    const dy = (ny - drag.y) / (planetScreen.clientHeight || window.innerHeight);
    drag.x = nx; drag.y = ny;
    // Rotate globe: horizontal drag -> y rotation, vertical drag -> x rotation
    THREE_GLOBE.rotation.y += dx * Math.PI * 2;
    THREE_GLOBE.rotation.x += dy * Math.PI * 2;
    THREE_GLOBE.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, THREE_GLOBE.rotation.x));
    // хмари крутяться разом із планетою
    clouds.rotation.y = THREE_GLOBE.rotation.y;
    clouds.rotation.x = THREE_GLOBE.rotation.x;
  }
  function onPointerUp(){ drag.active = false; }
  planetCanvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  planetCanvas.addEventListener('touchstart', onPointerDown, {passive: true});
  window.addEventListener('touchmove', onPointerMove, {passive: true});
  window.addEventListener('touchend', onPointerUp, {passive: true});
  planetCanvas.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const d = Math.sign(e.deltaY);
    const cur = THREE_CAMERA.position.length();
    const next = Math.max(1.2, Math.min(6, cur + d * 0.2));
    THREE_CAMERA.position.setLength(next);
  }, { passive: false });

  function onResize() {
    const w2 = planetScreen.clientWidth || window.innerWidth;
    const h2 = planetScreen.clientHeight || window.innerHeight;
    THREE_CAMERA.aspect = w2 / h2;
    THREE_CAMERA.updateProjectionMatrix();
    THREE_RENDERER.setSize(w2, h2);
  }
  window.addEventListener("resize", onResize);

  function animate() {
    requestAnimationFrame(animate);
    // idle rotation: планета + хмари повільно обертаються
    if (!drag.active && THREE_GLOBE) {
      THREE_GLOBE.rotation.y += 0.0015;
      clouds.rotation.y += 0.0018;
    }
    THREE_RENDERER.render(THREE_SCENE, THREE_CAMERA);
  }
  animate();

  planetInitialized = true;
}

planetBackBtn.addEventListener("click", () => {
  hapticTap();
  showScreen(profileScreen);
});

window.addEventListener("load", () => {
  console.log("[APP] window loaded, THREE:", !!window.THREE);
});

document.getElementById("continue-btn").addEventListener("click", () => {
  try {
    console.log("[UI] Continue clicked");
    hapticTap();
    if (!window.THREE) {
      console.error("[3D] THREE not loaded");
      document.getElementById("error-detail").textContent = "3D бібліотека не завантажилась. Онови сторінку або спробуй ще раз.";
      showScreen(errorScreen);
      return;
    }
    // Спочатку показуємо екран планети, щоб canvas мав реальні розміри,
    // потім ініціалізуємо 3D-сцену в наступному кадрі.
    showScreen(planetScreen);
    requestAnimationFrame(() => initPlanet());
  } catch (e) {
    console.error("[3D] init error:", e);
    document.getElementById("error-detail").textContent = String(e?.message || e);
    showScreen(errorScreen);
  }
});

const SKIN_TONES = ["#FFDBB4", "#F1C27D", "#E0AC69", "#C68642", "#8D5524", "#5C3317"];
const HAIR_COLORS = ["#2C1B18", "#4A2E1E", "#B55239", "#D6B370", "#E8E8E8", "#1E88E5", "#E91E63"];
const HAIR_STYLES = [
  { id: "bald", label: "Лисий" },
  { id: "short", label: "Коротка" },
  { id: "long", label: "Довга" },
  { id: "curly", label: "Кучері" },
  { id: "mohawk", label: "Ірокез" },
];
const MOUTH_STYLES = [
  { id: "smile", label: "Усмішка" },
  { id: "neutral", label: "Нейтрально" },
  { id: "open", label: "Здивування" },
  { id: "smirk", label: "Смірк" },
];

let avatarConfig = {
  skin: SKIN_TONES[0],
  hairStyle: "short",
  hairColor: HAIR_COLORS[0],
  mouth: "smile",
  glasses: false,
};

function hairSvg(style, color) {
  switch (style) {
    case "bald":
      return "";
    case "short":
      return `<path d="M32,88 Q36,18 100,18 Q164,18 168,88 L168,55 Q160,32 100,32 Q40,32 32,55 Z" fill="${color}"/>`;
    case "long":
      return `
        <path d="M32,88 Q36,18 100,18 Q164,18 168,88 L168,55 Q160,32 100,32 Q40,32 32,55 Z" fill="${color}"/>
        <rect x="22" y="55" width="20" height="90" rx="10" fill="${color}"/>
        <rect x="158" y="55" width="20" height="90" rx="10" fill="${color}"/>
      `;
    case "curly":
      return `
        <circle cx="50" cy="45" r="18" fill="${color}"/>
        <circle cx="80" cy="28" r="20" fill="${color}"/>
        <circle cx="115" cy="26" r="20" fill="${color}"/>
        <circle cx="148" cy="42" r="18" fill="${color}"/>
        <circle cx="65" cy="35" r="16" fill="${color}"/>
        <circle cx="132" cy="34" r="16" fill="${color}"/>
      `;
    case "mohawk":
      return `<path d="M85,15 Q100,5 115,15 L120,70 Q100,60 80,70 Z" fill="${color}"/>`;
    default:
      return "";
  }
}

function mouthSvg(style) {
  switch (style) {
    case "smile":
      return `<path d="M75,130 Q100,152 125,130" stroke="#5a3825" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case "neutral":
      return `<line x1="80" y1="132" x2="120" y2="132" stroke="#5a3825" stroke-width="4" stroke-linecap="round"/>`;
    case "open":
      return `<ellipse cx="100" cy="133" rx="12" ry="16" fill="#5a3825"/>`;
    case "smirk":
      return `<path d="M78,130 Q100,140 122,124" stroke="#5a3825" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    default:
      return "";
  }
}

function glassesSvg(enabled) {
  if (!enabled) return "";
  return `
    <circle cx="78" cy="95" r="16" fill="none" stroke="#333" stroke-width="4"/>
    <circle cx="122" cy="95" r="16" fill="none" stroke="#333" stroke-width="4"/>
    <line x1="94" y1="95" x2="106" y2="95" stroke="#333" stroke-width="4"/>
  `;
}

function generateAvatarSVG(config) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <circle cx="100" cy="100" r="90" fill="#eef6f2"/>
    <ellipse cx="100" cy="115" rx="70" ry="75" fill="${config.skin}"/>
    <circle cx="78" cy="95" r="7" fill="#2c1b18"/>
    <circle cx="122" cy="95" r="7" fill="#2c1b18"/>
    <circle cx="80" cy="93" r="2" fill="#fff"/>
    <circle cx="124" cy="93" r="2" fill="#fff"/>
    ${mouthSvg(config.mouth)}
    ${hairSvg(config.hairStyle, config.hairColor)}
    ${glassesSvg(config.glasses)}
  </svg>`;
}

function renderAvatarPreview() {
  document.getElementById("avatar-preview").innerHTML = generateAvatarSVG(avatarConfig);
}

function buildSwatchRow(containerId, colors, configKey) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  colors.forEach((color) => {
    const btn = document.createElement("button");
    btn.className = "swatch";
    btn.style.background = color;
    if (avatarConfig[configKey] === color) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      hapticTap();
      avatarConfig[configKey] = color;
      container.querySelectorAll(".swatch").forEach((s) => s.classList.remove("selected"));
      btn.classList.add("selected");
      renderAvatarPreview();
    });
    container.appendChild(btn);
  });
}

function buildPillRow(containerId, options, configKey) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "pill-btn";
    btn.textContent = opt.label;
    if (avatarConfig[configKey] === opt.id) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      hapticTap();
      avatarConfig[configKey] = opt.id;
      container.querySelectorAll(".pill-btn").forEach((p) => p.classList.remove("selected"));
      btn.classList.add("selected");
      renderAvatarPreview();
    });
    container.appendChild(btn);
  });
}

function setupAvatarBuilder() {
  buildSwatchRow("skin-swatches", SKIN_TONES, "skin");
  buildPillRow("hair-style-row", HAIR_STYLES, "hairStyle");
  buildSwatchRow("hair-color-swatches", HAIR_COLORS, "hairColor");
  buildPillRow("mouth-style-row", MOUTH_STYLES, "mouth");

  const glassesToggle = document.getElementById("glasses-toggle");
  glassesToggle.checked = avatarConfig.glasses;
  glassesToggle.addEventListener("change", () => {
    hapticTap();
    avatarConfig.glasses = glassesToggle.checked;
    renderAvatarPreview();
  });

  renderAvatarPreview();
}

const avatarBuilderOverlay = document.getElementById("avatar-builder-overlay");

function openAvatarBuilder() {
  hapticTap();
  setupAvatarBuilder();
  avatarBuilderOverlay.classList.remove("hidden");
}

function closeAvatarBuilder() {
  hapticTap();
  avatarBuilderOverlay.classList.add("hidden");
}

document.getElementById("create-avatar-btn").addEventListener("click", openAvatarBuilder);
document.getElementById("close-avatar-builder").addEventListener("click", closeAvatarBuilder);

document.getElementById("save-avatar-btn").addEventListener("click", async () => {
  hapticTap();
  const svgString = generateAvatarSVG(avatarConfig);
  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;

  try {
    const response = await fetch(`${API_BASE_URL}/api/profile/avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: tg.initData, avatar_url: dataUri }),
    });

    if (!response.ok) throw new Error("Не вдалось зберегти аватар");

    const updatedProfile = await response.json();
    closeAvatarBuilder();
    renderProfile(updatedProfile);
    tg.HapticFeedback?.notificationOccurred("success");
  } catch (err) {
    tg.showAlert("Не вдалось зберегти аватар: " + err.message);
  }
});

initProfile();
