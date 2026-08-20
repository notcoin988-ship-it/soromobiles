# Что нужно от бэкенда: две ручки

Мобильное приложение готово и проверено целиком, кроме одного — на сервере нет
двух эндпоинтов. Без них человек доходит до выбора аккаунта Google и упирается
в ошибку, а Google Play не примет приложение без удаления аккаунта.

Ни новых таблиц, ни миграций, ни правок в существующем коде сайта не нужно.

---

## 1. Что уже есть на проде (проверено запросами)

`/v1/auth/login`, `/v1/auth/refresh`, `/v1/auth/logout` работают, схемы
`SessionOut` и `TokenPair` отдаются. Значит модуль мобильной авторизации,
таблица `refresh_tokens`, `JWT_SECRET` и функция `issue_session` уже на месте —
новые ручки просто ими пользуются.

Чего нет: `POST /v1/auth/google` и `DELETE /v1/account` — обе отвечают 404.

## 2. Файлы

Оба лежат в этом репозитории, в `docs/backend-reference/`:

| Файл | Куда | Что делает |
|---|---|---|
| `router_auth_google.py` | `routers/` | `POST /v1/auth/google` — вход по `id_token` |
| `router_account.py` | `routers/` | `DELETE /v1/account` — удаление аккаунта и всех данных |

## 3. Что поправить под ваш проект

Импорты написаны под условную структуру, у вас имена свои:

```python
from ..db import get_session      # ваш способ получить AsyncSession
from ..models import User         # ваша модель пользователя
from ..deps import current_user   # ваша проверка Authorization: Bearer
from .router_auth import SessionOut, UserOut, issue_session
```

Последняя строка важнее прочих: `issue_session`, `SessionOut` и `UserOut` уже
существуют — судя по схемам в вашем openapi, в модуле **`mobile_auth`**. Тогда
строка превращается в:

```python
from .mobile_auth import SessionOut, UserOut, issue_session
```

Второе место — функция `purge_user_data` в `router_account.py`. Она удаляет
чаты, сообщения, обратную связь, расход токенов и refresh-токены. Если в
проекте есть проекты (`/v1/project/*`) и вложения, допишите их туда же: там
оставлен помеченный комментарий `ЗАМЕНИТЬ`.

## 4. Установка

```bash
pip install "google-auth>=2.30,<3"
```

Больше ничего: ни passlib, ни bcrypt, ни SMTP — регистрации по почте с кодом из
письма в приложении больше нет.

В `main.py`, рядом с остальными роутерами:

```python
from .routers import router_auth_google, router_account

app.include_router(router_auth_google.router)
app.include_router(router_account.router)
```

Переменные окружения задавать не обязательно — значения по умолчанию уже
правильные. При желании можно вынести список клиентов:

```
GOOGLE_CLIENT_IDS=<web>,<android>,<ios>
```

## 5. Почему аудитория проверяется списком, а не одним значением

В приложении два пути входа, и `aud` у них разный:

* системное окно Google отдаёт токен с `aud` = **web**-клиент (приложение
  передаёт его как `serverClientId`);
* на телефонах без сервисов Google (Huawei и прочие без GMS) приложение само
  проводит OAuth в браузере по PKCE, и там `aud` = клиент **Android** или
  **iOS**.

Поэтому `verify_oauth2_token` вызывается без `audience` — она умеет только одно
значение, — а сверка идёт по множеству `GOOGLE_CLIENT_IDS`. Убирать эту сверку
нельзя ни при каких условиях: без неё подойдёт токен, выданный любому другому
приложению на свете, и вход превратится в дыру.

Все три клиента — в проекте Google Cloud `500782884295`. **Это не клиенты
сайта:** у сайта свой проект `480387520142`, он обслуживает вход на sorollm.tj и
приложения не касается.

## 6. Грабли, на которые уже наступили

`UserOut.model_validate(user)` **обязан** вызываться до `commit` и после
`await session.refresh(user)`. У только что созданного пользователя `created_at`
и `updated_at` проставляет сама база, а после `commit` SQLAlchemy помечает
атрибуты устаревшими — pydantic лезет за ними в базу из синхронного кода и
падает с `MissingGreenlet`. Это 500-я на каждом первом входе. В файле порядок
уже правильный, при переносе не переставляйте.

## 7. Проверка

**Стенд** — поднимает настоящий PostgreSQL и прогоняет 31 проверку по обеим
ручкам, не трогая боевую базу:

```bash
docker run -d --name soro-authtest-db -e POSTGRES_PASSWORD=testpw \
    -e POSTGRES_DB=sorotest -p 55433:5432 postgres:16-alpine
pip install fastapi "sqlalchemy[asyncio]>=2" asyncpg pyjwt "google-auth>=2.30,<3" httpx
python docs/backend-reference/bench/test_endpoints.py
```

Проверяются: отказ на выдуманный токен, отказ на токен чужого приложения,
заведение аккаунта, повторный вход без дубликата, смена почты в Google,
привязка старого аккаунта с сайта по почте, хранение refresh хешем, удаление
всех данных и неработающий токен после удаления.

**После деплоя, снаружи** — ручка обязана отвергнуть выдуманный токен:

```bash
curl -i -X POST -H 'Content-Type: application/json' \
     -d '{"id_token":"nonsense"}' https://api.sorollm.tj/v1/auth/google
```

Ожидается `401`. Если `500` — не установлен `google-auth` либо роутер поднялся
с ошибкой; если `404` — не подключён.

Полная сверка контракта одной командой (из мобильного репозитория):

```bash
node scripts/check-contract.mjs https://api.sorollm.tj
```

## 8. Чего делать НЕ надо

* не деплоить регистрацию по почте, коды подтверждения и отправку писем —
  этого в приложении больше нет;
* не создавать таблиц: `refresh_tokens` уже есть, а вход через Google своих
  таблиц не требует;
* не трогать `/auth/google` и `/auth/callback` сайта — приложение ими не
  пользуется.
