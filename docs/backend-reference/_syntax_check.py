"""Проверка синтаксиса референсных файлов. Запуск: python _syntax_check.py"""

import ast
import pathlib
import sys

FILES = [
    "security.py",
    "models_refresh_token.py",
    "router_auth.py",
    "router_auth_google.py",
    "deps.py",
    "router_account.py",
    "router_config.py",
    "models_message_idempotency.py",
    "router_ask_idempotent.py",
    "router_ask_stream.py",
    "router_chats_pagination.py",
    "pure.py",
]

here = pathlib.Path(__file__).parent
failed = 0

for name in FILES:
    path = here / name
    try:
        ast.parse(path.read_text(encoding="utf-8"), filename=name)
        print(f"  ok      {name}")
    except SyntaxError as error:
        failed += 1
        print(f"  ОШИБКА  {name}: строка {error.lineno}: {error.msg}")

print()
print("все файлы разбираются" if failed == 0 else f"файлов с ошибками: {failed}")
sys.exit(1 if failed else 0)
