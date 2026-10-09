"""Konfigurasi Kevi — semuanya dari variabel lingkungan / berkas .env di akar proyek."""
from __future__ import annotations

import os
import secrets
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent
VERSI = (AKAR / "VERSION").read_text().strip() if (AKAR / "VERSION").exists() else "0.0.0"


def muat_env(berkas: Path = AKAR / ".env") -> None:
    if os.environ.get("KEVI_ABAIKAN_DOTENV") == "1" or not berkas.exists():
        return
    for baris in berkas.read_text().splitlines():
        baris = baris.strip()
        if not baris or baris.startswith("#") or "=" not in baris:
            continue
        kunci, nilai = baris.split("=", 1)
        os.environ.setdefault(kunci.strip(), nilai.strip().strip('"').strip("'"))


muat_env()


def _env(nama: str, bawaan: str = "") -> str:
    return (os.environ.get(nama) or bawaan).strip()


def _angka(nama: str, bawaan: float) -> float:
    try:
        return float(_env(nama) or bawaan)
    except ValueError:
        return bawaan


PORT = int(_angka("KEVI_PORT", 8800))
BIND = _env("KEVI_BIND", "0.0.0.0")
BASIS_DATA = Path(_env("KEVI_DB", str(AKAR / "data" / "kevi.db")))
STATIS = AKAR / "app" / "static"
COOKIE_SECURE = _env("KEVI_COOKIE_SECURE", "0") in {"1", "true", "ya"}
UMUR_SESI = int(_angka("KEVI_UMUR_SESI_HARI", 14)) * 86400

# Laju waktu permainan: 1 "jam kebun" = 3600 / LAJU detik nyata. 60 = satu jam kebun per menit (enak untuk dicoba);
# untuk dipakai sehari-hari angka 6–12 lebih pas (sawi 15–30 menit).
LAJU = max(1.0, _angka("KEVI_LAJU", 60))
JAM_KEBUN = 3600.0 / LAJU

KOIN_AWAL = int(_angka("KEVI_KOIN_AWAL", 300))

# Terminal dalam game.
TERMINAL_AKTIF = _env("KEVI_TERMINAL", "1") not in {"0", "false", "tidak"}
TERMINAL_SERENTAK = int(_angka("KEVI_TERMINAL_SERENTAK", 4))      # proses jaringan bersamaan, seluruh server
TERMINAL_PER_MENIT = int(_angka("KEVI_TERMINAL_PER_MENIT", 10))   # per pemain
TERMINAL_BATAS_DETIK = int(_angka("KEVI_TERMINAL_BATAS_DETIK", 40))

# Alamat proxy (NPM) yang dipercaya membawa X-Forwarded-For; selain dari sini header itu diabaikan.
PROXY_TEPERCAYA = {a.strip() for a in _env("KEVI_PROXY_TEPERCAYA").split(",") if a.strip()}
DOMAIN = _env("KEVI_DOMAIN")

# Laporan pemakaian token pengerjaan proyek (halaman /laporan, admin saja).
LAPORAN_TOKEN = AKAR / "docs" / "laporan-token.json"

RAHASIA = _env("KEVI_RAHASIA") or secrets.token_urlsafe(32)
