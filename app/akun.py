"""Akun & sesi. Sandi di-hash scrypt; sesi = token acak di cookie HttpOnly, yang disimpan hanya hash-nya."""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import sqlite3
import time

NAMA_COOKIE = "kevi_sesi"
POLA_USERNAME = re.compile(r"^[a-z0-9][a-z0-9._-]{2,23}$")
SANDI_MIN = 8
_N, _R, _P = 2 ** 14, 8, 1

# Pembatas coba masuk: per username dan per alamat.
GAGAL_MAKS = 8
GAGAL_JENDELA = 600
_gagal: dict[str, list[float]] = {}


class AkunDitolak(ValueError):
    """Pesan untuk pemakai."""


def hash_sandi(sandi: str) -> str:
    garam = secrets.token_bytes(16)
    h = hashlib.scrypt(sandi.encode(), salt=garam, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${garam.hex()}${h.hex()}"


def cocok_sandi(sandi: str, tersimpan: str) -> bool:
    try:
        skema, garam, h = tersimpan.split("$")
        if skema != "scrypt":
            return False
        coba = hashlib.scrypt(sandi.encode(), salt=bytes.fromhex(garam), n=_N, r=_R, p=_P, dklen=32)
        return hmac.compare_digest(coba, bytes.fromhex(h))
    except (ValueError, TypeError):
        return False


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def buat_pemakai(kon: sqlite3.Connection, username: str, sandi: str, peran: str = "pemain") -> int:
    username = (username or "").strip().lower()
    if not POLA_USERNAME.match(username):
        raise AkunDitolak("Username 3–24 karakter: huruf kecil, angka, titik, strip, garis bawah.")
    if len(sandi or "") < SANDI_MIN:
        raise AkunDitolak(f"Password minimal {SANDI_MIN} karakter.")
    if peran not in {"admin", "pemain"}:
        raise AkunDitolak("Peran tidak dikenal.")
    try:
        cur = kon.execute("INSERT INTO pemakai (username, sandi, peran, dibuat) VALUES (?, ?, ?, ?)",
                          (username, hash_sandi(sandi), peran, time.time()))
    except sqlite3.IntegrityError as e:
        raise AkunDitolak("Username sudah dipakai.") from e
    return int(cur.lastrowid)


def ganti_sandi(kon: sqlite3.Connection, pemakai_id: int, sandi: str, cabut_sesi: bool = True) -> None:
    if len(sandi or "") < SANDI_MIN:
        raise AkunDitolak(f"Password minimal {SANDI_MIN} karakter.")
    kon.execute("UPDATE pemakai SET sandi = ? WHERE id = ?", (hash_sandi(sandi), pemakai_id))
    if cabut_sesi:
        kon.execute("DELETE FROM sesi WHERE pemakai_id = ?", (pemakai_id,))


def _terlalu_sering(kunci: str, kini: float) -> bool:
    daftar = [t for t in _gagal.get(kunci, []) if kini - t < GAGAL_JENDELA]
    _gagal[kunci] = daftar
    return len(daftar) >= GAGAL_MAKS


def masuk(kon: sqlite3.Connection, username: str, sandi: str, alamat: str, umur: int) -> tuple[str, sqlite3.Row]:
    """Token sesi (untuk cookie) + baris pemakai. Pesan galat sengaja sama untuk username salah & sandi salah."""
    kini = time.time()
    username = (username or "").strip().lower()
    kunci = ("u:" + username, "a:" + alamat)
    # Batas per alamat lebih longgar: di balik proxy banyak orang bisa berbagi satu alamat.
    if _terlalu_sering(kunci[0], kini) or len([t for t in _gagal.get(kunci[1], []) if kini - t < GAGAL_JENDELA]) >= GAGAL_MAKS * 5:
        raise AkunDitolak("Terlalu banyak percobaan. Coba lagi beberapa menit lagi.")
    baris = kon.execute("SELECT * FROM pemakai WHERE username = ? AND aktif = 1", (username,)).fetchone()
    # Hash tetap dihitung walau username tak ada, supaya lama jawaban tak membocorkan username yang sah.
    sah = cocok_sandi(sandi or "", baris["sandi"] if baris else "scrypt$00$00") and baris is not None
    if not sah:
        for k in kunci:
            _gagal.setdefault(k, []).append(kini)
        raise AkunDitolak("Username atau password salah.")
    token = secrets.token_urlsafe(32)
    kon.execute("DELETE FROM sesi WHERE kedaluwarsa < ?", (kini,))
    kon.execute("INSERT INTO sesi (kunci, pemakai_id, dibuat, kedaluwarsa) VALUES (?, ?, ?, ?)",
                (_hash_token(token), baris["id"], kini, kini + umur))
    return token, baris


def dari_token(kon: sqlite3.Connection, token: str | None) -> sqlite3.Row | None:
    if not token:
        return None
    return kon.execute(
        "SELECT p.* FROM sesi s JOIN pemakai p ON p.id = s.pemakai_id WHERE s.kunci = ? AND s.kedaluwarsa > ? AND p.aktif = 1",
        (_hash_token(token), time.time())).fetchone()


def keluar(kon: sqlite3.Connection, token: str | None) -> None:
    if token:
        kon.execute("DELETE FROM sesi WHERE kunci = ?", (_hash_token(token),))
