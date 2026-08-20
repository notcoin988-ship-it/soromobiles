"""
DELETE /v1/account — задача B5.

Обязательное требование ОБОИХ магазинов, проверяется на ревью:
Apple Guideline 5.1.1(v), Google Play — аналогично. Приложение без работающего
удаления аккаунта отклоняют.

Требования §6.6:
  * удаляет пользователя и каскадом все его чаты, сообщения, вложения,
    проекты, обратную связь, записи об использовании токенов;
  * отзывает все refresh-токены;
  * логирует факт удаления БЕЗ персональных данных для аудита.

Тела у запроса нет: вход только через Google, подтверждать удаление паролем
нечем (см. комментарий у самого обработчика).

Плюс отдельно нужна публичная веб-страница https://sorollm.tj/delete-account —
пользователь должен иметь возможность запросить удаление БЕЗ установки
приложения. Ссылка указывается в Play Console. Черновик её эндпоинта — внизу.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..deps import current_user, current_user_hybrid
from ..models import (
    Chat,
    Feedback,
    Message,
    RefreshToken,
    TokenUsage,
    User,
)

router = APIRouter(prefix="/v1", tags=["account"])

logger = logging.getLogger("account.deletion")


@router.delete("/account")
async def delete_account(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Удаление аккаунта и всех данных.

    БЕЗ ТЕЛА И БЕЗ ПОДТВЕРЖДЕНИЯ ПАРОЛЕМ. Вход в приложении только через
    Google, пароля у такого аккаунта нет вовсе — требовать его значило бы
    закрыть удаление наглухо, а это прямое нарушение Apple 5.1.1(v) и
    требований Google Play.

    От случайного нажатия защищает приложение: удаление стоит за отдельным
    подтверждением на экране настроек. Само право удалить подтверждено
    access-токеном — им владеет только тот, кто прошёл вход через Google.
    """
    user_id = user.id
    # Данные для аудита собираем ДО удаления, но БЕЗ персональных сведений:
    # ни почты, ни имени, ни текстов диалогов (§13 — Sentry и логи без PII).
    audit = {
        "user_id": str(user_id),
        "tier": user.tier,
        "registered_at": user.created_at.isoformat(),
        "deleted_at": datetime.now(timezone.utc).isoformat(),
    }

    await purge_user_data(session, user_id)
    await session.delete(user)
    await session.commit()

    # Факт удаления логируется — это нужно, чтобы отвечать на запросы
    # «я удалял аккаунт, почему данные ещё есть».
    logger.info("account deleted", extra=audit)

    return {"status": "deleted"}


async def purge_user_data(session: AsyncSession, user_id: uuid.UUID) -> None:
    """
    Явное удаление связанных данных.

    Полагаться только на ondelete=CASCADE рискованно: он работает лишь если
    внешние ключи объявлены с ним И включён `PRAGMA foreign_keys` / нет
    отключённых констрейнтов. Явное удаление гарантирует результат независимо
    от состояния схемы, а каскад останется страховкой.

    Порядок важен: сначала то, что ссылается на сообщения, потом сообщения,
    потом чаты.
    """
    # Обратная связь и жалобы ссылаются на сообщения.
    await session.execute(delete(Feedback).where(Feedback.user_id == user_id))

    # Сообщения удаляем через подзапрос по чатам пользователя.
    chat_ids = select(Chat.id).where(Chat.user_id == user_id).scalar_subquery()
    await session.execute(delete(Message).where(Message.chat_id.in_(chat_ids)))

    await session.execute(delete(Chat).where(Chat.user_id == user_id))

    # Записи об использовании токенов — иначе лимиты «помнят» удалённого.
    await session.execute(delete(TokenUsage).where(TokenUsage.user_id == user_id))

    # Все refresh-токены: после удаления по ним не должно выдаваться access.
    await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))

    # ЗАМЕНИТЬ: если в проекте есть проекты (/v1/project/*) и вложения —
    # добавить их сюда. §6.6 требует удалять и их тоже.
    # await session.execute(delete(Project).where(Project.user_id == user_id))
    # await session.execute(delete(Attachment).where(Attachment.user_id == user_id))


# ---------------------------------------------------------------------------
# Публичная страница удаления — требование Google Play
# ---------------------------------------------------------------------------
#
# Пользователь должен иметь возможность запросить удаление, НЕ устанавливая
# приложение. Ссылка указывается в Play Console.
#
# Страница https://sorollm.tj/delete-account предлагает войти через Google —
# тем же входом, что и весь сайт, — и удаляет аккаунт вошедшего. Пароля она не
# спрашивает: его у аккаунта Google нет.
#
# Эндпоинт отдельный от DELETE /v1/account потому, что у веба другая
# авторизация: cookie-сессия, а не Bearer. Приложение сюда не ходит.

@router.post("/account/delete-request")
async def public_delete_request(
    user: User = Depends(current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """
    Удаление аккаунта с публичной веб-страницы.

    current_user_hybrid (deps.py) принимает и cookie-сессию сайта, и Bearer —
    поэтому страница работает сразу после входа через Google, без отдельного
    механизма подтверждения.

    Незалогиненный получает 401 и кнопку «Войти через Google»: анонимный
    запрос на удаление по одной лишь почте был бы способом стирать чужие
    аккаунты, а «отвечаем 200 всем» — способом проверять, кто зарегистрирован.
    """
    user_id = user.id

    await purge_user_data(session, user_id)
    await session.delete(user)
    await session.commit()

    logger.info("account deleted via web form", extra={"user_id": str(user_id)})

    return {"status": "deleted"}
