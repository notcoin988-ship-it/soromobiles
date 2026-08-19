-- Миграция БД под мобильный контракт: токены (B1) и вход через Google (B2).
--
-- ДВА способа накатить:
--
--   1. Alembic (предпочтительно) — автогенерация читает модели и создаёт то же
--      самое:
--          alembic revision -m "token auth + mobile google login" --autogenerate
--          alembic upgrade head
--
--   2. Этот файл — если проще применить SQL напрямую:
--          psql "$DATABASE_URL" -f docs/backend-reference/migration.sql
--
-- SQL идемпотентен там, где PostgreSQL это позволяет (IF NOT EXISTS). Типы
-- соответствуют моделям: UUID генерируется приложением (default=uuid.uuid4),
-- поэтому серверный DEFAULT на id не нужен.
--
-- ⚠ Таблица users уже существует в sorollm-webapp — миграция её не трогает
-- вовсе. Регистрация по почте с кодом из письма из приложения убрана, вход
-- только через Google, поэтому ни password_hash, ни email_verified, ни
-- таблица verification_codes мобильному контракту больше не нужны. Если
-- предыдущая редакция этой миграции уже накатывалась — см. откат внизу.

BEGIN;

-- --- refresh_tokens (B1) ---------------------------------------------------
-- Долгая сессия §6.2: приложение не спрашивает вход при каждом запуске и
-- молча продлевается на 401. Cookie-сессия веба (2 часа) для этого не годится.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Хеш токена, а не сам токен: утечка базы не даёт войти.
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- NULL — токен живой. Не удаляется при ротации, а помечается отозванным,
    -- чтобы ловить повторное использование украденного токена.
    revoked_at  TIMESTAMPTZ
);

-- Самый частый запрос — живые токены пользователя.
CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_active
    ON refresh_tokens (user_id, revoked_at);

-- --- mobile_auth_codes (B2, вход через Google) ------------------------------
-- Одноразовый код из редиректа soro://auth/callback?code=… Живёт 5 минут и
-- гасится первым применением: токены нельзя отдавать прямо в адресе редиректа,
-- он проходит через историю браузера и чужие приложения с той же схемой.
CREATE TABLE IF NOT EXISTS mobile_auth_codes (
    id           UUID PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Хеш кода, а не сам код — как у refresh-токенов.
    code_hash    VARCHAR(64) NOT NULL UNIQUE,
    -- Завёл ли этот вход нового пользователя: нужно счётчику signup_completed
    -- (§13), на клиенте регистрация через Google неотличима от возврата.
    is_new_user  BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at   TIMESTAMPTZ NOT NULL,
    -- NULL — код не потрачен. Потраченный не удаляется сразу: повторное
    -- применение видно и означает перехват.
    used_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Единственный запрос не по code_hash — уборка просроченных.
CREATE INDEX IF NOT EXISTS ix_mobile_auth_codes_expires
    ON mobile_auth_codes (expires_at);

COMMIT;

-- Откат (если понадобится):
--   DROP TABLE IF EXISTS mobile_auth_codes;
--   DROP TABLE IF EXISTS refresh_tokens;
--
-- Если накатывалась ПРЕДЫДУЩАЯ редакция этой миграции (регистрация по почте с
-- кодом из письма), лишнее убирается так. Столбцы users сносить осторожно:
-- password_hash может быть занят собственным входом сайта по паролю —
-- проверьте, прежде чем удалять.
--   DROP TABLE IF EXISTS verification_codes;
--   DROP TYPE  IF EXISTS code_purpose;
--   ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
