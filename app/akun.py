"""Akun & sesi. Sandi di-hash scrypt; sesi = token acak di cookie HttpOnly, yang disimpan hanya hash-nya.
Kode sekali pakai (TOTP) opsional per akun, wajib untuk memakai remote."""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import sqlite3
import struct
import time

TOTP_LANGKAH = 30              # detik per kode
TOTP_SEGAR = 600               # lama satu pembuktian kode berlaku untuk membuka remote
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


class ButuhKode(AkunDitolak):
    """Password benar, tetapi akun ini memasang kode sekali pakai dan kodenya belum dikirim."""


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


# ---------------------------------------------------------------- kode sekali pakai (TOTP, RFC 6238)

def totp_rahasia() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode()


def totp_kode(rahasia: str, langkah: int) -> str:
    kunci = base64.b32decode(rahasia.upper() + "=" * (-len(rahasia) % 8))
    h = hmac.new(kunci, struct.pack(">Q", langkah), hashlib.sha1).digest()
    o = h[-1] & 15
    return f"{(struct.unpack('>I', h[o:o + 4])[0] & 0x7FFFFFFF) % 10 ** 6:06d}"


def totp_cocok(rahasia: str, kode: str, kini: float | None = None, sesudah: int = 0) -> int | None:
    """Langkah waktu yang cocok (jendela satu langkah ke belakang dan ke depan), None bila tidak ada.
    Langkah <= `sesudah` ditolak supaya kode yang sudah dipakai tidak bisa dipakai ulang."""
    kode = "".join(str(kode or "").split())
    if not (len(kode) == 6 and kode.isdigit()):
        return None
    tengah = int((time.time() if kini is None else kini) // TOTP_LANGKAH)
    for langkah in (tengah - 1, tengah, tengah + 1):
        if langkah > sesudah and hmac.compare_digest(totp_kode(rahasia, langkah), kode):
            return langkah
    return None


def _totp_periksa(kon: sqlite3.Connection, baris: sqlite3.Row, rahasia: str, kode: str) -> None:
    """Kode salah dihitung ke pembatas per akun; kode benar mengunci langkahnya."""
    kini = time.time()
    kunci = f"t:{baris['id']}"
    if _terlalu_sering(kunci, kini):
        raise AkunDitolak("Terlalu banyak percobaan kode. Coba lagi beberapa menit lagi.")
    langkah = totp_cocok(rahasia, kode, kini, baris["totp_langkah"])
    if langkah is None:
        _gagal.setdefault(kunci, []).append(kini)
        raise AkunDitolak("Kode sekali pakai salah atau sudah dipakai. Tunggu kode berikutnya.")
    kon.execute("UPDATE pemakai SET totp_langkah = ? WHERE id = ?", (langkah, baris["id"]))


def _baris(kon: sqlite3.Connection, pemakai_id: int) -> sqlite3.Row:
    return kon.execute("SELECT * FROM pemakai WHERE id = ?", (pemakai_id,)).fetchone()


def _tandai_segar(kon: sqlite3.Connection, token: str | None) -> None:
    if token:
        kon.execute("UPDATE sesi SET totp = ? WHERE kunci = ?", (time.time(), _hash_token(token)))


def totp_mulai(kon: sqlite3.Connection, pemakai_id: int, sandi: str) -> dict:
    """Buat rahasia calon; baru berlaku sesudah totp_pasang membuktikan aplikasi autentikator bisa menghitungnya."""
    p = _baris(kon, pemakai_id)
    if p["totp"]:
        raise AkunDitolak("Kode sekali pakai sudah terpasang. Lepas dulu bila ingin mengganti.")
    if not cocok_sandi(sandi or "", p["sandi"]):
        raise AkunDitolak("Password salah.")
    rahasia = totp_rahasia()
    kon.execute("UPDATE pemakai SET totp_calon = ? WHERE id = ?", (rahasia, pemakai_id))
    return {"rahasia": rahasia,
            "uri": f"otpauth://totp/Kevi:{p['username']}?secret={rahasia}&issuer=Kevi&algorithm=SHA1&digits=6&period={TOTP_LANGKAH}"}


def totp_pasang(kon: sqlite3.Connection, pemakai_id: int, kode: str, token: str | None) -> None:
    p = _baris(kon, pemakai_id)
    if p["totp"] or not p["totp_calon"]:
        raise AkunDitolak("Mulai pemasangan dulu.")
    _totp_periksa(kon, p, p["totp_calon"], kode)
    kon.execute("UPDATE pemakai SET totp = totp_calon, totp_calon = NULL WHERE id = ?", (pemakai_id,))
    _tandai_segar(kon, token)


def totp_lepas(kon: sqlite3.Connection, pemakai_id: int, sandi: str, kode: str) -> None:
    p = _baris(kon, pemakai_id)
    if not p["totp"]:
        raise AkunDitolak("Kode sekali pakai belum terpasang.")
    if not cocok_sandi(sandi or "", p["sandi"]):
        raise AkunDitolak("Password salah.")
    _totp_periksa(kon, p, p["totp"], kode)
    totp_hapus(kon, pemakai_id)


def totp_hapus(kon: sqlite3.Connection, pemakai_id: int) -> None:
    """Jalan pulih (admin atau tools.pemakai): buang TOTP tanpa kode. Sesi yang ada kehilangan tanda segarnya."""
    kon.execute("UPDATE pemakai SET totp = NULL, totp_calon = NULL, totp_langkah = 0 WHERE id = ?", (pemakai_id,))
    kon.execute("UPDATE sesi SET totp = NULL WHERE pemakai_id = ?", (pemakai_id,))


def totp_segarkan(kon: sqlite3.Connection, pemakai_id: int, kode: str, token: str | None) -> None:
    p = _baris(kon, pemakai_id)
    if not p["totp"]:
        raise AkunDitolak("Kode sekali pakai belum terpasang.")
    _totp_periksa(kon, p, p["totp"], kode)
    _tandai_segar(kon, token)


def totp_segar(kon: sqlite3.Connection, token: str | None) -> bool:
    """Apakah sesi ini membuktikan kode sekali pakai dalam TOTP_SEGAR detik terakhir."""
    if not token:
        return False
    r = kon.execute("SELECT totp FROM sesi WHERE kunci = ?", (_hash_token(token),)).fetchone()
    return bool(r and r["totp"] and time.time() - r["totp"] < TOTP_SEGAR)


def masuk(kon: sqlite3.Connection, username: str, sandi: str, alamat: str, umur: int, kode: str = "") -> tuple[str, sqlite3.Row]:
    """Token sesi (untuk cookie) + baris pemakai. Pesan galat sengaja sama untuk username salah & sandi salah.
    Akun ber-TOTP: password benar tanpa kode -> ButuhKode (belum ada sesi); kode salah dihitung sebagai percobaan gagal."""
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
    if baris["totp"]:
        if not "".join(str(kode or "").split()):
            raise ButuhKode("Masukkan kode sekali pakai dari aplikasi autentikator.")
        try:
            _totp_periksa(kon, baris, baris["totp"], kode)
        except AkunDitolak:
            for k in kunci:
                _gagal.setdefault(k, []).append(kini)
            raise
    token = secrets.token_urlsafe(32)
    kon.execute("DELETE FROM sesi WHERE kedaluwarsa < ?", (kini,))
    kon.execute("INSERT INTO sesi (kunci, pemakai_id, dibuat, kedaluwarsa, totp) VALUES (?, ?, ?, ?, ?)",
                (_hash_token(token), baris["id"], kini, kini + umur, kini if baris["totp"] else None))
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
