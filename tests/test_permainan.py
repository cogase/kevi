"""Aturan permainan: koin, toko, rumah, kebun, kandang, misi."""
import time

import pytest

from app import basis, konfig, permainan
from tests.conftest import setel_xp
from app.permainan import Ditolak


def test_karakter_baru_dapat_modal(kon, pemain):
    assert permainan.saldo(kon, pemain) == 300
    inv = permainan.inventori(kon, pemain)
    assert inv["kebun_petak"] == 6 and inv["benih:sawi"] == 6
    r = kon.execute("SELECT tampilan FROM karakter WHERE pemakai_id = ?", (pemain,)).fetchone()
    t = basis.muat_json(r["tampilan"], {})
    assert t["kepala"] == "" and t["mata"] == "" and t["baju"] in permainan.WARNA_BAJU      # karakter baru: setel dasar, tanpa aksesori


def test_ubah_karakter_tidak_menggandakan_modal(kon, pemain):
    permainan.buat_karakter(kon, pemain, "Budi Baru", {})
    assert permainan.saldo(kon, pemain) == 300
    assert permainan.inventori(kon, pemain)["kebun_petak"] == 6


@pytest.mark.parametrize("nama", ["", "x", "a" * 21, "<script>"])
def test_nama_karakter_disaring(kon, pemain, nama):
    with pytest.raises(Ditolak):
        permainan.buat_karakter(kon, pemain, nama, {})


def test_beli_dan_jual(kon, pemain):
    permainan.beli(kon, pemain, "benih:wortel", 2)
    assert permainan.saldo(kon, pemain) == 270
    with pytest.raises(Ditolak, match="level"):
        permainan.beli(kon, pemain, "sofa_krem", 1)              # 75 koin = level 4
    setel_xp(kon, pemain, permainan.ambang(permainan.level_barang("sofa_krem")))
    permainan.beli(kon, pemain, "sofa_krem", 1)
    harga = permainan.harga_beli("sofa_krem")
    assert permainan.saldo(kon, pemain) == 270 - harga
    d = permainan.jual(kon, pemain, "sofa_krem", 1)
    assert d["dapat"] == harga // 2


def test_koin_tak_bisa_minus(kon, pemain):
    with pytest.raises(Ditolak):
        permainan.beli(kon, pemain, "kandang_ternak", 1)       # 900 koin
    assert permainan.saldo(kon, pemain) == 300


@pytest.mark.parametrize("barang", ["tokoh_bawah_diam", "antar_lift", "tidak_ada", "benih:ganja", "panen:sawi", "lantai:ngawur"])
def test_barang_di_luar_toko_ditolak(kon, pemain, barang):
    with pytest.raises(Ditolak):
        permainan.beli(kon, pemain, barang, 1)


@pytest.mark.parametrize("jumlah", [0, -5, 501, "3", 1.5])
def test_jumlah_beli_disaring(kon, pemain, jumlah):
    with pytest.raises(Ditolak):
        permainan.beli(kon, pemain, "benih:sawi", jumlah)


def test_jual_melebihi_stok_ditolak(kon, pemain):
    with pytest.raises(Ditolak):
        permainan.jual(kon, pemain, "benih:sawi", 99)


def _petak(kon, uid, x=32, y=32):
    d = permainan.pasang(kon, uid, {"barang": "kebun_petak", "x": x, "y": y})
    return d["rumah"]["benda"][-1]["id"]


def test_pasang_memakai_inventori_dan_angkat_mengembalikan(kon, pemain):
    bid = _petak(kon, pemain)
    assert permainan.inventori(kon, pemain)["kebun_petak"] == 5
    permainan.angkat(kon, pemain, {"id": bid})
    assert permainan.inventori(kon, pemain)["kebun_petak"] == 6
    assert permainan.baca_rumah(kon, pemain)["benda"] == []


def test_pasang_tanpa_stok_dan_di_luar_tanah_ditolak(kon, pemain):
    with pytest.raises(Ditolak):
        permainan.pasang(kon, pemain, {"barang": "sofa_krem", "x": 10, "y": 10})
    with pytest.raises(Ditolak):
        permainan.pasang(kon, pemain, {"barang": "kebun_petak", "x": 99999, "y": 10})
    with pytest.raises(Ditolak):
        permainan.pasang(kon, pemain, {"barang": "kebun_petak", "x": "1", "y": 10})


