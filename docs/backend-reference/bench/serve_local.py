"""
Локальный сервер для проверки входа с настоящего устройства.

Поднимает ровно те две ручки, что поедут на сервер, — вход через Google и
удаление аккаунта, — плюс минимум, без которого приложение не доходит до
экрана чата: /auth/me, /v1/auth/refresh, /v1/auth/logout и заглушки конфига и
списка чатов.

ЧТО ЭТИМ ПРОВЕРЯЕТСЯ И ЧТО НЕТ. Проверяется единственное, чего не может
стенд: живой id_token от настоящего Google — что он доходит из приложения,
что подпись сходится, что аудитория совпадает с нашими клиентами и что в ответ
выдаётся рабочая пара токенов. Модель здесь не отвечает: чат живёт на проде и
уже проверен там.

    pip install uvicorn
    python docs/backend-reference/bench/serve_local.py

Приложение направляется сюда переменной сборки:
    EXPO_PUBLIC_API_URL=http://10.0.2.2:8787   (эмулятор Android)
    EXPO_PUBLIC_API_URL=http://<ip-компьютера>:8787   (телефон в той же сети)

10.0.2.2 — это адрес хоста изнутри эмулятора; localhost там указывает на сам
эмулятор. Открытый http разрешён только дев-сборкой (§11), в релизе остаётся
чистый TLS.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path

os.environ.setdefault("JWT_SECRET", "local-bench-secret")

BENCH = Path(__file__).resolve().parent
sys.path.insert(0, str(BENCH))

from test_endpoints import app  # noqa: E402  — сборка пакета живёт там

import uvicorn  # noqa: E402
from fastapi import Depends  # noqa: E402

from _pkg.deps import current_user  # noqa: E402
from _pkg.db import Base, engine  # noqa: E402
from _pkg.models import User  # noqa: E402
from _pkg.routers.router_auth import UserOut  # noqa: E402


@app.get("/auth/me", response_model=UserOut)
async def me(user: User = Depends(current_user)):
    """Приложение зовёт её на старте, чтобы восстановить сессию (§6.2)."""
    return UserOut.model_validate(user)


@app.get("/v1/config")
async def config():
    """
    Заглушка конфига. На проде этой ручки тоже нет, приложение переживает её
    отсутствие на дефолтах — здесь она просто чтобы не мусорить в логи.
    """
    return {
        "min_supported_version": "1.0.0",
        "default_model": "fast",
        "suggestions": [],
        "links": {"support": "https://sorollm.tj", "privacy": "https://sorollm.tj"},
        "certificate_pinning_enabled": False,
    }


@app.get("/v1/chat/list")
async def chat_list(user: User = Depends(current_user)):
    """
    Пустой список. Настоящие чаты — на проде: локально проверяется вход, а не
    работа модели.
    """
    return {"chats": [], "has_more": False}


@app.on_event("startup")
async def prepare_database() -> None:
    # Локальная база стенда, не боевая. Схема создаётся при первом запуске.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print(f"[{datetime.now():%H:%M:%S}] база готова, ручки подняты")


# --- В Swagger — только то, что деплоим ---------------------------------------
#
# Сервер поднимает и служебные ручки: без /auth/me, /v1/auth/refresh и заглушек
# конфига и списка чатов приложение не доходит до экрана чата. Но в
# документации им делать нечего: проверяем и обсуждаем мы ровно две ручки,
# остальное — подпорки стенда, и в списке они только сбивают.
#
# Ручки при этом продолжают работать: include_in_schema убирает их из схемы,
# а не из маршрутизации.
DEPLOYED = {("POST", "/v1/auth/google"), ("DELETE", "/v1/account")}

for route in app.routes:
    methods = getattr(route, "methods", None)
    if not methods:
        continue
    route.include_in_schema = any((m, route.path) in DEPLOYED for m in methods)

# Схема кешируется при первом обращении — сбрасываем, иначе правка не видна.
app.openapi_schema = None


if __name__ == "__main__":
    # 0.0.0.0, а не localhost: иначе ни эмулятор, ни телефон в сети не достучатся.
    uvicorn.run(app, host="0.0.0.0", port=8787, log_level="info")
