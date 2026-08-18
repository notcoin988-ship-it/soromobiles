"""
Проверка Authorization: Bearer <access_token> (задача B1).

Заменяет чтение cookie-сессии: мобильному приложению cookie запрещены (§6.2).

Веб-клиент при этом продолжает работать на cookie — можно поддержать оба
способа одновременно, см. current_user_hybrid внизу.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_session          # ЗАМЕНИТЬ на ваш способ получить сессию
from .models import User
from .security import decode_access_token

# auto_error=False: хотим сами решать, что вернуть, и отвечать в формате
# {"detail": "Not authenticated"} из §6.5, а не дефолтом FastAPI.
bearer_scheme = HTTPBearer(auto_error=False)

UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
)


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    """
    Достаёт пользователя из access-токена.

    Возвращать 401 здесь критично: приложение по нему запускает рефреш и
    повторяет запрос прозрачно для интерфейса (§5.3). Любой другой код
    сломает автопродление сессии.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UNAUTHORIZED

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise UNAUTHORIZED

    user = await session.get(User, user_id)
    if user is None:
        raise UNAUTHORIZED

    return user


async def current_user_hybrid(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    """
    Переходный вариант на время миграции: сначала Bearer, потом cookie.

    Позволяет добавить токены, не ломая работающий веб-клиент. Когда веб
    переедет на токены, cookie-ветку можно удалить.
    """
    if credentials is not None and credentials.scheme.lower() == "bearer":
        user_id = decode_access_token(credentials.credentials)
        if user_id:
            user = await session.get(User, user_id)
            if user is not None:
                return user

    session_user_id = request.session.get("user_id")
    if session_user_id:
        user = await session.get(User, session_user_id)
        if user is not None:
            return user

    raise UNAUTHORIZED
