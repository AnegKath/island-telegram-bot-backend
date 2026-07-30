import uuid
from datetime import datetime

from sqlalchemy import String, BigInteger, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class User(Base):
    """
    Профіль гравця. Створюється автоматично при першому вході в Mini App.
    """
    __tablename__ = "users"

    # Внутрішній унікальний ID (UUID) - головний ключ в базі
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Telegram ID - унікальний для кожного юзера Telegram, використовується для входу
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)

    # Telegram username (може бути відсутній, якщо юзер його не встановив)
    telegram_username: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Нікнейм гравця в грі (за замовчуванням = ім'я з Telegram)
    nickname: Mapped[str] = mapped_column(String(50))

    # 4-значний тег, який робить нікнейм унікальним при відображенні: Nickname#1234
    tag: Mapped[str] = mapped_column(String(4))

    # Шлях до аватарки (одна з дефолтних, обирається випадково при створенні)
    avatar_url: Mapped[str] = mapped_column(String(200))

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
