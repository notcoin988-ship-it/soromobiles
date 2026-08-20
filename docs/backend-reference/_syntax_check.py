"""Проверка синтаксиса референсных файлов. Запуск: python _syntax_check.py"""

import ast
import pathlib
import sys

FILES = [
    # Уезжает на сервер:
    "router_auth_google.py",
    "router_account.py",
    # Уже стоит на проде, лежит здесь как образец и опора для стенда:
    "security.py",
    "deps.py",
    "router_auth.py",
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
