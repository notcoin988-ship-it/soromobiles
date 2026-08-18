"""
Идемпотентность отправки — задача B8.

§6.6 дословно:

    В AssistantRequestV2 и RegenerateRequest добавляется поле:
        { "client_msg_id": "uuid-v4-от-клиента" }

    Сервер хранит client_msg_id в таблице messages с уникальным индексом
    (chat_id, client_msg_id). Повторный запрос с тем же client_msg_id:
      * если ответ уже сгенерирован — возвращает готовый AssistantResponse
        без повторной генерации и без списания токенов;
      * если генерация ещё идёт — возвращает 202 с request_id, клиент
        подписывается заново.

Зачем это нужно. Приложение ставит сообщение в очередь при отсутствии сети и
повторяет отправку при восстановлении связи (§5.5). Без идемпотентности повтор
создаёт дубликат в истории и списывает дневной лимит второй раз. Критерий §17
«сообщение уходит ровно один раз» без этого не выполняется.

ГЛАВНОЕ: защита держится на уникальном индексе в БАЗЕ, а не на проверке
«есть ли уже такая запись» в коде. Проверка в коде — это гонка: два запроса
приходят одновременно, оба видят «нет записи», оба вставляют. База в такой
ситуации отвергнет второй.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base  # ЗАМЕНИТЬ на ваш declarative Base


class GenerationState(str, enum.Enum):
    """Состояние генерации ответа на пользовательское сообщение."""

    PENDING = "pending"    # запрос принят, модель ещё отвечает
    COMPLETED = "completed"
    FAILED = "failed"


class Message(Base):
    """
    ЗАМЕНИТЬ: это НЕ новая таблица, а поля, которые надо добавить в
    существующую модель Message. Показана целиком для наглядности.
    """

    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chat_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # --- Новое для B8 --------------------------------------------------------

    # Идентификатор, сгенерированный КЛИЕНТОМ (UUID v4). NULL допустим:
    # у ответов ассистента его нет, и у сообщений, созданных до внедрения B8,
    # тоже. NULL не участвует в уникальном индексе в PostgreSQL — это то, что
    # нужно: несколько NULL не конфликтуют между собой.
    client_msg_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Состояние генерации. Заполняется только у пользовательских сообщений:
    # именно на них «висит» ответ, который либо готов, либо ещё считается.
    generation_state: Mapped[GenerationState | None] = mapped_column(
        Enum(GenerationState, name="generation_state"), nullable=True
    )

    # request_id текущей генерации. Возвращается клиенту в 202, чтобы он мог
    # соотнести повтор с идущим запросом.
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        # СЕРДЦЕ B8. Уникальность обеспечивает база, а не код.
        #
        # PostgreSQL не считает два NULL равными, поэтому сообщения без
        # client_msg_id (ответы ассистента, старые записи) индексу не мешают.
        UniqueConstraint("chat_id", "client_msg_id", name="uq_messages_chat_client_msg"),
        Index("ix_messages_chat_created", "chat_id", "created_at"),
    )


# Миграция Alembic вручную, если autogenerate не подхватит:
#
#     op.add_column("messages", sa.Column("client_msg_id", sa.String(64), nullable=True))
#     op.add_column("messages", sa.Column("request_id", sa.String(64), nullable=True))
#     op.execute("CREATE TYPE generation_state AS ENUM ('pending','completed','failed')")
#     op.add_column(
#         "messages",
#         sa.Column("generation_state",
#                   sa.Enum("pending", "completed", "failed", name="generation_state"),
#                   nullable=True),
#     )
#     op.create_unique_constraint(
#         "uq_messages_chat_client_msg", "messages", ["chat_id", "client_msg_id"]
#     )
#
# ВАЖНО про существующие данные: если в messages уже есть строки, они получат
# client_msg_id = NULL и индексу не помешают. Отдельной чистки не нужно.
