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
const mainMenu = document.getElementById("main-menu");

let currentProfile = null;

function showScreen(screen) {
  [loadingScreen, profileScreen, errorScreen, planetScreen, mainMenu].forEach((s) => s.classList.add("hidden"));
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

  const avatarUrl = profile.avatar_url.startsWith("data:")
    ? profile.avatar_url
    : `${API_BASE_URL}${profile.avatar_url}`;

  // Профіль (на випадок якщо потрібен десь)
  document.getElementById("avatar-img").src = avatarUrl;
  document.getElementById("create-avatar-btn").textContent =
    profile.has_3d_avatar ? "🧑‍🎨 Змінити аватар" : "🧑‍🎨 Створити аватар";
  document.getElementById("display-name").textContent = profile.display_name;

  // Головне меню
  document.getElementById("menu-avatar").src = avatarUrl;
  document.getElementById("menu-display-name").textContent = profile.display_name;

  showScreen(mainMenu);
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

  // Сфера Землі з текстурою — надійний підхід, працює скрізь.
  // sRGB-кодування: без нього JPEG-текстура виглядає сірою/тьмяною.
  const loader = new THREE.TextureLoader();
  const earthMat = new THREE.MeshStandardMaterial({
    roughness: 0.45,
    metalness: 0.0,
  });
  loader.load("vendor/earth_atmos_2048.jpg", (t) => {
    t.encoding = THREE.sRGBEncoding;
    earthMat.map = t;
    earthMat.needsUpdate = true;
  });
  loader.load("vendor/earth_normal_2048.jpg", (t) => { earthMat.normalMap = t; earthMat.needsUpdate = true; });

  THREE_GLOBE = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), earthMat);
  THREE_SCENE.add(THREE_GLOBE);

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

  // Атмосферне світіння — дуже тонке, тільки на самих краях сфери
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
      "  float intensity = pow(0.82 - dot(vNormal, vec3(0,0,1.0)), 3.0);",
      "  gl_FragColor = vec4(0.2,0.4,0.8,1.0) * intensity * 0.5;",
      "}"
    ].join("\n"),
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
  });
  THREE_SCENE.add(new THREE.Mesh(new THREE.SphereGeometry(1.08, 64, 64), atmoMat));

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
    // idle rotation: планета повільно обертається
    if (!drag.active && THREE_GLOBE) THREE_GLOBE.rotation.y += 0.0015;
    THREE_RENDERER.render(THREE_SCENE, THREE_CAMERA);
  }
  animate();

  planetInitialized = true;
}

planetBackBtn.addEventListener("click", () => {
  hapticTap();
  showScreen(mainMenu);
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

// Навігація з головного меню
document.getElementById("menu-island-btn").addEventListener("click", () => {
  hapticTap();
  if (!window.THREE) {
    document.getElementById("error-detail").textContent = "3D бібліотека не завантажилась.";
    showScreen(errorScreen);
    return;
  }
  showScreen(planetScreen);
  requestAnimationFrame(() => initPlanet());
});

document.getElementById("menu-avatar-btn").addEventListener("click", () => {
  hapticTap();
  openAvatarBuilder();
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

/* ═══════════════════════════════════════════════
   3D AVATAR BUILDER (three.js)
   ═══════════════════════════════════════════════ */

let avatarScene, avatarCamera, avatarRenderer;
let avatarHead, avatarHairGroup, avatarMouthMesh, avatarGlassesGroup;

function initAvatar3D() {
  const canvas = document.getElementById("avatar-3d-canvas");
  if (!canvas || !window.THREE) return;

  if (avatarRenderer) { updateAvatar3D(); return; }

  avatarScene = new THREE.Scene();
  avatarCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  avatarCamera.position.set(0, 0.15, 3.2);
  avatarCamera.lookAt(0, 0, 0);

  avatarRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  avatarRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  avatarRenderer.setSize(200, 200);

  avatarScene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(2, 3, 4);
  avatarScene.add(dir);

  // Голова
  const headMat = new THREE.MeshStandardMaterial({ color: avatarConfig.skin, roughness: 0.5 });
  avatarHead = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 32), headMat);
  avatarHead.position.y = -0.05;
  avatarScene.add(avatarHead);

  // Очі
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  [-0.22, 0.22].forEach((x) => {
    const g = new THREE.Group();
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), whiteMat);
    w.position.z = 0.65; w.scale.z = 0.5; g.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), pupilMat);
    p.position.z = 0.72; g.add(p);
    g.position.set(x, 0.1, 0);
    avatarScene.add(g);
  });

  avatarHairGroup = new THREE.Group(); avatarScene.add(avatarHairGroup);
  avatarMouthMesh = null;
  avatarGlassesGroup = new THREE.Group(); avatarScene.add(avatarGlassesGroup);

  updateAvatar3D();

  (function animate() {
    requestAnimationFrame(animate);
    if (avatarHead) avatarHead.rotation.y = Math.sin(Date.now() * 0.001) * 0.15;
    avatarRenderer.render(avatarScene, avatarCamera);
  })();
}

