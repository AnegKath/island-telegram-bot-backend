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

/* ═══════════════════════════════════════════════════════════════
   3D AVATAR BUILDER — повний ріст, ігровий blocky стиль
   ═══════════════════════════════════════════════════════════════ */

// 33 відтінки шкіри від порцелянового до темно-кавового
const SKIN_TONES = [
  "#FFF5E6","#FFECD2","#FFE0B2","#FFDBB4","#FFD1A4","#F5C89A",
  "#E8B88A","#D4A574","#C69C6D","#B8860B","#A0785A","#8D6E4C",
  "#7A5C3E","#6B4E35","#5C3D2B","#4A3228","#3D2B1F","#2E1F14",
  "#8B6914","#C49A6C","#DEB887","#D2B48C","#BC8F8F","#A0522D",
  "#8B4513","#CD853F","#D2691E","#B87333","#DAA520","#CC7722",
  "#996515","#704214","#4B3621"
];

// 16 зачісок
const HAIRSTYLES = [
  { id: "buzz", label: "Базз" },{ id: "crop", label: "Кроп" },
  { id: "short", label: "Коротка" },{ id: "medium", label: "Середня" },
  { id: "long", label: "Довга" },{ id: "curly", label: "Кучері" },
  { id: "afro", label: "Афро" },{ id: "mohawk", label: "Ірокез" },
  { id: "bun", label: "Пучок" },{ id: "ponytail", label: "Хвіст" },
  { id: "braids", label: "Косички" },{ id: "fade", label: "Фейд" },
  { id: "undercut", label: "Андеркат" },{ id: "messy", label: "Хаотик" },
  { id: "slick", label: "Гладко" },{ id: "sidepart", label: "Збоку" },
];

const HAIR_COLORS = [
  "#0a0a0a","#1a1a1a","#2C1B18","#4A2E1E","#6B3A2A","#8B4513",
  "#A0522D","#B55239","#C68642","#D4A574","#E8C07A","#F5DEB3",
  "#E8E8E8","#C0C0C0","#1E88E5","#E91E63","#9C27B0","#FF9800",
];

// 7 брендів
const BRANDS = [
  { id: "all", name: "Усі" },{ id: "nike", name: "Nike" },
  { id: "adidas", name: "Adidas" },{ id: "supreme", name: "Supreme" },
  { id: "offwhite", name: "Off-White" },{ id: "stussy", name: "Stüssy" },
  { id: "palace", name: "Palace" },{ id: "bape", name: "BAPE" },
];

// Верхній одяг
const TOPS = [
  { id:"n1", name:"Dri-FIT", brand:"nike", fit:"slim", color:"#111111" },
  { id:"n2", name:"Sport Tee", brand:"nike", fit:"regular", color:"#ffffff" },
  { id:"n3", name:"Tech Fleece", brand:"nike", fit:"loose", color:"#2d2d2d" },
  { id:"n4", name:"Windrunner", brand:"nike", fit:"regular", color:"#0066cc" },
  { id:"a1", name:"Originals Tee", brand:"adidas", fit:"regular", color:"#111111" },
  { id:"a2", name:"Trefoil Hoodie", brand:"adidas", fit:"loose", color:"#1a1a6e" },
  { id:"a3", name:"Stripe Jacket", brand:"adidas", fit:"regular", color:"#ffffff" },
  { id:"s1", name:"Box Logo Hoodie", brand:"supreme", fit:"loose", color:"#e31837" },
  { id:"s2", name:"Box Logo Tee", brand:"supreme", fit:"regular", color:"#ffffff" },
  { id:"s3", name:"Camp Cap Tee", brand:"supreme", fit:"slim", color:"#000000" },
  { id:"o1", name:"Diagonal Tee", brand:"offwhite", fit:"slim", color:"#ffffff" },
  { id:"o2", name:"Arrows Hoodie", brand:"offwhite", fit:"loose", color:"#111111" },
  { id:"o3", name:"Industrial Belt Tee", brand:"offwhite", fit:"regular", color:"#ff6600" },
  { id:"st1", name:"Basic Logo", brand:"stussy", fit:"regular", color:"#111111" },
  { id:"st2", name:"8 Ball Hoodie", brand:"stussy", fit:"loose", color:"#2d2d2d" },
  { id:"p1", name:"Triferg Tee", brand:"palace", fit:"regular", color:"#ffffff" },
  { id:"p2", name:"Gucci Collab", brand:"palace", fit:"loose", color:"#006633" },
  { id:"b1", name:"Shark Hoodie", brand:"bape", fit:"loose", color:"#1a1a1a" },
  { id:"b2", name:"Camo Tee", brand:"bape", fit:"regular", color:"#4a6741" },
];

