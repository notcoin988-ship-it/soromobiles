"""
Пагинация и фильтрация чатов — задачи B12 и B13.

B12 (§6.6):
    GET /v1/chat/list?status=active&limit=30&cursor=<updated_at>
    GET /v1/chat/{id}?limit=50&before=<message_id>

Сейчас (§2.3): «GET /v1/chat/list отдаёт все чаты пользователя; GET
/v1/chat/{id} — все сообщения чата. На 3G и на устройстве с 2 ГБ ОЗУ это узкое
место».

B13 (§2.3): «GET /v1/chat/list без параметра status возвращает и deleted-чаты.
Веб фильтрует на клиенте».

Почему это важнее, чем кажется. Учитель за полгода накопит сотни чатов и тысячи
сообщений. Открытие приложения на 3G превратится в минуту ожидания, а Redmi 9A
с 2 ГБ ОЗУ просто не удержит всю историю в памяти.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..deps import current_user
from ..models import Chat, Message, User

router = APIRouter(prefix="/v1", tags=["chats"])

DEFAULT_CHAT_LIMIT = 30      # §6.6
DEFAULT_MESSAGE_LIMIT = 50   # §6.6
MAX_LIMIT = 100              # потолок, чтобы limit=100000 не выгреб всю базу


class ChatInfo(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    project_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- B12 + B13: список чатов -------------------------------------------------

@router.get("/chat/list", response_model=list[ChatInfo])
async def list_chats(
    status: str | None = Query(None),
    limit: int = Query(DEFAULT_CHAT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: datetime | None = Query(None, description="updated_at последнего полученного чата"),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Список чатов, отсортированный по updated_at DESC (§6.3.2).

    B13. Удалённые чаты НЕ возвращаются, даже если параметр status не передан.
    Раньше поведение по умолчанию отдавало и deleted, и каждый клиент был обязан
    помнить про фильтр — веб фильтровал на своей стороне, а следующий клиент об
    этом бы не узнал. Безопасное умолчание лучше, чем документированная ловушка.
    Явный ?status=deleted по-прежнему работает: он нужен админке.

    B12. Курсорная пагинация, а не OFFSET. При OFFSET новый чат, созданный между
    двумя запросами, сдвигает окно, и одна запись приходит дважды либо теряется.
    Курсор по updated_at от этого свободен.
    """
    query = select(Chat).where(Chat.user_id == user.id)

    if status is not None:
        query = query.where(Chat.status == status)
    else:
        # B13: безопасное умолчание.
        query = query.where(Chat.status != "deleted")

    if cursor is not None:
        # Строго меньше: запись с этим updated_at клиент уже получил.
        query = query.where(Chat.updated_at < cursor)

    query = query.order_by(Chat.updated_at.desc()).limit(limit)

    return list(await session.scalars(query))


# --- B12: чат с сообщениями --------------------------------------------------

class MessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime
    kind: str = "normal"
    attachments: list = []

    model_config = {"from_attributes": True}


class ChatWithMessages(ChatInfo):
    messages: list[MessageOut]
    # Есть ли что догружать выше. Без этого клиент не знает, показывать ли
    # индикатор загрузки при прокрутке вверх.
    has_more: bool = False


@router.get("/chat/{chat_id}", response_model=ChatWithMessages)
async def get_chat(
    chat_id: uuid.UUID,
    limit: int = Query(DEFAULT_MESSAGE_LIMIT, ge=1, le=MAX_LIMIT),
    before: uuid.UUID | None = Query(None, description="id самого верхнего показанного сообщения"),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Чат с историей сообщений.

    Пагинация идёт СНИЗУ ВВЕРХ: свежие сообщения нужны сразу, старые
    догружаются при прокрутке вверх. Поэтому выбираем последние `limit` и
    разворачиваем — клиенту лента отдаётся в хронологическом порядке.
    """
    chat = await session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(404, detail="Chat not found")
    if chat.user_id != user.id:
        raise HTTPException(403, detail="Access denied")

    query = select(Message).where(Message.chat_id == chat_id)

    if before is not None:
        anchor = await session.get(Message, before)
        if anchor is None or anchor.chat_id != chat_id:
            raise HTTPException(404, detail="Message not found")
        query = query.where(Message.created_at < anchor.created_at)

    # Берём на одну запись больше запрошенного: если она пришла, значит выше
    # ещё есть история. Это дешевле отдельного COUNT(*) по всему чату.
    rows = list(
        await session.scalars(
            query.order_by(Message.created_at.desc()).limit(limit + 1)
        )
    )

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    # Разворачиваем: выбирали от свежих к старым, отдаём от старых к свежим.
    rows.reverse()

    return ChatWithMessages(
        **ChatInfo.model_validate(chat).model_dump(),
        messages=[MessageOut.model_validate(m) for m in rows],
        has_more=has_more,
    )