function updateAvatar3D() {
  if (!avatarRenderer) return;

  // Шкіра
  avatarHead.material.color.set(avatarConfig.skin);

  // Зачіска
  avatarHairGroup.clear();
  const hMat = new THREE.MeshStandardMaterial({ color: avatarConfig.hairColor, roughness: 0.7 });
  switch (avatarConfig.hairStyle) {
    case "short": {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.78, 32, 16, 0, Math.PI*2, 0, Math.PI*0.45), hMat);
      cap.position.y = 0.1; avatarHairGroup.add(cap); break;
    }
    case "long": {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.78, 32, 16, 0, Math.PI*2, 0, Math.PI*0.45), hMat);
      cap.position.y = 0.1; avatarHairGroup.add(cap);
      [-1, 1].forEach((s) => {
        const side = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.6, 12), hMat);
        side.position.set(s*0.6, -0.2, 0.1); side.rotation.z = s * -0.15;
        avatarHairGroup.add(side);
      }); break;
    }
    case "curly": {
      [[-0.3,0.5,0.2],[0,0.6,0.15],[0.3,0.5,0.2],[-0.15,0.55,-0.1],[0.15,0.55,-0.1],[0,0.45,0.35]].forEach(([x,y,z]) => {
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), hMat);
        c.position.set(x,y,z); avatarHairGroup.add(c);
      }); break;
    }
    case "mohawk": {
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3-i*0.03, 8), hMat);
        s.position.set(0, 0.45+i*0.06, 0.25-i*0.06); avatarHairGroup.add(s);
      } break;
    }
  }

  // Рот
  avatarScene.remove(avatarMouthMesh);
  const mMat = new THREE.MeshStandardMaterial({ color: 0x5a3825 });
  switch (avatarConfig.mouth) {
    case "smile": {
      avatarMouthMesh = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 8, 16, Math.PI), mMat);
      avatarMouthMesh.position.set(0, -0.25, 0.68);
      avatarMouthMesh.rotation.x = Math.PI; avatarMouthMesh.rotation.z = Math.PI; break;
    }
    case "neutral": {
      avatarMouthMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), mMat);
      avatarMouthMesh.position.set(0, -0.25, 0.7); avatarMouthMesh.rotation.z = Math.PI/2; break;
    }
    case "open": {
      avatarMouthMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), mMat);
      avatarMouthMesh.position.set(0, -0.28, 0.66); avatarMouthMesh.scale.y = 1.3; break;
    }
    case "smirk": {
      avatarMouthMesh = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 16, Math.PI*0.7), mMat);
      avatarMouthMesh.position.set(0.05, -0.25, 0.68);
      avatarMouthMesh.rotation.x = Math.PI; avatarMouthMesh.rotation.z = Math.PI+0.3; break;
    }
  }
  if (avatarMouthMesh) avatarScene.add(avatarMouthMesh);

  // Окуляри
  avatarGlassesGroup.clear();
  if (avatarConfig.glasses) {
    const gMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3 });
    [-0.22, 0.22].forEach((x) => {
      const f = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 8, 24), gMat);
      f.position.set(x, 0.1, 0.72); avatarGlassesGroup.add(f);
    });
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), gMat);
    bridge.position.set(0, 0.1, 0.74); bridge.rotation.z = Math.PI/2;
    avatarGlassesGroup.add(bridge);
    [-1, 1].forEach((s) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 6), gMat);
      arm.position.set(s*0.35, 0.12, 0.6); arm.rotation.y = s*-0.5; arm.rotation.z = Math.PI/2;
      avatarGlassesGroup.add(arm);
    });
  }
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

function renderAvatarPreview() {
  updateAvatar3D();
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

  initAvatar3D();
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
  // Експортуємо 3D-сцену в PNG data URI
  const canvas = document.getElementById("avatar-3d-canvas");
  const dataUri = canvas.toDataURL("image/png");

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
