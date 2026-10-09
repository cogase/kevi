#!/usr/bin/env bash
# Kevi — commit seluruh perubahan di checkout TEMPAT SKRIP INI BERADA (tak pernah repo lain), lalu push bila cabangnya
# punya upstream. Sebelum commit, berkas terlacak diperiksa terhadap pola data internal: repo ini publik.
# Pakai: tools/simpan.sh "<pesan commit>"
set -euo pipefail
AKAR="$(cd "$(dirname "$0")/.." && pwd)"
[ -n "${1:-}" ] || { echo "pakai: tools/simpan.sh \"<pesan>\"" >&2; exit 2; }
[ "$(git -C "$AKAR" rev-parse --show-toplevel)" = "$AKAR" ] || { echo "bukan akar checkout: $AKAR" >&2; exit 2; }
git -C "$AKAR" add -A
# Pola yang tak boleh ikut terbit: alamat privat/kantor, jalur rumah pemakai, kunci, token. Tambah di sini bila perlu.
POLA='(^|[^0-9])10\.[0-9]+\.[0-9]+\.[0-9]+|192\.168\.[0-9]+\.[0-9]+|/home/[a-z]+/|BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20}|^password: [A-Za-z0-9_-]{8,}$'
if git -C "$AKAR" grep --cached -nIE "$POLA" -- . ':!tests/' ':!docs/RILIS.md' ':!app/atur.py' ':!app/interaksi.py' ':!tools/simpan.sh' | head -5 | grep .; then
  echo "DITAHAN: pola data internal ditemukan di berkas terlacak (lihat di atas). Bersihkan dulu." >&2
  exit 3
fi
git -C "$AKAR" commit -q -m "$1" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git -C "$AKAR" log --oneline -1
if git -C "$AKAR" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  git -C "$AKAR" push -q && echo "terdorong ke $(git -C "$AKAR" rev-parse --abbrev-ref '@{u}')"
fi
