"""
GET /v1/config — задача B6.

Зачем нужен: без него нельзя менять тексты карточек-подсказок и выкатывать
принудительное обновление, не выпуская новую версию в магазин. А выпуск версии
в Google Play — это дни на ревью.

Приложение запрашивает конфиг при каждом холодном старте и кэширует на 24 часа.
При недоступности использует зашитый по умолчанию набор, поэтому падение этой
ручки НЕ блокирует вход в продукт — но и полагаться на это не стоит.

Эндпоинт публичный: токен не нужен, его вызывают до входа.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter(prefix="/v1", tags=["config"])


class Suggestion(BaseModel):
    cat: str
    text: str


class ConfigLinks(BaseModel):
    # Только support: приложение читает из links лишь его. Политику и условия
    # оно показывает встроенным текстом, а удаление аккаунта делает в приложении
    # через API — эти ссылки конфигу не нужны. Публичные веб-страницы политики
    # и удаления по-прежнему обязательны для магазинов, но их URL живут в
    # консоли Play/App Store, а не здесь.
    support: str


class ClientConfig(BaseModel):
    min_supported_version: str
    force_update: bool
    update_url: str
    default_model: str
    streaming_enabled: bool
    certificate_pinning_enabled: bool
    suggestions: list[Suggestion]
    teacher_templates: list[dict] = []
    limits: dict[str, int]
    links: ConfigLinks


# Карточки-подсказки на главном экране (§7.5, Приложение C.8).
# Меняются здесь, без релиза приложения — в этом и смысл эндпоинта.
SUGGESTIONS_TG = [
    Suggestion(cat="Таърих", text="Дар бораи давлати Сомониён ва Исмоили Сомонӣ нақл кун"),
    Suggestion(cat="Ҷуғрофия", text="Баландтарин қуллаҳои кӯҳии Тоҷикистон кадомҳоянд?"),
    Suggestion(cat="Адабиёт", text="Як рубоии Рӯдакиро шарҳ дода метавонӣ?"),
    Suggestion(cat="Сайёҳӣ", text="Ҷойҳои ҷолибтарин барои сайёҳон дар Помир"),
]

SUGGESTIONS_RU = [
    Suggestion(cat="История", text="Расскажи о государстве Саманидов и Исмоиле Сомони"),
    Suggestion(cat="География", text="Какие самые высокие горные вершины Таджикистана?"),
    Suggestion(cat="Литература", text="Можешь объяснить одно рубаи Рудаки?"),
    Suggestion(cat="Туризм", text="Самые интересные места для туристов на Памире"),
]

SUGGESTIONS_EN = [
    Suggestion(cat="History", text="Tell me about the Samanid state and Ismoili Somoni"),
    Suggestion(cat="Geography", text="What are the highest mountain peaks of Tajikistan?"),
    Suggestion(cat="Literature", text="Can you explain one of Rudaki's rubai?"),
    Suggestion(cat="Travel", text="The most interesting places for tourists in the Pamirs"),
]

STORE_URLS = {
    "android": "https://play.google.com/store/apps/details?id=ai.zypl.soro",
    "ios": "https://apps.apple.com/app/id0000000000",
}


@router.get("/config", response_model=ClientConfig)
async def get_config(
    platform: str = Query("android", pattern="^(ios|android)$"),
    version: str = Query("1.0.0"),
    lang: str = Query("tg"),
):
    """
    Конфигурация клиента.

    Параметры позволяют отдавать разное разным клиентам: например, поднять
    min_supported_version только для Android, если там нашли критичный баг.
    """
    suggestions = {
        "ru": SUGGESTIONS_RU,
        "en": SUGGESTIONS_EN,
    }.get(lang, SUGGESTIONS_TG)

    return ClientConfig(
        # Версии НИЖЕ этой получают блокирующий экран с кнопкой в магазин.
        # Поднимать только при критичных проблемах: это принудительно выкидывает
        # людей из приложения, пока они не обновятся.
        min_supported_version="1.0.0",
        # Аварийный рубильник: true заблокирует ВСЕ версии. Держать false.
        force_update=False,
        update_url=STORE_URLS.get(platform, STORE_URLS["android"]),
        # Профиль модели по умолчанию. "fast" — единственный, который сегодня
        # умеет стримить: base требует полного ответа для fact-check (B9).
        default_model="fast",
        streaming_enabled=True,
        # Выключатель certificate pinning (§11). Если ротация сертификата
        # что-то сломает — сюда можно поставить false и починить без релиза.
        certificate_pinning_enabled=True,
        suggestions=suggestions,
        teacher_templates=[],
        
        limits={"free_anon": 3000, "free_email": 10000, "plus": 100000},
        links=ConfigLinks(
            support="https://t.me/fayzow",
        ),
    )
