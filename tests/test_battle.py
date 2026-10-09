"""0.19.0 — battle: zombie milik server, Health, pukulan, hadiah, dan pingsan (docs/KONSEP-battle.md)."""
import asyncio

import pytest

from app import atur, battle, permainan
from app.dunia import Dunia


@pytest.fixture(autouse=True)
def _atur_bersih():
    atur.lupa()
    yield
    atur.lupa()


def _dunia(kon, uid, adegan="kantor", x=320.0, y=688.0):       # baris 44 peta Default: lapang, tanpa dinding
    dunia, terkirim = Dunia(kon), []

    async def tangkap(p, pesan):
        terkirim.append((p["id"], pesan))

    dunia._kirim = tangkap
    dunia.pemain[uid] = {"id": uid, "nama": "Budi", "adegan": adegan, "x": x, "y": y, "level": permainan.level(kon, uid), "pose": ""}
    return dunia, dunia.battle, dunia.pemain[uid], terkirim


def _jenis(terkirim, t):
    return [m for _, m in terkirim if m.get("t") == t]


def jalankan(coro):
    return asyncio.run(coro)


def test_pengaturan_zombie_disaring(kon):
    d = atur.baca(kon)
    assert d["zombie_aktif"] is False and d["zombie_menit"] == 15 and d["zombie_denda_xp"] == 150
    d = atur.simpan(kon, {"zombie_aktif": 1, "zombie_acak": True, "zombie_menit": 5, "zombie_jumlah": 3})
    assert d["zombie_aktif"] is True and d["zombie_acak"] is True and d["zombie_menit"] == 5 and atur.publik(d)["zombie_aktif"] is True
    for buruk in ({"zombie_menit": 0}, {"zombie_jumlah": 13}, {"zombie_hp": 10}, {"zombie_denda_xp": -1}, {"zombie_hadiah": "banyak"}):
        with pytest.raises(atur.AturDitolak):
            atur.simpan(kon, buruk)


def test_zombie_hanya_datang_bila_menyala_dan_ada_pemain_di_kantor(kon, pemain):
    dunia, b, p, terkirim = _dunia(kon, pemain)
    jalankan(b.langkah(1000.0))
    assert not b.zombie and b.berikut is None                              # sakelar utama mati
    atur.simpan(kon, {"zombie_aktif": True, "zombie_menit": 1, "zombie_jumlah": 3})
    jalankan(b.langkah(1000.0))
    assert not b.zombie and b.berikut == 1060.0                            # dijadwalkan semenit lagi
    jalankan(b.langkah(1059.0))
    assert not b.zombie
    jalankan(b.langkah(1061.0))
    assert len(b.zombie) == 3 and _jenis(terkirim, "gelombang")[0] == {"t": "gelombang", "mulai": True, "jumlah": 3}
    assert all(0 <= z["x"] < 45 * 16 and 0 <= z["y"] < 46 * 16 and b._bebas(z["x"], z["y"]) for z in b.zombie.values())
    assert all(((z["x"] - p["x"]) ** 2 + (z["y"] - p["y"]) ** 2) ** 0.5 >= 60 for z in b.zombie.values())   # tidak muncul menempel pemain
    assert len(_jenis(terkirim, "zombie")[-1]["z"]) == 3
    # Pemain pulang: rumah selalu aman, zombie pergi.
    p["adegan"] = f"rumah:{pemain}"
    jalankan(b.langkah(1062.0))
    assert not b.zombie and b.berikut is None and _jenis(terkirim, "zombie")[-1] == {"t": "zombie", "z": [], "k": []}


def test_admin_memanggil_gelombang_walau_sakelar_mati(kon, pemain):
    dunia, b, p, terkirim = _dunia(kon, pemain)
    b.panggil()
    jalankan(b.langkah(50.0))
    assert len(b.zombie) == 3 and not b.paksa                              # otomatis: 2 + jumlah pemain
    jalankan(b.langkah(50.0 + battle.GELOMBANG_MAKS + 1))
    assert not b.zombie and _jenis(terkirim, "gelombang")[-1].get("kabur")  # gelombang yang tak selesai pergi sendiri


