#!/bin/bash
# Швидкий запуск бекенду локально
set -e

if [ ! -d "venv" ]; then
  echo "Створюю віртуальне середовище..."
  python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt --quiet

if [ ! -f ".env" ]; then
  echo "УВАГА: файл .env не знайдено. Скопіюй .env.example в .env і встав туди свій BOT_TOKEN."
  cp .env.example .env
fi

echo "Запускаю сервер на http://localhost:8000 ..."
# Без --reload, щоб стабільно працювало у фоновому режимі
uvicorn main:app --host 0.0.0.0 --port 8000
