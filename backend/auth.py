import hashlib
import hmac
import json
from urllib.parse import parse_qsl


def validate_init_data(init_data: str, bot_token: str) -> dict | None:
    """
    Перевіряє, що init_data дійсно прийшла з Telegram і не підроблена.
    Алгоритм офіційний: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

    Повертає розпарсені дані (dict) якщо підпис вірний, інакше None.
    """
    try:
        parsed = dict(parse_qsl(init_data, strict_parsing=True))
    except ValueError:
        return None

    received_hash = parsed.pop("hash", None)
    if not received_hash:
        return None

    # Формуємо data_check_string: усі пари key=value, відсортовані за ключем, через \n
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))

    # Секретний ключ виводиться з токена бота
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        return None

    # Поле "user" приходить як JSON-рядок - розпаковуємо його
    if "user" in parsed:
        parsed["user"] = json.loads(parsed["user"])

    return parsed


def extract_telegram_user(validated_data: dict) -> dict:
    """Дістає дані юзера (id, username, first_name) з валідованого initData."""
    user = validated_data.get("user", {})
    return {
        "telegram_id": user.get("id"),
        "username": user.get("username"),
        "first_name": user.get("first_name", "Гравець"),
    }
