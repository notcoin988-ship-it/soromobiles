"""
Стенд для проверки двух ручек ДО деплоя на сервер.

Проверяются ровно те файлы, которые поедут в sorollm-webapp:
docs/backend-reference/router_auth_google.py и router_account.py — они
скопированы в app/routers без единой правки. Вокруг них минимальное
окружение: настоящий PostgreSQL в докере, модели с теми же полями, что в
проекте-хозяине, и штатный deps.current_user.

ЧТО НЕЛЬЗЯ ПРОВЕРИТЬ И ПОЧЕМУ. Настоящий id_token выдаёт Google живому
человеку в ответ на живой вход — подделать его невозможно, на то и подпись.
Поэтому проверка Google подменяется: verify_oauth2_token возвращает заранее
заданные claims. Всё, что ПОСЛЕ проверки, — поиск пользователя, привязка по
почте, выдача токенов, удаление данных — работает по-настоящему.

Отдельно проверяется, что негодный токен отвергается: там подмены нет, в дело
идёт настоящая библиотека google-auth.

    docker run -d --name soro-authtest-db -e POSTGRES_PASSWORD=testpw         -e POSTGRES_DB=sorotest -p 55433:5432 postgres:16-alpine
    pip install fastapi "sqlalchemy[asyncio]>=2" asyncpg pyjwt "google-auth>=2.30,<3" httpx
    python docs/backend-reference/bench/test_endpoints.py

Адрес базы переопределяется переменной DATABASE_URL — на сервере удобно
прогнать против отдельной пустой базы, не трогая боевую.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

os.environ.setdefault("JWT_SECRET", "bench-secret-not-for-production")

import sys as _sys
# --- Сборка пакета из референсных файлов -------------------------------------
#
# Роутеры лежат этажом выше и написаны под чужой проект: они импортируют ..db,
# ..models, ..deps. Стенд собирает вокруг них такой же пакет во временной папке
# и НЕ ПРАВИТ ни строчки — иначе проверялась бы копия, а не то, что поедет на
# сервер.

import shutil
from pathlib import Path

BENCH = Path(__file__).resolve().parent
REFERENCE = BENCH.parent
PKG = BENCH / "_pkg"


def assemble_package() -> None:
    shutil.rmtree(PKG, ignore_errors=True)
    (PKG / "routers").mkdir(parents=True)

    (PKG / "__init__.py").write_text("", encoding="utf-8")
    (PKG / "routers" / "__init__.py").write_text("", encoding="utf-8")

    for name in ("security.py", "deps.py"):
        shutil.copy(REFERENCE / name, PKG / name)
    for name in ("router_auth.py", "router_auth_google.py", "router_account.py"):
        shutil.copy(REFERENCE / name, PKG / "routers" / name)

    # Окружение, которого в референсе нет: в проекте-хозяине оно своё.
    shutil.copy(BENCH / "_db.py", PKG / "db.py")
    shutil.copy(BENCH / "_models.py", PKG / "models.py")


assemble_package()
sys.path.insert(0, str(BENCH))

import httpx
from fastapi import FastAPI
from sqlalchemy import select, text

from _pkg.db import Base, SessionLocal, engine
from _pkg.models import Chat, Feedback, Message, RefreshToken, TokenUsage, User
from _pkg.routers import router_account, router_auth, router_auth_google
from _pkg.security import decode_access_token

WEB_CLIENT = "500782884295-iuvbrjg4u1nd004n3ecdj7acv9kq9e4t.apps.googleusercontent.com"
ANDROID_CLIENT = "500782884295-nrvihf8vob0i4vqk6rarm3vodooa07b3.apps.googleusercontent.com"

app = FastAPI()
app.include_router(router_auth.router)
app.include_router(router_auth_google.router)
app.include_router(router_account.router)

passed: list[str] = []
failed: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    (passed if condition else failed).append(name)
    mark = "OK  " if condition else "FAIL"
    print(f"  [{mark}] {name}" + (f" — {detail}" if detail and not condition else ""))


def fake_google(claims: dict) -> None:
    """Подменяет проверку Google на заданные claims."""
    router_auth_google.google_id_token.verify_oauth2_token = (  # type: ignore[assignment]
        lambda token, request: claims
    )


async def reset_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


async def main() -> None:
    await reset_db()
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://bench") as client:
        print("\nPOST /v1/auth/google — вход")

        # 1. Негодный токен: настоящая библиотека, без подмены.
        bad = await client.post("/v1/auth/google", json={"id_token": "not-a-token"})
        check("выдуманный токен отвергнут (401)", bad.status_code == 401, f"статус {bad.status_code}")
        check("на выдуманный токен не выдана сессия", "access_token" not in bad.text)

        # 2. Чужая аудитория: подпись «верна», но токен выписан другому приложению.
        fake_google(
            {
                "aud": "999999-someone-else.apps.googleusercontent.com",
                "sub": "google-sub-alien",
                "email": "alien@example.com",
                "name": "Alien",
            }
        )
        alien = await client.post("/v1/auth/google", json={"id_token": "x"})
        check(
            "токен чужого приложения отвергнут (401)",
            alien.status_code == 401,
            f"статус {alien.status_code} — сверка aud не работает",
        )

        # 3. Первый вход: аккаунта нет, он заводится.
        fake_google(
            {
                "aud": WEB_CLIENT,
                "sub": "google-sub-1",
                "email": "Daler@Example.COM",
                "name": "Далер",
                "picture": "https://example.com/a.png",
            }
        )
        first = await client.post("/v1/auth/google", json={"id_token": "x"})
        check("первый вход успешен (200)", first.status_code == 200, f"статус {first.status_code}: {first.text[:200]}")

        body = first.json() if first.status_code == 200 else {}
        check("выдан access_token", bool(body.get("access_token")))
        check("выдан refresh_token", bool(body.get("refresh_token")))
        check("есть expires_in", isinstance(body.get("expires_in"), int))
        check("is_new_user = true у нового аккаунта", body.get("is_new_user") is True)
        check("в ответе профиль пользователя", (body.get("user") or {}).get("fullname") == "Далер")
        check(
            "почта нормализована в нижний регистр",
            (body.get("user") or {}).get("email") == "daler@example.com",
            f"пришло {(body.get('user') or {}).get('email')}",
        )
        check(
            "access_token читается нашим же ключом",
            bool(decode_access_token(body.get("access_token", ""))),
        )

        async with SessionLocal() as session:
            stored = await session.scalar(select(RefreshToken))
            check("refresh сохранён в базе хешем", stored is not None and len(stored.token_hash) == 64)
            check(
                "в базе лежит НЕ сам токен",
                stored is not None and stored.token_hash != body.get("refresh_token"),
            )

        # 4. Повторный вход тем же аккаунтом: второй профиль не заводится.
        second = await client.post("/v1/auth/google", json={"id_token": "x"})
        check("повторный вход успешен", second.status_code == 200)
        check("is_new_user = false при возврате", second.json().get("is_new_user") is False)
        check(
            "id пользователя тот же",
            second.json().get("user", {}).get("id") == body.get("user", {}).get("id"),
        )

        async with SessionLocal() as session:
            count = len((await session.scalars(select(User))).all())
            check("в базе по-прежнему один пользователь", count == 1, f"их {count}")

        # 5. Смена почты в аккаунте Google: ищем по google_id, а не по почте.
        fake_google(
            {
                "aud": ANDROID_CLIENT,  # заодно: браузерный путь, аудитория Android
                "sub": "google-sub-1",
                "email": "new-address@example.com",
                "name": "Далер",
            }
        )
        renamed = await client.post("/v1/auth/google", json={"id_token": "x"})
        check("токен с аудиторией Android принят", renamed.status_code == 200, f"статус {renamed.status_code}")
        check(
            "смена почты не плодит второй профиль",
            renamed.json().get("user", {}).get("id") == body.get("user", {}).get("id"),
        )

        # 6. Человек с сайта, зарегистрированный почтой: аккаунт связывается.
        async with SessionLocal() as session:
            legacy = User(email="legacy@example.com", fullname="Старый", tier="free_email")
            session.add(legacy)
            await session.commit()
            legacy_id = str(legacy.id)

        fake_google(
            {
                "aud": WEB_CLIENT,
                "sub": "google-sub-2",
                "email": "legacy@example.com",
                "name": "Старый",
            }
        )
        linked = await client.post("/v1/auth/google", json={"id_token": "x"})
        check("вход в старый аккаунт по почте успешен", linked.status_code == 200)
        check(
            "это тот же аккаунт, а не новый",
            linked.json().get("user", {}).get("id") == legacy_id,
            "завёлся дубликат — история старого аккаунта потеряна",
        )
        check("is_new_user = false у связанного", linked.json().get("is_new_user") is False)

        print("\nDELETE /v1/account — удаление аккаунта")

        access = body.get("access_token", "")
        auth = {"Authorization": f"Bearer {access}"}

        # Набиваем данные, которые обязаны исчезнуть.
        async with SessionLocal() as session:
            user_id = uuid.UUID(body["user"]["id"])
            chat = Chat(user_id=user_id, title="Диалог")
            session.add(chat)
            await session.flush()
            session.add(Message(chat_id=chat.id, content="привет"))
            session.add(TokenUsage(user_id=user_id, tokens=100))
            session.add(Feedback(user_id=user_id))
            await session.commit()

        no_auth = await client.delete("/v1/account")
        check("без токена удаление запрещено (401)", no_auth.status_code == 401, f"статус {no_auth.status_code}")

        deleted = await client.delete("/v1/account", headers=auth)
        check("удаление проходит (200)", deleted.status_code == 200, f"статус {deleted.status_code}: {deleted.text[:200]}")

        async with SessionLocal() as session:
            gone = await session.get(User, uuid.UUID(body["user"]["id"]))
            check("пользователь удалён", gone is None)

            chats = (await session.scalars(select(Chat).where(Chat.user_id == user_id))).all()
            check("чаты удалены", len(chats) == 0, f"осталось {len(chats)}")

            msgs = (await session.scalars(select(Message))).all()
            check("сообщения удалены", len(msgs) == 0, f"осталось {len(msgs)}")

            usage = (await session.scalars(select(TokenUsage).where(TokenUsage.user_id == user_id))).all()
            check("расход токенов удалён — лимит не помнит удалённого", len(usage) == 0)

            tokens_left = (
                await session.scalars(select(RefreshToken).where(RefreshToken.user_id == user_id))
            ).all()
            check("refresh-токены удалены — по ним больше не войти", len(tokens_left) == 0)

            others = (await session.scalars(select(User))).all()
            check("чужой аккаунт не задет", len(others) == 1 and str(others[0].id) == legacy_id)

        after = await client.delete("/v1/account", headers=auth)
        check(
            "старый токен после удаления не работает (401)",
            after.status_code == 401,
            f"статус {after.status_code}",
        )

    await engine.dispose()

    print(f"\n{'─' * 60}")
    print(f"Пройдено: {len(passed)}, провалено: {len(failed)}")
    if failed:
        for name in failed:
            print(f"  ✖ {name}")
        sys.exit(1)
    print("Обе ручки ведут себя по контракту.")


if __name__ == "__main__":
    asyncio.run(main())
