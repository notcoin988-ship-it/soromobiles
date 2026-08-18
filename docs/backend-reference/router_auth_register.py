"""
POST /v1/auth/register, /verify, /resend, /password/forgot, /password/reset
— задачи B2 и B4.

Контракт §6.6. Проверяется:
    node scripts/check-contract.mjs http://localhost:8000

Что исправлено по сравнению с текущим /auth/register (§2.3):
уникальность проверялась по полю login, а не по email; письмо не отправлялось;
подтверждения почты не было; тир не повышался до free_email.
"""

from __future__ import annotations

import secrets  # только для compare_digest при сверке кода
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..email_sender import send_code_safe
from ..models import CodePurpose, User, VerificationCode
from ..models.verification_code import (
    CODE_TTL_MINUTES,
    MAX_ATTEMPTS,
    MAX_CODES_PER_EMAIL_HOUR,
    MAX_CODES_PER_IP_HOUR,
    RESEND_COOLDOWN_SECONDS,
)
from ..security import hash_password
# Чистая логика покрыта тестами в test_pure.py — не дублировать здесь.
from ..pure import (
    MIN_PASSWORD_LENGTH,
    generate_code,
    hash_code,
    normalize_email,
    password_problem,
)
from .auth_v1 import SessionOut, UserOut, issue_session

router = APIRouter(prefix="/v1/auth", tags=["auth"])


# --- Схемы -------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=MIN_PASSWORD_LENGTH)
    fullname: str = Field(min_length=1)
    lang: str = "tg"


class VerifyRequest(BaseModel):
    email: EmailStr
    code: str


class EmailOnlyRequest(BaseModel):
    email: EmailStr


class ResetRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH)


class AcceptedResponse(BaseModel):
    status: str = "verification_sent"
    resend_after_sec: int = RESEND_COOLDOWN_SECONDS


# --- Вспомогательное ---------------------------------------------------------

def validate_password(password: str) -> None:
    """Обёртка над password_problem: превращает код ошибки в HTTP-ответ."""
    problem = password_problem(password)
    if problem is not None:
        raise HTTPException(422, detail={"code": problem})


