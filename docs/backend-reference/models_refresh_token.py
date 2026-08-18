"""
Таблица refresh-токенов (задача B1).

Нужна отдельная таблица, а не поле в users: у одного человека может быть
несколько устройств, и логаут на телефоне не должен разлогинивать планшет.

Миграция Alembic:

    alembic revision -m "refresh tokens" --autogenerate
    alembic upgrade head
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base  # ЗАМЕНИТЬ на ваш declarative Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        # При удалении аккаунта (B5) токены обязаны исчезнуть каскадом,
        # иначе после удаления по ним ещё можно будет получить access.
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Хеш токена, а не сам токен. Утечка базы не даёт войти.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Момент отзыва. NULL — токен живой.
    #
    # Токен НЕ удаляется при ротации, а помечается отозванным. Это позволяет
    # обнаружить повторное использование: если пришёл уже отозванный токен,
    # значит его кто-то украл и применил после легитимного пользователя.
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        # Поиск живых токенов пользователя — самый частый запрос.
        Index("ix_refresh_tokens_user_active", "user_id", "revoked_at"),
    )

    @property
    def is_active(self) -> bool:
        if self.revoked_at is not None:
            return False
        return self.expires_at > datetime.now(self.expires_at.tzinfo)