def test_lantai_dan_tembok(kon, pemain):
    # 0.18.0: lantai dan tembok gratis, tidak dijual dan tidak lewat inventory.
    for barang in ("lantai:lantai_parket", "tembok"):
        with pytest.raises(Ditolak, match="tidak dijual"):
            permainan.beli(kon, pemain, barang, 1)
    koin = permainan.saldo(kon, pemain)
    permainan.pasang(kon, pemain, {"barang": "lantai:lantai_parket", "gx": 3, "gy": 3})
    permainan.pasang(kon, pemain, {"barang": "tembok", "gx": 3, "gy": 2, "warna": "javascript:1"})
    d = permainan.baca_rumah(kon, pemain)
    assert d["lantai"]["3,3"] == "lantai_parket" and d["tembok"]["3,2"] == "#8b9bb4"
    with pytest.raises(Ditolak):
        permainan.pasang(kon, pemain, {"barang": "tembok", "gx": 99, "gy": 2})
    permainan.angkat(kon, pemain, {"gx": 3, "gy": 2})
    permainan.angkat(kon, pemain, {"gx": 3, "gy": 3})
    inv = permainan.inventori(kon, pemain)
    assert "tembok" not in inv and not any(b.startswith("lantai:") for b in inv) and permainan.saldo(kon, pemain) == koin
    assert not permainan.baca_rumah(kon, pemain)["tembok"] and not permainan.baca_rumah(kon, pemain)["lantai"]


def test_motif_lantai_terbuka_menurut_level(kon, pemain):
    assert permainan.level_barang("lantai:lantai_parket") == 1 and permainan.level_barang("tembok") == 1
    assert permainan.level_barang("lantai:lantai_marmer") == permainan.LEVEL_LANTAI["marmer"] > 1
    assert all(1 <= permainan.level_barang("lantai:" + n) <= permainan.LEVEL_MAKS for n in permainan.katalog()["lantai"])
    with pytest.raises(Ditolak, match="terbuka di level"):
        permainan.pasang(kon, pemain, {"barang": "lantai:lantai_marmer", "gx": 2, "gy": 2})
    kon.execute("UPDATE karakter SET xp = ? WHERE pemakai_id = ?", (permainan.ambang(permainan.LEVEL_LANTAI["marmer"]), pemain))
    permainan.pasang(kon, pemain, {"barang": "lantai:lantai_marmer", "gx": 2, "gy": 2})
    assert permainan.baca_rumah(kon, pemain)["lantai"]["2,2"] == "lantai_marmer"


def test_stok_ubin_lama_dikembalikan_jadi_koin(kon, pemain):
    permainan.tambah_barang(kon, pemain, "tembok", 4)
    permainan.tambah_barang(kon, pemain, "lantai:lantai_parket", 10)
    permainan.tambah_barang(kon, pemain, "pakan", 2)
    d = permainan.baca_rumah(kon, pemain)
    d["peti"]["7"] = {"lantai:lantai_parket": 5, "pakan": 1}
    permainan.simpan_rumah(kon, pemain, d)
    koin = permainan.saldo(kon, pemain)
    assert permainan.kembalikan_ubin(kon) == 1
    harga = 4 * permainan.HARGA_TEMBOK_LAMA + 15 * permainan.HARGA_LANTAI_LAMA
    assert permainan.saldo(kon, pemain) == koin + harga
    inv = permainan.inventori(kon, pemain)
    assert inv.get("pakan") == 2 and "tembok" not in inv and "lantai:lantai_parket" not in inv
    assert permainan.baca_rumah(kon, pemain)["peti"]["7"] == {"pakan": 1}
    assert permainan.kembalikan_ubin(kon) == 0 and permainan.saldo(kon, pemain) == koin + harga      # sekali saja


