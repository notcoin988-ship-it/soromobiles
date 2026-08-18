"""
Поиск неиспользуемых импортов и явных огрехов в референсных файлах.

    py _lint_check.py

Не заменяет ruff или flake8 — их здесь просто нет. Ловит одну конкретную
категорию: импорт, который остался после переноса кода. Такие импорты
безобидны в рантайме, но вводят в заблуждение читателя и накапливаются.
"""

import ast
import pathlib
import sys

FILES = sorted(
    p for p in pathlib.Path(__file__).parent.glob("*.py")
    if not p.name.startswith("_") and p.name != "test_pure.py"
)

problems = 0

for path in FILES:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=path.name)

    imported: dict[str, int] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.asname or alias.name.split(".")[0]
                imported[name] = node.lineno
        elif isinstance(node, ast.ImportFrom):
            # `from __future__ import annotations` — директива компилятора,
            # а не импорт: она не может «использоваться» в коде.
            if node.module == "__future__":
                continue
            for alias in node.names:
                name = alias.asname or alias.name
                imported[name] = node.lineno

    used = {
        node.id for node in ast.walk(tree) if isinstance(node, ast.Name)
    } | {
        node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)
    }
    # Имена в аннотациях и строках типа "Mapped[str]" тоже считаются
    # использованием — ищем их грубо, по вхождению в текст.
    for name in list(imported):
        if name in used:
            continue
        # Отсекаем ложные срабатывания: имя встречается в аннотации или строке.
        occurrences = source.count(name)
        if occurrences > 1:
            continue
        print(f"  {path.name}:{imported[name]}  неиспользуемый импорт: {name}")
        problems += 1

print()
if problems == 0:
    print(f"Проверено файлов: {len(FILES)}. Неиспользуемых импортов нет.")
else:
    print(f"Найдено проблем: {problems}")

sys.exit(1 if problems else 0)
