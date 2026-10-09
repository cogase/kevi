"""Koleksi peta utama: admin menyimpan banyak peta dan memilih satu yang AKTIF (yang dilihat semua pemain).

Tiap peta unik: denahnya (lantai, tembok, ruang, penghalang, perabot) DAN NPC serta titik interaksinya milik peta itu
sendiri, jadi peletakan NPC tidak bercampur antarpeta.

Cara kerjanya sengaja sederhana. Keadaan yang sedang dipakai tetap di tempat lama (pengaturan `peta_utama`, dan
`npc` / `titik` di atur.py), jadi seluruh kode lain tidak berubah. Tabel `peta_simpanan` menyimpan salinan tiap peta;
salinan peta aktif disegarkan dari keadaan kerja tiap kali daftar dibaca dan tepat sebelum berganti peta.
"""
from __future__ import annotations

import sqlite3
import time

from . import atur, basis, permainan
from .permainan import Ditolak

PETA_MAKS = 30
NAMA_MAKS = 40


def _nama_sah(nama) -> str:
    nama = " ".join(str(nama or "").split())[:NAMA_MAKS]
    if len(nama) < 2:
        raise Ditolak("Nama peta minimal 2 karakter.")
    return nama


def _aktif(kon: sqlite3.Connection) -> int:
    """Id peta aktif. Pertama kali dipanggil, peta yang sedang dipakai didaftarkan sebagai "Kantor utama"."""
    r = kon.execute("SELECT nilai FROM pengaturan WHERE kunci = 'peta_aktif'").fetchone()
    if r and kon.execute("SELECT 1 FROM peta_simpanan WHERE id = ?", (basis.muat_json(r["nilai"], 0),)).fetchone():
        return int(basis.muat_json(r["nilai"], 0))
    d = atur.baca(kon)
    kini = time.time()
    pid = kon.execute("INSERT INTO peta_simpanan (nama, data, npc, titik, dibuat, diubah) VALUES (?, ?, ?, ?, ?, ?)",
                      ("Kantor utama", basis.tulis_json(permainan.baca_peta(kon)), basis.tulis_json(d["npc"]), basis.tulis_json(d["titik"]), kini, kini)).lastrowid
    _setel_aktif(kon, pid)
    return int(pid)


def _setel_aktif(kon: sqlite3.Connection, pid: int) -> None:
    kon.execute("INSERT INTO pengaturan (kunci, nilai) VALUES ('peta_aktif', ?) ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai", (str(int(pid)),))


def _segarkan_aktif(kon: sqlite3.Connection) -> int:
    """Tulis keadaan kerja (peta + NPC + titik) ke baris peta aktif."""
    pid = _aktif(kon)
    d = atur.baca(kon)
    kon.execute("UPDATE peta_simpanan SET data = ?, npc = ?, titik = ?, diubah = ? WHERE id = ?",
                (basis.tulis_json(permainan.baca_peta(kon)), basis.tulis_json(d["npc"]), basis.tulis_json(d["titik"]), time.time(), pid))
    return pid


def daftar(kon: sqlite3.Connection) -> dict:
    aktif = _segarkan_aktif(kon)
    hasil = []
    for r in kon.execute("SELECT id, nama, data, npc, dibuat, diubah FROM peta_simpanan ORDER BY id"):
        d = basis.muat_json(r["data"], {})
        hasil.append({"id": r["id"], "nama": r["nama"], "aktif": r["id"] == aktif, "dasar": d.get("dasar", "default"),
                      "lebar": d.get("lebar", 45), "tinggi": d.get("tinggi", 46), "benda": len(d.get("benda") or []),
                      "ruang": len(d.get("ruang") or []), "npc": len(basis.muat_json(r["npc"], [])), "diubah": r["diubah"]})
    return {"peta": hasil, "aktif": aktif, "maks": PETA_MAKS}


