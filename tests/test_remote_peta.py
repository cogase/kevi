"""0.3.0 — pagar remote SSH/telnet, peta utama, kunci barang per level."""
import pytest

from app import atur, permainan, remote
from app.permainan import Ditolak
from app.remote import RemoteDitolak

D = {"remote_jaringan": ["10.0.0.0/8", "192.168.1.0/24"], "remote_port": [22, 23]}


@pytest.mark.parametrize("host,port", [("10.9.8.1", 22), ("192.168.1.7", 23), ("10.255.255.254", 22)])
def test_sasaran_dalam_jaringan_diizinkan(host, port):
    assert remote.sasaran_boleh(D, host, port) == host


@pytest.mark.parametrize("host,port", [
    ("8.8.8.8", 22), ("192.168.2.7", 22),            # di luar jaringan yang didaftarkan
    ("127.0.0.1", 22), ("localhost", 22), ("0.0.0.0", 22), ("169.254.1.1", 22), ("::1", 22),
    ("10.9.8.1", 80), ("10.9.8.1", "22"), ("10.9.8.1", True),   # port tak diizinkan / bukan angka
    ("-oProxyCommand=id", 22), ("10.9.8.1;id", 22), ("", 22),
])
def test_sasaran_di_luar_pagar_ditolak(host, port):
    with pytest.raises(RemoteDitolak):
        remote.sasaran_boleh(D, host, port)


def test_ssh_tidak_memakai_kunci_server_dan_tanpa_escape():
    o = " ".join(remote.OPSI_SSH)
    for wajib in ("-F /dev/null", "PubkeyAuthentication=no", "IdentityFile=/dev/null", "IdentityAgent=none", "EscapeChar=none",
                  "ClearAllForwardings=yes", "PermitLocalCommand=no", "ForwardAgent=no"):
        assert wajib in o


@pytest.mark.parametrize("user", ["-oProxyCommand=x", "a b", "a;b", "$(id)", "", "x" * 65])
def test_username_perangkat_disaring(user):
    assert not (remote.POLA_USER.match(user) and not user.startswith("-"))


def test_izin_remote(kon):
    from app import akun
    atur.lupa()
    a = akun.buat_pemakai(kon, "bos", "sandi-admin-1", "admin")
    b = akun.buat_pemakai(kon, "staf", "sandi-staf-12")
    baris = lambda uid: kon.execute("SELECT * FROM pemakai WHERE id = ?", (uid,)).fetchone()   # noqa: E731
    assert remote.boleh(kon, baris(a)) and not remote.boleh(kon, baris(b))
    kon.execute("UPDATE pemakai SET remote = 1 WHERE id = ?", (b,))
    assert remote.boleh(kon, baris(b))
    atur.simpan(kon, {"remote_aktif": False})
    assert not remote.boleh(kon, baris(a)) and not remote.boleh(kon, baris(b))      # sakelar mati = semua tertutup
    atur.simpan(kon, {"remote_aktif": True})
    atur.lupa()


def test_pengaturan_remote_dan_pesan_disaring(kon):
    atur.lupa()
    d = atur.simpan(kon, {"remote_jaringan": ["10.9.8.7/24", " 172.16.0.0/12 "], "remote_port": [23, 22, 22], "pesan_sistem": ["  Halo   semua ", ""], "pesan_jeda": 5})
    assert d["remote_jaringan"] == ["10.9.8.0/24", "172.16.0.0/12"] and d["remote_port"] == [22, 23] and d["pesan_sistem"] == ["Halo semua"]
    for buruk in ({"remote_jaringan": ["bukan-cidr"]}, {"remote_port": [0]}, {"remote_port": ["22"]}, {"pesan_jeda": 0}, {"pesan_sistem": "teks"}):
        with pytest.raises(atur.AturDitolak):
            atur.simpan(kon, buruk)
    atur.lupa()


