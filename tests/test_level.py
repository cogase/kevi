"""0.2.0 — level & XP, interaksi berhadiah, pengaturan admin."""
import time

import pytest

from app import atur, interaksi, permainan
from app.permainan import Ditolak


@pytest.fixture(autouse=True)
def _atur_bersih():
    atur.lupa()
    yield
    atur.lupa()


def test_ambang_level():
    assert [permainan.ambang(n) for n in (1, 2, 3, 4, 5)] == [0, 300, 900, 1800, 3000]
    assert permainan.level_dari(0) == 1 and permainan.level_dari(299) == 1 and permainan.level_dari(300) == 2
    assert permainan.level_dari(10 ** 9) == permainan.LEVEL_MAKS


def test_naik_level_dibayar_per_level(kon, pemain):
    awal = permainan.saldo(kon, pemain)
    assert permainan.tambah_xp(kon, pemain, 950) == 3                      # melompati level 2 dan 3 sekaligus
    assert permainan.saldo(kon, pemain) == awal + permainan.HADIAH_NAIK * (2 + 3)
    lv = permainan.potret_level(kon, pemain)
    assert lv == {"xp": 950, "level": 3, "dasar": 900, "lanjut": 1800, "stamina": 100 + 2 * permainan.STAMINA_PER_LEVEL}


def test_xp_kegiatan_punya_jatah_harian(kon, pemain):
    dapat = [permainan.xp_kegiatan(kon, pemain, "catat") for _ in range(permainan.XP_JATAH["catat"] + 3)]
    assert dapat.count(permainan.XP["catat"]) == permainan.XP_JATAH["catat"] and dapat[-1] == 0


def test_kegiatan_kebun_memberi_xp(kon, pemain):
    bid = permainan.pasang(kon, pemain, {"barang": "kebun_petak", "x": 32, "y": 32})["rumah"]["benda"][-1]["id"]
    permainan.tanam(kon, pemain, bid, "sawi")
    permainan.siram(kon, pemain, bid)
    assert permainan.xp_kini(kon, pemain) == permainan.XP["hias"] + permainan.XP["tanam"] + permainan.XP["siram"]


def test_interaksi_terkunci_level(kon, pemain):
    for fn in (lambda: interaksi.kuis_ambil(kon, pemain), lambda: interaksi.arcade_mulai(kon, pemain),
               lambda: interaksi.kirim_koin(kon, pemain, 99, 5)):
        with pytest.raises(Ditolak, match="level"):
            fn()


def test_misi_trace_tak_muncul_sebelum_terbuka(kon, pemain):
    for hari in ("2026-01-0%d" % i for i in range(1, 10)):
        assert "trace" not in permainan._pilih_misi(pemain, hari, 1)
    assert any("trace" in permainan._pilih_misi(pemain, "2026-01-0%d" % i, 2) for i in range(1, 10))


def test_kuis_benar_dibayar_sampai_jatah_habis(kon, pemain):
    permainan.tambah_xp(kon, pemain, 300)
    maks = atur.baca(kon)["kuis_per_hari"]
    dibayar = 0
    for _ in range(maks + 2):
        soal = interaksi.kuis_ambil(kon, pemain)
        i, urut = interaksi._kuis[pemain]
        benar = urut.index(interaksi.KUIS[i][2])
        assert soal["pilihan"][benar] == interaksi.KUIS[i][1][interaksi.KUIS[i][2]]
        h = interaksi.kuis_jawab(kon, pemain, benar)
        assert h["benar"]
        dibayar += 1 if h["koin_dapat"] else 0
    assert dibayar == maks
    with pytest.raises(Ditolak):
        interaksi.kuis_jawab(kon, pemain, 0)                               # soal hanya bisa dijawab sekali


def test_kuis_salah_tak_dibayar(kon, pemain):
    permainan.tambah_xp(kon, pemain, 300)
    koin = permainan.saldo(kon, pemain)
    interaksi.kuis_ambil(kon, pemain)
    i, urut = interaksi._kuis[pemain]
    salah = next(j for j in range(4) if urut[j] != interaksi.KUIS[i][2])
    h = interaksi.kuis_jawab(kon, pemain, salah)
    assert not h["benar"] and h["jawaban"] and permainan.saldo(kon, pemain) == koin


