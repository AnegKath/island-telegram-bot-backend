from pathlib import Path

from sqlalchemy import text
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


async def _run_simple_migrations(conn):
    """
    Проста "міграція" для SQLite без зайвих інструментів (Alembic тощо).
    Перевіряє, чи є в таблиці users нові колонки, і додає їх, якщо база
    залишилась зі старої версії коду (SQLite сама нові колонки не додає).
    """
    result = await conn.execute(text("PRAGMA table_info(users)"))
    existing_columns = {row[1] for row in result.fetchall()}  # row[1] - назва колонки

    if "has_3d_avatar" not in existing_columns:
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN has_3d_avatar BOOLEAN DEFAULT 0")
        )


async def init_db():
    """Створює таблиці при першому запуску, якщо їх ще немає, і доганяє схему, якщо база стара."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Якщо таблиця users вже існувала (стара база) - переконуємось,
        # що в ній є всі колонки, які очікує актуальний код.
        await _run_simple_migrations(conn)


async def get_session():
    async with async_session() as session:
        yield session
