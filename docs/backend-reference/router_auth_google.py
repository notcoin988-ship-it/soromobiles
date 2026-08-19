"""
POST /v1/auth/google и /v1/auth/google/exchange — вход приложения через Google (B2).

ДВА ПУТИ, ДВА ЭНДПОИНТА — потому что их два и на клиенте.

  • POST /v1/auth/google {id_token} — НАТИВНОЕ окно выбора аккаунта. Google
    подписал токен сам, серверу остаётся проверить подпись его публичными
    ключами. Ни редиректов, ни таблиц, ни правок в существующем коде сайта:
    это самый дешёвый для бэкенда путь, и если выбирать один — выбирайте его.

  • POST /v1/auth/google/exchange {code} — БРАУЗЕРНЫЙ путь, тот же OAuth, что
    у сайта. Нужен там, где нативное окно невозможно: телефоны без сервисов
    Google (в Таджикистане это заметная доля) и время, пока в Google Cloud
    Console не заведён Android-клиент. Он и требует патча к /auth/callback.

Ниже описано и то, и другое. Это ВТОРАЯ половина обмена. Первая уже есть в sorollm-webapp и работает:
GET /auth/google?platform=… уводит на Google, GET /auth/callback принимает
ответ и заводит пользователя. Ниже — то, чего не хватает, и патч к callback,
без которого редирект в приложение не случится (см. «ПАТЧ К /auth/callback»).

ЗАЧЕМ ОТДЕЛЬНЫЙ ОБМЕН, ЕСЛИ У ВЕБА УЖЕ ЕСТЬ COOKIE. Мобильному клиенту
cookie-сессия запрещена (§6.2): она живёт 2 часа, а приложение обязано не
спрашивать вход при каждом запуске (§6.2, долгая сессия), и на 401 обязано
уметь молча продлиться. Поэтому приложение работает на паре access+refresh,
как и весь остальной мобильный контракт.

ПОЧЕМУ НЕЛЬЗЯ ОТДАТЬ ТОКЕНЫ ПРЯМО В РЕДИРЕКТЕ. soro://auth/callback?access=…
выглядит проще, но адрес редиректа проходит через историю встроенного
браузера, логи прокси и — на Android — через любое приложение, успевшее
зарегистрировать ту же схему. Одноразовый код, живущий пять минут, украсть
тоже можно, но воспользоваться им второй раз уже нельзя, а первое
использование принадлежит настоящему приложению.

Проверяется командой:
    node scripts/check-contract.mjs https://api.sorollm.tj
"""

from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from google.auth.transport import requests as google_requests  # pip install google-auth
from google.oauth2 import id_token as google_id_token

from ..db import get_session          # ЗАМЕНИТЬ на ваш способ получить сессию
from ..models import MobileAuthCode, User
from ..pure import hash_code
from .router_auth import SessionOut, UserOut, issue_session

router = APIRouter(prefix="/v1/auth", tags=["auth"])

logger = logging.getLogger("auth.google")

# --- Настройки ---------------------------------------------------------------

# Куда возвращать приложение. Схема soro:// объявлена в app.config.ts
# мобильного проекта; значение НЕ берётся из запроса — иначе это открытый
# редирект, через который угоняют коды авторизации.
MOBILE_REDIRECT_URL = "soro://auth/callback"

# Пять минут. Столько занимает дорога от закрытия окна Google до запроса на
# обмен даже на плохой связи; больше держать незачем — это лишнее окно для
# перехваченного кода.
MOBILE_CODE_TTL = timedelta(minutes=5)

# Тот же web-клиент, что у сайта: приложение передаёт его как serverClientId,
# и Google кладёт его в aud выданного id_token. Не секрет, но из окружения —
# чтобы стенд и прод не расходились правкой кода.
GOOGLE_CLIENT_ID = os.environ.get(
    "GOOGLE_CLIENT_ID",
    "480387520142-kvn3qpi2rtvvopo3g93qpn5c3vc8doht.apps.googleusercontent.com",
)


# --- Выдача одноразового кода (зовётся из /auth/callback) --------------------