// Штани
const PANTS = [
  { id:"pn1", name:"Joggers", brand:"nike", fit:"slim", color:"#111111" },
  { id:"pn2", name:"Tech Fleece", brand:"nike", fit:"regular", color:"#2d2d2d" },
  { id:"pa1", name:"Track Pants", brand:"adidas", fit:"regular", color:"#111111" },
  { id:"pa2", name:"Cargo", brand:"adidas", fit:"loose", color:"#5c5c3d" },
  { id:"ps1", name:"Cargo Pants", brand:"supreme", fit:"loose", color:"#1a1a1a" },
  { id:"po1", name:"Carpenter", brand:"offwhite", fit:"loose", color:"#d4c5a9" },
  { id:"pst1", name:"Pleated", brand:"stussy", fit:"regular", color:"#2d2d2d" },
  { id:"pp1", name:"Track Pant", brand:"palace", fit:"slim", color:"#111111" },
  { id:"pb1", name:"Shark Pants", brand:"bape", fit:"regular", color:"#1a1a1a" },
];

// Взуття
const SHOES = [
  { id:"sh1", name:"Air Max 90", brand:"nike", color:"#ffffff" },
  { id:"sh2", name:"Air Force 1", brand:"nike", color:"#ffffff" },
  { id:"sh3", name:"Dunk Low", brand:"nike", color:"#111111" },
  { id:"sh4", name:"Jordan 1", brand:"nike", color:"#cc0000" },
  { id:"sh5", name:"Ultraboost", brand:"adidas", color:"#111111" },
  { id:"sh6", name:"Forum Low", brand:"adidas", color:"#ffffff" },
  { id:"sh7", name:"Superstar", brand:"adidas", color:"#ffffff" },
  { id:"sh8", name:"Skate Shoes", brand:"supreme", color:"#e31837" },
  { id:"sh9", name:"Vulcanized", brand:"offwhite", color:"#ffffff" },
  { id:"sh10", name:"Classic Vans", brand:"stussy", color:"#1a1a1a" },
  { id:"sh11", name:"Palace Pro", brand:"palace", color:"#111111" },
  { id:"sh12", name:"Bapesta", brand:"bape", color:"#ffffff" },
];

let avatarConfig = {
  skin: SKIN_TONES[6],
  hairStyle: "short",
  hairColor: HAIR_COLORS[0],
  top: TOPS[0],
  pants: PANTS[0],
  shoes: SHOES[0],
};
let activeFilter = { tops: "all", pants: "all", shoes: "all" };

// ═══════════════════════════════════════════════════════
// 3D CHARACTER — blocky повний ріст
// ═══════════════════════════════════════════════════════

let avScene, avCam, avRen;
let C = {};

