#!/bin/sh
# Keep HOST_GW in infra/.env pointing at the Windows host.
#
# Whisper and Ollama run on the Hyper-V host, and its Default Switch renumbers
# its subnet whenever that host reboots — so the address cannot be hardcoded.
# The backend container can't discover it either: on a docker bridge network its
# own default route is the bridge (the VM), and bind-mounting the VM's
# /proc/net/route doesn't help because /proc/net re-resolves to the reader's
# own network namespace. Measured on the live VM: 172.18.0.1, not 172.24.160.1.
#
# So resolve it where the answer is correct — on the VM — and write it into the
# env file the backend reads. Run from cron every few minutes:
#
#   */5 * * * * /opt/life-pilot/scripts/refresh-host-gw.sh >> /tmp/host-gw.log 2>&1
#
# Rewrites nothing and restarts nothing while the address is unchanged, so it's
# safe to run often.
set -eu

ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")/../infra" && pwd)/.env}"
COMPOSE_DIR="${COMPOSE_DIR:-$(dirname "$ENV_FILE")}"
SERVICE="${SERVICE:-backend}"

gateway=$(ip route | awk '/^default/ {print $3; exit}')
if [ -z "$gateway" ]; then
    echo "$(date -Is) no default route; leaving $ENV_FILE alone" >&2
    exit 1
fi

current=$(sed -n 's/^HOST_GW=//p' "$ENV_FILE" 2>/dev/null | head -n1)
if [ "$current" = "$gateway" ]; then
    exit 0
fi

echo "$(date -Is) host gateway ${current:-unset} -> $gateway"

# Rewrite via a temp file so a crash mid-write can't truncate the env file.
tmp=$(mktemp)
grep -v '^HOST_GW=' "$ENV_FILE" > "$tmp" 2>/dev/null || true
echo "HOST_GW=$gateway" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"

# Recreate rather than restart: env_file is read at container creation, so a
# plain restart would keep serving the old address.
cd "$COMPOSE_DIR" && docker compose up -d --force-recreate "$SERVICE"
