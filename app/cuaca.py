"""Cuaca nyata (0.24.0, kata yosi: "cuaca mengikuti real time seperti di Agent Pak").

Cara dan pemetaannya disalin dari Agent Pak (app/cuaca.py): cuaca Jakarta saat ini dari Open-Meteo (tanpa kunci API),
ditarik paling sering tiap 15 menit, disimpan di ingatan saja. Gagal menarik = nilai lama dipertahankan dan ditandai
basi sesudah 45 menit. Dimatikan dengan KEVI_CUACA=0 (uji selalu mematikannya supaya tidak menyentuh internet).
"""
from __future__ import annotations

import json
import os
import time
import urllib.request

URL = ("https://api.open-meteo.com/v1/forecast?latitude=-6.2&longitude=106.82"
       "&current=weather_code,is_day,temperature_2m,precipitation,cloud_cover&timezone=Asia%2FJakarta")
JEDA = 15 * 60
AKTIF = os.environ.get("KEVI_CUACA", "1").strip().lower() not in ("0", "false", "tidak")
NAMA = {"cerah": "Cerah", "berawan": "Cerah berawan", "mendung": "Mendung", "kabut": "Berkabut", "gerimis": "Gerimis",
        "hujan": "Hujan", "hujan_lebat": "Hujan lebat", "badai": "Hujan badai"}

_TERAKHIR: dict = {}
_TARIK = [0.0]


def jenis_dari(kode: int) -> str:
    """Kode cuaca WMO (Open-Meteo) ke jenis cuaca permainan."""
    if kode in (0, 1):
        return "cerah"
    if kode == 2:
        return "berawan"
    if kode == 3:
        return "mendung"
    if kode in (45, 48):
        return "kabut"
    if 51 <= kode <= 57:
        return "gerimis"
    if kode in (61, 63, 66, 80, 81):
        return "hujan"
    if kode in (65, 67, 82) or 71 <= kode <= 77 or 85 <= kode <= 86:
        return "hujan_lebat"
    if 95 <= kode <= 99:
        return "badai"
    return "berawan"


def urai(data: dict, kini: float) -> dict:
    c = data.get("current") or {}
    kode = int(c.get("weather_code", 2))
    jenis = jenis_dari(kode)
    return {"jenis": jenis, "nama": NAMA[jenis], "kode": kode, "suhu": c.get("temperature_2m"), "hujan_mm": c.get("precipitation"),
            "awan": c.get("cloud_cover"), "pada": kini}


def tarik(kini: float | None = None) -> dict | None:
    """Tarik bila sudah waktunya (dipanggil dari utas terpisah). Mengembalikan keadaan terbaru, atau None bila belum ada."""
    kini = time.time() if kini is None else kini
    if not AKTIF:
        return None
    if _TERAKHIR and kini - _TARIK[0] < JEDA:
        return keadaan(kini)
    if not _TERAKHIR and kini - _TARIK[0] < 60:          # belum pernah berhasil: coba lagi paling cepat semenit sekali
        return None
    _TARIK[0] = kini
    try:
        permintaan = urllib.request.Request(URL, headers={"User-Agent": "Kevi/cuaca"})
        with urllib.request.urlopen(permintaan, timeout=8) as r:      # noqa: S310 — alamat tetap, https
            _TERAKHIR.clear()
            _TERAKHIR.update(urai(json.loads(r.read(200_000)), kini))
    except Exception as e:  # noqa: BLE001 — jaringan mati tidak boleh mengganggu permainan
        print("cuaca: gagal menarik:", type(e).__name__)
    return keadaan(kini)


def keadaan(kini: float | None = None) -> dict | None:
    if not _TERAKHIR:
        return None
    kini = time.time() if kini is None else kini
    return dict(_TERAKHIR, basi=kini - _TERAKHIR["pada"] > 3 * JEDA)
