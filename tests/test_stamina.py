"""0.7.0 — stamina = lapar: disimpan di server, turun karena kerja dan lama daring, naik karena makan."""
import asyncio

from app import permainan
from app.dunia import Dunia

from .conftest import setel_xp


def test_karakter_lama_dianggap_kenyang(kon, pemain):
    assert kon.execute("SELECT stamina FROM karakter WHERE pemakai_id = ?", (pemain,)).fetchone()["stamina"] is None
    assert permainan.potret_stamina(kon, pemain) == {"nilai": 100.0, "maks": 100}
    setel_xp(kon, pemain, 300)                                   # level 2: batasnya ikut naik
    assert permainan.stamina_maks(kon, pemain) == 106 and permainan.stamina(kon, pemain) == 106


def test_kerja_membuat_lapar_dan_makan_mengenyangkan(kon, pemain):
    permainan.xp_kegiatan(kon, pemain, "tanam")
    assert permainan.stamina(kon, pemain) == 100 - permainan.LAPAR_AKSI["tanam"]
    permainan.xp_kegiatan(kon, pemain, "terminal")
    permainan.xp_kegiatan(kon, pemain, "catat")                   # mencatat tidak membuat lapar
    assert permainan.stamina(kon, pemain) == 100 - permainan.LAPAR_AKSI["tanam"] - permainan.LAPAR_AKSI["terminal"]
    permainan.ubah_stamina(kon, pemain, -90)
    permainan.tambah_barang(kon, pemain, "makan:roti")
    d = permainan.makan(kon, pemain, "makan:roti")
    assert d["kenyang"] == 25 and permainan.stamina(kon, pemain) == 8.5 + 25
    permainan.ubah_stamina(kon, pemain, 10 ** 6)
    assert permainan.stamina(kon, pemain) == 100                 # tidak melewati batas
    permainan.ubah_stamina(kon, pemain, -10 ** 6)
    assert permainan.stamina(kon, pemain) == 0                   # tidak di bawah nol


def test_kelaparan_memotong_xp(kon, pemain):
    xp0 = permainan.xp_kini(kon, pemain)
    assert permainan.xp_kegiatan(kon, pemain, "panen") == permainan.XP["panen"]
    permainan.ubah_stamina(kon, pemain, -10 ** 6)
    assert permainan.xp_kegiatan(kon, pemain, "panen") == permainan.XP["panen"] // 2
    assert permainan.xp_kegiatan(kon, pemain, "siram") == 1      # paling sedikit 1
    assert permainan.xp_kini(kon, pemain) == xp0 + permainan.XP["panen"] + permainan.XP["panen"] // 2 + 1


def test_profil(kon, pemain):
    permainan.xp_kegiatan(kon, pemain, "panen")
    permainan.tambah_statistik(kon, pemain, "panen")
    permainan.tambah_statistik(kon, pemain, "menit", 75)
    d = permainan.potret_profil(kon, pemain)
    assert d["nama"] == "Budi" and d["level"]["level"] == 1 and d["statistik"]["panen"] == 1 and d["statistik"]["menit"] == 75
    assert d["rumah"]["petak"] == sum(1 for o in permainan.baca_rumah(kon, pemain)["benda"] if o["n"] == "kebun_petak") and d["slot"] == 20
    assert "sandi" not in d and "username" not in d                 # profil tidak membocorkan data akun
    import pytest
    with pytest.raises(permainan.Ditolak):
        permainan.potret_profil(kon, 9999)


def test_daring_membuat_lapar(kon, pemain):
    dunia = Dunia(kon)
    terkirim = []

    async def tangkap(p, pesan):
        terkirim.append(pesan)

    dunia._kirim = tangkap
    dunia.pemain[pemain] = {"id": pemain}

    async def jalan():
        t = asyncio.ensure_future(dunia.putar_lapar(jeda=0.01))
        await asyncio.sleep(0.08)
        t.cancel()

    asyncio.run(jalan())
    assert terkirim and terkirim[-1]["t"] == "stamina" and terkirim[-1]["stamina"]["maks"] == 100
    assert 99.9 < permainan.stamina(kon, pemain) < 100            # 0,01 detik per putaran = sangat sedikit, tetapi turun
