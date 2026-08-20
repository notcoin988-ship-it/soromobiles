"""
POST /v1/auth/google — единственный вход мобильного приложения (B2).

Приложение показывает системное окно выбора аккаунта Google и получает
id_token, подписанный самим Google. Эта ручка проверяет подпись и меняет
токен на нашу пару access + refresh — ту же, что выдают уже работающие
/v1/auth/login и /v1/auth/refresh.

ЧТО ЭТО ЗНАЧИТ ДЛЯ РАЗВЁРТЫВАНИЯ: ни новых таблиц, ни миграций, ни правок в
существующем коде сайта. Нужны google-auth в зависимостях и одна строка
include_router. Механика токенов (issue_session, таблица refresh_tokens) на
сервере уже есть.

ВТОРОЙ ПУТЬ ВХОДА СЕРВЕРА НЕ КАСАЕТСЯ. На телефонах без сервисов Google
(Huawei и прочие без GMS) системного окна не существует, и приложение
проводит OAuth само — браузером, по PKCE, напрямую с Google. Наружу оно
выносит тот же id_token, поэтому сюда приходит одинаковый запрос; отличается
только поле aud, и потому аудитория проверяется списком, а не одним значением.

Проверяется командой:
    node scripts/check-contract.mjs https://api.sorollm.tj
"""

from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from google.auth.transport import requests as google_requests  # pip install google-auth
from google.oauth2 import id_token as google_id_token

from ..db import get_session          # ЗАМЕНИТЬ на ваш способ получить сессию
from ..models import User
from .router_auth import SessionOut, UserOut, issue_session

router = APIRouter(prefix="/v1/auth", tags=["auth"])

logger = logging.getLogger("auth.google")

# --- Настройки ---------------------------------------------------------------

# Наши OAuth-клиенты в проекте Google Cloud 500782884295. Токен принимается,
# если его aud совпал с ЛЮБЫМ из них, — потому что путей входа два и аудитория
# у них разная:
#
#   • системное окно Google отдаёт токен с aud = web-клиент (приложение
#     передаёт его как serverClientId);
#   • браузерный путь для телефонов без сервисов Google идёт по PKCE напрямую
#     с Google от имени клиента своей платформы, и aud там = Android или iOS.
#
# ЭТО НЕ КЛИЕНТЫ САЙТА. У сайта свой проект (480387520142) и свой web-клиент,
# он обслуживает вход на sorollm.tj и мобильного приложения не касается.
#
# Секретами эти идентификаторы не являются — они видны в любом OAuth-запросе,
# — но берутся из окружения, чтобы стенд и прод не расходились правкой кода.
GOOGLE_CLIENT_IDS = {
    client_id
    for client_id in os.environ.get(
        "GOOGLE_CLIENT_IDS",
        ",".join(
            (
                "500782884295-iuvbrjg4u1nd004n3ecdj7acv9kq9e4t.apps.googleusercontent.com",
                "500782884295-nrvihf8vob0i4vqk6rarm3vodooa07b3.apps.googleusercontent.com",
                "500782884295-e1hntpkh21r8htmj6pes27p7mjm4igjh.apps.googleusercontent.com",
            )
        ),
    ).split(",")
    if client_id.strip()
}


# --- Общая схема ответа ------------------------------------------------------

class GoogleSessionOut(SessionOut):
    """Та же сессия, что у остальных входов, плюс признак новой регистрации."""

    is_new_user: bool = False



# --- POST /v1/auth/google (нативное окно) ------------------------------------

class GoogleIdTokenRequest(BaseModel):
    id_token: str


