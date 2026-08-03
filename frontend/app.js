const API_BASE_URL = "";

// Субдомен Ready Player Me. "demo" - публічний тестовий, підходить для розробки.
// Коли зареєструєш свій акаунт на https://studio.readyplayer.me - заміниш
// на власний (наприклад "island-mvp") для повноцінного продакшн-використання.
const RPM_SUBDOMAIN = "demo";

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

let currentProfile = null;

function showScreen(screen) {
  [loadingScreen, profileScreen, errorScreen].forEach((s) => s.classList.add("hidden"));
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
  const avatar3d = document.getElementById("avatar-3d");
  const createAvatarBtn = document.getElementById("create-avatar-btn");

  if (profile.has_3d_avatar) {
    avatar3d.src = profile.avatar_url;
    avatar3d.classList.remove("hidden");
    avatarImg.classList.add("hidden");
    createAvatarBtn.textContent = "🧑‍🎨 Переробити 3D-аватар";
  } else {
    avatarImg.src = `${API_BASE_URL}${profile.avatar_url}`;
    avatarImg.classList.remove("hidden");
    avatar3d.classList.add("hidden");
    createAvatarBtn.textContent = "🧑‍🎨 Створити 3D-аватар";
  }

  document.getElementById("display-name").textContent = profile.display_name;

  const title = document.getElementById("welcome-title");
  const subText = document.getElementById("sub-text");

  if (profile.is_new) {
    title.textContent = "Твій острів створено!";
    subText.textContent = "Це твій профіль. Спробуй створити собі справжній 3D-аватар!";
  } else {
    title.textContent = "З поверненням!";
    subText.textContent = "Твій профіль уже готовий.";
  }

  showScreen(profileScreen);
}

document.getElementById("continue-btn").addEventListener("click", () => {
  hapticTap();
  tg.showAlert("Далі тут буде острів 🏝️ (наступний етап розробки)");
});

// --- Конструктор 3D-аватара (Ready Player Me) - ручний вибір зовнішності ---

const avatarCreatorOverlay = document.getElementById("avatar-creator-overlay");
const avatarCreatorFrame = document.getElementById("avatar-creator-frame");

function openAvatarCreator() {
  hapticTap();
  // selfie=false прибирає опцію фотографування - юзер одразу обирає готовий
  // шаблон зовнішності і налаштовує його вручну (обличчя, зачіска, одяг).
  avatarCreatorFrame.src =
    `https://${RPM_SUBDOMAIN}.readyplayer.me/avatar?frameApi&clearCache&language=uk&selfie=false`;
  avatarCreatorOverlay.classList.remove("hidden");
}

function closeAvatarCreator() {
  hapticTap();
  avatarCreatorOverlay.classList.add("hidden");
  avatarCreatorFrame.src = "";
}

document.getElementById("create-avatar-btn").addEventListener("click", openAvatarCreator);
document.getElementById("close-avatar-creator").addEventListener("click", closeAvatarCreator);

async function saveAvatarUrl(avatarUrl) {
  const response = await fetch(`${API_BASE_URL}/api/profile/avatar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ init_data: tg.initData, avatar_url: avatarUrl }),
  });

  if (!response.ok) throw new Error("Не вдалось зберегти аватар");

  const updatedProfile = await response.json();
  renderProfile(updatedProfile);
  tg.HapticFeedback?.notificationOccurred("success");
}

// Ready Player Me спілкується з батьківською сторінкою через postMessage.
// Слухаємо подію "v1.avatar.exported" - вона приходить, коли юзер закінчив
// вибирати зовнішність вручну з галереї шаблонів, і містить посилання на .glb модель.
window.addEventListener("message", async (event) => {
  if (!event.origin.includes("readyplayer.me")) return;

  let data;
  try {
    data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }

  if (data?.eventName !== "v1.avatar.exported") return;

  const avatarUrl = data.data?.url;
  if (!avatarUrl) return;

  try {
    await saveAvatarUrl(avatarUrl);
    closeAvatarCreator();
  } catch (err) {
    tg.showAlert("Не вдалось зберегти аватар: " + err.message);
  }
});

initProfile();