function initAvatar3D() {
  const canvas = document.getElementById("avatar-3d-canvas");
  if (!canvas || !window.THREE) return;
  if (avRen) { updateAvatar3D(); return; }

  avScene = new THREE.Scene();
  avCam = new THREE.PerspectiveCamera(35, 300/420, 0.1, 100);
  avCam.position.set(0, 0.8, 5.5);
  avCam.lookAt(0, 0.4, 0);

  avRen = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  avRen.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  avRen.setSize(300, 420);

  avScene.add(new THREE.AmbientLight(0xffffff, 0.75));
  var dl = new THREE.DirectionalLight(0xffffff, 0.85);
  dl.position.set(3, 5, 4); avScene.add(dl);

  var skin = function(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }); };
  var sCol = avatarConfig.skin;

  C.head = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.7,0.7), skin(sCol));
  C.head.position.y = 2.2; avScene.add(C.head);

  var wM = new THREE.MeshStandardMaterial({color:0xffffff});
  var pM = new THREE.MeshStandardMaterial({color:0x111111});
  [-0.14,0.14].forEach(function(x) {
    var g = new THREE.Group();
    var wm = new THREE.Mesh(new THREE.SphereGeometry(0.07,10,10),wM); wm.position.set(x,2.3,0.36); g.add(wm);
    var pm = new THREE.Mesh(new THREE.SphereGeometry(0.04,8,8),pM); pm.position.set(x,2.3,0.41); g.add(pm);
    avScene.add(g);
  });

  C.body = new THREE.Mesh(new THREE.BoxGeometry(0.8,1.0,0.45), new THREE.MeshStandardMaterial({color:avatarConfig.top.color,roughness:0.7}));
  C.body.position.y = 1.35; avScene.add(C.body);

  var armMat = skin(sCol);
  C.lArm = new THREE.Mesh(new THREE.BoxGeometry(0.24,0.9,0.24), armMat.clone());
  C.lArm.position.set(-0.52,1.4,0); avScene.add(C.lArm);
  C.rArm = new THREE.Mesh(new THREE.BoxGeometry(0.24,0.9,0.24), armMat.clone());
  C.rArm.position.set(0.52,1.4,0); avScene.add(C.rArm);

  var pantMat = new THREE.MeshStandardMaterial({color:avatarConfig.pants.color,roughness:0.7});
  C.lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.9,0.3), pantMat.clone());
  C.lLeg.position.set(-0.19,0.4,0); avScene.add(C.lLeg);
  C.rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.9,0.3), pantMat.clone());
  C.rLeg.position.set(0.19,0.4,0); avScene.add(C.rLeg);

  var shoeMat = new THREE.MeshStandardMaterial({color:avatarConfig.shoes.color,roughness:0.5});
  C.lShoe = new THREE.Mesh(new THREE.BoxGeometry(0.32,0.14,0.44), shoeMat.clone());
  C.lShoe.position.set(-0.19,-0.02,0.04); avScene.add(C.lShoe);
  C.rShoe = new THREE.Mesh(new THREE.BoxGeometry(0.32,0.14,0.44), shoeMat.clone());
  C.rShoe.position.set(0.19,-0.02,0.04); avScene.add(C.rShoe);

  C.hairG = new THREE.Group(); avScene.add(C.hairG);

  updateAvatar3D();

  (function anim(){
    requestAnimationFrame(anim);
    avScene.rotation.y = Math.sin(Date.now()*0.0008)*0.12;
    avRen.render(avScene, avCam);
  })();
}

