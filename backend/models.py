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

    # Посилання на аватарку. Спочатку - шлях до дефолтної SVG-заглушки
    # (/static/avatars/avatarN.svg), пізніше - може стати посиланням на
    # справжню 3D-модель (.glb) з Ready Player Me. Довжина збільшена під URL.
    avatar_url: Mapped[str] = mapped_column(String(500))

    # True, якщо юзер вже створив собі справжній 3D-аватар через Ready Player Me
    # (тоді avatar_url вказує на .glb файл, а не на SVG-заглушку)
    has_3d_avatar: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