@router.post("/google", response_model=GoogleSessionOut)
async def sign_in_with_google_id_token(
    body: GoogleIdTokenRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Вход по id_token из нативного окна Google.

    ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ. id_token подписан самим Google: verify_oauth2_token
    сверяет подпись его публичными ключами, издателя и срок годности, а
    аудиторию мы проверяем сами — она у нас не одна (см. GOOGLE_CLIENT_IDS).
    Ключи библиотека кеширует, лишнего похода в сеть на каждый вход нет.

    Токен приходит одинаковый обоими путями входа — из системного окна Google
    и из браузера на телефонах без сервисов Google. Отличается только aud.
    """
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "invalid_token"},
    )

    try:
        # audience не передаём: у библиотеки он один, а у нас их три. Подпись,
        # издателя и срок она проверит сама, аудиторию сверяем ниже списком.
        claims = google_id_token.verify_oauth2_token(
            body.id_token,
            google_requests.Request(),
        )
    except ValueError:
        # Битая подпись, истёкший токен, чужой издатель — снаружи это один и
        # тот же случай: войти нельзя. Разные ответы дали бы способ подбирать.
        raise invalid

    # СВЕРКА АУДИТОРИИ — суть защиты. Без неё подошёл бы токен, выданный любому
    # другому приложению на свете, и вход превратился бы в дыру.
    if claims.get("aud") not in GOOGLE_CLIENT_IDS:
        raise invalid

    # Пустой sub невозможен у настоящего токена, но проверка стоит копейки, а
    # цена ошибки — аккаунт без владельца.
    google_sub = claims.get("sub")
    email = (claims.get("email") or "").strip().lower()
    if not google_sub:
        raise invalid

    user, created = await upsert_google_user(
        session,
        google_id=google_sub,
        email=email or None,
        fullname=claims.get("name") or email or "Soro",
        picture=claims.get("picture"),
    )

    tokens = await issue_session(session, user)

    # ПОРЯДОК ЗДЕСЬ НЕ СЛУЧАЕН, И ЕГО НЕЛЬЗЯ УПРОЩАТЬ.
    #
    # refresh подтягивает поля, которые проставляет сама база: у только что
    # созданного пользователя created_at и updated_at в объекте пустые.
    #
    # Профиль собирается ДО commit, потому что после него SQLAlchemy помечает
    # атрибуты устаревшими, и обращение к любому из них лезет в базу из
    # синхронного кода pydantic — это MissingGreenlet и 500-я на каждом первом
    # входе. Ошибка поймана стендом и воспроизводится стабильно.
    await session.refresh(user)
    payload = UserOut.model_validate(user)

    await session.commit()

    return GoogleSessionOut(
        **tokens.model_dump(),
        user=payload,
        is_new_user=created,
    )


async def upsert_google_user(
    session: AsyncSession,
    *,
    google_id: str,
    email: str | None,
    fullname: str,
    picture: str | None,
) -> tuple[User, bool]:
    """
    Находит пользователя или заводит нового.

    ПОРЯДОК ПОИСКА ВАЖЕН: сначала по google_id, и только потом по почте. Иначе
    человек, сменивший почту в аккаунте Google, получил бы второй профиль с
    пустой историей. Привязка по почте нужна для тех, кто раньше
    регистрировался на сайте паролем: они входят в свой аккаунт, а не в новый.
    """
    user = await session.scalar(select(User).where(User.google_id == google_id))

    if user is None and email:
        user = await session.scalar(select(User).where(User.email == email))
        if user is not None:
            user.google_id = google_id

    if user is not None:
        return user, False

    user = User(
        google_id=google_id,
        email=email,
        fullname=fullname,
        profile_img_url=picture,
        # Почта от Google уже подтверждена — повторно её проверять нечем и незачем.
        tier="free_email",
    )
    session.add(user)
    await session.flush()
    return user, True


# -----------------------------------------------------------------------------
# КАК ПОДКЛЮЧИТЬ (три шага, ничего больше)
# -----------------------------------------------------------------------------
#
#   1. pip install "google-auth>=2.30,<3"
#
#   2. в окружение сервиса (через запятую, без пробелов) — либо ничего не
#      задавать, значения по умолчанию уже верные:
#        GOOGLE_CLIENT_IDS=<web>,<android>,<ios>
#
#   3. в main.py, рядом с остальными роутерами:
#        from .routers import router_auth_google
#        app.include_router(router_auth_google.router)
#
# Проверка после перезапуска — ручка обязана ОТВЕРГНУТЬ выдуманный токен:
#
#   curl -i -X POST -H 'Content-Type: application/json' \
#        -d '{"id_token":"nonsense"}' https://api.sorollm.tj/v1/auth/google
#
# Ожидается 401. Если 500 — не установлен google-auth либо не задан
# GOOGLE_CLIENT_ID; если 404 — роутер не подключён.
