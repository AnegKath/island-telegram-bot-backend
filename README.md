# Острів — MVP: профіль гравця + конструктор аватара

Telegram Mini App: юзер відкриває Mini App у Telegram → бекенд автоматично
створює профіль (внутрішній ID, унікальний тег `Нікнейм#1234`, випадкова дефолтна
аватарка) → фронтенд показує картку профілю, дозволяє зібрати власну SVG-аватарку
і відкриває 3D-планету острова.

**Фронтенд і бекенд працюють на одному порту** — FastAPI сам роздає HTML/CSS/JS.
`API_BASE_URL` у `frontend/app.js` відносний, тому все працює і локально, і на
будь-якому хостингу без змін коду.

## Структура проєкту

```
island-mvp/
├── backend/
│   ├── main.py           # FastAPI: API + роздача фронтенду
│   ├── auth.py           # валідація даних від Telegram (HMAC)
│   ├── database.py       # SQLite (async) + прості міграції
│   ├── models.py         # модель User
│   ├── schemas.py        # Pydantic-схеми
│   ├── requirements.txt
│   ├── .env.example      # шаблон; реальний .env не комітиться
│   ├── run.sh            # локальний запуск
│   └── static/avatars/   # 6 дефолтних аватарок (SVG)
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── app.js            # звертається до API відносним шляхом
│   └── vendor/three.min.js  # three.js локально, без CDN — для Telegram WebView
├── Dockerfile            # деплой у Docker (Fly.io / Render / etc.)
├── Procfile              # команда запуску для Render (native deploy)
├── bin/start.sh
└── .gitignore            # .env, venv, __pycache__ — не комітити
```

## Крок 1. Бот у Telegram

1. [@BotFather](https://t.me/BotFather) → `/newbot`, username має закінчуватись на `bot`
2. Скопіюй `backend/.env.example` в `backend/.env` і встав токен:
   `BOT_TOKEN=123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

> ⚠️ `.env` у `.gitignore` — **ніколи не коміти його**. Якщо токен випадково
> потрапив у git-історію — негайно відкликай його через BotFather
> (`/mybots` → твій бот → `API Token` → `Revoke token`) і видали з історії.

## Крок 2. Локальний запуск (розробка)

```bash
cd island-mvp/backend
./run.sh   # створює venv, ставить залежності, стартує на :8000
```

Перевірка:
- `http://localhost:8000/api/health` → `{"status":"ok"}`
- `http://localhost:8000/` → сторінка профілю (помилка Telegram у звичайному
  браузері — це нормально, ти відкрив не через бота)

Щоб відкрити застосунок через бота з локального хоста, прокинь тунель
`ngrok http 8000` і встав посилання у Menu Button (Крок 4). Після кожного
перезапуску ngrok посилання змінюється — оновлюй Menu Button.

## Крок 3. Деплой

Є два варіанти — в репозиторії готове для обох:

- **Render**: підключи репозиторій → New Web Service. В Environment додай
  секрет `BOT_TOKEN`. Команда запуску у `Procfile`.
- **Fly.io / Docker**: `Dockerfile` + `fly.toml` уже на місці. Секрет токена
  задається через `fly secrets set BOT_TOKEN=...`.

Після деплою отримаєш постійну адресу типу `https://<service>.onrender.com` —
вона ж стане URL Mini App.

## Крок 4. Прив'яжи Mini App до бота

1. [@BotFather](https://t.me/BotFather) → `/mybots` → обери бота
2. `Bot Settings` → `Menu Button` → `Configure Menu Button`
3. Встав URL деплою (Render або ngrok)
4. Назва кнопки, наприклад "Відкрити острів 🏝️"

## Крок 5. Перевірка

1. Відкрий бота в Telegram на телефоні → натисни кнопку меню
2. Екран завантаження → картка профілю з аватаркою, нікнеймом і тегом
3. "Створити аватар" → конструктор (тон шкіри, зачіска, вираз, окуляри) →
   "Зберегти аватар"
4. "Почати будувати острів" → 3D-планета (drag-to-rotate, wheel-zoom)

## Наступні кроки (не входять у цей етап)

- Grid острова і розміщення об'єктів
- Прив'язка фото/тексту-спогаду до об'єкта
- WebSocket для live-оновлень, коли на острові хтось інший
- PostgreSQL замість SQLite (для MVP SQLite вистачає)
- Заміна аватарок на кастомні

## Типові проблеми

- **"BOT_TOKEN не налаштовано"** — не заповнив `.env` або не перезапустив сервер
- **"Недійсні дані Telegram (init_data)"** — відкрито не через Telegram
  (напряму в браузері), або `BOT_TOKEN` у `.env` не збігається з токеном бота
- **Токен потрапив у git-історію** — відкликай через BotFather і GitHub,
  видали файл з історії (`git filter-branch` / `filter-repo`) і зроби force-push
- **Помилка збірки `pydantic-core` при `./run.sh`** — стара версія pip
  намагається компілювати з Rust. Онови `requirements.txt` (версії без жорсткої
  фіксації `==`, з `>=`) і видали папку `venv` перед повторним запуском
