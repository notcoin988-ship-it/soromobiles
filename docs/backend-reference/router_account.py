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

Плюс отдельно нужна публичная веб-страница https://sorollm.tj/delete-account —
пользователь должен иметь возможность запросить удаление БЕЗ установки
приложения. Ссылка указывается в Play Console. Черновик её эндпоинта — внизу.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..deps import current_user
from ..models import (
    Chat,
    Feedback,
    Message,
    RefreshToken,
    TokenUsage,
    User,
    VerificationCode,
)
from ..security import verify_password

router = APIRouter(prefix="/v1", tags=["account"])

logger = logging.getLogger("account.deletion")


class DeleteAccountRequest(BaseModel):
    # Подтверждение для email-аккаунтов. У пришедших через Google пароля нет.
    password: str | None = None


@router.delete("/account")
async def delete_account(
    body: DeleteAccountRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Удаление аккаунта и всех данных.

    Пароль обязателен, если он у аккаунта есть: удаление необратимо, и
    случайный тап по кнопке на чужом разблокированном телефоне не должен
    стирать переписку.
    """
    if user.password_hash:
        if not body.password or not verify_password(body.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "bad_credentials"},
            )

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

    # Незакрытые коды подтверждения на эту почту.
    user = await session.get(User, user_id)
    if user is not None and user.email:
        await session.execute(
            delete(VerificationCode).where(VerificationCode.email == user.email)
        )

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
# Форма на https://sorollm.tj/delete-account отправляет сюда почту и пароль,
# сервер удаляет аккаунт тем же кодом. Отдельный эндпоинт нужен потому, что у
# пользователя нет токена: он не в приложении.

class PublicDeleteRequest(BaseModel):
    email: str
    password: str


@router.post("/account/delete-request")
async def public_delete_request(
    body: PublicDeleteRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Удаление аккаунта с публичной веб-страницы.

    Отвечает 200 ВСЕГДА, даже если почта не найдена или пароль неверен: иначе
    страница становится способом проверять, зарегистрирован ли человек, и
    подбирать пароли без всякой защиты приложения.

    Реальный результат пользователь узнаёт из письма.
    """
    email = body.email.strip().lower()
    user = await session.scalar(select(User).where(User.email == email))

    if user is not None and user.password_hash and verify_password(body.password, user.password_hash):
        await purge_user_data(session, user.id)
        await session.delete(user)
        await session.commit()
        logger.info("account deleted via web form", extra={"user_id": str(user.id)})

    return {"status": "accepted"}
