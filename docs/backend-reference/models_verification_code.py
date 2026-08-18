"""
Коды подтверждения почты и восстановления пароля (задачи B2 и B4).

Одна таблица на оба сценария: механика одинаковая, различается только
назначение в поле purpose.

Требования §6.6: 6 цифр, TTL 15 минут, максимум 5 попыток ввода, затем
инвалидация.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base  # ЗАМЕНИТЬ на ваш declarative Base


class CodePurpose(str, enum.Enum):
    REGISTER = "register"
    RESET_PASSWORD = "reset_password"


class VerificationCode(Base):
    __tablename__ = "verification_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Привязка к почте, а НЕ к user_id: код для восстановления пароля нужно
    # уметь выдать до того, как мы поняли, есть ли такой пользователь вообще
    # (см. «всегда 202» в B4).
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)

    purpose: Mapped[CodePurpose] = mapped_column(
        # values_callable: хранить в БД строковые ЗНАЧЕНИЯ ('register',
        # 'reset_password'), а не ИМЕНА членов ('REGISTER'), как SQLAlchemy
        # делает по умолчанию. Так метки в БД совпадают с тем, что видно в коде
        # и в миграции, и hand-written SQL становится однозначным.
        Enum(CodePurpose, name="code_purpose", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )

    # Хеш кода, а не сам код. Утечка базы не даёт подтвердить чужую почту.
    # Здесь достаточно sha256: код живёт 15 минут и имеет всего 5 попыток,
    # перебирать его бессмысленно даже при мгновенном хешировании.
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Счётчик ПОПЫТОК ВВОДА. При превышении код инвалидируется целиком —
    # иначе шесть цифр подбираются за миллион запросов.
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # NULL — код ещё не использован. Использованный код нельзя применить дважды.
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # IP, с которого запросили код. Нужен для лимита «20 на IP в час» (§6.6):
    # без него один человек регистрирует сколько угодно чужих почт по одной
    # попытке на каждую и лимит по email его не останавливает.
    #
    # INET вместо строки: PostgreSQL умеет его индексировать и сравнивать
    # по подсетям, если понадобится банить диапазон.
    client_ip: Mapped[str | None] = mapped_column(INET, nullable=True)

    __table_args__ = (
        # Поиск живого кода по почте и назначению — основной запрос.
        Index("ix_verification_codes_lookup", "email", "purpose", "used_at"),
        # Для rate limit: сколько кодов выдано на эту почту за последний час.
        Index("ix_verification_codes_created", "email", "created_at"),
        # Для лимита по IP.
        Index("ix_verification_codes_ip", "client_ip", "created_at"),
    )


MAX_ATTEMPTS = 5           # §6.6
CODE_TTL_MINUTES = 15      # §6.6
RESEND_COOLDOWN_SECONDS = 60
# §6.6: не более 5 запросов на почту в час и 20 на IP в час.
MAX_CODES_PER_EMAIL_HOUR = 5
MAX_CODES_PER_IP_HOUR = 20
