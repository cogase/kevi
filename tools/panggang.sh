#!/usr/bin/env bash
# Kevi — nyalakan instans uji Agent Pak (DB kosong, semua sambungan keluar dimatikan), panggang peta Default,
# lalu matikan lagi. Agent Pak produksi (port 8003) dan datanya tidak disentuh.
# Pakai: tools/panggang.sh [port]
set -euo pipefail
PORT="${1:-8015}"
AKAR="$(cd "$(dirname "$0")/.." && pwd)"
SUMBER="${KEVI_AGENTPAK:-/opt/agent-pak}"
TMP="$(mktemp -d)"
RAHASIA="$(head -c 32 /dev/urandom | base64 | tr -d '/+=')"
export AGENTPAK_ABAIKAN_DOTENV=1 AGENTPAK_PEMAKAI=0 AGENTPAK_PANTAU_MODUL=0 AGENTPAK_AUDIT=0 AGENTPAK_ASISTEN=0 \
  AGENTPAK_NPC=0 AGENTPAK_CUACA=0 AGENTPAK_BANGUNKAN=0 AGENTPAK_CORE_NOTIF=0 AGENTPAK_TELEGRAM=0 AGENTPAK_KOIN_KERJA=0 \
  AGENTPAK_DB="$TMP/uji.db" AGENTPAK_PEMILIK=pemanggang APP_SECRET_KEY="$RAHASIA" PAKAPPS_SSO_SECRET="$RAHASIA" \
  AGENTPAK_BATAS_CLAUDE="$TMP/tidak-ada.json"
cd "$SUMBER"
"$SUMBER/venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port "$PORT" >"$TMP/server.log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true; rm -rf "$TMP"' EXIT
for _ in $(seq 1 40); do curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break; sleep 0.5; done
COOKIE="$("$SUMBER/venv/bin/python" "$AKAR/tools/cookie_uji.py" "$RAHASIA")"
mkdir -p "$AKAR/app/static/peta"
node "$AKAR/tools/panggang_peta.mjs" "$PORT" "$COOKIE" "$AKAR/app/static/peta"