def test_kebun_tumbuh_hanya_saat_basah(kon, pemain):
    bid = _petak(kon, pemain)
    permainan.tanam(kon, pemain, bid, "sawi")
    assert permainan.inventori(kon, pemain)["benih:sawi"] == 5
    time.sleep(konfig.JAM_KEBUN * 3.5)                          # kering: tidak tumbuh walau waktu lewat
    pt = permainan.potret_rumah(kon, pemain)["petak"][str(bid)]
    assert pt["tahap"] == 0 and not pt["matang"] and not pt["basah"]
    with pytest.raises(Ditolak):
        permainan.panen(kon, pemain, bid)
    permainan.siram(kon, pemain, bid)
    time.sleep(konfig.JAM_KEBUN * 3.5)
    assert permainan.potret_rumah(kon, pemain)["petak"][str(bid)]["matang"]
    d = permainan.panen(kon, pemain, bid)
    assert d["inventori"]["panen:sawi"] == 1
    assert "t" not in d["rumah"]["petak"][str(bid)]             # sawi sekali panen: petak kosong lagi
    assert permainan.jual_semua_hasil(kon, pemain)["dapat"] == 30


def test_tanaman_berulang_berbuah_lagi(kon, pemain):
    permainan.ubah_koin(kon, pemain, 100, "uji")
    setel_xp(kon, pemain, permainan.ambang(2))
    permainan.beli(kon, pemain, "benih:cabai", 1)
    bid = _petak(kon, pemain)
    permainan.tanam(kon, pemain, bid, "cabai")
    permainan.siram(kon, pemain, bid)
    time.sleep(konfig.JAM_KEBUN * 6.5)
    d = permainan.panen(kon, pemain, bid)
    pt = d["rumah"]["petak"][str(bid)]
    assert pt["t"] == "cabai" and not pt["matang"]
    assert d["habis"] is False and d["sisa_panen"] == permainan.PANEN_MAKS["cabai"] - 1 == pt["sisa_panen"]
    time.sleep(konfig.JAM_KEBUN * 3.5)
    assert permainan.potret_rumah(kon, pemain)["petak"][str(bid)]["matang"]


def test_tanaman_berulang_habis_setelah_batas_panen(kon, pemain):
    """0.18.0: panen berulang ada batasnya; panen terakhir mengosongkan petak."""
    assert all(permainan.TANAMAN[t][4] for t in permainan.PANEN_MAKS) and all(t in permainan.PANEN_MAKS for t, v in permainan.TANAMAN.items() if v[4])
    permainan.ubah_koin(kon, pemain, 100, "uji")
    setel_xp(kon, pemain, permainan.ambang(2))
    permainan.beli(kon, pemain, "benih:cabai", 1)
    bid = _petak(kon, pemain)
    permainan.tanam(kon, pemain, bid, "cabai")
    maks = permainan.PANEN_MAKS["cabai"]
    for ke in range(1, maks + 1):
        d = permainan.baca_rumah(kon, pemain)                      # matangkan langsung, tanpa menunggu
        d["petak"][str(bid)]["tumbuh"] = permainan.TANAMAN["cabai"][1] * konfig.JAM_KEBUN
        permainan.simpan_rumah(kon, pemain, d)
        h = permainan.panen(kon, pemain, bid)
        assert h["habis"] is (ke == maks) and h["sisa_panen"] == maks - ke
    assert permainan.inventori(kon, pemain)["panen:cabai"] == maks
    assert "t" not in h["rumah"]["petak"][str(bid)]                 # petak kosong lagi, siap ditanami
    with pytest.raises(Ditolak):
        permainan.panen(kon, pemain, bid)
    permainan.beli(kon, pemain, "benih:sawi", 1)                    # tanaman sekali panen tidak berubah
    permainan.tanam(kon, pemain, bid, "sawi")
    d = permainan.baca_rumah(kon, pemain)
    d["petak"][str(bid)]["tumbuh"] = permainan.TANAMAN["sawi"][1] * konfig.JAM_KEBUN
    permainan.simpan_rumah(kon, pemain, d)
    h = permainan.panen(kon, pemain, bid)
    assert h["habis"] is False and h["sisa_panen"] == 0 and "t" not in h["rumah"]["petak"][str(bid)]


def test_petak_berisi_tak_bisa_diangkat(kon, pemain):
    bid = _petak(kon, pemain)
    permainan.tanam(kon, pemain, bid, "sawi")
    with pytest.raises(Ditolak):
        permainan.angkat(kon, pemain, {"id": bid})
    permainan.cabut(kon, pemain, bid)
    permainan.angkat(kon, pemain, {"id": bid})


