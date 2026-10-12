#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

ROOT="${1:?usage: install-systemd.sh <sigdesk-root> <env-file>}"
ENV_FILE="${2:?usage: install-systemd.sh <sigdesk-root> <env-file>}"
test -f "$ROOT/deploy/beta/manage-beta.ps1"
test -f "$ENV_FILE"

TARGET=/etc/systemd/system/sigdesk-beta.service
sed -e "s|@@SIGDESK_ROOT@@|$ROOT|g" -e "s|@@SIGDESK_ENV@@|$ENV_FILE|g" \
  "$ROOT/deploy/beta/systemd/sigdesk-beta.service" > "$TARGET"
chmod 0644 "$TARGET"
systemctl daemon-reload
systemctl enable sigdesk-beta.service
echo "Installed $TARGET. Start it with: systemctl start sigdesk-beta"
