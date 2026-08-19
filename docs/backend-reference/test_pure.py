"""
Тесты чистой логики бэкенда. Только стандартная библиотека.

    py test_pure.py

Покрывают то, что действительно можно сломать незаметно: обрезку заголовка,
разрешение профилей моделей, хеширование одноразовых кодов и лимиты.

Остальные файлы в папке зависят от FastAPI и SQLAlchemy — их проверяет только
_syntax_check.py. Это надо понимать честно: синтаксис ≠ работоспособность.
"""

import unittest

from pure import (
    CHAT_TITLE_MAX_LENGTH,
    DEFAULT_CHAT_TITLE,
    daily_limit_for,
    hash_code,
    is_streamable,
    make_chat_title,
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


class Codes(unittest.TestCase):
    """Одноразовый код входа через Google хранится хешем."""

    def test_хеш_устойчив_к_пробелам(self):
        self.assertEqual(hash_code(" abc "), hash_code("abc"))

    def test_разные_коды_дают_разные_хеши(self):
        self.assertNotEqual(hash_code("abc"), hash_code("abd"))


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
