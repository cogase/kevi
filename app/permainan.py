"""Aturan permainan Kevi: koin, inventori, toko, rumah (tanah kosong yang dibangun pemain), kebun, kandang, misi.

Server yang berkuasa atas semua yang bernilai (koin, barang, isi rumah, hasil kebun); peramban hanya mengusulkan aksi.
Tabel tanaman & hewan diambil dari Agent Pak (app/kebun.py, app/kandang.py) supaya rasa ekonominya sama, tetapi
jamnya memakai "jam kebun" (konfig.JAM_KEBUN detik nyata) sehingga lajunya bisa diatur.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time

from . import basis, konfig

T = 16
LEBAR_TANAH, TINGGI_TANAH = 30, 22
BENDA_MAKS = 600

# kode: (nama, jam tumbuh, harga benih, harga jual, jam tumbuh ulang | None, pohon?)
TANAMAN = {
    "sawi": ("Sawi", 3, 10, 30, None, False),
    "wortel": ("Wortel", 4, 15, 45, None, False),
    "cabai": ("Cabai", 6, 25, 25, 3, False),
    "terong": ("Terong", 7, 30, 60, None, False),
    "tomat": ("Tomat", 8, 30, 35, 4, False),
    "stroberi": ("Stroberi", 9, 50, 45, 5, False),
    "jagung": ("Jagung", 10, 40, 110, None, False),
    "labu": ("Labu", 16, 60, 220, None, False),
    "jeruk": ("Pohon jeruk", 24, 150, 60, 8, True),
    "mangga": ("Pohon mangga", 36, 200, 90, 10, True),
}
BASAH_JAM = 12
TAHAP_MATANG = 4
JANGKAU_PENYIRAM = 26          # px dari pusat penyiram ke pusat petak (8 petak sekeliling)

# jenis kandang: (nama, kapasitas, hewan yang boleh)
KANDANG = {"kandang_ayam": ("Kandang ayam", 4, ("ayam", "itik")), "kandang_ternak": ("Kandang ternak", 2, ("kambing", "sapi"))}
# kode: (nama, harga beli, produk, jam per produk, porsi pakan per hari)
HEWAN = {
    "ayam": ("Ayam", 120, "telur", 12, 1),
    "itik": ("Bebek", 160, "telur_bebek", 12, 1),
    "kambing": ("Kambing", 450, "susu_kambing", 24, 2),
    "sapi": ("Sapi", 800, "susu_sapi", 24, 3),
}
PRODUK = {"telur": ("Telur", 18), "telur_bebek": ("Telur bebek", 25), "susu_kambing": ("Susu kambing", 70),
          "susu_sapi": ("Susu sapi", 120)}
HARGA_PAKAN = 8
KENYANG_JAM = 24

HARGA_LANTAI = 2
HARGA_TEMBOK = 3
JUAL_KEMBALI = 0.5             # perabot dijual lagi = separuh harga
KATEGORI_TAK_DIJUAL = ("Antar lantai/", "Tempat kerja/", "Hewan/")

PAKET_AWAL = {"kebun_petak": 6, "kebun_kotak_kiriman": 1, "benih:sawi": 6, "benih:wortel": 3, "luar_bangku_taman": 1}

# kode: (judul, sasaran, hadiah)
MISI = {
    "ping": ("Jalankan ping dari Terminal", 1, 40),
    "trace": ("Jalankan trace dari Terminal", 1, 50),
    "sapa": ("Ngobrol dengan 2 rekan atau NPC", 2, 30),
    "siram": ("Siram 3 petak kebun", 3, 30),
    "panen": ("Panen 2 hasil kebun", 2, 40),
    "catat": ("Tulis 1 catatan", 1, 25),
    "jual": ("Jual hasil senilai 50 koin", 50, 30),
    "hias": ("Pasang 2 perabot di rumah", 2, 30),
}
MISI_PER_HARI = 3
BONUS_MISI = 60
BONUS_MASUK = 50

POLA_WARNA = re.compile(r"^#[0-9a-fA-F]{6}$")

# ---------------------------------------------------------------- level (0.2.0)
LEVEL_MAKS = 20
HADIAH_NAIK = 40                      # koin per level yang dicapai, dikali levelnya
STAMINA_DASAR, STAMINA_PER_LEVEL = 100, 6
# XP per kegiatan. Yang mudah diulang-ulang punya jatah harian (XP_JATAH) supaya level tak bisa digiling.
XP = {"terminal": 12, "panen": 6, "tanam": 2, "siram": 1, "hias": 2, "produk": 3, "misi": 40, "catat": 3, "sapa": 4,
      "tos": 8, "suit": 6, "kuis": 10, "hadir": 20}
XP_JATAH = {"terminal": 15, "catat": 5, "sapa": 8, "tos": 5, "suit": 5, "hias": 30}
# Interaksi yang terbuka di level tertentu (yang tak tercantum = terbuka sejak level 1).
BUKA = {"emote": 1, "tos": 2, "kuis": 2, "trace": 2, "arcade": 3, "mtr": 3, "kirim_koin": 3, "suit": 4, "browser": 4, "port": 5}
NAMA_BUKA = {"emote": "Emote (tombol 1–8)", "tos": "Tos dengan rekan", "kuis": "Kuis jaringan Mas Dika", "trace": "Perintah trace",
             "arcade": "Mesin arcade: Cocokkan Kartu", "mtr": "Perintah mtr", "kirim_koin": "Kirim koin ke rekan",
             "suit": "Tantang suit (boleh bertaruh)", "browser": "Browser di Komputer", "port": "Perintah port"}


def ambang(lv: int) -> int:
    """Total XP untuk mencapai level `lv` (level 2 = 300, 3 = 900, 4 = 1800, 5 = 3000, ...).

    0.3.0 (yosi: "leveling jangan terlalu cepat"): tiga kali lebih curam dari 0.2.0. Pemain yang rajin mendapat
    kira-kira 250–400 XP sehari, jadi level 2 di hari pertama atau kedua, level 5 sekitar satu setengah minggu.
    """
    return 150 * lv * (lv - 1)


def level_dari(xp: int) -> int:
    lv = 1
    while lv < LEVEL_MAKS and xp >= ambang(lv + 1):
        lv += 1
    return lv


class Ditolak(ValueError):
    """Aksi ditolak; pesannya untuk pemain."""


_katalog: dict | None = None


def katalog() -> dict:
    global _katalog
    if _katalog is None:
        _katalog = json.loads((konfig.STATIS / "peta" / "katalog.json").read_text())
    return _katalog


def hari_wib(t: float | None = None) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime((t or time.time()) + 7 * 3600))


# ---------------------------------------------------------------- koin & inventori

def saldo(kon: sqlite3.Connection, uid: int) -> int:
    r = kon.execute("SELECT koin FROM karakter WHERE pemakai_id = ?", (uid,)).fetchone()
    return int(r["koin"]) if r else 0


def ubah_koin(kon: sqlite3.Connection, uid: int, jumlah: int, alasan: str) -> int:
    """Tambah (positif) atau potong (negatif) koin; saldo tak boleh minus. Mengembalikan saldo baru."""
    kini = saldo(kon, uid)
    if kini + jumlah < 0:
        raise Ditolak(f"Koin kurang: butuh {-jumlah}, punya {kini}.")
    kon.execute("UPDATE karakter SET koin = koin + ? WHERE pemakai_id = ?", (jumlah, uid))
    kon.execute("INSERT INTO buku_kas (pemakai_id, waktu, jumlah, alasan) VALUES (?, ?, ?, ?)", (uid, time.time(), jumlah, alasan[:120]))
    return kini + jumlah


def inventori(kon: sqlite3.Connection, uid: int) -> dict[str, int]:
    return {r["barang"]: r["jumlah"] for r in kon.execute("SELECT barang, jumlah FROM inventori WHERE pemakai_id = ? AND jumlah > 0", (uid,))}


# 0.4.0 — inventory berslot ala Minecraft: satu jenis barang = satu slot (tumpukan). 20 slot awal, tiap tas +10.
SLOT_AWAL, SLOT_PER_TAS, TAS_MAKS = 20, 10, 6
HARGA_TAS = 2000                     # tas ke-n berharga HARGA_TAS x n (2000, 4000, 6000, ...) — angka dari yosi
HOTBAR = 10
# kode: (nama, harga beli | None = hanya dimasak, stamina, detik pulih-cepat, ikon)
MAKANAN = {
    "roti": ("Roti", 6, 25, 0, "ikon_panen_pakan"),
    "nasi_bungkus": ("Nasi bungkus", 14, 55, 30, "ikon_panen_telur"),
    "tumis_sawi": ("Tumis sawi", None, 60, 45, "ikon_panen_sawi"),
    "sup_wortel": ("Sup wortel", None, 80, 60, "ikon_panen_wortel"),
    "sambal_terong": ("Sambal terong", None, 90, 60, "ikon_panen_terong"),
    "telur_dadar": ("Telur dadar", None, 90, 90, "ikon_panen_telur"),
    "jagung_bakar": ("Jagung bakar", None, 100, 60, "ikon_panen_jagung"),
    "jus_stroberi": ("Jus stroberi", None, 70, 120, "ikon_panen_stroberi"),
    "kolak_labu": ("Kolak labu", None, 150, 120, "ikon_panen_labu"),
}
# masakan: bahan {barang inventory: jumlah}. Dimasak di kompor / microwave (rumah sendiri atau pantry kantor).
RESEP = {
    "tumis_sawi": {"panen:sawi": 2},
    "sup_wortel": {"panen:wortel": 2, "panen:sawi": 1},
    "sambal_terong": {"panen:terong": 1, "panen:cabai": 1},
    "telur_dadar": {"telur": 2},
    "jagung_bakar": {"panen:jagung": 1},
    "jus_stroberi": {"panen:stroberi": 2},
    "kolak_labu": {"panen:labu": 1, "susu_kambing": 1},
}
XP_MASAK = 4


def kapasitas(kon: sqlite3.Connection, uid: int) -> int:
    r = kon.execute("SELECT tas FROM karakter WHERE pemakai_id = ?", (uid,)).fetchone()
    return SLOT_AWAL + SLOT_PER_TAS * int(r["tas"] if r else 0)


def tambah_barang(kon: sqlite3.Connection, uid: int, barang: str, jumlah: int = 1) -> None:
    punya = inventori(kon, uid)
    if barang not in punya and len(punya) >= kapasitas(kon, uid):
        raise Ditolak("Inventory penuh. Jual atau pasang sesuatu dulu, atau beli tas di Koperasi.")
    kon.execute("INSERT INTO inventori (pemakai_id, barang, jumlah) VALUES (?, ?, ?) "
                "ON CONFLICT(pemakai_id, barang) DO UPDATE SET jumlah = jumlah + excluded.jumlah", (uid, barang, jumlah))


def kurang_barang(kon: sqlite3.Connection, uid: int, barang: str, jumlah: int = 1) -> None:
    r = kon.execute("SELECT jumlah FROM inventori WHERE pemakai_id = ? AND barang = ?", (uid, barang)).fetchone()
    if not r or r["jumlah"] < jumlah:
        raise Ditolak(f"{nama_barang(barang)} tidak cukup di inventory.")
    kon.execute("UPDATE inventori SET jumlah = jumlah - ? WHERE pemakai_id = ? AND barang = ?", (jumlah, uid, barang))


def nama_barang(b: str) -> str:
    if b.startswith("makan:"):
        return MAKANAN.get(b[6:], (b[6:],))[0]
    if b.startswith("benih:"):
        return "Benih " + TANAMAN.get(b[6:], (b[6:],))[0].lower()
    if b.startswith("panen:"):
        return TANAMAN.get(b[6:], (b[6:],))[0]
    if b.startswith("lantai:"):
        return "Lantai " + b[7:].removeprefix("lantai_").replace("_", " ")
    if b == "tembok":
        return "Tembok"
    if b == "pakan":
        return "Pakan"
    if b in PRODUK:
        return PRODUK[b][0]
    return b.removeprefix("em_").replace("_", " ").capitalize()


def harga_beli(b: str) -> int | None:
    """Harga satu barang di toko, None = tidak dijual."""
    if b.startswith("benih:"):
        return TANAMAN[b[6:]][2] if b[6:] in TANAMAN else None
    if b.startswith("makan:"):
        return MAKANAN[b[6:]][1] if b[6:] in MAKANAN else None
    if b == "pakan":
        return HARGA_PAKAN
    if b == "tembok":
        return HARGA_TEMBOK
    if b.startswith("lantai:"):
        return HARGA_LANTAI if b[7:] in katalog()["lantai"] else None
    k = katalog()["barang"].get(b)
    if not k or k["k"].startswith(KATEGORI_TAK_DIJUAL):
        return None
    return int(k["harga"])


def harga_jual(b: str) -> int | None:
    if b.startswith("panen:"):
        return TANAMAN[b[6:]][3] if b[6:] in TANAMAN else None
    if b in PRODUK:
        return PRODUK[b][1]
    if b.startswith("benih:") or b == "pakan" or b == "tembok" or b.startswith("lantai:"):
        h = harga_beli(b)
        return max(1, int(h * JUAL_KEMBALI)) if h else None
    h = harga_beli(b)
    return max(1, int(h * JUAL_KEMBALI)) if h else None


# 0.3.0 (yosi: "unlock furnitur sesuai level, level 1 yang basic saja dulu"). Level sebuah barang ditentukan harganya:
# (harga paling tinggi, level). Barang di atas tingkat terakhir = LEVEL_BARANG_PUNCAK.
TINGKAT_HARGA = ((20, 1), (40, 2), (70, 3), (110, 4), (180, 5), (300, 6), (450, 7))
LEVEL_BARANG_PUNCAK = 8
# Pengecualian: kebutuhan dasar bermain tetap level 1, alat produksi dibuka bertahap (bukan menurut harganya).
LEVEL_KHUSUS = {
    "tembok": 1, "pakan": 1, "kebun_petak": 1, "kebun_kotak_kiriman": 1, "kebun_penyiram": 2,
    "kandang_ayam": 3, "kandang_ternak": 5,
    "benih:sawi": 1, "benih:wortel": 1, "benih:cabai": 2, "benih:terong": 2, "benih:tomat": 3, "benih:stroberi": 3,
    "benih:jagung": 4, "benih:labu": 5, "benih:jeruk": 6, "benih:mangga": 7,
}


def level_barang(b: str) -> int:
    """Level yang dibutuhkan untuk MEMBELI barang (yang sudah dimiliki tetap bisa dipasang dan dijual)."""
    if b in LEVEL_KHUSUS:
        return LEVEL_KHUSUS[b]
    if b.startswith(("lantai:", "makan:")):
        return 1
    h = harga_beli(b) or 0
    return next((lv for batas, lv in TINGKAT_HARGA if h <= batas), LEVEL_BARANG_PUNCAK)


def _cek_level_barang(kon: sqlite3.Connection, uid: int, barang: str) -> None:
    perlu = level_barang(barang)
    if level(kon, uid) < perlu:
        raise Ditolak(f"{nama_barang(barang)} baru bisa dibeli di level {perlu}.")


def beli(kon: sqlite3.Connection, uid: int, barang: str, jumlah: int) -> dict:
    if not isinstance(jumlah, int) or not 1 <= jumlah <= 500:
        raise Ditolak("Jumlah 1–500.")
    h = harga_beli(str(barang))
    if h is None:
        raise Ditolak("Barang itu tidak dijual.")
    _cek_level_barang(kon, uid, barang)
    ubah_koin(kon, uid, -h * jumlah, f"beli {jumlah} {nama_barang(barang)}")
    tambah_barang(kon, uid, barang, jumlah)
    return {"koin": saldo(kon, uid), "inventori": inventori(kon, uid)}


def jual(kon: sqlite3.Connection, uid: int, barang: str, jumlah: int) -> dict:
    if not isinstance(jumlah, int) or not 1 <= jumlah <= 9999:
        raise Ditolak("Jumlah tidak sah.")
    h = harga_jual(str(barang))
    if h is None:
        raise Ditolak("Barang itu tidak bisa dijual.")
    kurang_barang(kon, uid, barang, jumlah)
    ubah_koin(kon, uid, h * jumlah, f"jual {jumlah} {nama_barang(barang)}")
    hasil = barang.startswith("panen:") or barang in PRODUK
    if hasil:
        catat_aksi(kon, uid, "jual", h * jumlah)
        tambah_statistik(kon, uid, "jual", h * jumlah)
        tambah_xp(kon, uid, (h * jumlah) // 10)
    return {"koin": saldo(kon, uid), "inventori": inventori(kon, uid), "dapat": h * jumlah}


def jual_semua_hasil(kon: sqlite3.Connection, uid: int) -> dict:
    total = 0
    for b, n in inventori(kon, uid).items():
        if b.startswith("panen:") or b in PRODUK:
            total += jual(kon, uid, b, n)["dapat"]
    if not total:
        raise Ditolak("Belum ada hasil kebun atau kandang untuk dijual.")
    return {"koin": saldo(kon, uid), "inventori": inventori(kon, uid), "dapat": total}


def tambah_statistik(kon: sqlite3.Connection, uid: int, kunci: str, n: int = 1) -> None:
    r = kon.execute("SELECT statistik FROM karakter WHERE pemakai_id = ?", (uid,)).fetchone()
    if not r:
        return
    s = basis.muat_json(r["statistik"], {})
    s[kunci] = int(s.get(kunci, 0)) + n
    kon.execute("UPDATE karakter SET statistik = ? WHERE pemakai_id = ?", (basis.tulis_json(s), uid))


def xp_kini(kon: sqlite3.Connection, uid: int) -> int:
    r = kon.execute("SELECT xp FROM karakter WHERE pemakai_id = ?", (uid,)).fetchone()
    return int(r["xp"]) if r else 0


def level(kon: sqlite3.Connection, uid: int) -> int:
    return level_dari(xp_kini(kon, uid))


def potret_level(kon: sqlite3.Connection, uid: int) -> dict:
    xp = xp_kini(kon, uid)
    lv = level_dari(xp)
    return {"xp": xp, "level": lv, "dasar": ambang(lv), "lanjut": ambang(lv + 1) if lv < LEVEL_MAKS else None,
            "stamina": STAMINA_DASAR + (lv - 1) * STAMINA_PER_LEVEL}


def tambah_xp(kon: sqlite3.Connection, uid: int, n: int) -> int:
    """Tambah XP; tiap level baru dibayar HADIAH_NAIK x level. Mengembalikan level sesudahnya."""
    if n <= 0:
        return level(kon, uid)
    lama = xp_kini(kon, uid)
    kon.execute("UPDATE karakter SET xp = xp + ? WHERE pemakai_id = ?", (n, uid))
    dari, ke = level_dari(lama), level_dari(lama + n)
    for lv in range(dari + 1, ke + 1):
        ubah_koin(kon, uid, HADIAH_NAIK * lv, f"naik ke level {lv}")
    return ke


def jatah_harian(kon: sqlite3.Connection, uid: int, kunci: str, maks: int) -> bool:
    """Pakai satu jatah harian `kunci`; False bila jatah hari ini (WIB) sudah habis."""
    d = baca_misi(kon, uid)
    hitung = d.setdefault("hitung", {})
    if hitung.get(kunci, 0) >= maks:
        return False
    hitung[kunci] = hitung.get(kunci, 0) + 1
    _simpan_misi(kon, uid, d)
    return True


def sisa_jatah(kon: sqlite3.Connection, uid: int, kunci: str, maks: int) -> int:
    return max(0, maks - int(baca_misi(kon, uid).get("hitung", {}).get(kunci, 0)))


def xp_kegiatan(kon: sqlite3.Connection, uid: int, kunci: str, kali: int = 1) -> int:
    """XP untuk satu kegiatan menurut tabel XP, tunduk pada jatah harian bila ada. Mengembalikan XP yang masuk."""
    if kunci in XP_JATAH and not jatah_harian(kon, uid, "xp_" + kunci, XP_JATAH[kunci]):
        return 0
    n = XP[kunci] * kali
    tambah_xp(kon, uid, n)
    return n


def butuh_level(kon: sqlite3.Connection, uid: int, kunci: str) -> None:
    perlu = BUKA.get(kunci, 1)
    if level(kon, uid) < perlu:
        raise Ditolak(f"{NAMA_BUKA.get(kunci, kunci)} terbuka di level {perlu}.")


# ---------------------------------------------------------------- rumah

def rumah_kosong() -> dict:
    return {"v": 1, "lebar": LEBAR_TANAH, "tinggi": TINGGI_TANAH, "lantai": {}, "tembok": {}, "benda": [], "urut": 0,
            "petak": {}, "kandang": {}}


def baca_rumah(kon: sqlite3.Connection, uid: int) -> dict:
    r = kon.execute("SELECT data FROM rumah WHERE pemakai_id = ?", (uid,)).fetchone()
    d = basis.muat_json(r["data"], {}) if r else {}
    dasar = rumah_kosong()
    for k, v in dasar.items():
        d.setdefault(k, v)
    return d


def simpan_rumah(kon: sqlite3.Connection, uid: int, d: dict) -> None:
    kon.execute("INSERT INTO rumah (pemakai_id, data) VALUES (?, ?) ON CONFLICT(pemakai_id) DO UPDATE SET data = excluded.data",
                (uid, basis.tulis_json(d)))


def _ubin_sah(d: dict, gx, gy) -> bool:
    return isinstance(gx, int) and isinstance(gy, int) and 0 <= gx < d["lebar"] and 0 <= gy < d["tinggi"]


def _benda(d: dict, bid) -> dict:
    for o in d["benda"]:
        if o["id"] == bid:
            return o
    raise Ditolak("Benda itu sudah tidak ada.")


def pasang(kon: sqlite3.Connection, uid: int, p: dict) -> dict:
    """Taruh satu barang dari inventory ke tanah. p = {barang, x, y, r} | {barang: 'lantai:..'|'tembok', gx, gy, warna}."""
    d = baca_rumah(kon, uid)
    barang = str(p.get("barang") or "")
    if barang.startswith("lantai:") or barang == "tembok":
        gx, gy = p.get("gx"), p.get("gy")
        if not _ubin_sah(d, gx, gy):
            raise Ditolak("Di luar batas tanah.")
        kunci = f"{gx},{gy}"
        if barang == "tembok":
            if kunci in d["tembok"]:
                raise Ditolak("Sudah ada tembok di situ.")
            warna = p.get("warna") if POLA_WARNA.match(str(p.get("warna") or "")) else "#8b9bb4"
            _pastikan_punya(kon, uid, barang, p.get("beli"))
            kurang_barang(kon, uid, barang)
            d["tembok"][kunci] = warna
        else:
            if barang[7:] not in katalog()["lantai"]:
                raise Ditolak("Lantai tidak dikenal.")
            lama = d["lantai"].get(kunci)
            if lama == barang[7:]:
                raise Ditolak("Lantai itu sudah terpasang di situ.")
            _pastikan_punya(kon, uid, barang, p.get("beli"))
            kurang_barang(kon, uid, barang)
            if lama:
                tambah_barang(kon, uid, "lantai:" + lama)
            d["lantai"][kunci] = barang[7:]
    else:
        k = katalog()["barang"].get(barang)
        if not k:
            raise Ditolak("Barang itu tidak bisa dipasang.")
        x, y, r = p.get("x"), p.get("y"), p.get("r") or 0
        if not (isinstance(x, int) and isinstance(y, int) and isinstance(r, int)):
            raise Ditolak("Posisi tidak sah.")
        r = r % 4 if r in (k.get("putar") or []) else 0
        if not (-8 <= x <= d["lebar"] * T - 8 and -32 <= y <= d["tinggi"] * T - 8):
            raise Ditolak("Di luar batas tanah.")
        if len(d["benda"]) >= BENDA_MAKS:
            raise Ditolak(f"Tanah sudah penuh ({BENDA_MAKS} benda).")
        if barang == "kebun_petak":
            x, y = x // T * T, y // T * T
            if any(o["n"] == "kebun_petak" and o["x"] == x and o["y"] == y for o in d["benda"]):
                raise Ditolak("Sudah ada petak di situ.")
        _pastikan_punya(kon, uid, barang, p.get("beli"))
        kurang_barang(kon, uid, barang)
        d["urut"] += 1
        d["benda"].append({"id": d["urut"], "n": barang, "x": x, "y": y, "r": r})
        catat_aksi(kon, uid, "hias", 1)
        xp_kegiatan(kon, uid, "hias")
    simpan_rumah(kon, uid, d)
    return {"rumah": potret_rumah(kon, uid, d), "inventori": inventori(kon, uid)}


def _pastikan_punya(kon: sqlite3.Connection, uid: int, barang: str, beli) -> None:
    """Mode Bangun boleh membeli sambil menaruh (seperti Edit Layout Agent Pak): bila stok kosong dan `beli` diminta,
    satu barang dibeli dulu dengan harga toko."""
    if not beli or inventori(kon, uid).get(barang, 0) > 0:
        return
    h = harga_beli(barang)
    if h is None:
        raise Ditolak("Barang itu tidak dijual.")
    _cek_level_barang(kon, uid, barang)
    ubah_koin(kon, uid, -h, f"beli {nama_barang(barang)} (bangun)")
    tambah_barang(kon, uid, barang)


# ---------------------------------------------------------------- peta utama (kantor), disunting admin

PETA_BENDA_MAKS = 4000
PETA_UKURAN = (20, 80)


def peta_kosong() -> dict:
    return {"v": 1, "dasar": "default", "lebar": 45, "tinggi": 46, "lantai_dasar": "lantai_luar_rumput", "lantai": {}, "tembok": {},
            "benda": [], "urut": 0, "rev": 0}


def baca_peta(kon: sqlite3.Connection) -> dict:
    r = kon.execute("SELECT nilai FROM pengaturan WHERE kunci = 'peta_utama'").fetchone()
    d = basis.muat_json(r["nilai"], {}) if r else {}
    for k, v in peta_kosong().items():
        d.setdefault(k, v)
    return d


def _simpan_peta(kon: sqlite3.Connection, d: dict) -> None:
    d["rev"] = int(d.get("rev") or 0) + 1          # tiap simpan menaikkan revisi; penyunting menolak menimpa revisi lain
    kon.execute("INSERT INTO pengaturan (kunci, nilai) VALUES ('peta_utama', ?) ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai",
                (basis.tulis_json(d),))


def peta_dasar(kon: sqlite3.Connection, p: dict) -> dict:
    """Ganti dasar peta utama: "default" (peta Agent Pak terpanggang, 45 x 46) atau "kosong" (ukuran & lantai dasar
    pilihan admin). `kosongkan` membuang semua yang sudah ditaruh admin."""
    d = baca_peta(kon)
    dasar = p.get("dasar")
    if dasar not in ("default", "kosong"):
        raise Ditolak("Dasar peta harus default atau kosong.")
    if dasar == "default":
        d.update(dasar="default", lebar=45, tinggi=46)
    else:
        w, h = p.get("lebar"), p.get("tinggi")
        if not all(isinstance(v, int) and not isinstance(v, bool) and PETA_UKURAN[0] <= v <= PETA_UKURAN[1] for v in (w, h)):
            raise Ditolak(f"Ukuran peta {PETA_UKURAN[0]}–{PETA_UKURAN[1]} ubin.")
        lantai = str(p.get("lantai_dasar") or d["lantai_dasar"])
        if lantai not in katalog()["lantai"]:
            raise Ditolak("Lantai dasar tidak dikenal.")
        d.update(dasar="kosong", lebar=w, tinggi=h, lantai_dasar=lantai)
    if p.get("kosongkan"):
        d.update(lantai={}, tembok={}, benda=[])
    _simpan_peta(kon, d)
    return d


def peta_pasang(kon: sqlite3.Connection, p: dict) -> dict:
    """Admin menaruh perabot / lantai / tembok di peta utama. Gratis, tanpa inventory."""
    d = baca_peta(kon)
    barang = str(p.get("barang") or "")
    if barang.startswith("lantai:") or barang == "tembok":
        gx, gy = p.get("gx"), p.get("gy")
        if not _ubin_sah(d, gx, gy):
            raise Ditolak("Di luar batas peta.")
        if barang == "tembok":
            d["tembok"][f"{gx},{gy}"] = p.get("warna") if POLA_WARNA.match(str(p.get("warna") or "")) else "#8b9bb4"
        elif barang[7:] in katalog()["lantai"]:
            d["lantai"][f"{gx},{gy}"] = barang[7:]
        else:
            raise Ditolak("Lantai tidak dikenal.")
    else:
        k = katalog()["barang"].get(barang)
        x, y, r = p.get("x"), p.get("y"), p.get("r") or 0
        if not k or not (isinstance(x, int) and isinstance(y, int) and isinstance(r, int)):
            raise Ditolak("Barang atau posisi tidak sah.")
        if not (-8 <= x <= d["lebar"] * T - 8 and -32 <= y <= d["tinggi"] * T - 8):
            raise Ditolak("Di luar batas peta.")
        if len(d["benda"]) >= PETA_BENDA_MAKS:
            raise Ditolak(f"Peta sudah penuh ({PETA_BENDA_MAKS} benda).")
        d["urut"] += 1
        d["benda"].append({"id": d["urut"], "n": barang, "x": x, "y": y, "r": r % 4 if r in (k.get("putar") or []) else 0})
    _simpan_peta(kon, d)
    return d


def _kunci_ubin(d: dict, kunci) -> str:
    try:
        gx, gy = (int(v) for v in str(kunci).split(","))
    except ValueError as e:
        raise Ditolak("Kunci ubin tidak sah.") from e
    if not _ubin_sah(d, gx, gy):
        raise Ditolak("Ada ubin di luar batas peta.")
    return f"{gx},{gy}"


def peta_simpan(kon: sqlite3.Connection, p: dict) -> dict:
    """Penyunting peta (Edit Map) menyimpan seluruh drafnya sekaligus: p = {rev, lantai, tembok, benda}.
    `rev` harus revisi yang dibaca saat penyunting dibuka; kalau peta sudah berubah di tempat lain, simpan ditolak
    supaya dua admin tidak saling menimpa. Semua isi diperiksa ulang; benda tanpa id sah diberi id baru."""
    d = baca_peta(kon)
    if p.get("rev") != d["rev"]:
        raise Ditolak("Peta sudah diubah dari tempat lain. Keluar dari Edit Map lalu masuk lagi.")
    lantai, tembok, benda = p.get("lantai"), p.get("tembok"), p.get("benda")
    if not (isinstance(lantai, dict) and isinstance(tembok, dict) and isinstance(benda, list)):
        raise Ditolak("Isi peta tidak sah.")
    if len(benda) > PETA_BENDA_MAKS:
        raise Ditolak(f"Peta terlalu penuh (paling banyak {PETA_BENDA_MAKS} benda).")
    kat = katalog()
    lantai_baru, tembok_baru = {}, {}
    for kunci, n in lantai.items():
        if n not in kat["lantai"]:
            raise Ditolak("Lantai tidak dikenal.")
        lantai_baru[_kunci_ubin(d, kunci)] = n
    for kunci, warna in tembok.items():
        if not POLA_WARNA.match(str(warna or "")):
            raise Ditolak("Warna tembok tidak sah.")
        tembok_baru[_kunci_ubin(d, kunci)] = warna
    benda_baru, dipakai, urut = [], set(), int(d["urut"])
    for o in benda:
        k = kat["barang"].get(o.get("n")) if isinstance(o, dict) else None
        if not k:
            raise Ditolak("Ada benda yang tidak dikenal.")
        x, y, r, bid = o.get("x"), o.get("y"), o.get("r") or 0, o.get("id")
        if not all(isinstance(v, int) and not isinstance(v, bool) for v in (x, y, r)):
            raise Ditolak("Posisi benda tidak sah.")
        if not (-8 <= x <= d["lebar"] * T - 8 and -32 <= y <= d["tinggi"] * T - 8):
            raise Ditolak("Ada benda di luar batas peta.")
        if not isinstance(bid, int) or isinstance(bid, bool) or bid <= 0 or bid in dipakai:
            urut += 1
            bid = urut
        dipakai.add(bid)
        urut = max(urut, bid)
        baru = {"id": bid, "n": o["n"], "x": x, "y": y, "r": r % 4 if r in (k.get("putar") or []) else 0}
        if o.get("kunci"):
            baru["kunci"] = True
        benda_baru.append(baru)
    d.update(lantai=lantai_baru, tembok=tembok_baru, benda=benda_baru, urut=urut)
    _simpan_peta(kon, d)
    return d


def peta_angkat(kon: sqlite3.Connection, p: dict) -> dict:
    d = baca_peta(kon)
    if p.get("id") is not None:
        d["benda"].remove(_benda(d, p.get("id")))
    else:
        kunci = f"{p.get('gx')},{p.get('gy')}"
        if d["tembok"].pop(kunci, None) is None and d["lantai"].pop(kunci, None) is None:
            raise Ditolak("Tidak ada yang bisa diambil di situ.")
    _simpan_peta(kon, d)
    return d


def angkat(kon: sqlite3.Connection, uid: int, p: dict) -> dict:
    """Ambil kembali ke inventory: benda (id), atau lantai/tembok di satu ubin."""
    d = baca_rumah(kon, uid)
    if p.get("id") is not None:
        o = _benda(d, p.get("id"))
        kunci = str(o["id"])
        if d["petak"].get(kunci, {}).get("t"):
            raise Ditolak("Petak masih ditanami. Panen atau cabut dulu.")
        if d["kandang"].get(kunci, {}).get("hewan"):
            raise Ditolak("Kandang masih berisi hewan.")
        d["benda"].remove(o)
        d["petak"].pop(kunci, None)
        d["kandang"].pop(kunci, None)
        tambah_barang(kon, uid, o["n"])
    else:
        gx, gy = p.get("gx"), p.get("gy")
        kunci = f"{gx},{gy}"
        if kunci in d["tembok"]:
            d["tembok"].pop(kunci)
            tambah_barang(kon, uid, "tembok")
        elif kunci in d["lantai"]:
            tambah_barang(kon, uid, "lantai:" + d["lantai"].pop(kunci))
        else:
            raise Ditolak("Tidak ada yang bisa diambil di situ.")
    simpan_rumah(kon, uid, d)
    return {"rumah": potret_rumah(kon, uid, d), "inventori": inventori(kon, uid)}


def pindah(kon: sqlite3.Connection, uid: int, p: dict) -> dict:
    d = baca_rumah(kon, uid)
    o = _benda(d, p.get("id"))
    x, y, r = p.get("x"), p.get("y"), p.get("r")
    if not (isinstance(x, int) and isinstance(y, int)):
        raise Ditolak("Posisi tidak sah.")
    if not (-8 <= x <= d["lebar"] * T - 8 and -32 <= y <= d["tinggi"] * T - 8):
        raise Ditolak("Di luar batas tanah.")
    if o["n"] == "kebun_petak":
        x, y = x // T * T, y // T * T
    o["x"], o["y"] = x, y
    if isinstance(r, int):
        o["r"] = r % 4 if r in (katalog()["barang"].get(o["n"], {}).get("putar") or []) else 0
    simpan_rumah(kon, uid, d)
    return {"rumah": potret_rumah(kon, uid, d)}


# ---------------------------------------------------------------- kebun

def _penyiram(d: dict) -> list[tuple[float, float]]:
    return [(o["x"] + 8, o["y"] + 8) for o in d["benda"] if o["n"] == "kebun_penyiram"]


def _maju_kebun(d: dict, kini: float) -> None:
    """Pertumbuhan hanya berjalan selama petak basah (disiram, atau dalam jangkauan penyiram)."""
    siram = _penyiram(d)
    letak = {str(o["id"]): o for o in d["benda"] if o["n"] == "kebun_petak"}
    for kunci in letak:
        d["petak"].setdefault(kunci, {})
    for kunci, pt in d["petak"].items():
        o = letak.get(kunci)
        if o and any(abs(sx - o["x"] - 8) <= JANGKAU_PENYIRAM and abs(sy - o["y"] - 8) <= JANGKAU_PENYIRAM for sx, sy in siram):
            pt["basah"] = kini + BASAH_JAM * konfig.JAM_KEBUN
        if not pt.get("t") or pt["t"] not in TANAMAN:
            pt["cek"] = kini
            continue
        total = TANAMAN[pt["t"]][1] * konfig.JAM_KEBUN
        tumbuh = max(0.0, min(kini, pt.get("basah") or 0) - (pt.get("cek") or kini))
        pt["tumbuh"] = min(total, (pt.get("tumbuh") or 0) + tumbuh)
        pt["cek"] = kini


def _potret_petak(pt: dict, kini: float) -> dict:
    hasil = {"basah": bool((pt.get("basah") or 0) > kini)}
    if pt.get("t") in TANAMAN:
        total = TANAMAN[pt["t"]][1] * konfig.JAM_KEBUN
        bagian = min(1.0, (pt.get("tumbuh") or 0) / total)
        hasil.update(t=pt["t"], tahap=TAHAP_MATANG if bagian >= 1 else int(bagian * TAHAP_MATANG), matang=bagian >= 1,
                     sisa=round(total - (pt.get("tumbuh") or 0)))
    return hasil


def _petak(d: dict, bid) -> tuple[str, dict]:
    o = _benda(d, bid)
    if o["n"] != "kebun_petak":
        raise Ditolak("Itu bukan petak kebun.")
    return str(o["id"]), d["petak"].setdefault(str(o["id"]), {})


def tanam(kon: sqlite3.Connection, uid: int, bid, t: str) -> dict:
    if t not in TANAMAN:
        raise Ditolak("Benih tidak dikenal.")
    d = baca_rumah(kon, uid)
    kini = time.time()
    _maju_kebun(d, kini)
    _, pt = _petak(d, bid)
    if pt.get("t"):
        raise Ditolak("Petak ini sudah ditanami.")
    kurang_barang(kon, uid, "benih:" + t)
    pt.update(t=t, tumbuh=0, cek=kini)
    simpan_rumah(kon, uid, d)
    tambah_statistik(kon, uid, "tanam")
    xp_kegiatan(kon, uid, "tanam")
    return {"rumah": potret_rumah(kon, uid, d), "inventori": inventori(kon, uid)}


def siram(kon: sqlite3.Connection, uid: int, bid) -> dict:
    d = baca_rumah(kon, uid)
    kini = time.time()
    _maju_kebun(d, kini)
    _, pt = _petak(d, bid)
    sudah = (pt.get("basah") or 0) > kini + (BASAH_JAM - 1) * konfig.JAM_KEBUN
    pt["basah"] = kini + BASAH_JAM * konfig.JAM_KEBUN
    pt.setdefault("cek", kini)
    simpan_rumah(kon, uid, d)
    if not sudah:
        catat_aksi(kon, uid, "siram", 1)
        xp_kegiatan(kon, uid, "siram")
    return {"rumah": potret_rumah(kon, uid, d)}


def panen(kon: sqlite3.Connection, uid: int, bid) -> dict:
    d = baca_rumah(kon, uid)
    kini = time.time()
    _maju_kebun(d, kini)
    _, pt = _petak(d, bid)
    t = pt.get("t")
    if t not in TANAMAN:
        raise Ditolak("Petak ini kosong.")
    total = TANAMAN[t][1] * konfig.JAM_KEBUN
    if (pt.get("tumbuh") or 0) < total:
        raise Ditolak("Belum matang.")
    ulang = TANAMAN[t][4]
    if ulang:
        pt["tumbuh"] = total - ulang * konfig.JAM_KEBUN
    else:
        basah = pt.get("basah")
        pt.clear()
        pt.update(basah=basah, cek=kini)
    tambah_barang(kon, uid, "panen:" + t)
    simpan_rumah(kon, uid, d)
    catat_aksi(kon, uid, "panen", 1)
    tambah_statistik(kon, uid, "panen")
    xp_kegiatan(kon, uid, "panen")
    return {"rumah": potret_rumah(kon, uid, d), "inventori": inventori(kon, uid), "dapat": "panen:" + t}


def cabut(kon: sqlite3.Connection, uid: int, bid) -> dict:
    d = baca_rumah(kon, uid)
    _, pt = _petak(d, bid)
    basah = pt.get("basah")
    pt.clear()
    pt.update(basah=basah, cek=time.time())
    simpan_rumah(kon, uid, d)
    return {"rumah": potret_rumah(kon, uid, d)}


# ---------------------------------------------------------------- kandang

def _maju_kandang(d: dict, kini: float) -> None:
    for kd in d["kandang"].values():
        for h in kd.get("hewan") or []:
            info = HEWAN.get(h.get("j"))
            if not info:
                continue
            maks = int(24 // info[3])
            jalan = max(0.0, min(kini, h.get("kenyang") or 0) - (h.get("cek") or kini))
            h["cek"] = kini
            if (h.get("siap") or 0) >= maks:
                h["proses"] = 0
                continue
            h["proses"] = (h.get("proses") or 0) + jalan
            lama = info[3] * konfig.JAM_KEBUN
            while h["proses"] >= lama and (h.get("siap") or 0) < maks:
                h["proses"] -= lama
                h["siap"] = (h.get("siap") or 0) + 1


def _kandang(d: dict, bid) -> tuple[dict, dict]:
    o = _benda(d, bid)
    if o["n"] not in KANDANG:
        raise Ditolak("Itu bukan kandang.")
    return o, d["kandang"].setdefault(str(o["id"]), {"hewan": []})


def beli_hewan(kon: sqlite3.Connection, uid: int, bid, j: str) -> dict:
    d = baca_rumah(kon, uid)
    kini = time.time()
    _maju_kandang(d, kini)
    o, kd = _kandang(d, bid)
    nama, kapasitas, boleh = KANDANG[o["n"]]
    if j not in boleh:
        raise Ditolak(f"{nama} tidak cocok untuk hewan itu.")
    if len(kd["hewan"]) >= kapasitas:
        raise Ditolak(f"{nama} sudah penuh ({kapasitas} ekor).")
    ubah_koin(kon, uid, -HEWAN[j][1], f"beli {HEWAN[j][0].lower()}")
    kd["hewan"].append({"j": j, "kenyang": 0, "proses": 0, "siap": 0, "cek": kini})
    simpan_rumah(kon, uid, d)
    return {"rumah": potret_rumah(kon, uid, d), "koin": saldo(kon, uid)}


def beri_pakan(kon: sqlite3.Connection, uid: int, bid) -> dict:
    d = baca_rumah(kon, uid)
    kini = time.time()
    _maju_kandang(d, kini)
    _, kd = _kandang(d, bid)
    diberi = 0
    for h in kd["hewan"]:
        if (h.get("kenyang") or 0) > kini + (KENYANG_JAM - 1) * konfig.JAM_KEBUN:
            continue
        try:
            kurang_barang(kon, uid, "pakan", HEWAN[h["j"]][4])
        except Ditolak:
            break
        h["kenyang"] = kini + KENYANG_JAM * konfig.JAM_KEBUN
        h["cek"] = kini
        diberi += 1
    if not diberi:
        raise Ditolak("Semua hewan masih kenyang, atau pakan habis (beli di Koperasi).")
    simpan_rumah(kon, uid, d)
    return {"rumah": potret_rumah(kon, uid, d), "inventori": inventori(kon, uid), "diberi": diberi}


def ambil_produk(kon: sqlite3.Connection, uid: int, bid) -> dict:
    d = baca_rumah(kon, uid)
    _maju_kandang(d, time.time())
    _, kd = _kandang(d, bid)
    dapat = 0
    for h in kd["hewan"]:
        n = int(h.get("siap") or 0)
        if n:
            tambah_barang(kon, uid, HEWAN[h["j"]][2], n)
            h["siap"] = 0
            dapat += n
    if not dapat:
        raise Ditolak("Belum ada hasil. Hewan hanya berproduksi selama kenyang.")
    simpan_rumah(kon, uid, d)
    tambah_statistik(kon, uid, "produk", dapat)
    xp_kegiatan(kon, uid, "produk", dapat)
    return {"rumah": potret_rumah(kon, uid, d), "inventori": inventori(kon, uid), "dapat": dapat}


def potret_rumah(kon: sqlite3.Connection, uid: int, d: dict | None = None) -> dict:
    """Rumah untuk peramban: denah + keadaan kebun/kandang saat ini (waktu sudah dimajukan dan disimpan)."""
    segar = d is None
    d = d or baca_rumah(kon, uid)
    kini = time.time()
    _maju_kebun(d, kini)
    _maju_kandang(d, kini)
    if segar:
        simpan_rumah(kon, uid, d)
    kandang = {}
    for k, kd in d["kandang"].items():
        kandang[k] = {"hewan": [{"j": h["j"], "kenyang": (h.get("kenyang") or 0) > kini, "siap": int(h.get("siap") or 0)}
                                for h in kd.get("hewan") or []]}
    return {"lebar": d["lebar"], "tinggi": d["tinggi"], "lantai": d["lantai"], "tembok": d["tembok"], "benda": d["benda"],
            "petak": {k: _potret_petak(pt, kini) for k, pt in d["petak"].items()}, "kandang": kandang}


# ---------------------------------------------------------------- misi harian

def _pilih_misi(uid: int, hari: str, lv: int = LEVEL_MAKS) -> list[str]:
    kode = sorted(k for k in MISI if BUKA.get(k, 1) <= lv)          # misi trace tak muncul sebelum trace terbuka
    urut = sorted(kode, key=lambda k: hashlib.sha256(f"{uid}|{hari}|{k}".encode()).hexdigest())
    return urut[:MISI_PER_HARI]


def baca_misi(kon: sqlite3.Connection, uid: int) -> dict:
    hari = hari_wib()
    r = kon.execute("SELECT data FROM misi WHERE pemakai_id = ? AND hari = ?", (uid, hari)).fetchone()
    d = basis.muat_json(r["data"], {}) if r else {}
    if not d.get("misi"):
        d = {"misi": {k: 0 for k in _pilih_misi(uid, hari, level(kon, uid))}, "lunas": [], "bonus": False, "masuk": False}
    return d


def _simpan_misi(kon: sqlite3.Connection, uid: int, d: dict) -> None:
    kon.execute("INSERT INTO misi (pemakai_id, hari, data) VALUES (?, ?, ?) ON CONFLICT(pemakai_id, hari) DO UPDATE SET data = excluded.data",
                (uid, hari_wib(), basis.tulis_json(d)))


def potret_misi(kon: sqlite3.Connection, uid: int) -> dict:
    d = baca_misi(kon, uid)
    return {"misi": [{"kode": k, "judul": MISI[k][0], "sasaran": MISI[k][1], "hadiah": MISI[k][2], "maju": min(v, MISI[k][1]),
                      "lunas": k in d["lunas"]} for k, v in d["misi"].items() if k in MISI],
            "bonus": BONUS_MISI, "bonus_lunas": bool(d.get("bonus"))}


def catat_aksi(kon: sqlite3.Connection, uid: int, kode: str, n: int = 1) -> list[dict]:
    """Majukan misi harian; misi yang tuntas langsung dibayar. Mengembalikan daftar hadiah yang baru cair."""
    d = baca_misi(kon, uid)
    cair = []
    if kode in d["misi"] and kode not in d["lunas"]:
        d["misi"][kode] += n
        if d["misi"][kode] >= MISI[kode][1]:
            d["lunas"].append(kode)
            ubah_koin(kon, uid, MISI[kode][2], "misi: " + MISI[kode][0])
            tambah_xp(kon, uid, XP["misi"])
            cair.append({"judul": MISI[kode][0], "koin": MISI[kode][2]})
            if len(d["lunas"]) >= len(d["misi"]) and not d.get("bonus"):
                d["bonus"] = True
                ubah_koin(kon, uid, BONUS_MISI, "bonus misi harian tuntas")
                cair.append({"judul": "Semua misi hari ini tuntas", "koin": BONUS_MISI})
        _simpan_misi(kon, uid, d)
    return cair


def bonus_masuk(kon: sqlite3.Connection, uid: int) -> int:
    """Bonus hadir sekali per hari (WIB). 0 = sudah diambil."""
    d = baca_misi(kon, uid)
    if d.get("masuk"):
        return 0
    d["masuk"] = True
    _simpan_misi(kon, uid, d)
    ubah_koin(kon, uid, BONUS_MASUK, "bonus hadir harian")
    tambah_xp(kon, uid, XP["hadir"])
    return BONUS_MASUK


# ---------------------------------------------------------------- tas, tata letak, makanan (0.4.0)

def beli_tas(kon: sqlite3.Connection, uid: int) -> dict:
    tas = int(kon.execute("SELECT tas FROM karakter WHERE pemakai_id = ?", (uid,)).fetchone()["tas"])
    if tas >= TAS_MAKS:
        raise Ditolak("Tasmu sudah yang paling besar.")
    ubah_koin(kon, uid, -HARGA_TAS * (tas + 1), f"beli tas ke-{tas + 1}")
    kon.execute("UPDATE karakter SET tas = tas + 1 WHERE pemakai_id = ?", (uid,))
    return potret_tas(kon, uid)


def baca_tata(kon: sqlite3.Connection, uid: int) -> dict:
    r = kon.execute("SELECT tata FROM karakter WHERE pemakai_id = ?", (uid,)).fetchone()
    return tata_sah(basis.muat_json(r["tata"], {}) if r else {})


def tata_sah(t) -> dict:
    """Tata letak inventory (urutan slot), isi hotbar, dan pilihan tampilan — hanya bentuk yang dikenal."""
    t = t if isinstance(t, dict) else {}
    kode = lambda v: v if isinstance(v, str) and 0 < len(v) <= 64 else None        # noqa: E731
    urut = [kode(v) for v in (t.get("urut") if isinstance(t.get("urut"), list) else [])][:SLOT_AWAL + SLOT_PER_TAS * TAS_MAKS]
    hotbar = ([kode(v) for v in (t.get("hotbar") if isinstance(t.get("hotbar"), list) else [])] + [None] * HOTBAR)[:HOTBAR]
    return {"urut": urut, "hotbar": hotbar, "bilah": t.get("bilah") is not False}


def simpan_tata(kon: sqlite3.Connection, uid: int, t) -> dict:
    bersih = tata_sah(t)
    kon.execute("UPDATE karakter SET tata = ? WHERE pemakai_id = ?", (basis.tulis_json(bersih), uid))
    return {"tata": bersih}


def potret_tas(kon: sqlite3.Connection, uid: int) -> dict:
    tas = int(kon.execute("SELECT tas FROM karakter WHERE pemakai_id = ?", (uid,)).fetchone()["tas"])
    return {"tas": {"jumlah": tas, "kapasitas": SLOT_AWAL + SLOT_PER_TAS * tas, "harga": HARGA_TAS * (tas + 1) if tas < TAS_MAKS else None},
            "inventori": inventori(kon, uid)}


def makan(kon: sqlite3.Connection, uid: int, barang: str) -> dict:
    m = MAKANAN.get(barang[6:]) if isinstance(barang, str) and barang.startswith("makan:") else None
    if not m:
        raise Ditolak("Itu bukan makanan.")
    kurang_barang(kon, uid, barang)
    tambah_statistik(kon, uid, "makan")
    return {"stamina": m[2], "kopi": m[3], "inventori": inventori(kon, uid), "nama": m[0]}


def masak(kon: sqlite3.Connection, uid: int, kode: str) -> dict:
    bahan = RESEP.get(kode)
    if not bahan:
        raise Ditolak("Resep tidak dikenal.")
    for b, n in bahan.items():
        kurang_barang(kon, uid, b, n)
    tambah_barang(kon, uid, "makan:" + kode)
    tambah_xp(kon, uid, XP_MASAK)
    tambah_statistik(kon, uid, "masak")
    return {"inventori": inventori(kon, uid), "dapat": "makan:" + kode}


# ---------------------------------------------------------------- karakter

GAYA_RAMBUT = ("", "rambut_panjang", "rambut_keriting", "rambut_cepak", "rambut_bob", "rambut_kuncir")
KEPALA = ("", "topi_bisbol", "kupluk", "headset", "kerudung", "topi_fedora", "helm_proyek")
MATA = ("", "kacamata", "kacamata_bulat", "kacamata_hitam")
POLA_NAMA = re.compile(r"^[\w .'-]{2,20}$", re.UNICODE)


def tampilan_sah(t) -> dict:
    """Saring tampilan kiriman peramban menjadi bentuk yang dikenal tokoh.js (bagian tak sah dibuang)."""
    t = t if isinstance(t, dict) else {}
    hasil = {}
    for k in ("kulit", "rambut_warna", "baju", "celana", "sepatu", "aksen"):
        if POLA_WARNA.match(str(t.get(k) or "")):
            hasil[k] = t[k].lower()
    hasil["gaya_rambut"] = t.get("gaya_rambut") if t.get("gaya_rambut") in GAYA_RAMBUT else ""
    hasil["kepala"] = t.get("kepala") if t.get("kepala") in KEPALA else ""
    hasil["mata"] = t.get("mata") if t.get("mata") in MATA else ""
    for k in ("dasi", "tali", "telinga", "jubah"):
        hasil[k] = bool(t.get(k))
    return hasil


def buat_karakter(kon: sqlite3.Connection, uid: int, nama: str, tampilan) -> None:
    nama = " ".join(str(nama or "").split())
    if not POLA_NAMA.match(nama):
        raise Ditolak("Nama karakter 2–20 karakter (huruf, angka, spasi).")
    t = basis.tulis_json(tampilan_sah(tampilan))
    ada = kon.execute("SELECT 1 FROM karakter WHERE pemakai_id = ?", (uid,)).fetchone()
    if ada:
        kon.execute("UPDATE karakter SET nama = ?, tampilan = ? WHERE pemakai_id = ?", (nama, t, uid))
        return
    kon.execute("INSERT INTO karakter (pemakai_id, nama, tampilan, koin, dibuat) VALUES (?, ?, ?, 0, ?)", (uid, nama, t, time.time()))
    ubah_koin(kon, uid, konfig.KOIN_AWAL, "modal awal")
    for b, n in PAKET_AWAL.items():
        tambah_barang(kon, uid, b, n)
    simpan_rumah(kon, uid, rumah_kosong())


def info_toko() -> dict:
    return {
        "tanaman": {k: {"nama": v[0], "jam": v[1], "benih": v[2], "jual": v[3], "ulang": v[4], "pohon": v[5]} for k, v in TANAMAN.items()},
        "hewan": {k: {"nama": v[0], "harga": v[1], "produk": v[2], "jam": v[3], "pakan": v[4]} for k, v in HEWAN.items()},
        "produk": {k: {"nama": v[0], "jual": v[1]} for k, v in PRODUK.items()},
        "kandang": {k: {"nama": v[0], "kapasitas": v[1], "hewan": list(v[2])} for k, v in KANDANG.items()},
        "harga": {"pakan": HARGA_PAKAN, "lantai": HARGA_LANTAI, "tembok": HARGA_TEMBOK, "jual_kembali": JUAL_KEMBALI},
        "tak_dijual": list(KATEGORI_TAK_DIJUAL), "jam_kebun": konfig.JAM_KEBUN, "basah_jam": BASAH_JAM,
        "makanan": {k: {"nama": v[0], "harga": v[1], "stamina": v[2], "kopi": v[3], "ikon": v[4]} for k, v in MAKANAN.items()},
        "resep": RESEP, "hotbar": HOTBAR,
        "tingkat_harga": [list(t) for t in TINGKAT_HARGA], "level_puncak": LEVEL_BARANG_PUNCAK, "level_khusus": LEVEL_KHUSUS,
    }
