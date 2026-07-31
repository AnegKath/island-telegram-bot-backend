import os
import random
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import validate_init_data, extract_telegram_user
from database import init_db, get_session
from models import User
from schemas import InitRequest, ProfileResponse

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

# Скільки дефолтних аватарок лежить в static/avatars (avatar1.svg ... avatar6.svg)
AVATAR_COUNT = 6

# Абсолютні шляхи, обчислені від розташування ЦЬОГО файлу (main.py),
# а не від того, з якої папки запущено процес. Це важливо, бо на Render
# (і взагалі на будь-якому хостингу) команда запускається з кореня репозиторію,
# а не з backend/ - тому відносні шляхи типу "static" або "../frontend" ламались.
BASE_DIR = Path(__file__).resolve().parent          # .../backend
STATIC_DIR = BASE_DIR / "static"                     # .../backend/static
FRONTEND_DIR = BASE_DIR.parent / "frontend"           # .../frontend

app = FastAPI(title="Island MVP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Роздаємо статичні файли (аватарки) напряму, щоб фронтенд міг їх завантажити
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.on_event("startup")
async def on_startup():
    await init_db()


def make_tag(telegram_id: int) -> str:
    """Генерує стабільний 4-значний тег з telegram_id, щоб він завжди був однаковий для юзера."""
    return str(telegram_id % 9000 + 1000)


@app.post("/api/auth/init", response_model=ProfileResponse)
async def auth_init(payload: InitRequest, session: AsyncSession = Depends(get_session)):
    """
    Головний ендпоінт першого входу.
    Фронтенд викликає це одразу при відкритті Mini App, передаючи Telegram.WebApp.initData.

    1. Перевіряє підпис initData (щоб ніхто не підробив дані юзера)
    2. Якщо юзер вже є в базі - повертає його профіль
    3. Якщо юзера немає - створює новий профіль з нікнеймом з Telegram і випадковою аватаркою
    """
    if not BOT_TOKEN:
        raise HTTPException(status_code=500, detail="BOT_TOKEN не налаштовано на сервері")

    validated = validate_init_data(payload.init_data, BOT_TOKEN)
    if validated is None:
        raise HTTPException(status_code=401, detail="Недійсні дані Telegram (init_data)")

    tg_user = extract_telegram_user(validated)
    telegram_id = tg_user["telegram_id"]
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Не вдалось визначити Telegram ID")

    # Шукаємо чи вже є такий юзер
    result = await session.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalar_one_or_none()

    is_new = False
    if user is None:
        # Новий юзер - створюємо профіль з дефолтними значеннями
        is_new = True
        avatar_number = random.randint(1, AVATAR_COUNT)
        user = User(
            telegram_id=telegram_id,
            telegram_username=tg_user["username"],
            nickname=tg_user["first_name"],
            tag=make_tag(telegram_id),
            avatar_url=f"/static/avatars/avatar{avatar_number}.svg",
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    return ProfileResponse(
        id=user.id,
        nickname=user.nickname,
        tag=user.tag,
        display_name=f"{user.nickname}#{user.tag}",
        avatar_url=user.avatar_url,
        is_new=is_new,
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Роздаємо фронтенд (index.html, app.js, style.css) з того ж порту, що і API.
# Це має бути ОСТАННІМ рядком - інакше він "перехопить" запити, призначені для /api/...
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
