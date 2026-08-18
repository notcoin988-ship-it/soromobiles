"""
POST /v2/ask/stream для профиля base — задача B9.

§6.6 дословно:

    Стримить основной ответ, fact-check выполнять после и отправлять отдельным
    событием:
        event: corrected
        data: {"response": "исправленный полный текст"}
    Клиент при получении corrected заменяет содержимое сообщения.

Сейчас (§2.3): «POST /v2/ask/stream возвращает 409 для base, потому что
fact-check требует полного ответа». То есть человек ждёт весь ответ молча,
хотя модель уже пишет.

Клиент событие corrected УЖЕ умеет принимать и заменять им текст — см.
src/api/sse.ts. То есть после этой правки стриминг для base заработает без
изменений в приложении.
"""

from __future__ import annotations

import json
import uuid
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..deps import current_user
from ..models import Chat, Message, User
# Покрыта тестами в test_pure.py — не дублировать здесь.
from ..pure import resolve_profile

router = APIRouter(prefix="/v2", tags=["ask"])


def sse(event: str, data: dict) -> str:
    """
    Одна запись SSE (§6.4): `event: <тип>`, `data: <json>`, пустая строка.

    ensure_ascii=False обязателен: иначе таджикские буквы уедут в \\u04b3 и
    раздуют трафик втрое на 3G.
    """
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/ask/stream")
async def ask_stream(
    body: dict,  # ЗАМЕНИТЬ на существующую схему AssistantRequestV2
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    chat = await session.get(Chat, body["chat_id"])
    if chat is None:
        raise HTTPException(404, detail="Chat not found")
    if chat.user_id != user.id:
        raise HTTPException(403, detail="Access denied")

    profile = resolve_profile(body.get("model", "fast"))
    request_id = str(uuid.uuid4())

    async def generate() -> AsyncIterator[str]:
        yield sse("meta", {
            "request_id": request_id,
            "model": profile,
            "web_search": bool(body.get("use_rag")),
        })

        # --- Веб-поиск, если включён -------------------------------------
        sources: list[dict] = []
        if body.get("use_rag") and profile == "base":
            sources = await run_web_search(body)  # ЗАМЕНИТЬ
            if sources:
                yield sse("sources", {"sources": sources})

        # --- Стрим основного ответа --------------------------------------
        #
        # Раньше здесь стоял 409 для base. Теперь стримим как есть: человек
        # видит текст сразу, а не ждёт молча полминуты.
        chunks: list[str] = []
        async for token in stream_from_model(body):  # ЗАМЕНИТЬ
            chunks.append(token)
            yield sse("token", {"t": token})

        draft = "".join(chunks)
        message_id = str(uuid.uuid4())

        # --- Fact-check ПОСЛЕ стрима -------------------------------------
        #
        # В этом и суть B9: проверка требует полного текста, поэтому она не
        # может идти во время генерации. Но и повод молчать всё это время она
        # не даёт — сначала показываем черновик, потом при необходимости
        # заменяем.
        final = draft
        if profile == "base":
            corrected = await run_fact_check(draft, sources)  # ЗАМЕНИТЬ

            # Событие шлём ТОЛЬКО если текст реально изменился. Иначе клиент
            # без нужды перерисует всё сообщение — заметный подскок на
            # дешёвом Android.
            if corrected is not None and corrected != draft:
                final = corrected
                yield sse("corrected", {"response": final})

        # --- Сохранение и завершение --------------------------------------
        #
        # Сохраняем ИСПРАВЛЕННЫЙ текст: при переоткрытии чата человек должен
        # увидеть то же, что видел на экране.
        await persist(session, chat, body, final, message_id)  # ЗАМЕНИТЬ

        yield sse("done", {
            "message_id": message_id,
            "model": profile,
            "sources": sources,
        })

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Обязателен: без него nginx буферизует ответ, и стриминга не
            # будет вообще — клиент получит всё разом в конце (§6.4).
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# --- Заглушки под существующий код -------------------------------------------

async def stream_from_model(body: dict) -> AsyncIterator[str]:
    """ЗАМЕНИТЬ: обёртка над vLLM с stream=True."""
    raise NotImplementedError
    yield ""  # noqa: unreachable — нужен, чтобы функция была генератором


async def run_web_search(body: dict) -> list[dict]:
    """ЗАМЕНИТЬ: существующий поиск через Tavily."""
    return []


async def run_fact_check(draft: str, sources: list[dict]) -> str | None:
    """
    ЗАМЕНИТЬ: существующий fact-check.

    Возвращает исправленный текст либо None, если правок нет.

    ВАЖНО: не бросать исключение наружу. Если проверка упала, лучше отдать
    непроверенный черновик, чем оборвать поток и потерять весь ответ — клиент
    в этом случае не сохранит его вовсе (§6.4).
    """
    return None


async def persist(
    session: AsyncSession, chat: Chat, body: dict, text: str, message_id: str
) -> None:
    """ЗАМЕНИТЬ: сохранение вопроса и ответа, как в /v2/ask."""
    session.add(Message(id=message_id, chat_id=chat.id, role="assistant", content=text))
    await session.commit()
