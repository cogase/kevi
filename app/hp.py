"""Handphone (0.23.0, kata yosi): perangkat yang dibeli di toko elektronik pada level tertentu, untuk mengirim pesan ke
pemain lain di mana pun (daring maupun tidak) dan menghubungi NPC dari jauh. Bagian NPC sepenuhnya di peramban; modul
ini hanya mengurus pesan antarpemain.

Aturan: pengirim dan penerima sama-sama harus punya handphone; pesan tersimpan (tabel `pesan_hp`) sehingga yang sedang
luring membacanya saat masuk lagi; pengiriman dibatasi lajunya.
"""
from __future__ import annotations

import sqlite3
import time

from . import permainan
from .permainan import Ditolak

TEKS_MAKS = 240
PER_MENIT = 12
UTAS_MAKS = 60


def punya(kon: sqlite3.Connection, uid: int) -> bool:
    return permainan.inventori(kon, uid).get(permainan.BARANG_HP, 0) > 0


def _wajib_punya(kon: sqlite3.Connection, uid: int) -> None:
    if not punya(kon, uid):
        raise Ditolak("Kamu belum punya handphone. Beli di toko elektronik.")


def belum_dibaca(kon: sqlite3.Connection, uid: int) -> int:
    return kon.execute("SELECT COUNT(*) FROM pesan_hp WHERE ke = ? AND dibaca = 0", (uid,)).fetchone()[0]


def kontak(kon: sqlite3.Connection, uid: int) -> dict:
    """Daftar pemain lain yang punya handphone, dengan jumlah pesan belum dibaca dan waktu pesan terakhir."""
    _wajib_punya(kon, uid)
    belum = {r["dari"]: r["n"] for r in kon.execute("SELECT dari, COUNT(*) AS n FROM pesan_hp WHERE ke = ? AND dibaca = 0 GROUP BY dari", (uid,))}
    akhir: dict[int, float] = {}
    for r in kon.execute("SELECT dari, ke, MAX(waktu) AS w FROM pesan_hp WHERE dari = ? OR ke = ? GROUP BY dari, ke", (uid, uid)):
        lawan = r["ke"] if r["dari"] == uid else r["dari"]
        akhir[lawan] = max(akhir.get(lawan, 0), r["w"])
    hasil = []
    for r in kon.execute("SELECT k.pemakai_id AS id, k.nama, k.xp FROM karakter k JOIN inventori i ON i.pemakai_id = k.pemakai_id "
                         "WHERE i.barang = ? AND i.jumlah > 0 AND k.pemakai_id != ?", (permainan.BARANG_HP, uid)):
        hasil.append({"id": r["id"], "nama": r["nama"], "level": permainan.level_dari(int(r["xp"] or 0)), "belum": belum.get(r["id"], 0), "akhir": akhir.get(r["id"], 0)})
    hasil.sort(key=lambda k: (-k["belum"], -k["akhir"], k["nama"].lower()))
    return {"kontak": hasil, "belum": sum(belum.values())}


def utas(kon: sqlite3.Connection, uid: int, lawan) -> dict:
    """Percakapan dengan satu pemain (paling baru di bawah); pesan untuk pemain ini ditandai sudah dibaca."""
    _wajib_punya(kon, uid)
    if not isinstance(lawan, int) or isinstance(lawan, bool):
        raise Ditolak("Kontak tidak dikenal.")
    r = kon.execute("SELECT nama FROM karakter WHERE pemakai_id = ?", (lawan,)).fetchone()
    if not r or lawan == uid:
        raise Ditolak("Kontak tidak dikenal.")
    baris = kon.execute("SELECT id, dari, teks, waktu FROM pesan_hp WHERE (dari = ? AND ke = ?) OR (dari = ? AND ke = ?) ORDER BY id DESC LIMIT ?",
                        (uid, lawan, lawan, uid, UTAS_MAKS)).fetchall()
    kon.execute("UPDATE pesan_hp SET dibaca = 1 WHERE ke = ? AND dari = ? AND dibaca = 0", (uid, lawan))
    return {"id": lawan, "nama": r["nama"], "pesan": [{"id": b["id"], "saya": b["dari"] == uid, "teks": b["teks"], "waktu": b["waktu"]} for b in reversed(baris)],
            "belum": belum_dibaca(kon, uid)}


def kirim(kon: sqlite3.Connection, uid: int, ke, teks) -> dict:
    _wajib_punya(kon, uid)
    teks = " ".join(str(teks or "").split())[:TEKS_MAKS]
    if not teks:
        raise Ditolak("Pesan masih kosong.")
    if not isinstance(ke, int) or isinstance(ke, bool) or ke == uid:
        raise Ditolak("Kontak tidak dikenal.")
    r = kon.execute("SELECT nama FROM karakter WHERE pemakai_id = ?", (ke,)).fetchone()
    if not r:
        raise Ditolak("Kontak tidak dikenal.")
    if not punya(kon, ke):
        raise Ditolak(f"{r['nama']} belum punya handphone.")
    kini = time.time()
    if kon.execute("SELECT COUNT(*) FROM pesan_hp WHERE dari = ? AND waktu > ?", (uid, kini - 60)).fetchone()[0] >= PER_MENIT:
        raise Ditolak("Terlalu banyak pesan dalam semenit. Tunggu sebentar.")
    pid = kon.execute("INSERT INTO pesan_hp (dari, ke, waktu, teks) VALUES (?, ?, ?, ?)", (uid, ke, kini, teks)).lastrowid
    pengirim = kon.execute("SELECT nama FROM karakter WHERE pemakai_id = ?", (uid,)).fetchone()
    return {"pesan": {"id": pid, "saya": True, "teks": teks, "waktu": kini}, "ke": ke,
            "kabar": {"t": "hp_pesan", "dari": uid, "nama": pengirim["nama"] if pengirim else "?", "teks": teks, "waktu": kini, "id": pid}}
