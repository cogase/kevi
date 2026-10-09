"""0.11.0 — toko pakaian & lemari: setel dasar gratis, sisanya dibeli; ganti pakaian hanya dari isi lemari."""
import pytest

from app import atur, basis, permainan
from app.permainan import Ditolak

from .conftest import setel_xp


def _tampilan(kon, uid):
    return basis.muat_json(kon.execute("SELECT tampilan FROM karakter WHERE pemakai_id = ?", (uid,)).fetchone()["tampilan"], {})


def test_karakter_baru_dapat_setel_dasar(kon, pemain):
    t, milik = _tampilan(kon, pemain), permainan.lemari(kon, pemain)
    assert t["kepala"] == "" and not t["jubah"]                                  # aksesori pilihan saat membuat dibuang
    assert milik["baju"] == [t["baju"]] and milik["celana"] == [t["celana"]] and milik["sepatu"] == [t["sepatu"]]
    assert milik["kepala"] == [] and milik["aksesori"] == []


def test_beli_lalu_pakai(kon, pemain):
    t = _tampilan(kon, pemain)
    with pytest.raises(Ditolak) as e:
        permainan.buat_karakter(kon, pemain, "Budi", dict(t, kepala="kupluk"))
    assert "lemari" in str(e.value)
    d = permainan.beli_pakaian(kon, pemain, "kepala", "kupluk")
    assert permainan.saldo(kon, pemain) == 300 - 45 and "kupluk" in d["lemari"]["milik"]["kepala"]
    permainan.buat_karakter(kon, pemain, "Budi", dict(t, kepala="kupluk", kulit="#8d5a3b", aksen="#6b2737"))      # kulit dan aksen gratis
    assert _tampilan(kon, pemain)["kepala"] == "kupluk" and _tampilan(kon, pemain)["kulit"] == "#8d5a3b"
    permainan.buat_karakter(kon, pemain, "Budi", dict(t, kepala=""))             # melepas selalu boleh
    assert _tampilan(kon, pemain)["kepala"] == ""
    permainan.beli_pakaian(kon, pemain, "aksesori", "tali")
    permainan.buat_karakter(kon, pemain, "Budi", dict(t, tali=True))
    with pytest.raises(Ditolak):
        permainan.buat_karakter(kon, pemain, "Budi", dict(t, tali=True, dasi=True))      # dasi belum dibeli
    with pytest.raises(Ditolak):
        permainan.buat_karakter(kon, pemain, "Budi", dict(t, baju="#123456"))            # warna di luar katalog
    assert permainan.saldo(kon, pemain) == 300 - 45 - 15


def test_penolakan_beli(kon, pemain):
    permainan.beli_pakaian(kon, pemain, "mata", "kacamata")
    for jenis, kode in (("mata", "kacamata"), ("mata", "ngawur"), ("ngawur", "kacamata"), ("kepala", "topi_fedora"), ("aksesori", "jubah")):
        with pytest.raises(Ditolak):
            permainan.beli_pakaian(kon, pemain, jenis, kode)                      # sudah punya, tak dikenal, atau level kurang
    setel_xp(kon, pemain, 900)                                                   # level 3
    permainan.ubah_koin(kon, pemain, -permainan.saldo(kon, pemain), "uji")
    with pytest.raises(Ditolak):
        permainan.beli_pakaian(kon, pemain, "kepala", "topi_fedora")             # koin kurang
    permainan.ubah_koin(kon, pemain, 80, "uji")
    permainan.beli_pakaian(kon, pemain, "kepala", "topi_fedora")
    assert permainan.saldo(kon, pemain) == 0


def test_karakter_lama_mewarisi_yang_dikenakan(kon, pemain):
    kon.execute("DELETE FROM lemari WHERE pemakai_id = ?", (pemain,))
    kon.execute("UPDATE karakter SET tampilan = ? WHERE pemakai_id = ?",
                (basis.tulis_json({"baju": "#112233", "celana": "#3e4458", "kepala": "kupluk", "jubah": True, "gaya_rambut": "rambut_bob"}), pemain))
    milik = permainan.lemari(kon, pemain)
    assert milik["baju"] == ["#112233"] and milik["kepala"] == ["kupluk"] and milik["aksesori"] == ["jubah"] and milik["gaya_rambut"] == ["rambut_bob"]
    permainan.buat_karakter(kon, pemain, "Budi", _tampilan(kon, pemain))         # tampilan lamanya tetap sah


def test_penjual_pakaian_ditambahkan_sekali(kon):
    atur.lupa()
    lama = [n for n in atur.BAWAAN["npc"] if n["peran"] != "pakaian"]
    atur.simpan(kon, {"npc": lama})                                              # admin pernah menyunting daftar NPC (versi lama)
    assert atur.pastikan_penjual_pakaian(kon) is True
    npc = atur.baca(kon)["npc"]
    assert len(npc) == len(lama) + 1 and npc[-1]["peran"] == "pakaian" and npc[-1]["nama"] == "Kak Mira"
    atur.simpan(kon, {"npc": lama})                                              # admin sengaja menghapusnya
    assert atur.pastikan_penjual_pakaian(kon) is False and len(atur.baca(kon)["npc"]) == len(lama)
    atur.lupa()
