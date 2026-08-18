"""
POST /v1/auth/login, /refresh, /logout — задачи B1 и B3.

Контракт из §6.6 ТЗ. Проверяется командой:
    node scripts/check-contract.mjs http://localhost:8000

Что здесь исправлено по сравнению с текущим /auth/login (баг из §2.3):
существующая реализация делает `request.session['user_id']`, где `request` —
это Pydantic-модель LoginRequest, а объект запроса называется `request_obj`,
отсюда AttributeError и 500. Здесь сессии нет вообще: возвращаются токены.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session          # ЗАМЕНИТЬ на ваш способ получить сессию
from ..models import RefreshToken, User
from ..security import (
    ACCESS_TOKEN_TTL,
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    refresh_expires_at,
    verify_password,
)

router = APIRouter(prefix="/v1/auth", tags=["auth"])


# --- Схемы -------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    """Форма пользователя из §6.3.1. Приложение ждёт ровно эти поля."""

    id: str
    email: str | None
    fullname: str
    google_id: str | None
    profile_img_url: str | None
    lang: str
    is_admin: bool
    is_guest: bool
    tier: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    # id в базе — UUID, приложение (§6.3.1) ждёт строку. Под pydantic v2 поле
    # типа str НЕ приводит UUID само и падает с 500 на /verify, /login, /reset.
    # Проверено прогоном против PostgreSQL: без этого валидатора весь вход
    # отвечает 500. Приводим явно до валидации.
    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id_to_str(cls, value: object) -> object:
        return str(value) if value is not None else value


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int


class SessionOut(TokenPair):
    user: UserOut


# --- Вспомогательное ---------------------------------------------------------

async def issue_session(session: AsyncSession, user: User) -> TokenPair:
    """
    Выдаёт пару токенов и сохраняет хеш refresh в базу.

    Вынесено отдельно, потому что то же самое нужно после verify (B2) и после
    reset пароля (B4) — там пользователь тоже сразу входит.
    """
    refresh_plain = generate_refresh_token()

    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_plain),
            expires_at=refresh_expires_at(),
        )
    )
    await session.flush()

    return TokenPair(
        access_token=create_access_token(str(user.id)),
        # Наружу отдаётся сам токен, в базе остался только его хеш.
        refresh_token=refresh_plain,
        expires_in=int(ACCESS_TOKEN_TTL.total_seconds()),
    )


# --- POST /v1/auth/login -----------------------------------------------------

@router.post("/login", response_model=SessionOut)
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)):
    email = body.email.strip().lower()

    user = await session.scalar(select(User).where(User.email == email))

    # Один и тот же ответ и для несуществующей почты, и для неверного пароля.
    # Разные ответы превратили бы вход в способ узнать, зарегистрирован ли
    # человек в сервисе.
    #
    # verify_password вызывается даже когда пользователя нет — иначе разница во
    # времени ответа выдаёт существование аккаунта (timing-атака).
    stored_hash = user.password_hash if user and user.password_hash else DUMMY_HASH
    password_ok = verify_password(body.password, stored_hash)

    if user is None or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "bad_credentials"},
        )

    # 403, а не 401: для приложения это не тупик — оно по этому коду уводит
    # человека на экран ввода кода из письма (§8.2).
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "email_not_verified"},
        )

    tokens = await issue_session(session, user)
    await session.commit()

    return SessionOut(**tokens.model_dump(), user=UserOut.model_validate(user))


# Хеш заведомо несуществующего пароля. Нужен, чтобы verify_password тратила
# столько же времени, когда пользователя нет — иначе быстрый ответ выдаёт,
# что такой почты в базе не существует.
DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.tGCkkGV1x8yQwvNwHqXSKMTb2Xz3Wla"


# --- POST /v1/auth/refresh ---------------------------------------------------

@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_session)):
    """
    Обмен refresh-токена на новую пару. Старый токен отзывается — это ротация
    из §6.2.

    ВАЖНО ПРО ПОРЯДОК. Новый токен создаётся и коммитится ВМЕСТЕ с отзывом
    старого, одной транзакцией. Если отозвать старый раньше и упасть на выдаче
    нового, живой пользователь останется без токенов вообще и будет выкинут на
    экран входа без причины.
    """
    token_hash = hash_refresh_token(body.refresh_token)

    stored = await session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )

    if stored is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    now = datetime.now(timezone.utc)

    # Повторное использование уже отозванного токена означает кражу: легитимный
    # клиент отозванный токен не пришлёт. Отзываем ВСЕ токены пользователя —
    # пусть перелогинится, это дешевле, чем оставить доступ злоумышленнику.
    if stored.revoked_at is not None:
        await revoke_all_for_user(session, stored.user_id)
        await session.commit()
        raise HTTPException(status_code=401, detail="Not authenticated")

    if stored.expires_at <= now:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = await session.get(User, stored.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    stored.revoked_at = now
    tokens = await issue_session(session, user)
    await session.commit()

    return tokens


# --- POST /v1/auth/logout ----------------------------------------------------

@router.post("/logout")
async def logout(body: RefreshRequest, session: AsyncSession = Depends(get_session)):
    """
    Отзывает refresh-токен. Отвечает 200 всегда, даже если токена не было:
    пользователь всё равно выходит, а разные ответы дали бы способ проверять
    валидность чужих токенов.
    """
    stored = await session.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(body.refresh_token)
        )
    )
    if stored is not None and stored.revoked_at is None:
        stored.revoked_at = datetime.now(timezone.utc)
        await session.commit()

    return {"message": "Logged out successfully"}


async def revoke_all_for_user(session: AsyncSession, user_id) -> None:
    """Полный логаут со всех устройств. Нужен при удалении аккаунта (B5)."""
    tokens = await session.scalars(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
        )
    )
    now = datetime.now(timezone.utc)
    for token in tokens:
        token.revoked_at = now
