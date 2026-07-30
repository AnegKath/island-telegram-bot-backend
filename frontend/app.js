// Бекенд тепер роздає і фронтенд, і API з одного порту - тому шлях відносний,
// адресу міняти більше не треба навіть коли міняється ngrok-посилання
const API_BASE_URL = "";

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

  // Колір верхньої шапки Telegram зливається з фоном застосунку - зникає межа "де сайт, де Telegram"
  tg.setHeaderColor(p.bg_color || "#ffffff");
  tg.setBackgroundColor(p.bg_color || "#ffffff");
}
applyTelegramTheme();
tg.onEvent("themeChanged", applyTelegramTheme);

// Забороняємо свайп вниз для закриття - типова браузерна поведінка, якої не повинно бути в застосунку
if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();

// Тактильний відгук при натисканні кнопок - те, чого браузерні сайти не вміють, а нативні застосунки завжди мають
function hapticTap() {
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
}

const loadingScreen = document.getElementById("loading");
const profileScreen = document.getElementById("profile-screen");
const errorScreen = document.getElementById("error-screen");

function showScreen(screen) {
  [loadingScreen, profileScreen, errorScreen].forEach((s) => s.classList.add("hidden"));
  screen.classList.remove("hidden");
}

async function initProfile() {
  try {
    const initData = tg.initData; // сирий рядок, який бекенд перевірить на справжність

    if (!initData) {
      // Немає initData - застосунок відкрито не через Telegram
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
  document.getElementById("avatar").src = `${API_BASE_URL}${profile.avatar_url}`;
  document.getElementById("display-name").textContent = profile.display_name;

  const title = document.getElementById("welcome-title");
  const subText = document.getElementById("sub-text");

  if (profile.is_new) {
    title.textContent = "Твій острів створено!";
    subText.textContent = "Це твій профіль. Аватарку можна буде змінити пізніше.";
  } else {
    title.textContent = "З поверненням!";
    subText.textContent = "Твій профіль уже готовий.";
  }

  showScreen(profileScreen);
}

document.getElementById("continue-btn").addEventListener("click", () => {
  hapticTap();
  // Тут пізніше буде перехід до самого острова (grid-екран)
  tg.showAlert("Далі тут буде острів 🏝️ (наступний етап розробки)");
});

initProfile();
