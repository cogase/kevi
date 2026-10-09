"""0.13.0 — koleksi peta: banyak peta tersimpan, satu aktif; denah DAN NPC + titik milik tiap peta."""
import pytest

from app import atur, koleksi, permainan
from app.permainan import Ditolak


@pytest.fixture()
def bersih(kon):
    atur.lupa()
    yield kon
    atur.lupa()


def test_peta_pertama_terdaftar_sendiri(bersih):
    kon = bersih
    permainan.peta_pasang(kon, {"barang": "sofa_krem", "x": 100, "y": 100})
    d = koleksi.daftar(kon)
    assert len(d["peta"]) == 1 and d["peta"][0]["aktif"] and d["peta"][0]["nama"] == "Kantor utama"
    assert d["peta"][0]["benda"] == 1 and d["peta"][0]["npc"] == len(atur.NPC_BAWAAN)
    assert koleksi.daftar(kon)["aktif"] == d["aktif"]                    # tidak membuat baris kedua


def test_tiap_peta_punya_denah_dan_npc_sendiri(bersih):
    kon = bersih
    permainan.peta_pasang(kon, {"barang": "sofa_krem", "x": 100, "y": 100})
    asal = koleksi.daftar(kon)["aktif"]
    d = koleksi.baru(kon, {"nama": "  Taman   kota ", "dari": "kosong", "lebar": 30, "tinggi": 24})
    taman = d["id"]
    assert [p["nama"] for p in d["peta"]] == ["Kantor utama", "Taman kota"] and d["peta"][1]["npc"] == 0 and not d["peta"][1]["aktif"]
    rev = permainan.baca_peta(kon)["rev"]
    h = koleksi.aktifkan(kon, taman)
    assert h["aktif"] == taman and (h["denah"]["lebar"], h["denah"]["tinggi"], h["denah"]["dasar"]) == (30, 24, "kosong")
    assert h["denah"]["benda"] == [] and h["denah"]["rev"] > rev                          # revisi selalu maju
    assert atur.baca(kon)["npc"] == []                                                  # peta kosong tanpa NPC
    # Sunting peta baru: satu NPC dan satu perabot hanya milik peta ini.
    atur.simpan(kon, {"npc": [{"id": "pak_kebun", "nama": "Pak Kebun", "x": 64, "y": 64}]})
    permainan.peta_pasang(kon, {"barang": "sofa_krem", "x": 32, "y": 32})
    permainan.peta_pasang(kon, {"barang": "sofa_krem", "x": 64, "y": 32})
    h = koleksi.aktifkan(kon, asal)
    assert len(h["denah"]["benda"]) == 1 and h["denah"]["dasar"] == "default"             # denah kantor utuh
    assert len(atur.baca(kon)["npc"]) == len(atur.NPC_BAWAAN)                           # NPC kantor tidak tercampur
    d = koleksi.daftar(kon)
    oleh_id = {p["id"]: p for p in d["peta"]}
    assert oleh_id[taman]["benda"] == 2 and oleh_id[taman]["npc"] == 1
    h = koleksi.aktifkan(kon, taman)
    assert [n["nama"] for n in atur.baca(kon)["npc"]] == ["Pak Kebun"] and len(h["denah"]["benda"]) == 2


def test_salin_default_nama_hapus(bersih):
    kon = bersih
    permainan.peta_pasang(kon, {"barang": "sofa_krem", "x": 100, "y": 100})
    salin = koleksi.baru(kon, {"nama": "Kantor malam", "dari": "salin"})
    bawaan = koleksi.baru(kon, {"nama": "Kantor bersih", "dari": "default"})
    oleh_id = {p["id"]: p for p in bawaan["peta"]}
    assert oleh_id[salin["id"]]["benda"] == 1 and oleh_id[bawaan["id"]]["benda"] == 0 and oleh_id[bawaan["id"]]["npc"] == len(atur.NPC_BAWAAN)
    assert koleksi.ganti_nama(kon, salin["id"], "Kantor  senja")["peta"][1]["nama"] == "Kantor senja"
    aktif = bawaan["aktif"]
    for salah in (lambda: koleksi.hapus(kon, aktif), lambda: koleksi.hapus(kon, 9999), lambda: koleksi.aktifkan(kon, aktif), lambda: koleksi.aktifkan(kon, 9999),
                  lambda: koleksi.ganti_nama(kon, salin["id"], "x"), lambda: koleksi.baru(kon, {"nama": "A", "dari": "kosong", "lebar": 30, "tinggi": 30}),
                  lambda: koleksi.baru(kon, {"nama": "Peta X", "dari": "kosong", "lebar": 5, "tinggi": 30}), lambda: koleksi.baru(kon, {"nama": "Peta X", "dari": "ngawur"}),
                  lambda: koleksi.baru(kon, {"nama": "Peta X", "dari": "kosong", "lebar": 30, "tinggi": 30, "lantai_dasar": "ngawur"})):
        with pytest.raises(Ditolak):
            salah()
    assert len(koleksi.hapus(kon, salin["id"])["peta"]) == 2
