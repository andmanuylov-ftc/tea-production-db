#!/usr/bin/env bash
# =====================================================================
#  Перевод Django-витрины в постоянную службу на порту 80:
#    gunicorn (127.0.0.1:8000) + nginx (reverse proxy :80) + systemd.
#  Статику admin отдаёт WhiteNoise (не требует прав nginx на /root).
#  Идемпотентно: можно запускать повторно.
# =====================================================================
set -euo pipefail

BASE=/root/teahub
RAW=https://raw.githubusercontent.com/andmanuylov-ftc/tea-production-db/main/migration/django
cd "$BASE"

echo "[1/6] Обновление settings + зависимостей (whitenoise)…"
curl -fsSL "$RAW/settings.py"      -o teahub/settings.py
curl -fsSL "$RAW/requirements.txt" -o requirements.txt
./venv/bin/pip install -q -r requirements.txt

echo "[2/6] Правка окружения (CSRF на порт 80) + env для systemd…"
sed -i 's#^export DJANGO_CSRF_TRUSTED_ORIGINS=.*#export DJANGO_CSRF_TRUSTED_ORIGINS=http://5.42.122.156#' /root/.tea_django_env
# systemd EnvironmentFile не понимает 'export' — делаем копию без него
sed 's/^export //' /root/.tea_django_env > "$BASE/teahub.env"
chmod 600 "$BASE/teahub.env"

echo "[3/6] Сбор статики (WhiteNoise)…"
set -a; . /root/.tea_django_env; set +a
./venv/bin/python manage.py collectstatic --noinput >/dev/null
echo "    статики собрано: $(find staticfiles -type f | wc -l) файлов"

echo "[4/6] systemd-служба gunicorn…"
cat > /etc/systemd/system/teahub.service <<'UNIT'
[Unit]
Description=Tea Production Django (gunicorn)
After=network.target postgresql.service

[Service]
User=root
WorkingDirectory=/root/teahub
EnvironmentFile=/root/teahub/teahub.env
ExecStart=/root/teahub/venv/bin/gunicorn teahub.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 60
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

echo "[5/6] nginx reverse proxy на :80…"
cat > /etc/nginx/sites-available/teahub <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/teahub /etc/nginx/sites-enabled/teahub
nginx -t

echo "[6/6] Запуск служб…"
systemctl daemon-reload
systemctl enable --now teahub >/dev/null 2>&1 || systemctl restart teahub
systemctl restart nginx
sleep 2
echo "=== Статус ==="
systemctl is-active teahub && echo "gunicorn: active"
systemctl is-active nginx  && echo "nginx: active"
curl -s -o /dev/null -w "admin через nginx (локально): HTTP %{http_code}\n" http://127.0.0.1/admin/login/
