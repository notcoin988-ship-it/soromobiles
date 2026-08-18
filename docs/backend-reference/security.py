"""
Хеширование паролей и работа с токенами (задача B1).

Зависимости:
    pip install "passlib[bcrypt]" pyjwt

Почему именно так:

* Пароль НИКОГДА не хранится в открытом виде и не хешируется через sha256.
  bcrypt намеренно медленный — это его смысл: перебор украденной базы
  становится дорогим. sha256 перебирается миллиардами хешей в секунду.

* access_token — JWT: сервер может проверить его подписью, не ходя в базу.
  Живёт 30 минут, поэтому украденный токен быстро протухает.

* refresh_token — НЕ JWT, а случайная строка. Он живёт 90 дней, и его нужно
  уметь отозвать мгновенно (логаут, удаление аккаунта, компрометация). JWT
  отозвать нельзя — он валиден, пока не истёк. Поэтому refresh хранится в базе
  и проверяется по ней.

* В базе лежит ХЕШ refresh-токена, а не он сам. Если базу украдут, войти по
  ней не получится — ровно та же логика, что и с паролями.
"""

from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

# --- Настройки ---------------------------------------------------------------

# Секрет подписи JWT. ОБЯЗАТЕЛЬНО из окружения, никогда не в коде.
#
# С известным секретом кто угодно подпишет себе access-токен на любого
# пользователя — это полный обход авторизации. Поэтому отсутствие переменной
# считается ошибкой конфигурации: падаем при старте, а не берём молча слабый
# дефолт, с которым сервис проработает «вроде бы нормально» и останется дырявым.
#
# Сгенерировать:
#   python -c "import secrets; print(secrets.token_urlsafe(48))"
#
# Смена секрета инвалидирует все выданные access-токены — это штатный способ
# «разлогинить всех» при инциденте.
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET не задан в окружении. Сгенерируйте секрет "
        '(python -c "import secrets; print(secrets.token_urlsafe(48))") '
        "и передайте через переменную окружения JWT_SECRET."
    )
JWT_ALGORITHM = "HS256"

ACCESS_TOKEN_TTL = timedelta(minutes=30)   # §6.2
REFRESH_TOKEN_TTL = timedelta(days=90)     # §6.2

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# --- Пароли ------------------------------------------------------------------

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """
    passlib сам сравнивает за постоянное время — обычное `==` для хешей
    подвержено timing-атаке.
    """
    return pwd_context.verify(plain, hashed)


# --- Access token (JWT) ------------------------------------------------------

def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),          # кто
        "iat": now,                   # когда выдан
        "exp": now + ACCESS_TOKEN_TTL,  # до когда действителен
        "typ": "access",              # чтобы refresh нельзя было подсунуть вместо access
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> str | None:
    """Возвращает user_id или None, если токен невалиден либо истёк."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None

    # Без этой проверки refresh-токен, оформленный как JWT, прошёл бы как access.
    if payload.get("typ") != "access":
        return None
    return payload.get("sub")


# --- Refresh token -----------------------------------------------------------

def generate_refresh_token() -> str:
    """
    Непрозрачная строка (§6.2). 32 байта энтропии — перебрать невозможно.
    token_urlsafe даёт криптостойкую случайность, в отличие от random.
    """
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """
    В базе хранится хеш, а не сам токен.

    Здесь достаточно sha256, а не bcrypt: токен — это 32 случайных байта, его
    невозможно подобрать перебором, поэтому медленный хеш не нужен. У паролей
    ситуация обратная — там энтропии мало, и bcrypt обязателен.
    """
    return hashlib.sha256(token.encode()).hexdigest()


def refresh_expires_at() -> datetime:
    return datetime.now(timezone.utc) + REFRESH_TOKEN_TTL
