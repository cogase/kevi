"""0.4.0 — inventory berslot, tas, tata letak & hotbar, makanan, masak."""
import pytest

from app import permainan
from app.permainan import Ditolak
from tests.conftest import setel_xp


def test_inventory_penuh_menolak_jenis_baru_tetapi_menumpuk_yang_ada(kon, pemain):
    assert permainan.kapasitas(kon, pemain) == 20
    punya = len(permainan.inventori(kon, pemain))
    for i in range(20 - punya):
        permainan.tambah_barang(kon, pemain, f"uji_{i}")
    with pytest.raises(Ditolak, match="penuh"):
        permainan.tambah_barang(kon, pemain, "satu_lagi")
    permainan.tambah_barang(kon, pemain, "benih:sawi", 5)                 # menumpuk di slot yang sudah ada
    assert permainan.inventori(kon, pemain)["benih:sawi"] == 11


def test_tas_menambah_sepuluh_slot_dan_makin_mahal(kon, pemain):
    permainan.ubah_koin(kon, pemain, 100000, "uji")
    koin = permainan.saldo(kon, pemain)
    d = permainan.beli_tas(kon, pemain)
    assert d["tas"] == {"jumlah": 1, "kapasitas": 30, "harga": permainan.HARGA_TAS * 2} and permainan.saldo(kon, pemain) == koin - permainan.HARGA_TAS
    for _ in range(permainan.TAS_MAKS - 1):
        d = permainan.beli_tas(kon, pemain)
    assert d["tas"]["harga"] is None and d["tas"]["kapasitas"] == 20 + 10 * permainan.TAS_MAKS
    with pytest.raises(Ditolak):
        permainan.beli_tas(kon, pemain)


def test_tata_letak_disaring(kon, pemain):
    t = permainan.simpan_tata(kon, pemain, {"urut": ["benih:sawi", None, 7, "x" * 99], "hotbar": ["kebun_petak"] + [None] * 30, "bilah": False, "lain": 1})["tata"]
    assert t["urut"] == ["benih:sawi", None, None, None] and len(t["hotbar"]) == 10 and t["hotbar"][0] == "kebun_petak" and t["bilah"] is False
    assert permainan.baca_tata(kon, pemain) == t
    assert permainan.tata_sah("ngawur") == {"urut": [], "hotbar": [None] * 10, "bilah": True}


def test_makan_dan_masak(kon, pemain):
    permainan.beli(kon, pemain, "makan:roti", 1)
    d = permainan.makan(kon, pemain, "makan:roti")
    assert d["kenyang"] == 25 and "makan:roti" not in d["inventori"]
    with pytest.raises(Ditolak):
        permainan.makan(kon, pemain, "makan:roti")                        # sudah habis
    with pytest.raises(Ditolak):
        permainan.makan(kon, pemain, "kebun_petak")
    with pytest.raises(Ditolak):
        permainan.masak(kon, pemain, "tumis_sawi")                        # belum punya sawi
    with pytest.raises(Ditolak):
        permainan.beli(kon, pemain, "makan:tumis_sawi", 1)                # masakan tidak dijual
    permainan.tambah_barang(kon, pemain, "panen:sawi", 2)
    xp = permainan.xp_kini(kon, pemain)
    d = permainan.masak(kon, pemain, "tumis_sawi")
    assert d["inventori"]["makan:tumis_sawi"] == 1 and "panen:sawi" not in d["inventori"] and permainan.xp_kini(kon, pemain) == xp + permainan.XP_MASAK
    assert permainan.makan(kon, pemain, "makan:tumis_sawi")["kenyang"] == 60


def test_semua_resep_punya_makanan_dan_bahan_dikenal():
    for kode, bahan in permainan.RESEP.items():
        assert kode in permainan.MAKANAN and permainan.MAKANAN[kode][1] is None
        for b in bahan:
            assert (b.startswith("panen:") and b[6:] in permainan.TANAMAN) or b in permainan.PRODUK