async def issue_mobile_auth_code(
    session: AsyncSession,
    user: User,
    *,
    is_new_user: bool,
) -> str:
    """
    Создаёт одноразовый код и возвращает его открытым текстом — ровно один
    раз, для подстановки в редирект. В базе остаётся только хеш, как у
    refresh-токенов: утечка таблицы не даёт войти.

    is_new_user приходит из callback, потому что только он знает, завёл ли
    он пользователя сейчас или нашёл существующего. Приложению это нужно для
    счётчика signup_completed (§13) — на клиенте регистрация через Google от
    возврата неотличима.
    """
    code = secrets.token_urlsafe(32)

    session.add(
        MobileAuthCode(
            user_id=user.id,
            code_hash=hash_code(code),
            is_new_user=is_new_user,
            expires_at=datetime.now(timezone.utc) + MOBILE_CODE_TTL,
        )
    )
    await session.flush()

    return code


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

    ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ И ПОЧЕМУ ЭТОГО ДОСТАТОЧНО. id_token подписан самим
    Google; verify_oauth2_token сверяет подпись его публичными ключами, срок
    годности и поле aud. Именно aud — суть защиты: без сверки с НАШИМ
    client_id подошёл бы токен, выданный любому другому приложению, и вход
    превратился бы в дыру. Библиотека сама кеширует ключи Google, отдельный
    поход в сеть на каждый вход не нужен.

    GOOGLE_CLIENT_ID — тот же web-клиент, что у сайта: приложение передаёт его
    как serverClientId, поэтому Google кладёт его в aud.
    """
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "invalid_token"},
    )

    try:
        claims = google_id_token.verify_oauth2_token(
            body.id_token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError:
        # Битая подпись, чужая аудитория, истёкший токен — снаружи это один и
        # тот же случай: войти нельзя. Разные ответы дали бы способ подбирать.
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
    await session.commit()

    return GoogleSessionOut(
        **tokens.model_dump(),
        user=UserOut.model_validate(user),
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


# --- POST /v1/auth/google/exchange (браузерный путь) -------------------------

class GoogleExchangeRequest(BaseModel):
    code: str


@router.post("/google/exchange", response_model=GoogleSessionOut)
async def exchange_google_code(
    body: GoogleExchangeRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Меняет одноразовый код из редиректа на пару access + refresh.

    400 на любую негодность кода — приложение показывает одну и ту же просьбу
    попробовать снова (authErrors.googleFailed) и не разбирает причины: для
    человека «код просрочен» и «код уже потрачен» — одно и то же действие.
    Разные ответы дали бы способ перебирать чужие коды по разнице в реакции.
    """
    stored = await session.scalar(
        select(MobileAuthCode).where(MobileAuthCode.code_hash == hash_code(body.code))
    )

    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "invalid_code"},
    )

    if stored is None:
        raise invalid

    now = datetime.now(timezone.utc)

    if stored.used_at is not None:
        # Повторное использование означает, что код видел кто-то ещё:
        # приложение второй раз его не отправляет (обмен не ретраится —
        # см. exchangeGoogleCode в src/api/endpoints/auth.ts). Записываем в
        # лог БЕЗ персональных данных — по нему видно частоту, а не человека.
        logger.warning("mobile auth code reused", extra={"code_id": str(stored.id)})
        raise invalid

    if stored.expires_at <= now:
        raise invalid

    user = await session.get(User, stored.user_id)
    if user is None:
        # Аккаунт успели удалить между входом и обменом (B5).
        raise invalid

    # Код гасится в той же транзакции, что и выдача токенов: если упасть
    # между этими шагами, человек остался бы с потраченным кодом и без сессии.
    stored.used_at = now
    tokens = await issue_session(session, user)

    # Заодно подчищаем мусор: коды, которые никто не обменял. Отдельная
    # периодическая задача ради одной таблицы не нужна — обменов ровно
    # столько же, сколько входов.
    await session.execute(
        delete(MobileAuthCode).where(MobileAuthCode.expires_at < now - timedelta(days=1))
    )

    await session.commit()

    return GoogleSessionOut(
        **tokens.model_dump(),
        user=UserOut.model_validate(user),
        is_new_user=stored.is_new_user,
    )


# -----------------------------------------------------------------------------
# ПАТЧ К /auth/callback (файл веб-проекта, где сейчас живёт OAuth)
# -----------------------------------------------------------------------------
#
# platform уже кладётся в сессию в /auth/google — значение приходит query-
# параметром. Приложение шлёт platform=mobile; ios оставлен как есть, чтобы не
# трогать существующий сценарий.
#
# В конце callback, ПОСЛЕ того как пользователь найден или создан:
#
#     platform = request.session.pop("platform", None)
#
#     if platform == "mobile":
#         from .routers.router_auth_google import (
#             MOBILE_REDIRECT_URL,
#             issue_mobile_auth_code,
#         )
#
#         code = await issue_mobile_auth_code(
#             session, user, is_new_user=created
#         )
#         await session.commit()
#
#         # 302 на схему приложения. Встроенный браузер (ASWebAuthenticationSession
#         # на iOS, Custom Tabs на Android) поймает его сам и закроет окно.
#         return RedirectResponse(f"{MOBILE_REDIRECT_URL}?code={code}")
#
#     # …существующее поведение для веба: cookie-сессия и редирект на сайт
#
# ОТКАЗ ПОЛЬЗОВАТЕЛЯ. Если Google вернул error=access_denied (человек закрыл
# окно выбора аккаунта), для platform == "mobile" редирект обязан вести на
#
#     soro://auth/callback?error=access_denied
#
# а не на страницу сайта: иначе окно останется висеть на HTML-странице, и
# человеку придётся закрывать его руками. Приложение такой ответ понимает
# (parseGoogleRedirect в src/features/auth/googleAuthLink.ts).
#
# КУДА ПОДКЛЮЧИТЬ РОУТЕР (main.py):
#
#     from .routers import router_auth_google
#     app.include_router(router_auth_google.router)
#
# GOOGLE CLOUD CONSOLE: ничего добавлять НЕ НУЖНО. Обмен идёт через тот же
# web-клиент, что и сайт, redirect_uri остаётся https://api.sorollm.tj/auth/callback,
# а схема soro:// живёт уже после него, между нашим сервером и приложением.
# Отдельные OAuth-клиенты для Android и iOS понадобились бы только при
# нативном Google Sign-In, от которого мы отказались ради единого входа с сайтом.
