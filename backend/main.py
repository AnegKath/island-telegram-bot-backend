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
from schemas import InitRequest, AvatarUpdateRequest, ProfileResponse

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

AVATAR_COUNT = 6

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
FRONTEND_DIR = BASE_DIR.parent / "frontend"

app = FastAPI(title="Island MVP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.on_event("startup")
async def on_startup():
    await init_db()


def make_tag(telegram_id: int) -> str:
    return str(telegram_id % 9000 + 1000)


@app.post("/api/auth/init", response_model=ProfileResponse)
async def auth_init(payload: InitRequest, session: AsyncSession = Depends(get_session)):
    if not BOT_TOKEN:
        raise HTTPException(status_code=500, detail="BOT_TOKEN не налаштовано на сервері")

    validated = validate_init_data(payload.init_data, BOT_TOKEN)
    if validated is None:
        raise HTTPException(status_code=401, detail="Недійсні дані Telegram (init_data)")

    tg_user = extract_telegram_user(validated)
    telegram_id = tg_user["telegram_id"]
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Не вдалось визначити Telegram ID")

    result = await session.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalar_one_or_none()

    is_new = False
    if user is None:
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
        has_3d_avatar=user.has_3d_avatar,
        is_new=is_new,
    )


@app.post("/api/profile/avatar", response_model=ProfileResponse)
async def update_avatar(payload: AvatarUpdateRequest, session: AsyncSession = Depends(get_session)):
    if not BOT_TOKEN:
        raise HTTPException(status_code=500, detail="BOT_TOKEN не налаштовано на сервері")

    validated = validate_init_data(payload.init_data, BOT_TOKEN)
    if validated is None:
        raise HTTPException(status_code=401, detail="Недійсні дані Telegram (init_data)")

    tg_user = extract_telegram_user(validated)
    telegram_id = tg_user["telegram_id"]

    result = await session.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Профіль не знайдено")

    user.avatar_url = payload.avatar_url
    user.has_3d_avatar = True
    await session.commit()
    await session.refresh(user)

    return ProfileResponse(
        id=user.id,
        nickname=user.nickname,
        tag=user.tag,
        display_name=f"{user.nickname}#{user.tag}",
        avatar_url=user.avatar_url,
        has_3d_avatar=user.has_3d_avatar,
        is_new=False,
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
