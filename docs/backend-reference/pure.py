"""
Чистая логика без зависимостей от FastAPI и SQLAlchemy.

Вынесена отдельно намеренно: всё остальное в этой папке импортирует фреймворк
и без него не поднимается, а значит и не тестируется. Здесь только стандартная
библиотека — эти функции можно прогнать в любом окружении, что и делает
test_pure.py.

Роутеры импортируют отсюда, а не дублируют логику.
"""

from __future__ import annotations

import hashlib
import secrets

# --- B10: заголовок чата -----------------------------------------------------

CHAT_TITLE_MAX_LENGTH = 40   # §6.6: «первые ~40 символов вопроса»
DEFAULT_CHAT_TITLE = "Чати нав"


def make_chat_title(question: str) -> str:
    """
    Заголовок чата из первых ~40 символов вопроса.

    Обрезается по границе слова, иначе в списке останутся обрубки вроде
    «Баландтарин қуллаҳои кӯҳии Тоҷикисто». Многоточие добавляется только если
    текст реально обрезан.
    """
    text = " ".join(question.split())  # схлопываем переводы строк и двойные пробелы
    if not text:
        return DEFAULT_CHAT_TITLE
    if len(text) <= CHAT_TITLE_MAX_LENGTH:
        return text

    cut = text[:CHAT_TITLE_MAX_LENGTH]
    space = cut.rfind(" ")
    # Режем по слову, только если слово не занимает почти весь заголовок —
    # иначе от длинного первого слова останется огрызок в пару букв.
    if space > CHAT_TITLE_MAX_LENGTH // 2:
        cut = cut[:space]
    return cut.rstrip(" ,.;:—-") + "…"


# --- §6.3.3: профили модели --------------------------------------------------

def resolve_profile(model: str | None) -> str:
    """
    Во что разрешается значение model на сервере.

    Стримить умеют только light и translate: base требует полного ответа для
    fact-check (B9).
    """
    if model in ("smart", "base", "research"):
        return "base"
    if model in ("translate", "tarjuma"):
        return "translate"
    return "light"


def is_streamable(model: str | None) -> bool:
    return resolve_profile(model) != "base"


# --- Почта и коды ------------------------------------------------------------

def normalize_email(email: str) -> str:
    """
    Почта регистронезависима. Без нормализации Ivan@mail.ru и ivan@mail.ru
    станут двумя аккаунтами, и «уникальность по email» (B2) перестанет работать.
    """
    return email.strip().lower()


MIN_PASSWORD_LENGTH = 8  # §6.6

COMMON_PASSWORDS = {
    "password", "12345678", "qwerty123", "parol123", "11111111",
    "123456789", "1234567890", "qwertyui", "iloveyou", "admin123",
}


def password_problem(password: str) -> str | None:
    """Возвращает код ошибки или None. §6.6: минимум 8 символов + не из частых."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return "weak_password"
    if password.lower() in COMMON_PASSWORDS:
        return "weak_password"
    return None


def generate_code() -> str:
    """
    Шесть цифр (§6.6). secrets, а не random: random предсказуем по нескольким
    выданным значениям, и коды можно было бы вычислять для чужих почт.
    """
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().encode()).hexdigest()


# --- §6.3.4: лимиты ----------------------------------------------------------

TIER_DAILY_LIMIT = {
    "free_anon": 3_000,
    "free_email": 10_000,
    "plus": 100_000,
}


def daily_limit_for(tier: str) -> int:
    """Неизвестный тир получает самый строгий лимит, а не самый щедрый."""
    return TIER_DAILY_LIMIT.get(tier, TIER_DAILY_LIMIT["free_anon"])
