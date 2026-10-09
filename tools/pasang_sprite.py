#!/usr/bin/env python3
"""Kevi — pasang sprite milik Kevi sendiri (zombie, senjata, efek) dari folder serah ke `app/static/gambar/kevi/`.

Sprite Kevi tidak digabung ke atlas Agent Pak: tiap PNG disajikan sendiri dan didaftarkan di `daftar.json`, lalu
peramban memasukkannya ke atlas dengan nama berkasnya (tanpa .png). Kode yang memakainya sudah menunggu nama-nama ini:

    zombie_<varian>_<arah>_<n>.png   varian biasa_a/biasa_b/biasa_c/gesit/besar, arah bawah/atas/kiri/kanan, n = 0..3
    zombie_<varian>_jatuh_<n>.png    n = 0..2
    senjata_<kode>.png               ikon 16x16
    senjata_<kode>_pegang.png        dipegang, gagang di pojok kiri bawah

Pakai: tools/pasang_sprite.py <folder-serah>     (mis. folder yang diisi Agent Design)
Sesudahnya: tests/uji.sh, lalu rilis seperti biasa. Hanya pustaka bawaan Python.
"""
from __future__ import annotations

import json
import re
import shutil
import struct
import sys
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent
TUJUAN = AKAR / "app" / "static" / "gambar" / "kevi"
POLA = re.compile(r"^(zombie_[a-z0-9_]+|senjata_[a-z0-9_]+|kena_[0-9]|koin_[0-9])\.png$")
UKURAN_MAKS = 64


def ukuran_png(isi: bytes) -> tuple[int, int] | None:
    if len(isi) < 24 or isi[:8] != b"\x89PNG\r\n\x1a\n" or isi[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", isi[16:24])


def utama(sumber: Path) -> int:
    if not sumber.is_dir():
        print(f"bukan folder: {sumber}", file=sys.stderr)
        return 2
    TUJUAN.mkdir(parents=True, exist_ok=True)
    dipasang, dilewati = [], []
    for b in sorted(sumber.glob("*.png")):
        isi = b.read_bytes()
        u = ukuran_png(isi)
        if not POLA.match(b.name) or not u or max(u) > UKURAN_MAKS:
            dilewati.append(f"{b.name} ({'nama di luar pola' if not POLA.match(b.name) else 'bukan PNG sah' if not u else f'terlalu besar {u[0]}x{u[1]}'})")
            continue
        shutil.copyfile(b, TUJUAN / b.name)
        dipasang.append(b.name)
    daftar = sorted(p.stem for p in TUJUAN.glob("*.png"))
    (TUJUAN / "daftar.json").write_text(json.dumps(daftar, indent=0) + "\n")
    print(f"dipasang {len(dipasang)} berkas; kini {len(daftar)} sprite di {TUJUAN.relative_to(AKAR)}")
    for d in dilewati:
        print("  dilewati:", d)
    return 0


if __name__ == "__main__":
    sys.exit(utama(Path(sys.argv[1]).expanduser()) if len(sys.argv) == 2 else (print(__doc__) or 2))
