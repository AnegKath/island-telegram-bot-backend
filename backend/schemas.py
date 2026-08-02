from pydantic import BaseModel


class InitRequest(BaseModel):
    """Те, що фронтенд надсилає при відкритті Mini App."""
    init_data: str  # сирий рядок Telegram.WebApp.initData


class AvatarUpdateRequest(BaseModel):
    """Те, що фронтенд надсилає після завершення конструктора Ready Player Me."""
    init_data: str
    avatar_url: str  # посилання на .glb модель, яке віддає Ready Player Me


class ProfileResponse(BaseModel):
    """Профіль, який повертаємо фронтенду."""
    id: str
    nickname: str
    tag: str
    display_name: str  # nickname + "#" + tag, готове для показу
    avatar_url: str
    has_3d_avatar: bool  # True якщо це справжня 3D-модель, False якщо дефолтна SVG-заглушка
    is_new: bool  # True якщо профіль щойно створено (для привітального екрану)