function updateAvatar3D() {
  if (!avRen) return;
  var sc = avatarConfig.skin;
  C.head.material.color.set(sc);
  C.lArm.material.color.set(sc);
  C.rArm.material.color.set(sc);
  C.body.material.color.set(avatarConfig.top.color);
  C.lLeg.material.color.set(avatarConfig.pants.color);
  C.rLeg.material.color.set(avatarConfig.pants.color);
  C.lShoe.material.color.set(avatarConfig.shoes.color);
  C.rShoe.material.color.set(avatarConfig.shoes.color);

  C.hairG.clear();
  var hM = new THREE.MeshStandardMaterial({color:avatarConfig.hairColor,roughness:0.7});
  var Y = 2.55;
  var add = function(geo,pos,rot) {
    var m = new THREE.Mesh(geo, hM);
    m.position.set(pos[0],pos[1],pos[2]);
    if(rot) m.rotation.set(rot[0],rot[1],rot[2]);
    C.hairG.add(m);
  };
  switch(avatarConfig.hairStyle) {
    case "buzz": add(new THREE.BoxGeometry(0.72,0.06,0.72),[0,Y,0]); break;
    case "crop": add(new THREE.BoxGeometry(0.74,0.14,0.74),[0,Y+0.04,0]); break;
    case "short": add(new THREE.BoxGeometry(0.76,0.2,0.76),[0,Y+0.06,0]); break;
    case "medium": add(new THREE.BoxGeometry(0.78,0.32,0.78),[0,Y+0.12,0]); break;
    case "long":
      add(new THREE.BoxGeometry(0.78,0.25,0.78),[0,Y+0.1,0]);
      add(new THREE.BoxGeometry(0.14,0.65,0.14),[-0.34,1.85,0]);
      add(new THREE.BoxGeometry(0.14,0.65,0.14),[0.34,1.85,0]); break;
    case "curly":
      for(var i=0;i<9;i++){
        var a=(i/9)*Math.PI*2;
        add(new THREE.SphereGeometry(0.1,8,8),[Math.cos(a)*0.34,Y+0.08+Math.random()*0.12,Math.sin(a)*0.34]);
      } break;
    case "afro": add(new THREE.SphereGeometry(0.52,14,14),[0,Y-0.05,0]); break;
    case "mohawk":
      for(var i=0;i<5;i++) add(new THREE.ConeGeometry(0.055,0.24-i*0.02,6),[0,Y+i*0.05,-0.08+i*0.04]); break;
    case "bun":
      add(new THREE.BoxGeometry(0.76,0.18,0.76),[0,Y+0.05,0]);
      add(new THREE.SphereGeometry(0.18,10,10),[0,Y+0.3,-0.18]); break;
    case "ponytail":
      add(new THREE.BoxGeometry(0.76,0.18,0.76),[0,Y+0.05,0]);
      add(new THREE.BoxGeometry(0.1,0.55,0.1),[0,1.9,-0.38],[0.3,0,0]); break;
    case "braids":
      add(new THREE.BoxGeometry(0.76,0.18,0.76),[0,Y+0.05,0]);
      [-0.22,0.22].forEach(function(x){for(var j=0;j<4;j++)
        add(new THREE.SphereGeometry(0.055,6,6),[x,2.1-j*0.14,-0.12]);}); break;
    case "fade":
      add(new THREE.BoxGeometry(0.74,0.22,0.74),[0,Y+0.08,0]); break;
    case "undercut": add(new THREE.BoxGeometry(0.55,0.28,0.76),[0,Y+0.1,0.04]); break;
    case "messy":
      for(var i=0;i<7;i++) add(new THREE.BoxGeometry(0.18,0.12,0.18),
        [(Math.random()-0.5)*0.45,Y+Math.random()*0.2,(Math.random()-0.5)*0.45],
        [Math.random()*0.5,Math.random()*0.5,Math.random()*0.5]); break;
    case "slick": add(new THREE.BoxGeometry(0.76,0.1,0.82),[0,Y+0.02,-0.02]); break;
    case "sidepart":
      add(new THREE.BoxGeometry(0.48,0.2,0.76),[-0.1,Y+0.07,0]);
      add(new THREE.BoxGeometry(0.28,0.1,0.76),[0.25,Y+0.02,0]); break;
  }
}

// ═══════════════════════════════════════════════════════
// UI — таби, фільтри, списки
// ═══════════════════════════════════════════════════════

function renderSkinGrid() {
  var g = document.getElementById("skin-grid");
  g.innerHTML = "";
  SKIN_TONES.forEach(function(c) {
    var s = document.createElement("button");
    s.className = "skin-swatch" + (avatarConfig.skin===c?" selected":"");
    s.style.background = c;
    s.onclick = function() { hapticTap(); avatarConfig.skin=c; renderSkinGrid(); updateAvatar3D(); };
    g.appendChild(s);
  });
}

