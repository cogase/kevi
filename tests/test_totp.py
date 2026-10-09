"""Kode sekali pakai (TOTP): hitungan RFC 6238, pasang, masuk, pakai ulang, pembatas, lepas, dan pagar remote."""
import time

import pytest
from fastapi.testclient import TestClient

from app import akun, main


def _kode(rahasia, geser=0):
    return akun.totp_kode(rahasia, int(time.time() // akun.TOTP_LANGKAH) + geser)


def test_vektor_rfc6238():
    # Rahasia uji RFC 6238 (SHA-1): "12345678901234567890"; kode 8 digit di RFC, 6 digit terakhirnya yang dipakai.
    rahasia = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    assert akun.totp_kode(rahasia, 59 // 30) == "287082"
    assert akun.totp_kode(rahasia, 1111111109 // 30) == "081804"
    assert akun.totp_kode(rahasia, 2000000000 // 30) == "279037"


def test_jendela_dan_pakai_ulang():
    r = akun.totp_rahasia()
    kini = 1_700_000_000.0
    langkah = int(kini // 30)
    assert akun.totp_cocok(r, akun.totp_kode(r, langkah), kini) == langkah
    assert akun.totp_cocok(r, akun.totp_kode(r, langkah - 1), kini) == langkah - 1
    assert akun.totp_cocok(r, akun.totp_kode(r, langkah + 1), kini) == langkah + 1
    assert akun.totp_cocok(r, akun.totp_kode(r, langkah - 2), kini) is None
    assert akun.totp_cocok(r, akun.totp_kode(r, langkah), kini, sesudah=langkah) is None      # sudah dipakai
    for buruk in ("", "12345", "1234567", "abcdef", None):
        assert akun.totp_cocok(r, buruk, kini) is None
    assert akun.totp_cocok(r, " " + akun.totp_kode(r, langkah)[:3] + " " + akun.totp_kode(r, langkah)[3:], kini) == langkah


def test_pasang_masuk_lepas(kon):
    akun._gagal.clear()
    uid = akun.buat_pemakai(kon, "tini", "sandi-panjang-1")
    with pytest.raises(akun.AkunDitolak):
        akun.totp_mulai(kon, uid, "salah")
    with pytest.raises(akun.AkunDitolak):
        akun.totp_pasang(kon, uid, "000000", None)                 # belum mulai
    r = akun.totp_mulai(kon, uid, "sandi-panjang-1")
    assert r["rahasia"] in r["uri"] and r["uri"].startswith("otpauth://totp/Kevi:tini?")
    # Calon belum berlaku: masuk masih tanpa kode.
    token, _ = akun.masuk(kon, "tini", "sandi-panjang-1", "1.1.1.1", 3600)
    assert not akun.totp_segar(kon, token)
    with pytest.raises(akun.AkunDitolak):
        akun.totp_pasang(kon, uid, "000000" if _kode(r["rahasia"]) != "000000" else "111111", token)
    akun.totp_pasang(kon, uid, _kode(r["rahasia"]), token)
    assert akun.totp_segar(kon, token)
    with pytest.raises(akun.AkunDitolak):
        akun.totp_mulai(kon, uid, "sandi-panjang-1")               # sudah terpasang
    # Masuk kini butuh kode; kode yang baru dipakai tidak bisa dipakai lagi.
    with pytest.raises(akun.ButuhKode):
        akun.masuk(kon, "tini", "sandi-panjang-1", "1.1.1.1", 3600)
    with pytest.raises(akun.AkunDitolak) as e:
        akun.masuk(kon, "tini", "sandi-panjang-1", "1.1.1.1", 3600, _kode(r["rahasia"]))
    assert not isinstance(e.value, akun.ButuhKode)
    token2, _ = akun.masuk(kon, "tini", "sandi-panjang-1", "1.1.1.1", 3600, _kode(r["rahasia"], 1))
    assert akun.totp_segar(kon, token2)
    # Tanda segar kedaluwarsa, lalu disegarkan lagi dengan kode berikutnya.
    kon.execute("UPDATE sesi SET totp = ?", (time.time() - akun.TOTP_SEGAR - 1,))
    assert not akun.totp_segar(kon, token2)
    kon.execute("UPDATE pemakai SET totp_langkah = 0 WHERE id = ?", (uid,))
    akun.totp_segarkan(kon, uid, _kode(r["rahasia"]), token2)
    assert akun.totp_segar(kon, token2)
    # Lepas butuh password dan kode.
    kon.execute("UPDATE pemakai SET totp_langkah = 0 WHERE id = ?", (uid,))
    with pytest.raises(akun.AkunDitolak):
        akun.totp_lepas(kon, uid, "salah", _kode(r["rahasia"]))
    akun.totp_lepas(kon, uid, "sandi-panjang-1", _kode(r["rahasia"]))
    assert not akun.totp_segar(kon, token2)
    akun.masuk(kon, "tini", "sandi-panjang-1", "1.1.1.1", 3600)


def test_kode_salah_dibatasi(kon):
    akun._gagal.clear()
    uid = akun.buat_pemakai(kon, "dodi", "sandi-panjang-1")
    r = akun.totp_mulai(kon, uid, "sandi-panjang-1")
    akun.totp_pasang(kon, uid, _kode(r["rahasia"]), None)
    kon.execute("UPDATE pemakai SET totp_langkah = 0 WHERE id = ?", (uid,))
    for _ in range(akun.GAGAL_MAKS):
        with pytest.raises(akun.AkunDitolak):
            akun.totp_segarkan(kon, uid, "12345x", None)
    with pytest.raises(akun.AkunDitolak) as e:
        akun.totp_segarkan(kon, uid, _kode(r["rahasia"]), None)     # kode benar pun ditahan
    assert "Terlalu banyak" in str(e.value)
    akun._gagal.clear()


def test_hapus_jalan_pulih(kon):
    akun._gagal.clear()
    uid = akun.buat_pemakai(kon, "wati", "sandi-panjang-1")
    r = akun.totp_mulai(kon, uid, "sandi-panjang-1")
    akun.totp_pasang(kon, uid, _kode(r["rahasia"]), None)
    akun.totp_hapus(kon, uid)
    akun.masuk(kon, "wati", "sandi-panjang-1", "1.1.1.1", 3600)


@pytest.fixture(scope="module")
def klien():
    with main.basis.KUNCI:
        if not main.KON.execute("SELECT 1 FROM pemakai WHERE username = 'kepala'").fetchone():
            akun.buat_pemakai(main.KON, "kepala", "sandi-kepala-1", "admin")
            akun.buat_pemakai(main.KON, "anak", "sandi-anak-123")
    return TestClient(main.app)


def _remote(klien):
    with klien.websocket_connect("/ws/remote") as ws:
        ws.send_json({"proto": "ssh", "host": "127.0.0.1", "port": 22, "user": "x", "kolom": 80, "baris": 24})
        return ws.receive_bytes().decode()


def test_api_pasang_masuk_dan_remote(klien):
    akun._gagal.clear()
    klien.cookies.clear()
    assert klien.post("/api/totp/mulai", json={"password": "x"}).status_code == 401
    assert klien.post("/api/masuk", json={"username": "kepala", "password": "sandi-kepala-1"}).status_code == 200
    assert klien.get("/api/saya").json()["totp"] is False
    assert klien.get("/api/totp").json() == {"terpasang": False, "segar": False}
    assert "Pasang dulu" in _remote(klien)                                        # admin pun tanpa TOTP ditolak remote
    assert klien.post("/api/totp/mulai", json={"password": "salah"}).status_code == 400
    rahasia = klien.post("/api/totp/mulai", json={"password": "sandi-kepala-1"}).json()["rahasia"]
    assert klien.post("/api/totp/pasang", json={"kode": "abc"}).status_code == 400
    assert klien.post("/api/totp/pasang", json={"kode": _kode(rahasia)}).status_code == 200
    assert klien.get("/api/totp").json() == {"terpasang": True, "segar": True}
    assert klien.get("/api/saya").json()["totp"] is True
    assert "tidak boleh dituju" in _remote(klien)                                 # lolos pagar TOTP, tertahan pagar sasaran
    with main.basis.KUNCI:
        main.KON.execute("UPDATE sesi SET totp = ?", (time.time() - akun.TOTP_SEGAR - 1,))
    assert "kode sekali pakai dulu" in _remote(klien)                             # sudah basi: diminta lagi
    assert klien.post("/api/totp/segar", json={"kode": _kode(rahasia)}).status_code == 400      # kode yang sama: pakai ulang
    assert klien.post("/api/totp/segar", json={"kode": _kode(rahasia, 1)}).status_code == 200
    assert "tidak boleh dituju" in _remote(klien)
    # Masuk ulang: tanpa kode ditolak dengan penanda, dengan kode lolos.
    klien.cookies.clear()
    r = klien.post("/api/masuk", json={"username": "kepala", "password": "sandi-kepala-1"})
    assert r.status_code == 401 and r.json()["butuh_kode"] is True
    r = klien.post("/api/masuk", json={"username": "kepala", "password": "salah-total-1"})
    assert r.status_code == 401 and "butuh_kode" not in r.json()                  # password salah tak membocorkan adanya TOTP
    with main.basis.KUNCI:
        main.KON.execute("UPDATE pemakai SET totp_langkah = 0 WHERE username = 'kepala'")
    assert klien.post("/api/masuk", json={"username": "kepala", "password": "sandi-kepala-1", "kode": _kode(rahasia)}).status_code == 200
    # Admin tak bisa menghapus TOTP sendiri lewat dashboard; TOTP orang lain bisa.
    saya = klien.get("/api/saya").json()["pemakai"]["id"]
    assert klien.post("/api/admin/pemakai/ubah", json={"id": saya, "totp_hapus": True}).status_code == 400
    baris = [p for p in klien.get("/api/admin/dasbor").json()["pemakai"] if p["username"] == "kepala"][0]
    assert baris["totp"] == 1
    akun._gagal.clear()
