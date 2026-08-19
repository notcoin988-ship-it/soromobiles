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


# --- Одноразовые коды входа --------------------------------------------------

def hash_code(code: str) -> str:
    """
    Хеш одноразового кода входа (router_auth_google). В базе лежит он, а не сам
    код: утечка таблицы не даёт войти.

    sha256, а не bcrypt: код — это 32 случайных байта от secrets, перебирать
    там нечего, и медленный хеш только тормозил бы вход.
    """
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
