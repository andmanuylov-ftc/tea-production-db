#!/usr/bin/env bash
# =====================================================================
#  Разворачивание Django-витрины Tea Production (read-only).
#  Ставит venv + зависимости, скачивает файлы проекта из репозитория.
#  НЕ создаёт БД/роль и НЕ запускает сервер — это отдельные шаги.
#
#  Предусловие: создана роль `django` и база `teahub` (см. SQL-шаг),
#  креды сохранены в /root/.tea_django_env.
# =====================================================================
set -euo pipefail

BASE=/root/teahub
RAW=https://raw.githubusercontent.com/andmanuylov-ftc/tea-production-db/main/migration/django

echo "[1/4] Системные пакеты (python venv)…"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq python3-venv python3-pip >/dev/null

echo "[2/4] Структура проекта + venv…"
mkdir -p "$BASE/teahub" "$BASE/catalog"
cd "$BASE"
[ -d venv ] || python3 -m venv venv
./venv/bin/pip install -q --upgrade pip

echo "[3/4] Загрузка файлов проекта из репозитория…"
curl -fsSL "$RAW/requirements.txt"     -o requirements.txt
curl -fsSL "$RAW/manage.py"            -o manage.py
curl -fsSL "$RAW/settings.py"          -o teahub/settings.py
curl -fsSL "$RAW/urls.py"              -o teahub/urls.py
curl -fsSL "$RAW/wsgi.py"              -o teahub/wsgi.py
curl -fsSL "$RAW/dbrouter.py"          -o teahub/dbrouter.py
curl -fsSL "$RAW/catalog_models.py"    -o catalog/models.py
curl -fsSL "$RAW/catalog_admin.py"     -o catalog/admin.py
curl -fsSL "$RAW/apps.py"              -o catalog/apps.py
: > teahub/__init__.py
: > catalog/__init__.py
chmod +x manage.py

echo "[4/4] Установка зависимостей Python…"
./venv/bin/pip install -q -r requirements.txt

echo "=== Готово. Django установлен в $BASE ==="
./venv/bin/python -c "import django; print('Django', django.get_version())"