def test_penyiram_membasahi_petak_sekitar(kon, pemain):
    permainan.ubah_koin(kon, pemain, 100, "uji")
    setel_xp(kon, pemain, permainan.ambang(2))
    permainan.beli(kon, pemain, "kebun_penyiram", 1)
    dekat, jauh = _petak(kon, pemain, 32, 32), _petak(kon, pemain, 160, 32)
    permainan.pasang(kon, pemain, {"barang": "kebun_penyiram", "x": 48, "y": 32})
    p = permainan.potret_rumah(kon, pemain)["petak"]
    assert p[str(dekat)]["basah"] and not p.get(str(jauh), {}).get("basah")


def test_kandang_berproduksi_selama_kenyang(kon, pemain):
    permainan.ubah_koin(kon, pemain, 1000, "uji")
    setel_xp(kon, pemain, permainan.ambang(3))
    permainan.beli(kon, pemain, "kandang_ayam", 1)
    permainan.beli(kon, pemain, "pakan", 2)
    bid = permainan.pasang(kon, pemain, {"barang": "kandang_ayam", "x": 64, "y": 64})["rumah"]["benda"][-1]["id"]
    with pytest.raises(Ditolak):
        permainan.beli_hewan(kon, pemain, bid, "sapi")           # sapi bukan penghuni kandang ayam
    permainan.beli_hewan(kon, pemain, bid, "ayam")
    time.sleep(konfig.JAM_KEBUN * 13)
    with pytest.raises(Ditolak):
        permainan.ambil_produk(kon, pemain, bid)                 # lapar: tak bertelur
    permainan.beri_pakan(kon, pemain, bid)
    assert permainan.inventori(kon, pemain)["pakan"] == 1
    time.sleep(konfig.JAM_KEBUN * 13)
    d = permainan.ambil_produk(kon, pemain, bid)
    assert d["inventori"]["telur"] == 1
    with pytest.raises(Ditolak):
        permainan.angkat(kon, pemain, {"id": bid})               # kandang berisi tak bisa diangkat


def test_misi_harian_membayar_sekali(kon, pemain):
    m = permainan.potret_misi(kon, pemain)["misi"]
    assert len(m) == 3
    kode, sasaran, hadiah = m[0]["kode"], m[0]["sasaran"], m[0]["hadiah"]
    awal = permainan.saldo(kon, pemain)
    cair = permainan.catat_aksi(kon, pemain, kode, sasaran)
    assert cair and cair[0]["koin"] == hadiah
    assert permainan.catat_aksi(kon, pemain, kode, sasaran) == []
    assert permainan.saldo(kon, pemain) == awal + hadiah
    for x in m[1:]:
        permainan.catat_aksi(kon, pemain, x["kode"], x["sasaran"])
    assert permainan.potret_misi(kon, pemain)["bonus_lunas"]
    naik = sum(permainan.HADIAH_NAIK * lv for lv in range(2, permainan.level(kon, pemain) + 1))
    assert permainan.xp_kini(kon, pemain) >= 3 * permainan.XP["misi"]
    assert permainan.saldo(kon, pemain) == awal + sum(x["hadiah"] for x in m) + permainan.BONUS_MISI + naik


def test_bonus_hadir_sekali_sehari(kon, pemain):
    assert permainan.bonus_masuk(kon, pemain) == permainan.BONUS_MASUK
    assert permainan.bonus_masuk(kon, pemain) == 0


def test_rumah_pemain_lain_terpisah(kon, pemain):
    from app import akun
    lain = akun.buat_pemakai(kon, "sari", "sandi-panjang-2")
    permainan.buat_karakter(kon, lain, "Sari", {})
    bid = _petak(kon, pemain)
    with pytest.raises(Ditolak):
        permainan.angkat(kon, lain, {"id": bid})
    assert len(permainan.baca_rumah(kon, lain)["benda"]) == 0


# ---- 0.22.0 (yosi 9 Okt malam)