def test_zombie_mengejar_menggigit_dan_pingsan_memotong_exp(kon, pemain):
    kon.execute("UPDATE karakter SET xp = ? WHERE pemakai_id = ?", (permainan.ambang(3) + 20, pemain))
    dunia, b, p, terkirim = _dunia(kon, pemain)
    assert p["level"] == 3
    maks = b.hp_maks(p)
    assert maks == permainan.STAMINA_DASAR + 2 * permainan.STAMINA_PER_LEVEL and b.hp_kini(p) == maks
    b.zombie[1] = {"id": 1, "jenis": "biasa", "x": p["x"] + 80, "y": p["y"], "hp": 6, "maks": 6, "gigit": 0.0, "pemukul": set()}
    b.mulai, kini = 10.0, 10.0
    for _ in range(40):                                                    # 10 detik: 28 px/dtk menempuh 80 px
        kini += battle.DETAK
        jalankan(b.langkah(kini))
        if _jenis(terkirim, "hp"):
            break
    z = b.zombie[1]
    assert ((z["x"] - p["x"]) ** 2 + (z["y"] - p["y"]) ** 2) ** 0.5 <= battle.JARAK_GIGIT
    gigit = _jenis(terkirim, "hp")[0]
    assert gigit == {"t": "hp", "hp": maks - battle.JENIS["biasa"][2], "maks": maks, "gigit": True}
    # Sedang duduk bekerja di Komputer: tidak diincar.
    p["pose"] = "main_a"
    sebelum = b.hp_kini(p)
    for _ in range(12):
        kini += battle.DETAK
        jalankan(b.langkah(kini))
    assert b.hp_kini(p) == sebelum
    p["pose"] = ""
    # Digigit sampai habis: pingsan, EXP dipotong denda, level turun dari 3 ke 2.
    atur.simpan(kon, {"zombie_denda_xp": 400})
    b.hp[pemain] = 5
    kini += battle.JEDA_GIGIT + 1
    jalankan(b.langkah(kini))
    ps = _jenis(terkirim, "pingsan")[0]
    assert ps["xp_hilang"] == 400 and ps["turun"] is True and ps["level"]["level"] == 2 and p["level"] == 2
    assert permainan.xp_kini(kon, pemain) == permainan.ambang(3) + 20 - 400
    assert ps["hp"] == b.hp_maks(p) // 2 and b.kebal[pemain] > kini
    kini += 1.0
    hp = b.hp_kini(p)
    jalankan(b.langkah(kini))                                              # baru pingsan: zombie tidak menggigit lagi
    assert b.hp_kini(p) == hp
    # EXP tidak bisa minus.
    kon.execute("UPDATE karakter SET xp = 30 WHERE pemakai_id = ?", (pemain,))
    jalankan(b.pingsan(p, kini))
    assert permainan.xp_kini(kon, pemain) == 0 and _jenis(terkirim, "pingsan")[-1]["xp_hilang"] == 30


def test_pukul_jangkauan_jeda_hadiah_dan_koin_jatuh(kon, pemain):
    dunia, b, p, terkirim = _dunia(kon, pemain)
    b.acak.seed(7)
    b.zombie[1] = {"id": 1, "jenis": "biasa", "x": p["x"] + 60, "y": p["y"], "hp": 3, "maks": 3, "gigit": 1e12, "pemukul": set()}
    b.mulai = 100.0
    jalankan(b.pukul(p, {}, 100.0))
    assert b.zombie[1]["hp"] == 3 and _jenis(terkirim, "ayun")[0]["kena"] is None      # terlalu jauh untuk tangan kosong
    b.zombie[1]["x"] = p["x"] + 20
    jalankan(b.pukul(p, {}, 100.1))
    assert b.zombie[1]["hp"] == 3                                          # masih dalam jeda pukulan
    jalankan(b.pukul(p, {"senjata": "tongkat_bisbol"}, 100.6))
    assert b.zombie[1]["hp"] == 2                                          # senjata yang tidak dimiliki = tangan kosong
    assert _jenis(terkirim, "zombie_kena")[0] == {"t": "zombie_kena", "id": 1, "dmg": 1, "hp": 2}
    xp, koin = permainan.xp_kini(kon, pemain), permainan.saldo(kon, pemain)
    permainan.tambah_barang(kon, pemain, "senjata:tongkat_bisbol")
    jalankan(b.pukul(p, {"senjata": "tongkat_bisbol"}, 101.5))
    assert not b.zombie
    mati = _jenis(terkirim, "zombie_mati")[0]
    assert mati["id"] == 1 and mati["dmg"] == 5 and mati["koin"] and _jenis(terkirim, "gelombang")[-1] == {"t": "gelombang", "selesai": True}
    assert permainan.xp_kini(kon, pemain) == xp + battle.JENIS["biasa"][3]
    jatuh = next(iter(b.koin.values()))
    assert battle.JENIS["biasa"][4] <= jatuh["n"] <= battle.JENIS["biasa"][5] and permainan.saldo(kon, pemain) == koin
    # Koin diambil dengan menginjaknya.
    p["x"], p["y"] = jatuh["x"] - 8, jatuh["y"] - 14
    jalankan(b.langkah(102.0))
    assert not b.koin and permainan.saldo(kon, pemain) == koin + jatuh["n"]
    assert _jenis(terkirim, "koin_ambil")[0]["oleh"] == pemain and _jenis(terkirim, "level")[-1]["saldo"] == koin + jatuh["n"]
    # Dari rumah tidak bisa memukul.
    p["adegan"] = f"rumah:{pemain}"
    n = len(_jenis(terkirim, "ayun"))
    jalankan(b.pukul(p, {}, 200.0))
    assert len(_jenis(terkirim, "ayun")) == n


