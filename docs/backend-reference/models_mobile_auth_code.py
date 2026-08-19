"""
Таблица одноразовых кодов входа для приложения (B2, вход через Google).

Зачем отдельная таблица, а не поле у пользователя: код живёт минуты, гасится
после первого применения и должен переживать параллельные входы с двух
устройств — поле в users затирало бы одно другим.

Миграция Alembic:

    alembic revision -m "mobile auth codes" --autogenerate
    alembic upgrade head

Либо SQL напрямую — см. migration.sql.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base  # ЗАМЕНИТЬ на ваш declarative Base


class MobileAuthCode(Base):
    __tablename__ = "mobile_auth_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        # При удалении аккаунта (B5) невыкупленные коды обязаны исчезнуть:
        # иначе по ним ещё несколько минут можно получить сессию на
        # удалённого пользователя.
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Хеш кода, а не сам код — как у refresh-токенов. sha256 достаточно:
    # код это 32 случайных байта, перебирать нечего.
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)

    # Завёл ли этот вход нового пользователя. Нужно ровно одному счётчику —
    # signup_completed (§13): на клиенте регистрация через Google неотличима
    # от возврата, и посчитать её там невозможно.
    is_new_user: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # NULL — код не потрачен. Потраченный НЕ удаляется сразу: по нему видно
    # повторное применение, а это признак перехвата.
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # Уборка просроченных — единственный запрос не по code_hash.
        Index("ix_mobile_auth_codes_expires", "expires_at"),
    )
