"""0.8.0 — peti: menitipkan barang di perabot peti yang ditaruh di rumah sendiri."""
import pytest

from app import permainan
from app.permainan import Ditolak


def _taruh_peti(kon, uid, n="gudang_peti_kayu"):
    permainan.tambah_barang(kon, uid, n)
    return permainan.pasang(kon, uid, {"barang": n, "x": 64, "y": 64, "r": 0})["rumah"]["benda"][-1]["id"]


def test_titip_dan_ambil(kon, pemain):
    bid = _taruh_peti(kon, pemain)
    permainan.tambah_barang(kon, pemain, "pakan", 7)
    d = permainan.peti(kon, pemain, {"id": bid, "barang": "pakan", "jumlah": 5, "arah": "masuk"})
    assert d["rumah"]["peti"][str(bid)] == {"pakan": 5} and d["inventori"]["pakan"] == 2
    d = permainan.peti(kon, pemain, {"id": bid, "barang": "pakan", "jumlah": 2, "arah": "masuk"})
    assert d["rumah"]["peti"][str(bid)] == {"pakan": 7} and "pakan" not in d["inventori"]
    d = permainan.peti(kon, pemain, {"id": bid, "barang": "pakan", "jumlah": 3, "arah": "keluar"})
    assert d["rumah"]["peti"][str(bid)] == {"pakan": 4} and d["inventori"]["pakan"] == 3
    d = permainan.peti(kon, pemain, {"id": bid, "barang": "pakan", "jumlah": 4, "arah": "keluar"})
    assert d["rumah"]["peti"][str(bid)] == {} and d["inventori"]["pakan"] == 7


def test_penolakan(kon, pemain):
    bid = _taruh_peti(kon, pemain)
    permainan.tambah_barang(kon, pemain, "pakan", 2)
    permainan.tambah_barang(kon, pemain, "sofa_krem")
    sofa = permainan.pasang(kon, pemain, {"barang": "sofa_krem", "x": 120, "y": 64, "r": 0})["rumah"]["benda"][-1]["id"]
    for buruk in ({"id": bid, "barang": "pakan", "jumlah": 3, "arah": "masuk"},            # lebih dari yang dipunya
                  {"id": bid, "barang": "pakan", "jumlah": 1, "arah": "keluar"},           # peti kosong
                  {"id": bid, "barang": "pakan", "jumlah": 0, "arah": "masuk"}, {"id": bid, "barang": "pakan", "jumlah": True, "arah": "masuk"},
                  {"id": bid, "barang": "pakan", "jumlah": 1, "arah": "ngawur"}, {"id": bid, "barang": "", "jumlah": 1, "arah": "masuk"},
                  {"id": sofa, "barang": "pakan", "jumlah": 1, "arah": "masuk"},           # sofa bukan peti
                  {"id": 9999, "barang": "pakan", "jumlah": 1, "arah": "masuk"}):
        with pytest.raises(Ditolak):
            permainan.peti(kon, pemain, buruk)
    assert permainan.inventori(kon, pemain)["pakan"] == 2


def test_peti_berisi_tak_bisa_diangkat(kon, pemain):
    bid = _taruh_peti(kon, pemain)
    permainan.tambah_barang(kon, pemain, "pakan", 1)
    permainan.peti(kon, pemain, {"id": bid, "barang": "pakan", "jumlah": 1, "arah": "masuk"})
    with pytest.raises(Ditolak) as e:
        permainan.angkat(kon, pemain, {"id": bid})
    assert "berisi" in str(e.value)
    permainan.peti(kon, pemain, {"id": bid, "barang": "pakan", "jumlah": 1, "arah": "keluar"})
    d = permainan.angkat(kon, pemain, {"id": bid})
    assert str(bid) not in d["rumah"]["peti"] and d["inventori"]["gudang_peti_kayu"] == 1


def test_batas_jenis_dan_inventory_penuh(kon, pemain):
    bid = _taruh_peti(kon, pemain)
    kon.execute("DELETE FROM inventori WHERE pemakai_id = ?", (pemain,))
    jenis = [n for n in permainan.katalog()["barang"]][:permainan.PETI_JENIS + 1]
    for n in jenis[:permainan.PETI_JENIS]:
        permainan.tambah_barang(kon, pemain, n)
        permainan.peti(kon, pemain, {"id": bid, "barang": n, "jumlah": 1, "arah": "masuk"})
    permainan.tambah_barang(kon, pemain, jenis[-1])
    with pytest.raises(Ditolak) as e:
        permainan.peti(kon, pemain, {"id": bid, "barang": jenis[-1], "jumlah": 1, "arah": "masuk"})
    assert "penuh" in str(e.value)
    # Inventory penuh: mengambil jenis baru dari peti ditolak, isi peti tetap.
    kon.execute("DELETE FROM inventori WHERE pemakai_id = ?", (pemain,))
    for i in range(permainan.kapasitas(kon, pemain)):
        kon.execute("INSERT INTO inventori (pemakai_id, barang, jumlah) VALUES (?, ?, 1)", (pemain, f"isi_{i}"))
    with pytest.raises(Ditolak):
        permainan.peti(kon, pemain, {"id": bid, "barang": jenis[0], "jumlah": 1, "arah": "keluar"})
    assert len(permainan.baca_rumah(kon, pemain)["peti"][str(bid)]) == permainan.PETI_JENIS
