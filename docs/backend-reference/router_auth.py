"""
POST /v1/auth/refresh, /logout — задача B1. Плюс общие схемы сессии.

Контракт из §6.6 ТЗ. Проверяется командой:
    node scripts/check-contract.mjs http://localhost:8000

ВХОДА ПО ПАРОЛЮ ЗДЕСЬ НЕТ. Единственный вход приложения — Google
(router_auth_google.py): регистрация по почте с кодом из письма и
восстановление пароля из мобильного контракта убраны целиком, а вместе с ними
ушла зависимость от SMTP. Собственный вход сайта по паролю живёт в веб-проекте
и этих файлов не касается.

issue_session, UserOut и SessionOut остались здесь: их зовёт обмен
Google-кода, и в одном месте им лучше, чем продублированными в двух.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
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
)

router = APIRouter(prefix="/v1/auth", tags=["auth"])


# --- Схемы -------------------------------------------------------------------

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
    # типа str НЕ приводит UUID само и падает с 500 везде, где отдаётся
    # пользователь: обмен Google-кода, /auth/me. Проверено прогоном против
    # PostgreSQL. Приводим явно до валидации.
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

    Вынесено отдельно, потому что то же самое нужно обмену Google-кода (B2) и
    ротации refresh-токена ниже.
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
