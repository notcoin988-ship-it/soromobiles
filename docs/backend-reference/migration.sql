-- Миграция БД под задачи B1–B4 (токены, коды подтверждения).
--
-- ДВА способа накатить:
--
--   1. Alembic (предпочтительно) — автогенерация читает модели и создаёт то же
--      самое, включая метки enum:
--          alembic revision -m "token auth + verification codes" --autogenerate
--          alembic upgrade head
--
--   2. Этот файл — если проще применить SQL напрямую:
--          psql "$DATABASE_URL" -f docs/backend-reference/migration.sql
--
-- SQL идемпотентен там, где PostgreSQL это позволяет (IF NOT EXISTS). Типы
-- соответствуют моделям: UUID генерируется приложением (default=uuid.uuid4),
-- поэтому серверный DEFAULT на id не нужен.
--
-- ⚠ Таблица users уже существует в sorollm-webapp — миграция только ДОБАВЛЯЕТ
-- в неё два столбца, не создаёт её.

BEGIN;

-- --- users: два новых столбца (B1) -----------------------------------------
-- password_hash nullable: у пришедших через Google пароля нет вовсе.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- --- refresh_tokens (B1) ---------------------------------------------------
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

-- --- verification_codes (B2, B4) -------------------------------------------
-- Метки enum — строковые значения (см. values_callable в модели).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'code_purpose') THEN
        CREATE TYPE code_purpose AS ENUM ('register', 'reset_password');
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS verification_codes (
    id          UUID PRIMARY KEY,
    -- Привязка к почте, а не к user_id: код для восстановления пароля выдаётся
    -- до того, как ясно, есть ли такой пользователь («всегда 202» в B4).
    email       VARCHAR(320) NOT NULL,
    purpose     code_purpose NOT NULL,
    -- Хеш кода, а не сам код. sha256 достаточно: код живёт 15 минут, 5 попыток.
    code_hash   VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    -- Счётчик попыток ввода: при превышении код инвалидируется целиком.
    attempts    INTEGER NOT NULL DEFAULT 0,
    -- NULL — код не использован. Использованный нельзя применить дважды.
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- IP запроса — для лимита «20 на IP в час» (§6.6). INET индексируется и
    -- сравнивается по подсетям.
    client_ip   INET
);

CREATE INDEX IF NOT EXISTS ix_verification_codes_email
    ON verification_codes (email);
-- Поиск живого кода по почте и назначению — основной запрос.
CREATE INDEX IF NOT EXISTS ix_verification_codes_lookup
    ON verification_codes (email, purpose, used_at);
-- Rate limit: сколько кодов выдано на почту за час.
CREATE INDEX IF NOT EXISTS ix_verification_codes_created
    ON verification_codes (email, created_at);
-- Rate limit по IP.
CREATE INDEX IF NOT EXISTS ix_verification_codes_ip
    ON verification_codes (client_ip, created_at);

COMMIT;

-- Откат (если понадобится):
--   DROP TABLE IF EXISTS verification_codes;
--   DROP TYPE  IF EXISTS code_purpose;
--   DROP TABLE IF EXISTS refresh_tokens;
--   ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
--   ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