def test_hewan_kenyang_selama_tiga_kali_produksi(kon, pemain):
    assert permainan.PRODUK_PER_PAKAN == 3 and permainan.kenyang_jam("ayam") == 36 and permainan.kenyang_jam("sapi") == 72
    permainan.ubah_koin(kon, pemain, 2000, "uji")
    setel_xp(kon, pemain, permainan.ambang(3))
    permainan.beli(kon, pemain, "kandang_ayam", 1)
    bid = permainan.pasang(kon, pemain, {"barang": "kandang_ayam", "x": 96, "y": 96})["rumah"]["benda"][-1]["id"]
    permainan.beli_hewan(kon, pemain, bid, "ayam")
    permainan.beli(kon, pemain, "pakan", 2)
    permainan.beri_pakan(kon, pemain, bid)
    with pytest.raises(Ditolak):
        permainan.beri_pakan(kon, pemain, bid)                          # masih kenyang: pakan tidak terpakai
    assert permainan.inventori(kon, pemain)["pakan"] == 1
    d = permainan.baca_rumah(kon, pemain)
    h = d["kandang"][str(bid)]["hewan"][0]
    kenyang = h["kenyang"]
    assert abs((kenyang - h["cek"]) - 36 * konfig.JAM_KEBUN) < 1          # 36 jam kebun = tiga telur
    # Lompat ke sesudah masa kenyang habis: tepat tiga telur, lalu lapar dan berhenti bertelur.
    permainan._maju_kandang(d, kenyang + 50 * konfig.JAM_KEBUN)
    assert d["kandang"][str(bid)]["hewan"][0]["siap"] == 3


def test_kotak_kiriman_menjual_hanya_yang_dipilih(kon, pemain):
    permainan.tambah_barang(kon, pemain, "panen:sawi", 5)
    permainan.tambah_barang(kon, pemain, "telur", 3)
    koin = permainan.saldo(kon, pemain)
    h = permainan.jual_pilihan(kon, pemain, {"panen:sawi": 2, "telur": 3})
    assert h["dapat"] == 2 * permainan.TANAMAN["sawi"][3] + 3 * permainan.PRODUK["telur"][1]
    assert permainan.saldo(kon, pemain) - koin >= h["dapat"]                # bisa lebih: misi harian "jual hasil" ikut terbayar
    assert h["inventori"]["panen:sawi"] == 3 and "telur" not in h["inventori"]
    koin = permainan.saldo(kon, pemain)
    for buruk in ({}, None, {"panen:sawi": 99}, {"panen:sawi": 0}, {"panen:sawi": True}, {"kebun_petak": 1}, {"pakan": 1}, {"panen:sawi": 1, "senjata:sapu": 1}):
        with pytest.raises(Ditolak):
            permainan.jual_pilihan(kon, pemain, buruk)
    assert permainan.saldo(kon, pemain) == koin and permainan.inventori(kon, pemain)["panen:sawi"] == 3      # yang ditolak tidak menjual apa pun


def test_naik_level_menaikkan_batas_dan_isi_stamina(kon, pemain):
    permainan.ubah_stamina(kon, pemain, -40)
    sebelum, maks = permainan.stamina(kon, pemain), permainan.stamina_maks(kon, pemain)
    assert permainan.tambah_xp(kon, pemain, permainan.ambang(3)) == 3
    assert permainan.stamina_maks(kon, pemain) == maks + 2 * permainan.STAMINA_PER_LEVEL
    assert permainan.stamina(kon, pemain) == sebelum + 2 * permainan.STAMINA_PER_LEVEL
    assert permainan.ambang(4) - permainan.ambang(3) > permainan.ambang(3) - permainan.ambang(2)        # EXP per level makin besar


def test_perabot_dicabut_kembali_ke_inventory_dan_laku_separuh_harga(kon, pemain):
    permainan.ubah_koin(kon, pemain, 500, "uji")
    barang = "luar_bangku_taman"
    harga = permainan.harga_beli(barang)
    h = permainan.rumah_simpan(kon, pemain, {"lantai": {}, "tembok": {}, "ruang": [], "benda": [{"n": barang, "x": 64, "y": 64}]})
    punya = h["inventori"].get(barang, 0)
    h = permainan.rumah_simpan(kon, pemain, {"lantai": {}, "tembok": {}, "ruang": [], "benda": []})          # dihapus di Edit Rumah
    assert h["inventori"][barang] == punya + 1
    koin = permainan.saldo(kon, pemain)
    assert permainan.jual(kon, pemain, barang, 1)["dapat"] == max(1, int(harga * 0.5)) == permainan.saldo(kon, pemain) - koin
