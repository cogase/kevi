"""0.15.0 — Edit Rumah: draf disimpan sekaligus; stok dipakai dulu, kekurangan dibeli, yang dicabut kembali."""
import pytest

from app import permainan
from app.permainan import Ditolak


def _draf(kon, uid, **ubah):
    d = permainan.baca_rumah(kon, uid)
    return dict({"lantai": d["lantai"], "tembok": d["tembok"], "benda": list(d["benda"]), "ruang": d.get("ruang") or []}, **ubah)


def test_stok_dipakai_dulu_sisanya_dibeli(kon, pemain):
    inv0, koin0 = permainan.inventori(kon, pemain), permainan.saldo(kon, pemain)
    assert inv0["kebun_petak"] == 6
    harga_karung = permainan.harga_beli("gudang_karung")
    draf = _draf(kon, pemain, benda=[{"n": "kebun_petak", "x": 37, "y": 50}, {"n": "kebun_petak", "x": 64, "y": 48}, {"n": "gudang_karung", "x": 120, "y": 96, "l": "atas"}])
    b = permainan.rumah_biaya(kon, pemain, draf)
    assert b["biaya"] == harga_karung and b["beli"] == [{"barang": "gudang_karung", "nama": permainan.nama_barang("gudang_karung"), "n": 1, "harga": harga_karung}] and b["cukup"]
    assert permainan.inventori(kon, pemain) == inv0 and permainan.baca_rumah(kon, pemain)["benda"] == []      # biaya tidak mengubah apa pun
    h = permainan.rumah_simpan(kon, pemain, draf)
    kas = [r["jumlah"] for r in kon.execute("SELECT jumlah FROM buku_kas WHERE pemakai_id = ? AND alasan LIKE ?", (pemain, "belanja Edit Rumah%"))]
    assert h["belanja"] == harga_karung and kas == [-harga_karung] and permainan.saldo(kon, pemain) >= koin0 - harga_karung      # misi "hias" bisa ikut cair
    assert h["inventori"]["kebun_petak"] == 4 and "gudang_karung" not in h["inventori"]
    benda = h["rumah"]["benda"]
    assert [(o["n"], o["x"], o["y"]) for o in benda[:2]] == [("kebun_petak", 32, 48), ("kebun_petak", 64, 48)]      # petak dijepret ke ubin
    assert benda[2]["l"] == "atas" and len({o["id"] for o in benda}) == 3


def test_cabut_mengembalikan_dan_ruang_memakai_ubin(kon, pemain):
    permainan.rumah_simpan(kon, pemain, _draf(kon, pemain, benda=[{"n": "kebun_petak", "x": 32, "y": 48}]))
    assert permainan.inventori(kon, pemain)["kebun_petak"] == 5
    koin = permainan.saldo(kon, pemain)
    ruang = {"gx": 2, "gy": 6, "w": 4, "h": 3, "warna": "#8b9bb4", "lantai": "lantai_parket", "nama": "Gudang", "pintu": [{"sisi": "bawah", "pos": 1}]}
    b = permainan.rumah_biaya(kon, pemain, _draf(kon, pemain, benda=[], ruang=[ruang]))
    # 0.18.0: ruang (12 ubin lantai + 9 ubin tembok) gratis, jadi tidak ada yang dibeli.
    assert b["beli"] == [] and b["biaya"] == 0
    h = permainan.rumah_simpan(kon, pemain, _draf(kon, pemain, benda=[], ruang=[ruang]))
    assert h["inventori"]["kebun_petak"] == 6 and h["rumah"]["ruang"][0]["nama"] == "Gudang"                   # petak kembali ke inventory
    assert permainan.saldo(kon, pemain) == koin - b["biaya"]
    h = permainan.rumah_simpan(kon, pemain, _draf(kon, pemain, ruang=[]))                                      # ruang dihapus: ubinnya kembali
    assert "tembok" not in h["inventori"] and "lantai:lantai_parket" not in h["inventori"] and h["belanja"] == 0
    marmer = dict(ruang, lantai="lantai_marmer")                                                               # motif terkunci level
    with pytest.raises(Ditolak, match="terbuka di level"):
        permainan.rumah_biaya(kon, pemain, _draf(kon, pemain, ruang=[marmer]))


def test_yang_hidup_tidak_bisa_dicabut(kon, pemain):
    h = permainan.rumah_simpan(kon, pemain, _draf(kon, pemain, benda=[{"n": "kebun_petak", "x": 32, "y": 48}]))
    bid = h["rumah"]["benda"][0]["id"]
    permainan.tanam(kon, pemain, bid, "sawi")
    with pytest.raises(Ditolak) as e:
        permainan.rumah_simpan(kon, pemain, _draf(kon, pemain, benda=[]))
    assert "masih ditanami" in str(e.value)
    h = permainan.rumah_simpan(kon, pemain, _draf(kon, pemain, benda=[{"id": bid, "n": "kebun_petak", "x": 96, "y": 96}]))      # dipindah boleh
    assert h["rumah"]["petak"][str(bid)]["t"] == "sawi" and h["rumah"]["benda"][0]["x"] == 96


def test_penolakan(kon, pemain):
    permainan.ubah_koin(kon, pemain, -permainan.saldo(kon, pemain), "uji")
    for buruk in ({"benda": [{"n": "sofa_krem", "x": 96, "y": 96}]},                                           # koin kurang
                  {"benda": [{"n": "tidak_ada", "x": 1, "y": 1}]}, {"benda": [{"n": "kebun_petak", "x": 99999, "y": 1}]},
                  {"benda": [{"n": "kebun_petak", "x": 32, "y": 48}, {"n": "kebun_petak", "x": 40, "y": 50}]},  # dua petak di ubin yang sama
                  {"lantai": {"99,1": "lantai_parket"}}, {"tembok": {"1,1": "merah"}}, {"ruang": [{"gx": 0, "gy": 0, "w": 2, "h": 2, "warna": "#112233"}]},
                  {"benda": "x"}):
        with pytest.raises(Ditolak):
            permainan.rumah_simpan(kon, pemain, _draf(kon, pemain, **buruk))
    assert permainan.baca_rumah(kon, pemain)["benda"] == [] and permainan.inventori(kon, pemain)["kebun_petak"] == 6


def test_penghalang_buatan_pemilik_rumah(kon, pemain):
    """0.22.1 (yosi): Edit Rumah punya alat Penghalang seperti Edit Map."""
    h = permainan.rumah_simpan(kon, pemain, _draf(kon, pemain, halang={"3,4": 1, " 5,4": 1}))
    assert h["rumah"]["halang"] == {"3,4": 1, "5,4": 1} and h["belanja"] == 0
    h = permainan.rumah_simpan(kon, pemain, _draf(kon, pemain))                 # draf tanpa medan halang: penghalang tetap
    assert h["rumah"]["halang"] == {"3,4": 1, "5,4": 1}
    for buruk in ({"99,1": 1}, {"x": 1}, [], "semua"):
        with pytest.raises(Ditolak):
            permainan.rumah_simpan(kon, pemain, _draf(kon, pemain, halang=buruk))
    assert permainan.rumah_simpan(kon, pemain, _draf(kon, pemain, halang={}))["rumah"]["halang"] == {}
    assert permainan.rumah_kosong()["halang"] == {}
