from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

# Для старту використовуємо SQLite - нуль налаштувань, файл island.db
# Коли будеш деплоїти - заміниш на PostgreSQL, просто зміниш DATABASE_URL
DATABASE_URL = "sqlite+aiosqlite:///./island.db"

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
