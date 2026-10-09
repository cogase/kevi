"""0.10.0 — feedback pemain: kirim, pembatas laju, daftar untuk admin, ubah status dan catatan."""
import pytest
from fastapi.testclient import TestClient

from app import akun, main, umpan


def test_kirim_dan_kelola(kon, pemain):
    uid = umpan.kirim(kon, pemain, {"jenis": "bug", "teks": "  Karakter tembus tembok di pantry.  ", "adegan": "kantor", "x": 120.4, "y": True}, "0.10.0")
    umpan.kirim(kon, pemain, {"jenis": "saran", "teks": "Tambah kucing kantor."}, "0.10.0")
    d = umpan.daftar(kon)
    assert [u["jenis"] for u in d] == ["saran", "bug"] and umpan.jumlah_baru(kon) == 2
    bug = d[1]
    assert bug["teks"] == "Karakter tembus tembok di pantry." and bug["adegan"] == "kantor" and bug["x"] == 120.4 and bug["y"] is None
    assert bug["nama"] == "Budi" and bug["versi"] == "0.10.0" and bug["status"] == "baru"
    umpan.ubah(kon, {"id": uid, "status": "selesai", "catatan": "  diperbaiki di 0.10.1  "})
    d = umpan.daftar(kon)
    assert d[-1]["id"] == uid and d[-1]["status"] == "selesai" and d[-1]["catatan_admin"] == "diperbaiki di 0.10.1"      # yang selesai turun
    assert umpan.jumlah_baru(kon) == 1
    for buruk in ({"id": uid, "status": "ngawur"}, {"id": 9999, "status": "dibaca"}):
        with pytest.raises(umpan.UmpanDitolak):
            umpan.ubah(kon, buruk)


def test_penolakan_dan_pembatas(kon, pemain):
    for buruk in ({"jenis": "pujian", "teks": "bagus sekali"}, {"jenis": "bug", "teks": "eh"}, {"jenis": "bug", "teks": "x" * 1001}, {"jenis": "bug"}):
        with pytest.raises(umpan.UmpanDitolak):
            umpan.kirim(kon, pemain, buruk, "x")
    for i in range(umpan.LAJU_MAKS):
        umpan.kirim(kon, pemain, {"jenis": "saran", "teks": f"saran ke-{i} yang cukup panjang"}, "x")
    with pytest.raises(umpan.UmpanDitolak) as e:
        umpan.kirim(kon, pemain, {"jenis": "saran", "teks": "satu lagi boleh ya"}, "x")
    assert "Terlalu sering" in str(e.value)
    kon.execute("UPDATE umpan_balik SET waktu = waktu - ?", (umpan.LAJU_JENDELA + 1,))
    umpan.kirim(kon, pemain, {"jenis": "saran", "teks": "sesudah jendela lewat"}, "x")


def test_rute_hanya_admin_yang_membaca():
    with main.basis.KUNCI:
        if not main.KON.execute("SELECT 1 FROM pemakai WHERE username = 'umpan-admin'").fetchone():
            akun.buat_pemakai(main.KON, "umpan-admin", "sandi-admin-9", "admin")
            akun.buat_pemakai(main.KON, "umpan-staf", "sandi-staf-99")
    klien = TestClient(main.app)
    assert klien.post("/api/umpan-balik", json={"jenis": "bug", "teks": "tanpa sesi"}).status_code == 401
    klien.post("/api/masuk", json={"username": "umpan-staf", "password": "sandi-staf-99"})
    assert klien.post("/api/umpan-balik", json={"jenis": "bug", "teks": "eh"}).status_code == 400
    assert klien.post("/api/umpan-balik", json={"jenis": "bug", "teks": "Tombol E kadang tidak jalan."}).status_code == 200
    assert klien.get("/api/admin/umpan-balik").status_code == 403
    assert klien.post("/api/admin/umpan-balik/ubah", json={"id": 1, "status": "selesai"}).status_code == 403
    klien.cookies.clear()
    klien.post("/api/masuk", json={"username": "umpan-admin", "password": "sandi-admin-9"})
    d = klien.get("/api/admin/umpan-balik").json()
    saya = [u for u in d["umpan"] if u["username"] == "umpan-staf"]
    assert saya and saya[0]["teks"] == "Tombol E kadang tidak jalan." and d["baru"] >= 1
    assert klien.post("/api/admin/umpan-balik/ubah", json={"id": saya[0]["id"], "status": "dibaca"}).status_code == 200
