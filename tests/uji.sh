#!/usr/bin/env bash
# Kevi — uji menyeluruh: pytest (aturan server) lalu peramban headless terhadap instans SEMENTARA ber-DB kosong.
# DB sungguhan (data/kevi.db) tidak disentuh. Pakai: tests/uji.sh [folder foto]
set -euo pipefail
AKAR="$(cd "$(dirname "$0")/.." && pwd)"
PY="${KEVI_PY:-$AKAR/venv/bin/python}"
[ -x "$PY" ] || PY="$(git -C "$AKAR" rev-parse --git-common-dir)/../venv/bin/python"    # worktree: venv ada di checkout utama
PORT="${KEVI_PORT_UJI:-8811}"
TMP="$(mktemp -d)"
cd "$AKAR"
export KEVI_ABAIKAN_DOTENV=1 KEVI_DB="$TMP/uji.db" KEVI_PORT="$PORT" KEVI_BIND=127.0.0.1 KEVI_LAJU=3600
[ -n "${KEVI_LEWATI_PYTEST:-}" ] || "$PY" -m pytest -q tests
"$PY" -m tools.pemakai tambah penguji --admin --password rahasia-uji-123 >/dev/null
"$PY" -m tools.pemakai tambah penguji2 --password rahasia-uji-123 >/dev/null
"$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT" >"$TMP/server.log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true; rm -rf "$TMP"' EXIT
for _ in $(seq 1 40); do curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break; sleep 0.3; done
node tests/uji_peramban.mjs "$PORT" penguji rahasia-uji-123 "${1:-}" || { echo "--- log server ---"; tail -30 "$TMP/server.log"; exit 1; }