def test_health_pulih_bila_tidak_digigit(kon, pemain):
    dunia, b, p, terkirim = _dunia(kon, pemain, adegan=f"rumah:{pemain}")
    b.hp[pemain], b.luka[pemain] = 40.0, 100.0
    jalankan(b.langkah(102.0, 1.0))
    assert b.hp[pemain] == 40.0                                            # baru saja digigit: belum pulih
    jalankan(b.langkah(106.0, 60.0))
    assert b.hp[pemain] == 45.0 and _jenis(terkirim, "hp")[-1]["hp"] == 45  # di rumah: 5 Health per menit (kata yosi)
    p["adegan"] = "kantor"
    jalankan(b.langkah(200.0, 60.0))
    assert b.hp[pemain] == 47.0                                            # di kantor lebih pelan: 2 per menit
    p["adegan"] = f"rumah:{pemain}"
    b.hp[pemain] = b.hp_maks(p) - 1
    jalankan(b.langkah(300.0, 60.0))
    assert pemain not in b.hp and _jenis(terkirim, "hp")[-1]["hp"] == b.hp_maks(p)


def test_hadiah_naik_level_hanya_sekali_walau_level_pernah_turun(kon, pemain):
    awal = permainan.saldo(kon, pemain)
    assert permainan.tambah_xp(kon, pemain, permainan.ambang(3)) == 3
    assert permainan.saldo(kon, pemain) == awal + permainan.HADIAH_NAIK * (2 + 3)
    kon.execute("UPDATE karakter SET xp = ? WHERE pemakai_id = ?", (permainan.ambang(2), pemain))      # pingsan: turun ke level 2
    assert permainan.tambah_xp(kon, pemain, permainan.ambang(3)) == 3                                  # naik lagi ke 3: tidak dibayar ulang
    assert permainan.saldo(kon, pemain) == awal + permainan.HADIAH_NAIK * (2 + 3)
    assert permainan.tambah_xp(kon, pemain, permainan.ambang(4) - permainan.xp_kini(kon, pemain)) == 4  # level 4 belum pernah dicapai: dibayar
    assert permainan.saldo(kon, pemain) == awal + permainan.HADIAH_NAIK * (2 + 3 + 4)


def test_zombie_memutari_tembok(kon, pemain):
    """Tembok melintang di antara zombie dan pemain: zombie tidak tersangkut, ia memutar lewat ujung tembok."""
    peta = permainan.peta_dasar(kon, {"dasar": "kosong", "lebar": 30, "tinggi": 30, "lantai_dasar": "lantai_luar_rumput", "kosongkan": True})
    permainan.peta_simpan(kon, {"rev": peta["rev"], "lantai": {}, "benda": [], "tembok": {f"{gx},15": "#8b9bb4" for gx in range(5, 25)}})
    dunia, b, p, terkirim = _dunia(kon, pemain, x=15 * 16.0, y=20 * 16.0)
    assert not b._bebas(10 * 16, 15 * 16 - 16) and b._bebas(2 * 16, 15 * 16 - 16)
    b.zombie[1] = {"id": 1, "jenis": "gesit", "x": 15 * 16.0, "y": 8 * 16.0, "hp": 4, "maks": 4, "gigit": 1e12, "pemukul": set()}
    b.mulai, kini, jalur = 0.0, 0.0, []
    for _ in range(200):
        kini += battle.DETAK
        jalankan(b.langkah(kini))
        z = b.zombie[1]
        jalur.append(b._ubin(z["x"], z["y"]))
        assert b._bebas(z["x"], z["y"])                                    # tidak pernah berdiri di dalam tembok
        if ((z["x"] - p["x"]) ** 2 + (z["y"] - p["y"]) ** 2) ** 0.5 <= battle.JARAK_GIGIT:
            break
    assert ((z["x"] - p["x"]) ** 2 + (z["y"] - p["y"]) ** 2) ** 0.5 <= battle.JARAK_GIGIT, jalur[-5:]
    assert any(gx < 5 or gx > 24 for gx, gy in jalur if gy == 15)          # melewati baris tembok lewat ujungnya


