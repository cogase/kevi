"""Basis data Kevi (SQLite, satu berkas). Satu sambungan dipakai bersama; aplikasi berjalan satu proses."""
from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path

SKEMA = """
CREATE TABLE IF NOT EXISTS pemakai (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sandi TEXT NOT NULL,
  peran TEXT NOT NULL DEFAULT 'pemain',
  aktif INTEGER NOT NULL DEFAULT 1,
  dibuat REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sesi (
  kunci TEXT PRIMARY KEY,
  pemakai_id INTEGER NOT NULL REFERENCES pemakai(id) ON DELETE CASCADE,
  dibuat REAL NOT NULL,
  kedaluwarsa REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS karakter (
  pemakai_id INTEGER PRIMARY KEY REFERENCES pemakai(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  tampilan TEXT NOT NULL,
  koin INTEGER NOT NULL DEFAULT 0,
  adegan TEXT NOT NULL DEFAULT 'kantor',
  x REAL, y REAL,
  statistik TEXT NOT NULL DEFAULT '{}',
  dibuat REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS inventori (
  pemakai_id INTEGER NOT NULL REFERENCES pemakai(id) ON DELETE CASCADE,
  barang TEXT NOT NULL,
  jumlah INTEGER NOT NULL,
  PRIMARY KEY (pemakai_id, barang)
);
CREATE TABLE IF NOT EXISTS rumah (
  pemakai_id INTEGER PRIMARY KEY REFERENCES pemakai(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS catatan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pemakai_id INTEGER NOT NULL REFERENCES pemakai(id) ON DELETE CASCADE,
  judul TEXT NOT NULL,
  isi TEXT NOT NULL,
  diubah REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS buku_kas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pemakai_id INTEGER NOT NULL REFERENCES pemakai(id) ON DELETE CASCADE,
  waktu REAL NOT NULL,
  jumlah INTEGER NOT NULL,
  alasan TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS misi (
  pemakai_id INTEGER NOT NULL REFERENCES pemakai(id) ON DELETE CASCADE,
  hari TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (pemakai_id, hari)
);
CREATE TABLE IF NOT EXISTS log_terminal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pemakai_id INTEGER NOT NULL,
  waktu REAL NOT NULL,
  perintah TEXT NOT NULL,
  sasaran TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pengaturan (
  kunci TEXT PRIMARY KEY,
  nilai TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS obrolan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  waktu REAL NOT NULL,
  pemakai_id INTEGER NOT NULL,
  nama TEXT NOT NULL,
  saluran TEXT NOT NULL,
  teks TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS log_remote (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pemakai_id INTEGER NOT NULL,
  waktu REAL NOT NULL,
  proto TEXT NOT NULL,
  sasaran TEXT NOT NULL,
  port INTEGER NOT NULL,
  pengguna TEXT NOT NULL,
  selesai REAL
);
CREATE INDEX IF NOT EXISTS catatan_pemakai ON catatan (pemakai_id, diubah DESC);
CREATE INDEX IF NOT EXISTS kas_pemakai ON buku_kas (pemakai_id, id DESC);
"""

KUNCI = threading.RLock()


def buka(berkas: Path) -> sqlite3.Connection:
    berkas.parent.mkdir(parents=True, exist_ok=True)
    kon = sqlite3.connect(str(berkas), check_same_thread=False, isolation_level=None)
    kon.row_factory = sqlite3.Row
    kon.execute("PRAGMA journal_mode=WAL")
    kon.execute("PRAGMA foreign_keys=ON")
    kon.execute("PRAGMA busy_timeout=5000")
    kon.executescript(SKEMA)
    _migrasi(kon)
    return kon


def _migrasi(kon: sqlite3.Connection) -> None:
    """Kolom yang ditambahkan sesudah 0.1.0 (CREATE TABLE IF NOT EXISTS tak menyentuh tabel lama)."""
    kolom = {r["name"] for r in kon.execute("PRAGMA table_info(karakter)")}
    if "xp" not in kolom:                                   # 0.2.0 — leveling
        kon.execute("ALTER TABLE karakter ADD COLUMN xp INTEGER NOT NULL DEFAULT 0")
    if "tas" not in kolom:                                  # 0.4.0 — inventory berslot: tas tambahan + tata letak & hotbar
        kon.execute("ALTER TABLE karakter ADD COLUMN tas INTEGER NOT NULL DEFAULT 0")
        kon.execute("ALTER TABLE karakter ADD COLUMN tata TEXT NOT NULL DEFAULT '{}'")
    if "remote" not in {r["name"] for r in kon.execute("PRAGMA table_info(pemakai)")}:      # 0.3.0 — izin remote SSH/telnet
        kon.execute("ALTER TABLE pemakai ADD COLUMN remote INTEGER NOT NULL DEFAULT 0")


def muat_json(teks, bawaan):
    try:
        nilai = json.loads(teks) if teks else bawaan
    except (ValueError, TypeError):
        return bawaan
    return nilai if isinstance(nilai, type(bawaan)) else bawaan


def tulis_json(nilai) -> str:
    return json.dumps(nilai, ensure_ascii=False, separators=(",", ":"))