function renderHairStyles() {
  var l = document.getElementById("hair-styles-list");
  l.innerHTML = "";
  HAIRSTYLES.forEach(function(h) {
    var d = document.createElement("div");
    d.className = "item-card" + (avatarConfig.hairStyle===h.id?" selected":"");
    d.innerHTML = '<div class="item-card-color" style="background:'+avatarConfig.hairColor+'"></div><div class="item-card-info"><div class="item-card-name">'+h.label+'</div></div>';
    d.onclick = function() { hapticTap(); avatarConfig.hairStyle=h.id; renderHairStyles(); updateAvatar3D(); };
    l.appendChild(d);
  });
  var g = document.getElementById("hair-color-grid");
  g.innerHTML = "";
  HAIR_COLORS.forEach(function(c) {
    var s = document.createElement("button");
    s.className = "skin-swatch" + (avatarConfig.hairColor===c?" selected":"");
    s.style.background = c;
    s.onclick = function() { hapticTap(); avatarConfig.hairColor=c; renderHairStyles(); updateAvatar3D(); };
    g.appendChild(s);
  });
}

function renderClothingList(items, containerId, filterId, configKey) {
  var l = document.getElementById(containerId);
  var fDiv = document.getElementById(filterId);
  fDiv.innerHTML = "";
  BRANDS.forEach(function(b) {
    var chip = document.createElement("button");
    chip.className = "filter-chip" + (activeFilter[configKey]===b.id?" active":"");
    chip.textContent = b.name;
    chip.onclick = function() { hapticTap(); activeFilter[configKey]=b.id; renderClothingList(items,containerId,filterId,configKey); };
    fDiv.appendChild(chip);
  });
  l.innerHTML = "";
  var filtered = activeFilter[configKey]==="all" ? items : items.filter(function(i){return i.brand===activeFilter[configKey];});
  filtered.forEach(function(item) {
    var d = document.createElement("div");
    d.className = "item-card" + (avatarConfig[configKey].id===item.id?" selected":"");
    var bn = BRANDS.find(function(b){return b.id===item.brand;});
    d.innerHTML = '<div class="item-card-color" style="background:'+item.color+'"></div><div class="item-card-info"><div class="item-card-name">'+item.name+'</div><div class="item-card-brand">'+(bn?bn.name:"")+(item.fit?" · "+item.fit:"")+'</div></div>';
    d.onclick = function() { hapticTap(); avatarConfig[configKey]=item; renderClothingList(items,containerId,filterId,configKey); updateAvatar3D(); };
    l.appendChild(d);
  });
}

function setupAvatarBuilder() {
  renderSkinGrid();
  renderHairStyles();
  renderClothingList(TOPS,"tops-list","top-fit-filter","tops");

  document.querySelectorAll(".builder-tab").forEach(function(tab) {
    tab.onclick = function() {
      hapticTap();
      document.querySelectorAll(".builder-tab").forEach(function(t){t.classList.remove("active");});
      document.querySelectorAll(".builder-tab-content").forEach(function(c){c.classList.remove("active");});
      tab.classList.add("active");
      document.getElementById("tab-"+tab.dataset.tab).classList.add("active");
      var t = tab.dataset.tab;
      if(t==="hair") renderHairStyles();
      if(t==="tops") renderClothingList(TOPS,"tops-list","top-fit-filter","tops");
      if(t==="pants") renderClothingList(PANTS,"pants-list","pants-brand-filter","pants");
      if(t==="shoes") renderClothingList(SHOES,"shoes-list","shoes-brand-filter","shoes");
    };
  });

  initAvatar3D();
}

var avatarBuilderOverlay = document.getElementById("avatar-builder-overlay");

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

document.getElementById("save-avatar-btn").addEventListener("click", async function() {
  hapticTap();
  var canvas = document.getElementById("avatar-3d-canvas");
  var dataUri = canvas.toDataURL("image/png");
  try {
    var response = await fetch(API_BASE_URL+"/api/profile/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: tg.initData, avatar_url: dataUri }),
    });
    if (!response.ok) throw new Error("Не вдалось зберегти аватар");
    var updatedProfile = await response.json();
    closeAvatarBuilder();
    renderProfile(updatedProfile);
    tg.HapticFeedback?.notificationOccurred("success");
  } catch (err) {
    tg.showAlert("Не вдалось зберегти аватар: " + err.message);
  }
});

initProfile();
