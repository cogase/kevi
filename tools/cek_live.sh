#!/usr/bin/env bash
# Kevi — cek layanan yang sedang berjalan: kesehatan, login, potret pemain, halaman admin.
# Pakai: tools/cek_live.sh <alamat> <username> <password>     (contoh alamat: http://127.0.0.1:8800)
set -euo pipefail
ALAMAT="${1:?alamat}"; U="${2:?username}"; P="${3:?password}"
KUKI="$(mktemp)"; trap 'rm -f "$KUKI"' EXIT
echo "health : $(curl -fsS "$ALAMAT/health")"
echo "masuk  : $(curl -sS -c "$KUKI" -H 'Content-Type: application/json' -d "{\"username\":\"$U\",\"password\":\"$P\"}" "$ALAMAT/api/masuk")"
echo "saya   : $(curl -sS -b "$KUKI" "$ALAMAT/api/saya" | head -c 120)"
for h in / /admin /laporan /static/gambar/sprite.png /static/peta/kantor.json; do
  echo "$h -> $(curl -sS -b "$KUKI" -o /dev/null -w '%{http_code}' "$ALAMAT$h")"
done
echo "token  : $(curl -sS -b "$KUKI" -X POST "$ALAMAT/api/laporan-token/hitung" | head -c 150)"
curl -sS -b "$KUKI" -X POST -H 'Content-Type: application/json' -d '{}' "$ALAMAT/api/keluar" >/dev/null