def test_arcade_diukur_jam_server(kon, pemain, monkeypatch):
    permainan.tambah_xp(kon, pemain, 900)
    token = interaksi.arcade_mulai(kon, pemain)["token"]
    with pytest.raises(Ditolak, match="cepat"):
        interaksi.arcade_selesai(kon, pemain, token)                       # selesai seketika = tak dipercaya
    token = interaksi.arcade_mulai(kon, pemain)["token"]
    with pytest.raises(Ditolak):
        interaksi.arcade_selesai(kon, pemain, "token-palsu")
    token = interaksi.arcade_mulai(kon, pemain)["token"]
    asli = time.time
    monkeypatch.setattr(time, "time", lambda: asli() + 20)                 # 20 detik kemudian menurut server
    koin = permainan.saldo(kon, pemain)
    h = interaksi.arcade_selesai(kon, pemain, token)
    assert h["koin_dapat"] == interaksi.ARCADE_TINGKAT[0][1] and permainan.saldo(kon, pemain) == koin + h["koin_dapat"]


def test_kirim_koin_dibatasi(kon, pemain):
    from app import akun
    lain = akun.buat_pemakai(kon, "sari", "sandi-panjang-2")
    permainan.buat_karakter(kon, lain, "Sari", {})
    permainan.tambah_xp(kon, pemain, 900)
    koin, koin_lain = permainan.saldo(kon, pemain), permainan.saldo(kon, lain)
    assert interaksi.kirim_koin(kon, pemain, lain, 100)["terkirim"] == 100
    assert permainan.saldo(kon, pemain) == koin - 100 and permainan.saldo(kon, lain) == koin_lain + 100
    interaksi.kirim_koin(kon, pemain, lain, 100)
    for buruk in (lambda: interaksi.kirim_koin(kon, pemain, lain, 1),           # batas harian 200 habis
                  lambda: interaksi.kirim_koin(kon, pemain, pemain, 5), lambda: interaksi.kirim_koin(kon, pemain, lain, -5),
                  lambda: interaksi.kirim_koin(kon, pemain, lain, 101), lambda: interaksi.kirim_koin(kon, pemain, 999, 5)):
        with pytest.raises(Ditolak):
            buruk()


def test_kopi_memotong_koin(kon, pemain):
    koin = permainan.saldo(kon, pemain)
    assert interaksi.kopi(kon, pemain)["kopi"] > 0 and permainan.saldo(kon, pemain) == koin - interaksi.HARGA_KOPI


def test_pengaturan_disaring(kon):
    d = atur.simpan(kon, {"laju_jalan": 120, "bookmark": [{"nama": "Wiki", "url": "https://wiki.example/"}], "pengumuman": "  Rapat   jam 9  "})
    assert d["laju_jalan"] == 120 and d["pengumuman"] == "Rapat jam 9" and d["bookmark"][0]["url"] == "https://wiki.example/"
    atur.lupa()
    assert atur.baca(kon)["laju_jalan"] == 120                              # bertahan di DB
    for buruk in ({"laju_jalan": 9999}, {"laju": "cepat"}, {"bookmark": [{"url": "javascript:alert(1)"}]}, {"tidak_ada": 1},
                  {"npc": [{"id": "A B", "nama": "x", "x": 1, "y": 1}]}, {"npc": [{"id": "a", "nama": "", "x": 1, "y": 1}]},
                  {"titik": [{"id": "t1", "jenis": "bom", "x": 1, "y": 1}]}, {"titik": [{"id": "t1", "jenis": "kuis", "x": "a", "y": 1}]}):
        with pytest.raises(atur.AturDitolak):
            atur.simpan(kon, buruk)
    assert atur.baca(kon)["laju_jalan"] == 120                              # yang gagal tak mengubah apa pun


def test_npc_dan_titik_tersimpan_bersih(kon):
    d = atur.simpan(kon, {"npc": [{"id": "ayu", "nama": " Ayu ", "x": 99999, "y": -5, "peran": "ngawur", "tampilan": {"baju": "#123456", "kepala": "mahkota"},
                                   "ucap": ["Hai", "", "x" * 400]}], "titik": [{"id": "t1", "jenis": "arcade", "x": 100.7, "y": 200, "label": "Main"}]})
    n = d["npc"][0]
    assert n["nama"] == "Ayu" and n["peran"] == "obrol" and n["x"] == atur.PETA_W - 16 and n["y"] == 0
    assert n["tampilan"]["baju"] == "#123456" and n["tampilan"]["kepala"] == "" and len(n["ucap"]) == 2 and len(n["ucap"][1]) == 160
    assert d["titik"] == [{"id": "t1", "jenis": "arcade", "x": 100, "y": 200, "label": "Main"}]


def test_laju_kebun_berlaku_seketika(kon):
    from app import konfig
    asli = konfig.LAJU
    try:
        atur.simpan(kon, {"laju": 120})
        assert konfig.JAM_KEBUN == 30
    finally:
        atur.simpan(kon, {"laju": asli})