def test_peta_utama_disunting_admin(kon):
    d = permainan.baca_peta(kon)
    assert d["dasar"] == "default" and (d["lebar"], d["tinggi"]) == (45, 46)
    d = permainan.peta_pasang(kon, {"barang": "sofa_krem", "x": 100, "y": 100})
    bid = d["benda"][0]["id"]
    permainan.peta_pasang(kon, {"barang": "lantai:lantai_parket", "gx": 2, "gy": 3})
    d = permainan.peta_pasang(kon, {"barang": "tembok", "gx": 2, "gy": 2, "warna": "#112233"})
    assert d["lantai"]["2,3"] == "lantai_parket" and d["tembok"]["2,2"] == "#112233"
    for buruk in ({"barang": "tidak_ada", "x": 1, "y": 1}, {"barang": "sofa_krem", "x": 99999, "y": 1}, {"barang": "tembok", "gx": 99, "gy": 1},
                  {"barang": "lantai:ngawur", "gx": 1, "gy": 1}):
        with pytest.raises(Ditolak):
            permainan.peta_pasang(kon, buruk)
    d = permainan.peta_angkat(kon, {"id": bid})
    assert d["benda"] == []
    d = permainan.peta_dasar(kon, {"dasar": "kosong", "lebar": 30, "tinggi": 24, "lantai_dasar": "lantai_kayu_hangat"})
    assert (d["dasar"], d["lebar"], d["tinggi"]) == ("kosong", 30, 24) and d["tembok"]            # tambahan tetap ada
    d = permainan.peta_dasar(kon, {"dasar": "default", "kosongkan": True})
    assert d["lebar"] == 45 and not d["tembok"] and not d["lantai"]
    for buruk in ({"dasar": "kosong", "lebar": 5, "tinggi": 30}, {"dasar": "ngawur"}, {"dasar": "kosong", "lebar": 30, "tinggi": 30, "lantai_dasar": "x"}):
        with pytest.raises(Ditolak):
            permainan.peta_dasar(kon, buruk)


def test_peta_simpan_draf(kon):
    d = permainan.baca_peta(kon)
    assert d["rev"] == 0
    draf = {"rev": 0, "lantai": {"2,3": "lantai_parket"}, "tembok": {"4,4": "#112233", " 5,4": "#112233"},
            "benda": [{"n": "sofa_krem", "x": 96, "y": 96, "r": 0}, {"id": 7, "n": "sofa_krem", "x": 120, "y": 96, "r": 0, "kunci": True},
                      {"id": 7, "n": "sofa_krem", "x": 144, "y": 96, "r": 99}]}
    d = permainan.peta_simpan(kon, draf)
    assert d["rev"] == 1 and d["lantai"] == {"2,3": "lantai_parket"} and set(d["tembok"]) == {"4,4", "5,4"}
    ids = [o["id"] for o in d["benda"]]
    assert len(set(ids)) == 3 and 7 in ids and d["urut"] == max(ids)            # id kembar dan id kosong diberi id baru
    assert d["benda"][1].get("kunci") is True and "kunci" not in d["benda"][0] and d["benda"][2]["r"] == 0
    with pytest.raises(Ditolak) as e:
        permainan.peta_simpan(kon, draf)                                        # revisi basi: admin lain sudah menyimpan
    assert "tempat lain" in str(e.value)
    for buruk in ({"lantai": {"2,3": "ngawur"}}, {"lantai": {"99,3": "lantai_parket"}}, {"lantai": {"x": "lantai_parket"}},
                  {"tembok": {"1,1": "merah"}}, {"benda": [{"n": "tidak_ada", "x": 1, "y": 1}]}, {"benda": [{"n": "sofa_krem", "x": 99999, "y": 1}]},
                  {"benda": [{"n": "sofa_krem", "x": 1.5, "y": 1}]}, {"benda": "x"}, {"lantai": []}):
        with pytest.raises(Ditolak):
            permainan.peta_simpan(kon, {"rev": 1, "lantai": {}, "tembok": {}, "benda": [], **buruk})
    assert permainan.baca_peta(kon)["rev"] == 1                                 # yang ditolak tidak mengubah apa pun
    d = permainan.peta_simpan(kon, {"rev": 1, "lantai": {}, "tembok": {}, "benda": []})
    assert d["rev"] == 2 and not d["benda"] and d["urut"] == max(ids)           # id lama tidak dipakai ulang
    assert permainan.peta_pasang(kon, {"barang": "sofa_krem", "x": 100, "y": 100})["rev"] == 3


def test_level_barang():
    assert permainan.level_barang("kebun_petak") == 1 and permainan.level_barang("benih:sawi") == 1 and permainan.level_barang("lantai:lantai_parket") == 1
    assert permainan.level_barang("benih:mangga") == 7 and permainan.level_barang("kandang_ternak") == 5
    murah = [n for n, b in permainan.katalog()["barang"].items() if permainan.harga_beli(n) is not None and b["harga"] <= 20]
    assert len(murah) > 50 and all(permainan.level_barang(n) == 1 for n in murah if n not in permainan.LEVEL_KHUSUS)
    assert permainan.level_barang("luar_rumah_merah") == 7                                           # 450 koin


def test_pasang_sambil_beli_tunduk_pada_level(kon, pemain):
    with pytest.raises(Ditolak, match="level"):
        permainan.pasang(kon, pemain, {"barang": "sofa_krem", "x": 10, "y": 10, "beli": True})
    koin = permainan.saldo(kon, pemain)
    permainan.pasang(kon, pemain, {"barang": "tembok", "gx": 1, "gy": 1, "beli": True})
    assert permainan.saldo(kon, pemain) == koin - permainan.HARGA_TEMBOK