def baru(kon: sqlite3.Connection, p: dict) -> dict:
    """Peta baru (belum aktif). p = {nama, dari: kosong | default | salin, lebar, tinggi, lantai_dasar}.
    kosong = tanah lapang tanpa NPC; default = kantor Agent Pak dengan NPC bawaan; salin = tiruan peta aktif."""
    nama = _nama_sah(p.get("nama"))
    aktif = _segarkan_aktif(kon)
    if kon.execute("SELECT COUNT(*) FROM peta_simpanan").fetchone()[0] >= PETA_MAKS:
        raise Ditolak(f"Paling banyak {PETA_MAKS} peta. Hapus yang tidak dipakai dulu.")
    dari = p.get("dari")
    if dari == "salin":
        r = kon.execute("SELECT data, npc, titik FROM peta_simpanan WHERE id = ?", (aktif,)).fetchone()
        data, npc, titik = r["data"], r["npc"], r["titik"]
    elif dari == "default":
        data, npc, titik = basis.tulis_json(permainan.peta_kosong()), basis.tulis_json(atur.NPC_BAWAAN), "[]"
    elif dari == "kosong":
        w, h = p.get("lebar"), p.get("tinggi")
        lo, hi = permainan.PETA_UKURAN
        if not all(isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi for v in (w, h)):
            raise Ditolak(f"Ukuran peta {lo}–{hi} ubin.")
        lantai = str(p.get("lantai_dasar") or "lantai_luar_rumput")
        if lantai not in permainan.katalog()["lantai"]:
            raise Ditolak("Lantai dasar tidak dikenal.")
        d = permainan.peta_kosong()
        d.update(dasar="kosong", lebar=w, tinggi=h, lantai_dasar=lantai)
        data, npc, titik = basis.tulis_json(d), "[]", "[]"
    else:
        raise Ditolak("Pilih asal peta: kosong, default, atau salin.")
    kini = time.time()
    pid = kon.execute("INSERT INTO peta_simpanan (nama, data, npc, titik, dibuat, diubah) VALUES (?, ?, ?, ?, ?, ?)", (nama, data, npc, titik, kini, kini)).lastrowid
    return {"id": pid, **daftar(kon)}


def aktifkan(kon: sqlite3.Connection, pid) -> dict:
    """Ganti peta yang dilihat semua pemain. Keadaan peta lama disimpan dulu; NPC dan titik ikut berganti."""
    lama = _segarkan_aktif(kon)
    r = kon.execute("SELECT data, npc, titik FROM peta_simpanan WHERE id = ?", (pid,)).fetchone()
    if not r:
        raise Ditolak("Peta tidak ditemukan.")
    if pid == lama:
        raise Ditolak("Peta itu sudah aktif.")
    d = basis.muat_json(r["data"], {})
    for k, v in permainan.peta_kosong().items():
        d.setdefault(k, v)
    d["rev"] = max(int(d.get("rev") or 0), int(permainan.baca_peta(kon)["rev"]))      # revisi selalu maju: draf penyunting lama jadi basi
    permainan._simpan_peta(kon, d)
    atur.simpan(kon, {"npc": basis.muat_json(r["npc"], []), "titik": basis.muat_json(r["titik"], [])})
    _setel_aktif(kon, int(pid))
    return {"denah": permainan.baca_peta(kon), **daftar(kon)}


def ganti_nama(kon: sqlite3.Connection, pid, nama) -> dict:
    if not kon.execute("UPDATE peta_simpanan SET nama = ? WHERE id = ?", (_nama_sah(nama), pid)).rowcount:
        raise Ditolak("Peta tidak ditemukan.")
    return daftar(kon)


def hapus(kon: sqlite3.Connection, pid) -> dict:
    if pid == _aktif(kon):
        raise Ditolak("Peta yang sedang aktif tidak bisa dihapus. Aktifkan peta lain dulu.")
    if not kon.execute("DELETE FROM peta_simpanan WHERE id = ?", (pid,)).rowcount:
        raise Ditolak("Peta tidak ditemukan.")
    return daftar(kon)
