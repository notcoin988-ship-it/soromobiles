"""
Тесты чистой логики бэкенда. Только стандартная библиотека.

    py test_pure.py

Покрывают то, что действительно можно сломать незаметно: обрезку заголовка,
разрешение профилей моделей, нормализацию почты, правила паролей и лимиты.

Остальные файлы в папке зависят от FastAPI и SQLAlchemy — их проверяет только
_syntax_check.py. Это надо понимать честно: синтаксис ≠ работоспособность.
"""

import unittest

from pure import (
    CHAT_TITLE_MAX_LENGTH,
    DEFAULT_CHAT_TITLE,
    MIN_PASSWORD_LENGTH,
    daily_limit_for,
    generate_code,
    hash_code,
    is_streamable,
    make_chat_title,
    normalize_email,
    password_problem,
    resolve_profile,
)


class ChatTitle(unittest.TestCase):
    """B10 — §6.6: «первые ~40 символов вопроса»."""

    def test_короткий_вопрос_идёт_целиком(self):
        self.assertEqual(make_chat_title("Салом"), "Салом")

    def test_пустой_вопрос_даёт_заголовок_по_умолчанию(self):
        self.assertEqual(make_chat_title(""), DEFAULT_CHAT_TITLE)
        self.assertEqual(make_chat_title("   \n  "), DEFAULT_CHAT_TITLE)

    def test_длинный_вопрос_обрезается_и_получает_многоточие(self):
        title = make_chat_title("Баландтарин қуллаҳои кӯҳии Тоҷикистон кадомҳоянд ва дар куҷо?")
        self.assertTrue(title.endswith("…"))
        self.assertLessEqual(len(title), CHAT_TITLE_MAX_LENGTH + 1)

    def test_обрезка_идёт_по_границе_слова(self):
        """Иначе в списке чатов висят обрубки вроде «Тоҷикисто»."""
        title = make_chat_title("Баландтарин қуллаҳои кӯҳии Тоҷикистон кадомҳоянд?")
        self.assertNotIn("…", title[:-1])  # многоточие только в конце
        self.assertFalse(title[:-1].endswith(" "))
        # Последнее слово не должно быть обрублено.
        self.assertTrue(title[:-1].split()[-1] in
                        "Баландтарин қуллаҳои кӯҳии Тоҷикистон кадомҳоянд?".split()
                        or title[:-1].split()[-1].rstrip("?,.") in
                        "Баландтарин қуллаҳои кӯҳии Тоҷикистон кадомҳоянд?".split())

    def test_длинное_первое_слово_не_превращается_в_огрызок(self):
        """
        Если резать по пробелу всегда, от слова длиннее лимита останется
        начало строки, а то и пустота.
        """
        title = make_chat_title("Пневмоультрамикроскопиксиликоволканокониозис ва он чист?")
        self.assertGreater(len(title), CHAT_TITLE_MAX_LENGTH // 2)

    def test_переводы_строк_схлопываются(self):
        self.assertEqual(make_chat_title("Салом\n\n  дунё"), "Салом дунё")

    def test_граница_ровно_40_символов_не_обрезается(self):
        exact = "а" * CHAT_TITLE_MAX_LENGTH
        self.assertEqual(make_chat_title(exact), exact)
        self.assertFalse(make_chat_title(exact).endswith("…"))

    def test_хвостовая_пунктуация_убирается_перед_многоточием(self):
        title = make_chat_title("а" * 30 + " бб, " + "в" * 20)
        self.assertFalse(title.endswith(", …"))


class ModelProfiles(unittest.TestCase):
    """§6.3.3 — таблица соответствия model → профиль."""

    def test_light_профили(self):
        for model in ("fast", "light", None, "неизвестное"):
            self.assertEqual(resolve_profile(model), "light", model)

    def test_base_профили(self):
        for model in ("smart", "base", "research"):
            self.assertEqual(resolve_profile(model), "base", model)

    def test_translate_профили(self):
        for model in ("translate", "tarjuma"):
            self.assertEqual(resolve_profile(model), "translate", model)

    def test_base_не_стримится(self):
        """Именно из-за этого /v2/ask/stream отдаёт 409 (B9)."""
        self.assertFalse(is_streamable("smart"))
        self.assertTrue(is_streamable("fast"))
        self.assertTrue(is_streamable("translate"))


class EmailNormalization(unittest.TestCase):
    """B2 — уникальность по email работает только при нормализации."""

    def test_регистр_и_пробелы_не_создают_второй_аккаунт(self):
        self.assertEqual(normalize_email("  Ivan@Mail.RU "), "ivan@mail.ru")

    def test_уже_нормализованная_не_меняется(self):
        self.assertEqual(normalize_email("a@b.tj"), "a@b.tj")


class Passwords(unittest.TestCase):
    """§6.6 — минимум 8 символов и проверка на частые пароли."""

    def test_минимум_восемь_символов(self):
        self.assertEqual(MIN_PASSWORD_LENGTH, 8)
        self.assertIsNotNone(password_problem("a" * 7))
        self.assertIsNone(password_problem("a" * 8))

    def test_частый_пароль_отвергается_несмотря_на_длину(self):
        self.assertIsNotNone(password_problem("12345678"))
        self.assertIsNotNone(password_problem("PassWord"))  # регистр не спасает

    def test_нормальный_пароль_проходит(self):
        self.assertIsNone(password_problem("parolContract123"))


class Codes(unittest.TestCase):
    """§6.6 — код подтверждения: 6 цифр."""

    def test_всегда_шесть_цифр(self):
        for _ in range(200):
            code = generate_code()
            self.assertEqual(len(code), 6, code)
            self.assertTrue(code.isdigit(), code)

    def test_ведущие_нули_сохраняются(self):
        """Если форматировать через str(), код 42 станет «42», а не «000042»."""
        codes = {generate_code() for _ in range(2000)}
        self.assertTrue(any(c.startswith("0") for c in codes))

    def test_коды_не_повторяются_подряд(self):
        """Грубая проверка, что источник случайности вообще работает."""
        codes = [generate_code() for _ in range(50)]
        self.assertGreater(len(set(codes)), 40)

    def test_хеш_устойчив_к_пробелам_от_вставки_из_буфера(self):
        self.assertEqual(hash_code(" 123456 "), hash_code("123456"))

    def test_разные_коды_дают_разные_хеши(self):
        self.assertNotEqual(hash_code("123456"), hash_code("123457"))


class Limits(unittest.TestCase):
    """§6.3.4 — дневные лимиты по тирам."""

    def test_значения_из_тз(self):
        self.assertEqual(daily_limit_for("free_anon"), 3_000)
        self.assertEqual(daily_limit_for("free_email"), 10_000)
        self.assertEqual(daily_limit_for("plus"), 100_000)

    def test_неизвестный_тир_получает_самый_строгий_лимит(self):
        """Ошибка в сторону щедрости здесь стоит денег за GPU."""
        self.assertEqual(daily_limit_for("совершенно_новый"), 3_000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
