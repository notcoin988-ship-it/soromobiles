"""
POST /v2/ask с идемпотентностью и заголовком чата — задачи B8 и B10.

B8 (§6.6): повторный запрос с тем же client_msg_id не создаёт дубликат и не
списывает токены заново.

B10 (§6.6): «Сервер сам формирует заголовок чата после первого обмена (первые
~40 символов вопроса либо краткая суммаризация моделью) и возвращает его в
AssistantResponse как chat_title».

Показан только изменённый путь; вызовы модели и учёт лимитов взяты из вашего
существующего кода и помечены ЗАМЕНИТЬ.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..deps import current_user
from ..models import Chat, GenerationState, Message, User

# Чистая логика живёт отдельно и покрыта тестами (test_pure.py). Дублировать её
# здесь нельзя: тесты перестанут покрывать код, который реально выполняется.
from ..pure import DEFAULT_CHAT_TITLE, make_chat_title

router = APIRouter(prefix="/v2", tags=["ask"])


# --- Схемы -------------------------------------------------------------------

class AskMessage(BaseModel):
    role: str
    content: str


class AssistantRequestV2(BaseModel):
    """ЗАМЕНИТЬ: добавить поле client_msg_id в существующую схему."""

    messages: list[AskMessage]
    chat_id: uuid.UUID
    temperature: float | None = 0.5
    use_rag: bool | None = True
    model: str | None = "fast"
    attachment_ids: list[uuid.UUID] | None = None
    class_level: str | None = None

    # B8. Необязательное: старые клиенты его не шлют, и они должны продолжать
    # работать — просто без защиты от дублей.
    client_msg_id: str | None = Field(default=None, max_length=64)


class AssistantResponse(BaseModel):
    response: str
    model: str
    request_id: str
    message_id: str
    sources: list[dict] = []

    # B10. Клиент подставляет его в список чатов, не делая лишнего запроса.
    chat_title: str | None = None


class GenerationInProgress(BaseModel):
    """Тело ответа 202 (B8): генерация уже идёт, клиент подписывается заново."""

    request_id: str
    status: str = "generating"


# --- B10: заголовок чата -----------------------------------------------------

async def apply_chat_title(session: AsyncSession, chat: Chat, question: str) -> str:
    """
    Ставит заголовок после ПЕРВОГО обмена и больше его не трогает: §6.6 говорит
    «после первого обмена». Переименование пользователем (PATCH /rename) не
    должно затираться следующим вопросом.
    """
    if chat.title and chat.title != DEFAULT_CHAT_TITLE:
        return chat.title

    chat.title = make_chat_title(question)
    chat.updated_at = datetime.now(timezone.utc)
    return chat.title


# --- B8: идемпотентность -----------------------------------------------------

async def claim_request(
    session: AsyncSession,
    chat_id: uuid.UUID,
    client_msg_id: str,
    question: str,
    request_id: str,
) -> Message | None:
    """
    Пытается «занять» client_msg_id, вставив пользовательское сообщение.

    Возвращает созданную запись, если заняли, и None — если такой
    client_msg_id уже существует.

    Занятие делается ВСТАВКОЙ, а не проверкой «есть ли запись». Проверка —
    это гонка: два одновременных запроса оба увидят «нет записи» и оба
    вставят. Уникальный индекс отвергнет второй, и мы поймаем IntegrityError.
    """
    message = Message(
        chat_id=chat_id,
        role="user",
        content=question,
        client_msg_id=client_msg_id,
        generation_state=GenerationState.PENDING,
        request_id=request_id,
    )
    session.add(message)

    try:
        # SAVEPOINT: при конфликте откатится только эта вставка, а не вся
        # транзакция. Без него после IntegrityError сессия становится
        # непригодной и любой следующий запрос упадёт.
        async with session.begin_nested():
            await session.flush()
    except IntegrityError:
        return None

    return message


async def existing_result(
    session: AsyncSession, chat_id: uuid.UUID, client_msg_id: str
) -> tuple[Message, Message | None]:
    """
    Находит ранее принятое сообщение и ответ на него, если он готов.

    Ответ ищется как ближайшее сообщение ассистента ПОСЛЕ пользовательского:
    отдельной связи между ними в схеме нет.
    """
    user_message = await session.scalar(
        select(Message).where(
            Message.chat_id == chat_id,
            Message.client_msg_id == client_msg_id,
        )
    )
    if user_message is None:
        raise HTTPException(500, detail={"message": "idempotency record vanished"})

    answer = await session.scalar(
        select(Message)
        .where(
            Message.chat_id == chat_id,
            Message.role == "assistant",
            Message.created_at >= user_message.created_at,
        )
        .order_by(Message.created_at.asc())
    )
    return user_message, answer


# --- POST /v2/ask ------------------------------------------------------------

@router.post("/ask")
async def ask(
    body: AssistantRequestV2,
    response: Response,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    chat = await session.get(Chat, body.chat_id)
    if chat is None:
        raise HTTPException(404, detail="Chat not found")
    if chat.user_id != user.id:
        raise HTTPException(403, detail="Access denied")

    question = next(
        (m.content for m in reversed(body.messages) if m.role == "user"),
        "",
    )
    request_id = str(uuid.uuid4())

    # --- B8: путь повторного запроса ----------------------------------------
    user_message = None
    if body.client_msg_id:
        user_message = await claim_request(
            session, body.chat_id, body.client_msg_id, question, request_id
        )

        if user_message is None:
            # Такой client_msg_id уже принимали.
            previous, answer = await existing_result(
                session, body.chat_id, body.client_msg_id
            )

            if answer is not None and previous.generation_state == GenerationState.COMPLETED:
                # Ответ готов — отдаём его. БЕЗ повторной генерации и БЕЗ
                # списания токенов: пользователь за этот вопрос уже заплатил.
                return AssistantResponse(
                    response=answer.content,
                    model=body.model or "fast",
                    request_id=previous.request_id or request_id,
                    message_id=str(answer.id),
                    sources=[],
                    chat_title=chat.title,
                )

            if previous.generation_state == GenerationState.FAILED:
                # Прошлая попытка провалилась — разрешаем повтор: снимаем
                # занятость и генерируем заново.
                previous.generation_state = GenerationState.PENDING
                previous.request_id = request_id
                user_message = previous
            else:
                # Генерация ещё идёт (§6.6): 202 и request_id, клиент
                # подписывается заново.
                response.status_code = status.HTTP_202_ACCEPTED
                return GenerationInProgress(request_id=previous.request_id or request_id)
    else:
        # Клиент без client_msg_id — работает как раньше, без защиты от дублей.
        user_message = Message(
            chat_id=body.chat_id, role="user", content=question,
            generation_state=GenerationState.PENDING, request_id=request_id,
        )
        session.add(user_message)
        await session.flush()

    # --- Генерация ----------------------------------------------------------
    #
    # Фиксируем принятое сообщение ДО обращения к модели. Если процесс упадёт
    # во время генерации, повтор увидит state=PENDING и получит 202, а не
    # начнёт вторую генерацию.
    await session.commit()

    try:
        # ЗАМЕНИТЬ на ваш вызов модели и учёт лимитов.
        answer_text, resolved_model = await generate_answer(body, user)
    except Exception:
        user_message.generation_state = GenerationState.FAILED
        await session.commit()
        raise

    answer = Message(
        chat_id=body.chat_id,
        role="assistant",
        content=answer_text,
    )
    session.add(answer)

    user_message.generation_state = GenerationState.COMPLETED

    # --- B10: заголовок чата ------------------------------------------------
    title = await apply_chat_title(session, chat, question)

    await session.commit()

    return AssistantResponse(
        response=answer_text,
        model=resolved_model,
        request_id=request_id,
        message_id=str(answer.id),
        sources=[],
        chat_title=title,
    )


async def generate_answer(body: AssistantRequestV2, user: User) -> tuple[str, str]:
    """ЗАМЕНИТЬ на существующий вызов модели с учётом лимитов и профилей."""
    raise NotImplementedError