def client_ip_of(request: Request) -> str | None:
    """
    IP клиента с учётом прокси.

    ВАЖНО: X-Forwarded-For можно доверять ТОЛЬКО если ваш прокси (nginx,
    балансировщик) его перезаписывает. Если приложение смотрит в интернет
    напрямую, клиент подставит любой заголовок и обойдёт лимит — тогда эту
    ветку надо убрать и брать только request.client.host.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def enforce_rate_limit(session: AsyncSession, email: str, request: Request) -> None:
    """
    §6.6: не более 5 запросов на почту в час и 20 на IP в час.

    Оба лимита нужны вместе. Только по email — и один человек регистрирует
    сколько угодно чужих почт по одной попытке на каждую. Только по IP — и
    чужой ящик всё равно можно завалить с нескольких адресов.

    Без этого рассылку можно использовать как оружие против чужой почты.
    """
    hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)

    per_email = await session.scalar(
        select(func.count())
        .select_from(VerificationCode)
        .where(VerificationCode.email == email, VerificationCode.created_at > hour_ago)
    )
    if (per_email or 0) >= MAX_CODES_PER_EMAIL_HOUR:
        raise HTTPException(429, detail={"code": "too_many_requests"})

    ip = client_ip_of(request)
    if ip:
        per_ip = await session.scalar(
            select(func.count())
            .select_from(VerificationCode)
            .where(
                VerificationCode.client_ip == ip,
                VerificationCode.created_at > hour_ago,
            )
        )
        if (per_ip or 0) >= MAX_CODES_PER_IP_HOUR:
            raise HTTPException(429, detail={"code": "too_many_requests"})


async def issue_code(
    session: AsyncSession,
    background: BackgroundTasks,
    email: str,
    purpose: CodePurpose,
    lang: str,
    client_ip: str | None = None,
) -> None:
    """Гасит прежние коды и выдаёт новый. Письмо уходит в фоне."""
    previous = await session.scalars(
        select(VerificationCode).where(
            VerificationCode.email == email,
            VerificationCode.purpose == purpose,
            VerificationCode.used_at.is_(None),
        )
    )
    now = datetime.now(timezone.utc)
    for code in previous:
        code.used_at = now  # старый код перестаёт работать

    plain = generate_code()
    session.add(
        VerificationCode(
            email=email,
            purpose=purpose,
            code_hash=hash_code(plain),
            expires_at=now + timedelta(minutes=CODE_TTL_MINUTES),
            client_ip=client_ip,
        )
    )

    # Отправка в фоне: SMTP может занять секунды, держать на нём HTTP-запрос
    # значит показывать пользователю крутилку на пустом месте.
    background.add_task(send_code_safe, email, purpose.value, lang, plain)


async def consume_code(
    session: AsyncSession, email: str, purpose: CodePurpose, code: str
) -> None:
    """
    Проверяет код и погашает его. Бросает 400 при любой неудаче.

    Счётчик попыток инкрементируется ДО сравнения — иначе при падении между
    сравнением и записью попытка не засчитается, и лимит обходится.
    """
    stored = await session.scalar(
        select(VerificationCode)
        .where(
            VerificationCode.email == email,
            VerificationCode.purpose == purpose,
            VerificationCode.used_at.is_(None),
        )
        .order_by(VerificationCode.created_at.desc())
    )

    if stored is None:
        raise HTTPException(400, detail={"code": "invalid_code"})

    now = datetime.now(timezone.utc)

    if stored.expires_at <= now:
        stored.used_at = now
        await session.commit()
        raise HTTPException(400, detail={"code": "expired_code"})

    stored.attempts += 1
    if stored.attempts > MAX_ATTEMPTS:
        # Инвалидация целиком: шесть цифр подбираются за миллион запросов,
        # если не ограничить попытки.
        stored.used_at = now
        await session.commit()
        raise HTTPException(400, detail={"code": "expired_code"})

    if not secrets.compare_digest(stored.code_hash, hash_code(code.strip())):
        await session.commit()  # сохраняем счётчик попыток
        raise HTTPException(400, detail={"code": "invalid_code"})

    stored.used_at = now


# --- POST /v1/auth/register --------------------------------------------------

@router.post("/register", response_model=AcceptedResponse, status_code=202)
async def register(
    body: RegisterRequest,
    request: Request,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    email = normalize_email(body.email)
    validate_password(body.password)
    await enforce_rate_limit(session, email, request)

    existing = await session.scalar(select(User).where(User.email == email))

    if existing is not None:
        # Почта принадлежит подтверждённому аккаунту — регистрация невозможна.
        if existing.email_verified:
            raise HTTPException(409, detail={"code": "email_taken"})

        # Аккаунт есть, но не подтверждён: человек не дошёл до письма.
        # Отвечать «занято» значило бы запереть его навсегда — переотправляем
        # код и обновляем данные.
        existing.password_hash = hash_password(body.password)
        existing.fullname = body.fullname.strip()
        existing.lang = body.lang
        user = existing
    else:
        user = User(
            email=email,
            fullname=body.fullname.strip(),
            password_hash=hash_password(body.password),
            lang=body.lang,
            email_verified=False,
            # До подтверждения почты — гостевой лимит 3 000 токенов (§6.3.4).
            tier="free_anon",
        )
        session.add(user)

    await session.flush()
    await issue_code(session, background, email, CodePurpose.REGISTER, body.lang, client_ip_of(request))
    await session.commit()

    return AcceptedResponse()


# --- POST /v1/auth/verify ----------------------------------------------------

@router.post("/verify", response_model=SessionOut)
async def verify(
    body: VerifyRequest,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    email = normalize_email(body.email)

    await consume_code(session, email, CodePurpose.REGISTER, body.code)

    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        raise HTTPException(400, detail={"code": "invalid_code"})

    user.email_verified = True
    # §6.6: подтверждение почты повышает тир до free_email —
    # 10 000 токенов в сутки вместо 3 000.
    if user.tier == "free_anon":
        user.tier = "free_email"

    tokens = await issue_session(session, user)
    await session.commit()

    return SessionOut(**tokens.model_dump(), user=UserOut.model_validate(user))


# --- POST /v1/auth/resend ----------------------------------------------------

@router.post("/resend", status_code=202)
async def resend(
    body: EmailOnlyRequest,
    request: Request,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    email = normalize_email(body.email)

    last = await session.scalar(
        select(VerificationCode)
        .where(VerificationCode.email == email)
        .order_by(VerificationCode.created_at.desc())
    )

    if last is not None:
        elapsed = (datetime.now(timezone.utc) - last.created_at).total_seconds()
        if elapsed < RESEND_COOLDOWN_SECONDS:
            raise HTTPException(
                429,
                detail={"retry_after_sec": int(RESEND_COOLDOWN_SECONDS - elapsed)},
            )

    await enforce_rate_limit(session, email, request)

    user = await session.scalar(select(User).where(User.email == email))
    if user is not None and not user.email_verified:
        await issue_code(session, background, email, CodePurpose.REGISTER, user.lang, client_ip_of(request))
        await session.commit()

    # 202 независимо от того, был ли пользователь: иначе ручка становится
    # способом проверить, зарегистрирована ли почта.
    return {"resend_after_sec": RESEND_COOLDOWN_SECONDS}


# --- POST /v1/auth/password/forgot -------------------------------------------

@router.post("/password/forgot", status_code=202)
async def forgot_password(
    body: EmailOnlyRequest,
    request: Request,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    """
    ВСЕГДА 202, независимо от существования почты (§6.6).

    Это не небрежность: разные ответы превращают ручку в инструмент проверки,
    зарегистрирован ли человек в сервисе.
    """
    email = normalize_email(body.email)
    await enforce_rate_limit(session, email, request)

    user = await session.scalar(select(User).where(User.email == email))
    if user is not None:
        await issue_code(session, background, email, CodePurpose.RESET_PASSWORD, user.lang, client_ip_of(request))
        await session.commit()

    return {}


# --- POST /v1/auth/password/reset --------------------------------------------

@router.post("/password/reset", response_model=SessionOut)
async def reset_password(
    body: ResetRequest,
    session: AsyncSession = Depends(get_session),
):
    email = normalize_email(body.email)
    validate_password(body.new_password)

    await consume_code(session, email, CodePurpose.RESET_PASSWORD, body.code)

    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        raise HTTPException(400, detail={"code": "invalid_code"})

    user.password_hash = hash_password(body.new_password)

    # Успешная смена пароля через код с почты подтверждает владение почтой.
    if not user.email_verified:
        user.email_verified = True
        if user.tier == "free_anon":
            user.tier = "free_email"

    # Смена пароля обязана разлогинить все устройства: если пароль меняют
    # из-за компрометации, старые сессии злоумышленника должны умереть.
    from .auth_v1 import revoke_all_for_user

    await revoke_all_for_user(session, user.id)

    tokens = await issue_session(session, user)
    await session.commit()

    return SessionOut(**tokens.model_dump(), user=UserOut.model_validate(user))
