"""Feedback pemain: saran dan laporan bug dari dalam game, dibaca admin di dashboard (tab Feedback).
Kevi berdiri sendiri; ini tidak tersambung ke sistem pelaporan lain."""
from __future__ import annotations

import sqlite3
import time

JENIS = ("saran", "bug")
STATUS = ("baru", "dibaca", "selesai")
TEKS_MIN, TEKS_MAKS, CATATAN_MAKS = 5, 1000, 500
LAJU_MAKS, LAJU_JENDELA = 5, 600          # paling banyak 5 kiriman per 10 menit per pemain


class UmpanDitolak(ValueError):
    """Pesan untuk pemakai."""


def kirim(kon: sqlite3.Connection, uid: int, d: dict, versi: str) -> int:
    jenis = d.get("jenis")
    if jenis not in JENIS:
        raise UmpanDitolak("Pilih jenis: saran atau bug.")
    teks = str(d.get("teks") or "").strip()
    if not TEKS_MIN <= len(teks) <= TEKS_MAKS:
        raise UmpanDitolak(f"Tulis {TEKS_MIN} sampai {TEKS_MAKS} karakter.")
    kini = time.time()
    baru_saja = kon.execute("SELECT COUNT(*) FROM umpan_balik WHERE pemakai_id = ? AND waktu > ?", (uid, kini - LAJU_JENDELA)).fetchone()[0]
    if baru_saja >= LAJU_MAKS:
        raise UmpanDitolak("Terlalu sering mengirim. Coba lagi beberapa menit lagi.")
    angka = lambda v: float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) < 10 ** 6 else None      # noqa: E731
    cur = kon.execute("INSERT INTO umpan_balik (pemakai_id, waktu, jenis, teks, adegan, x, y, versi) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                      (uid, kini, jenis, teks, str(d.get("adegan") or "")[:40], angka(d.get("x")), angka(d.get("y")), versi))
    return int(cur.lastrowid)


def daftar(kon: sqlite3.Connection, batas: int = 200) -> list[dict]:
    return [dict(r) for r in kon.execute(
        "SELECT u.id, u.waktu, u.jenis, u.teks, u.adegan, u.x, u.y, u.versi, u.status, u.catatan_admin, p.username, k.nama "
        "FROM umpan_balik u LEFT JOIN pemakai p ON p.id = u.pemakai_id LEFT JOIN karakter k ON k.pemakai_id = u.pemakai_id "
        "ORDER BY (u.status = 'selesai'), u.id DESC LIMIT ?", (batas,))]


def ubah(kon: sqlite3.Connection, d: dict) -> None:
    if not kon.execute("SELECT 1 FROM umpan_balik WHERE id = ?", (d.get("id"),)).fetchone():
        raise UmpanDitolak("Feedback tidak ditemukan.")
    if "status" in d:
        if d["status"] not in STATUS:
            raise UmpanDitolak("Status tidak dikenal.")
        kon.execute("UPDATE umpan_balik SET status = ? WHERE id = ?", (d["status"], d["id"]))
    if "catatan" in d:
        kon.execute("UPDATE umpan_balik SET catatan_admin = ? WHERE id = ?", (str(d["catatan"] or "").strip()[:CATATAN_MAKS], d["id"]))


def jumlah_baru(kon: sqlite3.Connection) -> int:
    return int(kon.execute("SELECT COUNT(*) FROM umpan_balik WHERE status = 'baru'").fetchone()[0])
