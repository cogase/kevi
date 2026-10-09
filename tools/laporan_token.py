"""Hitung ulang laporan token proyek Kevi dan simpan ke docs/laporan-token.json.

    venv/bin/python -m tools.laporan_token

Halaman /laporan (admin) membaca berkas itu; tombol "Hitung ulang" di sana menjalankan hal yang sama.
"""
from app import laporan_token

if __name__ == "__main__":
    d = laporan_token.simpan()
    t = d["total"]
    print(f"sesi: {len(d['sesi'])}  panggilan model: {t['panggilan']}")
    print(f"masuk {t['masuk']:,}  tulis cache {t['tulis_cache']:,}  baca cache {t['baca_cache']:,}  keluar {t['keluar']:,}  TOTAL {t['semua']:,}")
