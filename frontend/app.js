// Бекенд тепер роздає і фронтенд, і API з одного порту - тому шлях відносний,
// адресу міняти більше не треба навіть коли міняється ngrok-посилання
const API_BASE_URL = "";

// Субдомен Ready Player Me. "demo" - публічний тестовий, підходить для розробки.
// Коли зареєструєш свій акаунт на https://studio.readyplayer.me - заміниш
// на власний (наприклад "island-mvp") для повноцінного продакшн-використання.
const RPM_SUBDOMAIN = "demo";

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand(); // розгортає Mini App на весь екран

// --- Робимо застосунок максимально "рідним" для Telegram, не схожим на сайт ---

// Підлаштовуємось під тему юзера (темна/світла), як робить сам Telegram
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

// --- Конструктор 3D-аватара (Ready Player Me) ---

const avatarCreatorOverlay = document.getElementById("avatar-creator-overlay");
const avatarCreatorFrame = document.getElementById("avatar-creator-frame");
const pasteAvatarOverlay = document.getElementById("paste-avatar-overlay");
const avatarUrlInput = document.getElementById("avatar-url-input");

function openAvatarCreator() {
  hapticTap();
  avatarCreatorFrame.src =
    `https://${RPM_SUBDOMAIN}.readyplayer.me/avatar?frameApi&quickStart=true&clearCache&language=uk`;
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

// --- Запасний шлях: конструктор у зовнішньому браузері (коли камера в iframe не працює) ---

document.getElementById("open-external-btn").addEventListener("click", () => {
  hapticTap();
  closeAvatarCreator();

  const externalUrl =
    `https://${RPM_SUBDOMAIN}.readyplayer.me/avatar?quickStart=true&clearCache&language=uk`;
  tg.openLink(externalUrl);

  pasteAvatarOverlay.classList.remove("hidden");
});

document.getElementById("close-paste-avatar").addEventListener("click", () => {
  hapticTap();
  pasteAvatarOverlay.classList.add("hidden");
  avatarUrlInput.value = "";
});

document.getElementById("save-pasted-avatar-btn").addEventListener("click", async () => {
  hapticTap();
  const url = avatarUrlInput.value.trim();

  if (!url || !url.includes("readyplayer.me")) {
    tg.showAlert("Схоже, це не посилання на аватар з Ready Player Me. Перевір і встав ще раз.");
    return;
  }

  try {
    await saveAvatarUrl(url);
    pasteAvatarOverlay.classList.add("hidden");
    avatarUrlInput.value = "";
  } catch (err) {
    tg.showAlert("Не вдалось зберегти аватар: " + err.message);
  }
});

initProfile();
