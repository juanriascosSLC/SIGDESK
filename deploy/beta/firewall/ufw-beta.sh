#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

ADMIN_CIDR="${ADMIN_CIDR:?set ADMIN_CIDR to the administrator VPN or subnet}"
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$ADMIN_CIDR" to any port 22 proto tcp comment 'SIG-DESK administration'
ufw allow 443/tcp comment 'SIG-DESK HTTPS'
ufw deny 5432/tcp
ufw deny 7233/tcp
ufw deny 8233/tcp
ufw deny 8001/tcp
ufw deny 8080:8089/tcp
ufw --force enable
ufw status verbose
