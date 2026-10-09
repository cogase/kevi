"""0.23.0 — handphone: dibeli di toko elektronik (terkunci level), pesan antarpemain tersimpan dan terbatas lajunya."""
import pytest

from app import akun, atur, hp, permainan
from app.permainan import Ditolak
from tests.conftest import setel_xp


@pytest.fixture()
def rekan(kon):
    uid = akun.buat_pemakai(kon, "sari", "sandi-panjang-2")
    permainan.buat_karakter(kon, uid, "Sari", {})
    return uid


def _beri_hp(kon, uid):
    permainan.tambah_barang(kon, uid, permainan.BARANG_HP)


def test_handphone_dijual_berlevel_dan_cukup_satu(kon, pemain):
    assert permainan.harga_beli("hp") == permainan.HARGA_HP and permainan.level_barang("hp") == permainan.LEVEL_HP == 15 and permainan.HARGA_HP == 20000
    assert permainan.nama_barang("hp") == "Handphone" and permainan.harga_jual("hp") is None
    permainan.ubah_koin(kon, pemain, 50000, "uji")
    setel_xp(kon, pemain, permainan.ambang(14))
    with pytest.raises(Ditolak, match="level 15"):
        permainan.beli(kon, pemain, "hp", 1)
    assert not hp.punya(kon, pemain)
    setel_xp(kon, pemain, permainan.ambang(15))
    koin = permainan.saldo(kon, pemain)
    permainan.beli(kon, pemain, "hp", 1)
    assert hp.punya(kon, pemain) and permainan.saldo(kon, pemain) == koin - permainan.HARGA_HP
    with pytest.raises(Ditolak, match="sudah kamu punya"):
        permainan.beli(kon, pemain, "hp", 1)


def test_pesan_butuh_handphone_di_kedua_pihak(kon, pemain, rekan):
    for fn in (lambda: hp.kontak(kon, pemain), lambda: hp.utas(kon, pemain, rekan), lambda: hp.kirim(kon, pemain, rekan, "halo")):
        with pytest.raises(Ditolak, match="belum punya handphone"):
            fn()
    _beri_hp(kon, pemain)
    assert hp.kontak(kon, pemain) == {"kontak": [], "belum": 0}                # rekan belum punya: tidak ada di kontak
    with pytest.raises(Ditolak, match="Sari belum punya handphone"):
        hp.kirim(kon, pemain, rekan, "halo")
    _beri_hp(kon, rekan)
    assert [k["nama"] for k in hp.kontak(kon, pemain)["kontak"]] == ["Sari"]


def test_kirim_baca_dan_tanda_belum_dibaca(kon, pemain, rekan):
    _beri_hp(kon, pemain)
    _beri_hp(kon, rekan)
    h = hp.kirim(kon, pemain, rekan, "  Rapat   jam sembilan  ")
    assert h["pesan"]["teks"] == "Rapat jam sembilan" and h["ke"] == rekan
    assert h["kabar"]["t"] == "hp_pesan" and h["kabar"]["dari"] == pemain and h["kabar"]["nama"] == "Budi"
    hp.kirim(kon, pemain, rekan, "x" * 500)
    k = hp.kontak(kon, rekan)
    assert k["belum"] == 2 and k["kontak"][0]["id"] == pemain and k["kontak"][0]["belum"] == 2 and hp.belum_dibaca(kon, rekan) == 2
    u = hp.utas(kon, rekan, pemain)                                            # dibuka = terbaca
    assert [p["saya"] for p in u["pesan"]] == [False, False] and len(u["pesan"][1]["teks"]) == hp.TEKS_MAKS and u["belum"] == 0
    assert hp.kontak(kon, rekan)["belum"] == 0 and hp.belum_dibaca(kon, pemain) == 0
    hp.kirim(kon, rekan, pemain, "Siap")
    u = hp.utas(kon, pemain, rekan)
    assert [(p["saya"], p["teks"]) for p in u["pesan"]][-1] == (False, "Siap") and u["nama"] == "Sari"
    for buruk in (("", rekan), ("   ", rekan), ("halo", pemain), ("halo", 9999), ("halo", "2"), ("halo", True)):
        with pytest.raises(Ditolak):
            hp.kirim(kon, pemain, buruk[1], buruk[0])
    with pytest.raises(Ditolak):
        hp.utas(kon, pemain, pemain)


def test_laju_kirim_dibatasi(kon, pemain, rekan):
    _beri_hp(kon, pemain)
    _beri_hp(kon, rekan)
    for i in range(hp.PER_MENIT):
        hp.kirim(kon, pemain, rekan, f"pesan {i}")
    with pytest.raises(Ditolak, match="Terlalu banyak"):
        hp.kirim(kon, pemain, rekan, "satu lagi")
    hp.kirim(kon, rekan, pemain, "aku masih boleh")                            # batasnya per pengirim


def test_koh_andi_ditambahkan_sekali(kon):
    assert atur.pastikan_penjual_elektronik(kon) is True
    assert [n["nama"] for n in atur.baca(kon)["npc"] if n["peran"] == "elektronik"] == ["Koh Andi"]
    assert atur.pastikan_penjual_elektronik(kon) is False
    npc = atur.baca(kon)["npc"]
    next(n for n in npc if n["peran"] == "elektronik")["ucap"][2] = "Handphone baru bisa dibeli mulai level 4."      # ucapan dari 0.23.0
    atur.simpan(kon, {"npc": npc})
    assert atur.segarkan_ucapan_elektronik(kon) is True and atur.segarkan_ucapan_elektronik(kon) is False
    assert "level 15" in next(n for n in atur.baca(kon)["npc"] if n["peran"] == "elektronik")["ucap"][2]
