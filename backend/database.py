from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

# Для старту використовуємо SQLite - нуль налаштувань, файл island.db.
# Шлях абсолютний (поряд з цим файлом) - незалежно від того, звідки запущено процес.
# Коли будеш деплоїти постійно - заміниш DATABASE_URL на PostgreSQL.
BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = f"sqlite+aiosqlite:///{BASE_DIR / 'island.db'}"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def init_db():
    """Створює таблиці при першому запуску, якщо їх ще немає."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session():
    async with async_session() as session:
        yield session
