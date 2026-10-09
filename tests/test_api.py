"""Akun, sesi, pagar asal permintaan, admin, dan saringan terminal."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app import akun, main, terminal
from app.terminal import TerminalDitolak


@pytest.fixture(scope="module")
def klien():
    with main.basis.KUNCI:
        if not main.KON.execute("SELECT 1 FROM pemakai WHERE username = 'bos'").fetchone():
            akun.buat_pemakai(main.KON, "bos", "sandi-admin-1", "admin")
            akun.buat_pemakai(main.KON, "staf", "sandi-staf-12")
    return TestClient(main.app)


def _masuk(klien, u, p):
    klien.cookies.clear()
    return klien.post("/api/masuk", json={"username": u, "password": p})


def test_tanpa_sesi_ditolak(klien):
    klien.cookies.clear()
    assert klien.get("/api/saya").status_code == 401
    assert klien.get("/", follow_redirects=False).status_code == 303
    assert klien.post("/api/toko/beli", json={"barang": "pakan"}).status_code == 401
    assert klien.get("/api/admin/pemakai").status_code == 403


def test_masuk_salah_lalu_benar(klien):
    r = _masuk(klien, "staf", "salah-total-1")
    assert r.status_code == 401 and "salah" in r.json()["galat"]
    assert _masuk(klien, "tidak-ada", "salah-total-1").json()["galat"] == r.json()["galat"]     # pesan sama
    r = _masuk(klien, "STAF", "sandi-staf-12")
    assert r.status_code == 200
    kuki = r.headers["set-cookie"].lower()
    assert "httponly" in kuki and "samesite=lax" in kuki
    d = klien.get("/api/saya").json()
    assert d["pemakai"]["username"] == "staf" and d["karakter"] is None


def test_aksi_butuh_karakter_lalu_jalan(klien):
    _masuk(klien, "staf", "sandi-staf-12")
    assert klien.post("/api/toko/beli", json={"barang": "pakan", "jumlah": 1}).status_code == 409
    r = klien.post("/api/karakter", json={"nama": "Staf Uji", "tampilan": {"baju": "#112233", "jubah": 1}})
    assert r.status_code == 200 and r.json()["koin"] == 300
    r = klien.post("/api/toko/beli", json={"barang": "pakan", "jumlah": 2})
    assert r.status_code == 200 and r.json()["koin"] == 284 and len(r.json()["misi"]["misi"]) == 3
    assert klien.post("/api/toko/beli", json={"barang": "pakan", "jumlah": 99999}).status_code == 400
    assert klien.get("/api/saya").json()["bonus_masuk"] in (0, 50)


def test_asal_asing_ditolak(klien):
    _masuk(klien, "staf", "sandi-staf-12")
    r = klien.post("/api/toko/beli", json={"barang": "pakan", "jumlah": 1}, headers={"Origin": "http://jahat.example"})
    assert r.status_code == 403
    r = klien.post("/api/toko/beli", json={"barang": "pakan", "jumlah": 1}, headers={"Origin": "http://testserver"})
    assert r.status_code == 200


def test_catatan_milik_sendiri(klien):
    _masuk(klien, "staf", "sandi-staf-12")
    cid = klien.post("/api/catatan", json={"judul": "Rahasia", "isi": "isi"}).json()["id"]
    _masuk(klien, "bos", "sandi-admin-1")
    klien.post("/api/karakter", json={"nama": "Bos", "tampilan": {}})
    assert klien.get("/api/catatan").json()["catatan"] == []
    assert klien.post("/api/catatan", json={"id": cid, "judul": "dibajak", "isi": "x"}).status_code == 400
    klien.post("/api/catatan/hapus", json={"id": cid})
    _masuk(klien, "staf", "sandi-staf-12")
    assert klien.get("/api/catatan").json()["catatan"][0]["judul"] == "Rahasia"


def test_admin_saja_yang_mengelola_pemakai(klien):
    _masuk(klien, "staf", "sandi-staf-12")
    assert klien.post("/api/admin/pemakai", json={"username": "baru", "password": "sandi-baru-1"}).status_code == 403
    assert klien.get("/laporan").status_code == 403
    _masuk(klien, "bos", "sandi-admin-1")
    assert klien.post("/api/admin/pemakai", json={"username": "baru", "password": "pendek"}).status_code == 400
    uid = klien.post("/api/admin/pemakai", json={"username": "baru", "password": "sandi-baru-1"}).json()["id"]
    assert klien.post("/api/admin/pemakai/ubah", json={"id": uid, "aktif": False}).status_code == 200
    assert _masuk(klien, "baru", "sandi-baru-1").status_code == 401


def test_keluar_mencabut_sesi(klien):
    _masuk(klien, "staf", "sandi-staf-12")
    kuki = klien.cookies.get(akun.NAMA_COOKIE)
    klien.post("/api/keluar", json={})
    klien.cookies.set(akun.NAMA_COOKIE, kuki)
    assert klien.get("/api/saya").status_code == 401


def test_ws_butuh_sesi(klien):
    klien.cookies.clear()
    with pytest.raises(Exception):
        with klien.websocket_connect("/ws"):
            pass


def test_ws_halo_dan_terminal(klien):
    _masuk(klien, "staf", "sandi-staf-12")
    with klien.websocket_connect("/ws") as ws:
        halo = ws.receive_json()
        assert halo["t"] == "halo" and halo["saya"]["nama"] == "Staf Uji" and len(halo["npc"]) == 6
        ws.send_json({"t": "term", "baris": "rm -rf /"})
        assert "tidak dikenal" in ws.receive_json()["baris"]
        assert ws.receive_json()["t"] == "term_selesai"
        ws.send_json({"t": "term", "baris": "ping $(reboot)"})
        assert "Sasaran" in ws.receive_json()["baris"]


@pytest.mark.parametrize("s", ["-c", "--help", "a b", "a;b", "$(x)", "`x`", "a|b", "a&b", "../etc", "", "x" * 300, "a..b", "host\nx"])
def test_sasaran_berbahaya_ditolak(s):
    with pytest.raises(TerminalDitolak):
        terminal.sasaran_sah(s)


@pytest.mark.parametrize("s", ["8.8.8.8", "google.com", "sw-core-01.contoh.net", "2001:4860:4860::8888", "localhost"])
def test_sasaran_sah_diterima(s):
    assert terminal.sasaran_sah(s)


def test_perintah_di_luar_daftar_ditolak():
    async def coba():
        async for _ in terminal.jalankan(1, "bash", ["x"]):
            pass
    with pytest.raises(TerminalDitolak):
        asyncio.run(coba())