def test_senjata_dijual_berlevel_dan_cukup_satu(kon, pemain):
    assert permainan.harga_beli("senjata:sapu") == 150 and permainan.harga_beli("senjata:") is None and permainan.harga_beli("senjata:bazoka") is None
    assert permainan.nama_barang("senjata:kunci_inggris") == "Kunci inggris" and permainan.harga_jual("senjata:sapu") is None
    assert permainan.level_barang("senjata:tongkat_bisbol") == 5 and battle.SENJATA is permainan.SENJATA
    damage = [v[1] for k, v in permainan.SENJATA.items()]
    assert min(damage) == permainan.SENJATA[""][1] == 1                    # tangan kosong paling kecil
    permainan.ubah_koin(kon, pemain, 2000, "uji")
    koin = permainan.saldo(kon, pemain)
    assert permainan.beli(kon, pemain, "senjata:sapu", 1)["inventori"]["senjata:sapu"] == 1 and permainan.saldo(kon, pemain) == koin - 150
    for jumlah in (1, 2):
        with pytest.raises(permainan.Ditolak, match="sudah kamu punya"):
            permainan.beli(kon, pemain, "senjata:sapu", jumlah)
    with pytest.raises(permainan.Ditolak, match="level 5"):
        permainan.beli(kon, pemain, "senjata:tongkat_bisbol", 1)
    assert permainan.potret_toko()["senjata"]["sapu"] == {"nama": "Sapu", "damage": 2, "jeda": 0.5, "jangkau": 26, "harga": 150, "level": 1} if hasattr(permainan, "potret_toko") else True


def test_bang_jago_ditambahkan_sekali(kon):
    assert atur.pastikan_penjual_battle(kon) is True
    npc = atur.baca(kon)["npc"]
    assert [n["nama"] for n in npc if n["peran"] == "battle"] == ["Bang Jago"]
    atur.simpan(kon, {"npc": [n for n in npc if n["peran"] != "battle"]})      # admin menghapusnya: tidak muncul lagi
    assert atur.pastikan_penjual_battle(kon) is False and not [n for n in atur.baca(kon)["npc"] if n["peran"] == "battle"]


def test_barang_yang_dipegang_disiarkan_ke_rekan(kon, pemain):
    dunia, b, p, terkirim = _dunia(kon, pemain)
    dunia.pemain[99] = {"id": 99, "nama": "Rekan", "adegan": "kantor", "x": 0.0, "y": 0.0, "level": 1, "pose": ""}
    p.update(tampilan={}, arah="bawah", jalan=False)
    jalankan(dunia.terima(p, {"t": "pegang", "barang": "senjata:sapu"}))
    assert p["pegang"] == "senjata:sapu" and dunia._publik(p)["pegang"] == "senjata:sapu"
    assert [(uid, m) for uid, m in terkirim if m["t"] == "pegang"] == [(99, {"t": "pegang", "id": pemain, "barang": "senjata:sapu"})]
    jalankan(dunia.terima(p, {"t": "pegang", "barang": "senjata:sapu"}))                    # tidak berubah: tidak disiarkan lagi
    assert len(_jenis(terkirim, "pegang")) == 1
    for buruk in ("<script>", "A" * 80, 12, None):
        jalankan(dunia.terima(p, {"t": "pegang", "barang": buruk}))
        assert p["pegang"] == ""
    assert _jenis(terkirim, "pegang")[-1]["barang"] == ""


# ---- 0.24.0: peti harta acak dan cuaca nyata

