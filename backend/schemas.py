from pydantic import BaseModel


class InitRequest(BaseModel):
    """Те, що фронтенд надсилає при відкритті Mini App."""
    init_data: str  # сирий рядок Telegram.WebApp.initData


class ProfileResponse(BaseModel):
    """Профіль, який повертаємо фронтенду."""
    id: str
    nickname: str
    tag: str
    display_name: str  # nickname + "#" + tag, готове для показу
    avatar_url: str
    is_new: bool  # True якщо профіль щойно створено (для привітального екрану)
