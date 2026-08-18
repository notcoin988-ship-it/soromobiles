"""
Отправка писем (задача B7) и шаблоны на трёх языках.

§17 требует подтверждённой доставки на Gmail, Mail.ru и Yandex — письма
доходят и НЕ попадают в спам, со скриншотами входящих.

Одной библиотеки для этого мало. Обязательны три DNS-записи:

    SPF    TXT  @   "v=spf1 include:<провайдер> ~all"
    DKIM   TXT  <selector>._domainkey  "v=DKIM1; k=rsa; p=<публичный ключ>"
    DMARC  TXT  _dmarc  "v=DMARC1; p=quarantine; rua=mailto:dmarc@sorollm.tj"

Без них Gmail и Mail.ru кладут письмо в спам почти гарантированно, и критерий
§17 не выполняется независимо от кода.

Проверить настройку: отправить письмо на check-auth@verifier.port25.com либо
через mail-tester.com — они присылают отчёт по SPF/DKIM/DMARC.
"""

from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage

# --- Настройки из окружения --------------------------------------------------

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
MAIL_FROM = os.environ.get("MAIL_FROM", "Soro <noreply@sorollm.tj>")


# --- Шаблоны -----------------------------------------------------------------
#
# Локализуются по полю lang пользователя (§9). Таджикский — язык по умолчанию.
#
# Текст намеренно короткий и без ссылок: письма с кодом и без ссылок реже
# попадают в спам, а пользователю не нужно ничего нажимать — он вводит код в
# приложении.

_TEMPLATES = {
    "register": {
        "tg": (
            "Рамзи тасдиқи Soro",
            "Салом!\n\n"
            "Рамзи тасдиқи шумо: {code}\n\n"
            "Рамз 15 дақиқа эътибор дорад.\n"
            "Агар шумо дар Soro сабти ном накарда бошед, ин мактубро нодида гиред.",
        ),
        "ru": (
            "Код подтверждения Soro",
            "Здравствуйте!\n\n"
            "Ваш код подтверждения: {code}\n\n"
            "Код действителен 15 минут.\n"
            "Если вы не регистрировались в Soro, просто проигнорируйте это письмо.",
        ),
        "en": (
            "Your Soro verification code",
            "Hello!\n\n"
            "Your verification code: {code}\n\n"
            "The code is valid for 15 minutes.\n"
            "If you did not sign up for Soro, please ignore this email.",
        ),
    },
    "reset_password": {
        "tg": (
            "Барқарорсозии пароли Soro",
            "Салом!\n\n"
            "Рамзи барқарорсозии парол: {code}\n\n"
            "Рамз 15 дақиқа эътибор дорад.\n"
            "Агар шумо барқарорсозиро дархост накарда бошед, ин мактубро нодида гиред — "
            "пароли шумо бетағйир мемонад.",
        ),
        "ru": (
            "Восстановление пароля Soro",
            "Здравствуйте!\n\n"
            "Код для смены пароля: {code}\n\n"
            "Код действителен 15 минут.\n"
            "Если вы не запрашивали восстановление, проигнорируйте это письмо — "
            "пароль останется прежним.",
        ),
        "en": (
            "Reset your Soro password",
            "Hello!\n\n"
            "Your password reset code: {code}\n\n"
            "The code is valid for 15 minutes.\n"
            "If you did not request a reset, ignore this email — "
            "your password will stay unchanged.",
        ),
    },
}


def render(purpose: str, lang: str, code: str) -> tuple[str, str]:
    """Возвращает (тема, текст). Неизвестный язык падает на таджикский (§9)."""
    by_lang = _TEMPLATES[purpose]
    subject, body = by_lang.get(lang, by_lang["tg"])
    return subject, body.format(code=code)


# --- Отправка ----------------------------------------------------------------

def send_code(to_email: str, purpose: str, lang: str, code: str) -> None:
    """
    Синхронная отправка. В FastAPI вызывать через BackgroundTasks или очередь:
    SMTP-соединение может занять секунды, и держать на нём HTTP-запрос значит
    показывать пользователю крутилку на пустом месте.

    Исключения НЕ гасятся: если письмо не ушло, это должно быть видно в логах
    и метриках. Пользователю при этом всё равно отвечаем 202 — он может
    запросить код повторно.
    """
    subject, body = render(purpose, lang, code)

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = MAIL_FROM
    message["To"] = to_email
    message.set_content(body)

    context = ssl.create_default_context()

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        smtp.starttls(context=context)
        smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.send_message(message)


def send_code_safe(to_email: str, purpose: str, lang: str, code: str) -> bool:
    """
    Вариант для фоновой задачи: не роняет обработчик, но возвращает результат
    для логирования.
    """
    try:
        send_code(to_email, purpose, lang, code)
        return True
    except Exception:  # noqa: BLE001 — здесь намеренно ловим всё
        import logging

        logging.getLogger(__name__).exception("не удалось отправить письмо на %s", to_email)
        return False