def test_peti_harta_muncul_dibuka_dan_berisi_hadiah(kon, pemain):
    dunia, b, p, terkirim = _dunia(kon, pemain)
    b.acak.seed(3)
    atur.simpan(kon, {"harta_menit": 2})
    jalankan(b.langkah(1000.0))
    assert not b.harta and 1060.0 <= b.harta_berikut <= 1180.0             # dijadwalkan acak: separuh sampai satu setengah kali
    jalankan(b.langkah(b.harta_berikut + 1))
    assert len(b.harta) == 1 and _jenis(terkirim, "harta")[-1]["daftar"] == b.potret_harta()
    h = next(iter(b.harta.values()))
    assert b._bebas(h["x"], h["y"] - 4)
    koin, inv = permainan.saldo(kon, pemain), dict(permainan.inventori(kon, pemain))
    jalankan(b.buka_harta(p, h["id"]))                                     # terlalu jauh: tidak terbuka
    assert len(b.harta) == 1
    for buruk in ("x", None, True, 9999):
        jalankan(b.buka_harta(p, buruk))
    p["x"], p["y"] = h["x"] + 6, h["y"] - 6
    jalankan(b.buka_harta(p, h["id"]))
    dapat = _jenis(terkirim, "harta_dapat")[0]
    assert not b.harta and _jenis(terkirim, "harta")[-1]["dibuka"] == h["id"]
    if dapat["barang"]:
        assert permainan.inventori(kon, pemain)[dapat["barang"]] == inv.get(dapat["barang"], 0) + dapat["jumlah"] and dapat["nama"]
    else:
        assert 20 <= dapat["koin"] <= 80 and permainan.saldo(kon, pemain) == koin + dapat["koin"]
    jalankan(b.buka_harta(p, h["id"]))                                     # sudah dibuka: tidak dua kali
    assert len(_jenis(terkirim, "harta_dapat")) == 1
    # Tiga jenis isi semuanya bisa keluar; perabot hadiah selalu yang murah dan dijual toko.
    jenis = set()
    for i in range(60):
        b.acak.seed(i)
        isi = b._isi_harta(pemain)
        jenis.add("koin" if not isi["barang"] else "perabot" if isi["barang"] in permainan.katalog()["barang"] else "makanan")
        if isi["barang"] in permainan.katalog()["barang"]:
            assert 15 <= permainan.harga_beli(isi["barang"]) <= 150
    assert jenis == {"koin", "makanan", "perabot"}


def test_peti_harta_dibatasi_kedaluwarsa_dan_bisa_dimatikan(kon, pemain):
    dunia, b, p, terkirim = _dunia(kon, pemain)
    atur.simpan(kon, {"harta_menit": 1})
    kini = 0.0
    for _ in range(12):
        kini += 120.0
        jalankan(b.langkah(kini))
    assert len(b.harta) == battle.HARTA_MAKS                               # tidak menumpuk
    jalankan(b.langkah(kini + battle.HARTA_UMUR + 200))
    assert len(b.harta) <= 1                                               # yang lama hilang sendiri
    atur.simpan(kon, {"harta_menit": 0})
    b.harta.clear()
    for _ in range(5):
        kini += 5000.0
        jalankan(b.langkah(kini))
    assert not b.harta and b.harta_berikut is None
    p["adegan"] = f"rumah:{pemain}"
    atur.simpan(kon, {"harta_menit": 1})
    jalankan(b.langkah(kini + 9000))
    assert not b.harta                                                     # tak ada pemain di peta utama: tidak muncul


def test_cuaca_pemetaan_kode_dan_keadaan():
    from app import cuaca
    assert [cuaca.jenis_dari(k) for k in (0, 1, 2, 3, 45, 53, 61, 80, 65, 75, 95, 99, 1234)] == ["cerah", "cerah", "berawan", "mendung", "kabut", "gerimis", "hujan", "hujan", "hujan_lebat", "hujan_lebat", "badai", "badai", "berawan"]
    c = cuaca.urai({"current": {"weather_code": 63, "temperature_2m": 26.4, "precipitation": 1.2, "cloud_cover": 90}}, 1000.0)
    assert c == {"jenis": "hujan", "nama": "Hujan", "kode": 63, "suhu": 26.4, "hujan_mm": 1.2, "awan": 90, "pada": 1000.0}
    assert cuaca.urai({}, 5.0)["jenis"] == "berawan"
    assert cuaca.AKTIF is False and cuaca.tarik() is None and cuaca.keadaan() is None      # uji tidak menyentuh internet
    cuaca._TERAKHIR.update(c)
    try:
        assert cuaca.keadaan(1000.0 + 60)["basi"] is False and cuaca.keadaan(1000.0 + 3 * cuaca.JEDA + 1)["basi"] is True
    finally:
        cuaca._TERAKHIR.clear()
