"""Pengaturan permainan yang bisa diubah admin dari dashboard (tanpa restart): angka ekonomi, NPC, titik interaksi
di peta kantor, bookmark browser, pengumuman. Disimpan per kunci di tabel `pengaturan`; yang tak tersimpan memakai
bawaan di bawah. Setiap nilai disaring di sini — dashboard tidak dipercaya begitu saja.
"""
from __future__ import annotations

import re
import sqlite3

from . import basis, konfig

PERAN_NPC = ("obrol", "toko", "misi", "kuis", "kopi", "pulang", "pakaian", "battle", "elektronik")
JENIS_TITIK = ("arcade", "kuis", "toko", "terminal", "misi")
ARAH = ("bawah", "atas", "kiri", "kanan")
POLA_ID = re.compile(r"^[a-z0-9_]{1,24}$")
PETA_W, PETA_H = 80 * 16, 80 * 16      # batas terluar; peta utama bisa diperbesar admin sampai 80 x 80 ubin

NPC_BAWAAN = [
    {"id": "rina", "nama": "Rina", "jabatan": "Customer Service", "x": 256, "y": 582, "arah": "bawah", "peran": "misi",
     "tampilan": {"kulit": "#f2c8a4", "rambut_warna": "#2e2320", "baju": "#1e3563", "celana": "#d9c8a1", "sepatu": "#2a2522",
                  "gaya_rambut": "rambut_bob", "kepala": "headset", "mata": "", "tali": True},
     "ucap": ["Selamat datang di Kevi! Aku Rina.", "Misi harian ada di aku. Selesaikan tiga-tiganya, ada bonus.",
              "Mau kerja? Duduk di meja mana saja lalu tekan E untuk membuka Komputer."]},
    {"id": "sari", "nama": "Bu Sari", "jabatan": "Koperasi", "x": 44, "y": 517, "arah": "bawah", "peran": "toko",
     "tampilan": {"kulit": "#e8b48c", "baju": "#56925c", "celana": "#3e4458", "sepatu": "#5a3a28", "kepala": "kerudung",
                  "aksen": "#6b2737", "mata": "kacamata_bulat"},
     "ucap": ["Koperasi buka! Benih, pakan, perabot, lantai, semua ada.", "Hasil kebun juga boleh dijual ke sini."]},
    {"id": "dika", "nama": "Mas Dika", "jabatan": "NOC", "x": 528, "y": 181, "arah": "bawah", "peran": "kuis",
     "tampilan": {"kulit": "#d49a6a", "rambut_warna": "#15151c", "baju": "#39404f", "celana": "#26324a", "sepatu": "#282a36",
                  "gaya_rambut": "rambut_cepak", "kepala": "", "mata": "kacamata", "telinga": True, "tali": True},
     "ucap": ["Rak server jangan disenggol ya.", "Di Terminal coba: ping 8.8.8.8, dns google.com. Level 2 baru boleh trace.",
              "Mau kuis jaringan? Jawab benar dapat XP dan koin."]},
    {"id": "tia", "nama": "Mbak Tia", "jabatan": "Pantry", "x": 384, "y": 117, "arah": "bawah", "peran": "kopi",
     "tampilan": {"kulit": "#f2c8a4", "rambut_warna": "#7a4a2a", "baju": "#e072a8", "celana": "#5a4636", "sepatu": "#e5e7eb",
                  "gaya_rambut": "rambut_kuncir", "kepala": "", "mata": ""},
     "ucap": ["Kopi? Lima koin saja, stamina langsung penuh.", "Katanya labu paling mahal dijual, tapi lama tumbuhnya.",
              "Petak kebun cuma tumbuh selama basah. Jangan lupa disiram."]},
    {"id": "budi", "nama": "Pak Budi", "jabatan": "Satpam", "x": 310, "y": 684, "arah": "bawah", "peran": "pulang",
     "tampilan": {"kulit": "#b77a4e", "rambut_warna": "#2e2320", "baju": "#1f2937", "celana": "#1f2937", "sepatu": "#282a36",
                  "gaya_rambut": "rambut_cepak", "kepala": "topi_bisbol", "aksen": "#2e2e34", "mata": ""},
     "ucap": ["Siang! Mau pulang? Jalan saja terus ke bawah.", "Tanah kosongmu menunggu dibangun."]},
    NPC_PAKAIAN := {"id": "mira", "nama": "Kak Mira", "jabatan": "Toko Pakaian", "x": 320, "y": 612, "arah": "bawah", "peran": "pakaian",
                    "tampilan": {"kulit": "#f2c8a4", "rambut_warna": "#7a4a2a", "baju": "#eadcf0", "celana": "#3f5f8a", "sepatu": "#b91c1c",
                                 "gaya_rambut": "rambut_panjang", "kepala": "topi_fedora", "aksen": "#b08a5a", "mata": "kacamata_bulat", "dasi": True},
                    "ucap": ["Baju baru, semangat baru! Lihat-lihat dulu.", "Yang sudah dibeli masuk lemarimu, bisa dipakai kapan saja.",
                             "Topi fedora dan kacamata hitam baru terbuka di level yang lebih tinggi."]},
]

BAWAAN = {
    "laju": konfig.LAJU,              # 1 jam kebun = 3600 / laju detik
    "koin_awal": konfig.KOIN_AWAL,
    "terminal": konfig.TERMINAL_AKTIF,
    "laju_jalan": 84,                 # px per detik
    "arcade_per_hari": 3,             # main arcade yang berhadiah per hari
    "kuis_per_hari": 5,
    "kirim_koin_maks": 200,           # total koin yang boleh dikirim seorang pemain per hari
    "pengumuman": "",
    "npc": NPC_BAWAAN,
    "titik": [],
    "bookmark": [],
    "pesan_sistem": [],               # pesan berulang ke semua pemain (bergiliran)
    "pesan_jeda": 15,                 # menit antar pesan sistem
    "remote_aktif": True,             # remote SSH/telnet dari Komputer
    "remote_jaringan": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
    "remote_port": [22, 23],
    # Battle (docs/KONSEP-battle.md). Sakelar utama bawaannya mati sampai admin menyalakannya.
    "zombie_aktif": False,
    "zombie_acak": False,             # False = tiap `zombie_menit`; True = acak antara separuh dan dua kalinya
    "zombie_menit": 15,
    "zombie_jumlah": 0,               # 0 = otomatis: 2 + jumlah pemain di kantor
    "zombie_hp": 100,                 # persen pengali HP zombie
    "zombie_hadiah": 100,             # persen pengali EXP dan koin jatuh
    "zombie_denda_xp": 150,           # EXP yang hilang tiap pingsan (level bisa turun)
    "harta_menit": 10,                # jarak kemunculan peti harta di peta utama; 0 = mati
}
ANGKA = {"laju": (1, 3600), "koin_awal": (0, 100000), "laju_jalan": (40, 200), "arcade_per_hari": (0, 50),
         "kuis_per_hari": (0, 50), "kirim_koin_maks": (0, 100000), "pesan_jeda": (1, 1440),
         "zombie_menit": (1, 240), "zombie_jumlah": (0, 12), "zombie_hp": (50, 400), "zombie_hadiah": (0, 300), "zombie_denda_xp": (0, 5000), "harta_menit": (0, 240)}


class AturDitolak(ValueError):
    pass


def _teks(v, maks: int) -> str:
    return " ".join(str(v or "").split())[:maks]


def _posisi(d: dict) -> tuple[int, int]:
    x, y = d.get("x"), d.get("y")
    if not (isinstance(x, (int, float)) and isinstance(y, (int, float))):
        raise AturDitolak("Posisi harus angka.")
    return int(max(0, min(PETA_W - 16, x))), int(max(0, min(PETA_H - 20, y)))


def _npc_sah(daftar) -> list[dict]:
    from . import permainan
    if not isinstance(daftar, list) or len(daftar) > 30:
        raise AturDitolak("Daftar NPC tidak sah (paling banyak 30).")
    hasil, terpakai = [], set()
    for n in daftar:
        if not isinstance(n, dict) or not POLA_ID.match(str(n.get("id") or "")) or n["id"] in terpakai:
            raise AturDitolak("Id NPC harus unik: huruf kecil, angka, garis bawah.")
        terpakai.add(n["id"])
        nama = _teks(n.get("nama"), 24)
        if not nama:
            raise AturDitolak("NPC butuh nama.")
        x, y = _posisi(n)
        ucap = [_teks(u, 160) for u in (n.get("ucap") or []) if _teks(u, 160)][:8]
        hasil.append({"id": n["id"], "nama": nama, "jabatan": _teks(n.get("jabatan"), 32), "x": x, "y": y,
                      "arah": n.get("arah") if n.get("arah") in ARAH else "bawah",
                      "peran": n.get("peran") if n.get("peran") in PERAN_NPC else "obrol",
                      "tampilan": permainan.tampilan_sah(n.get("tampilan")), "ucap": ucap or ["Halo!"]})
    return hasil


def _titik_sah(daftar) -> list[dict]:
    if not isinstance(daftar, list) or len(daftar) > 40:
        raise AturDitolak("Daftar titik tidak sah (paling banyak 40).")
    hasil, terpakai = [], set()
    for t in daftar:
        if not isinstance(t, dict) or not POLA_ID.match(str(t.get("id") or "")) or t["id"] in terpakai:
            raise AturDitolak("Id titik harus unik: huruf kecil, angka, garis bawah.")
        if t.get("jenis") not in JENIS_TITIK:
            raise AturDitolak("Jenis titik tidak dikenal.")
        terpakai.add(t["id"])
        x, y = _posisi(t)
        hasil.append({"id": t["id"], "jenis": t["jenis"], "x": x, "y": y, "label": _teks(t.get("label"), 40)})
    return hasil


def _bookmark_sah(daftar) -> list[dict]:
    if not isinstance(daftar, list) or len(daftar) > 30:
        raise AturDitolak("Daftar bookmark tidak sah (paling banyak 30).")
    hasil = []
    for b in daftar:
        url = str((b or {}).get("url") or "").strip()[:300] if isinstance(b, dict) else ""
        if not re.match(r"^https?://[^\s\"'<>]+$", url):
            raise AturDitolak("Alamat bookmark harus diawali http:// atau https://")
        hasil.append({"nama": _teks(b.get("nama"), 40) or url, "url": url})
    return hasil


def saring(kunci: str, nilai):
    if kunci in ANGKA:
        if isinstance(nilai, bool) or not isinstance(nilai, (int, float)):
            raise AturDitolak(f"{kunci} harus angka.")
        bawah, atas = ANGKA[kunci]
        if not bawah <= nilai <= atas:
            raise AturDitolak(f"{kunci} harus antara {bawah} dan {atas}.")
        return float(nilai) if kunci == "laju" else int(nilai)
    if kunci in ("terminal", "remote_aktif", "zombie_aktif", "zombie_acak"):
        return bool(nilai)
    if kunci == "pesan_sistem":
        if not isinstance(nilai, list) or len(nilai) > 20:
            raise AturDitolak("Pesan sistem paling banyak 20 baris.")
        return [t for t in (_teks(v, 200) for v in nilai) if t]
    if kunci == "remote_jaringan":
        import ipaddress
        if not isinstance(nilai, list) or len(nilai) > 30:
            raise AturDitolak("Daftar jaringan remote tidak sah (paling banyak 30).")
        try:
            return [str(ipaddress.ip_network(str(v).strip(), strict=False)) for v in nilai if str(v).strip()]
        except ValueError as e:
            raise AturDitolak(f"Jaringan remote tidak sah: {e}") from e
    if kunci == "remote_port":
        if not isinstance(nilai, list) or len(nilai) > 10 or not all(isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 65535 for v in nilai):
            raise AturDitolak("Port remote harus daftar angka 1–65535 (paling banyak 10).")
        return sorted(set(nilai))
    if kunci == "pengumuman":
        return _teks(nilai, 240)
    if kunci == "npc":
        return _npc_sah(nilai)
    if kunci == "titik":
        return _titik_sah(nilai)
    if kunci == "bookmark":
        return _bookmark_sah(nilai)
    raise AturDitolak(f"Pengaturan tidak dikenal: {kunci}")


_cache: dict | None = None


def baca(kon: sqlite3.Connection) -> dict:
    global _cache
    if _cache is None:
        d = dict(BAWAAN)
        for r in kon.execute("SELECT kunci, nilai FROM pengaturan"):
            if r["kunci"] in BAWAAN:
                try:
                    d[r["kunci"]] = saring(r["kunci"], basis.muat_json("[" + r["nilai"] + "]", [None])[0])
                except AturDitolak:
                    pass                                  # nilai lama yang tak lagi sah: pakai bawaan
        _cache = d
        terapkan(d)
    return _cache


def simpan(kon: sqlite3.Connection, perubahan: dict) -> dict:
    """Saring semua dulu, baru tulis — satu nilai tak sah membatalkan seluruhnya."""
    global _cache
    bersih = {k: saring(k, v) for k, v in perubahan.items()}
    for k, v in bersih.items():
        kon.execute("INSERT INTO pengaturan (kunci, nilai) VALUES (?, ?) ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai",
                    (k, basis.tulis_json(v)))
    _cache = None
    return baca(kon)


def terapkan(d: dict) -> None:
    konfig.LAJU = float(d["laju"])
    konfig.JAM_KEBUN = 3600.0 / konfig.LAJU
    konfig.KOIN_AWAL = int(d["koin_awal"])
    konfig.TERMINAL_AKTIF = bool(d["terminal"])


NPC_BATTLE = {"id": "jago", "nama": "Bang Jago", "jabatan": "Keamanan", "x": 350, "y": 684, "arah": "bawah", "peran": "battle",
              "tampilan": {"kulit": "#b77a4e", "rambut_warna": "#15151c", "baju": "#39404f", "celana": "#26324a", "sepatu": "#282a36",
                           "gaya_rambut": "rambut_cepak", "kepala": "helm_proyek", "mata": "kacamata_hitam", "telinga": True},
              "ucap": ["Zombie suka datang tiba-tiba. Jangan cuma mengandalkan tangan kosong.",
                       "Dekati zombienya, pegang senjata di hotbar, lalu tekan Spasi.",
                       "Kalau Health habis kamu pingsan, bangun di rumah, dan EXP-mu berkurang. Hati-hati."]}


def pastikan_penjual_battle(kon: sqlite3.Connection) -> bool:
    """Sekali saja (0.19.0): Bang Jago, penjual item battle, ditambahkan ke peta aktif bila belum ada NPC berperan battle.
    Tanda `penjual_battle_dipasang` mencegahnya muncul lagi kalau admin sengaja menghapusnya. True = baru ditambahkan."""
    if kon.execute("SELECT 1 FROM pengaturan WHERE kunci = 'penjual_battle_dipasang'").fetchone():
        return False
    kon.execute("INSERT INTO pengaturan (kunci, nilai) VALUES ('penjual_battle_dipasang', '1')")
    npc = baca(kon)["npc"]
    if any(n.get("peran") == "battle" for n in npc) or any(n.get("id") == NPC_BATTLE["id"] for n in npc):
        return False
    simpan(kon, {"npc": list(npc) + [NPC_BATTLE]})
    return True


NPC_ELEKTRONIK = {"id": "andi", "nama": "Koh Andi", "jabatan": "Toko Elektronik", "x": 270, "y": 684, "arah": "bawah", "peran": "elektronik",
                  "tampilan": {"kulit": "#f2c8a4", "rambut_warna": "#15151c", "baju": "#0f766e", "celana": "#3e4458", "sepatu": "#282a36",
                               "gaya_rambut": "rambut_cepak", "kepala": "", "mata": "kacamata", "tali": True},
                  "ucap": ["Handphone baru, garansi resmi! Bisa kirim pesan ke rekan di mana pun.",
                           "Dengan handphone kamu bisa menghubungi Bu Sari atau Rina tanpa jalan ke mejanya.",
                           "Handphone barang mahal: 20.000 koin, dan baru bisa dibeli mulai level 15."]}


def pastikan_penjual_elektronik(kon: sqlite3.Connection) -> bool:
    """Sekali saja (0.23.0): Koh Andi, penjual handphone, ditambahkan ke peta aktif bila belum ada NPC berperan elektronik."""
    if kon.execute("SELECT 1 FROM pengaturan WHERE kunci = 'penjual_elektronik_dipasang'").fetchone():
        return False
    kon.execute("INSERT INTO pengaturan (kunci, nilai) VALUES ('penjual_elektronik_dipasang', '1')")
    npc = baca(kon)["npc"]
    if any(n.get("peran") == "elektronik" for n in npc) or any(n.get("id") == NPC_ELEKTRONIK["id"] for n in npc):
        return False
    simpan(kon, {"npc": list(npc) + [NPC_ELEKTRONIK]})
    return True


def segarkan_ucapan_elektronik(kon: sqlite3.Connection) -> bool:
    """Koh Andi yang sudah terpasang di peta masih mengucapkan syarat lama ("mulai level 4"); samakan dengan yang berlaku.
    Ucapan yang sudah disunting admin tidak disentuh. True = ada yang diganti."""
    npc, lama, berubah = baca(kon)["npc"], "Handphone baru bisa dibeli mulai level 4.", False
    for n in npc:
        if n.get("peran") == "elektronik" and lama in (n.get("ucap") or []):
            n["ucap"] = [NPC_ELEKTRONIK["ucap"][2] if u == lama else u for u in n["ucap"]]
            berubah = True
    if berubah:
        simpan(kon, {"npc": npc})
    return berubah


def pastikan_penjual_pakaian(kon: sqlite3.Connection) -> bool:
    """Sekali saja (0.11.0): bila daftar NPC sudah disunting admin dan belum ada penjual pakaian, Kak Mira ditambahkan.
    Tanda `penjual_pakaian_dipasang` mencegahnya muncul lagi kalau admin sengaja menghapusnya. True = baru ditambahkan."""
    if kon.execute("SELECT 1 FROM pengaturan WHERE kunci = 'penjual_pakaian_dipasang'").fetchone():
        return False
    kon.execute("INSERT INTO pengaturan (kunci, nilai) VALUES ('penjual_pakaian_dipasang', '1')")
    npc = baca(kon)["npc"]
    if any(n.get("peran") == "pakaian" for n in npc) or any(n.get("id") == NPC_PAKAIAN["id"] for n in npc):
        return False
    simpan(kon, {"npc": list(npc) + [NPC_PAKAIAN]})
    return True


def lupa() -> None:
    """Untuk uji: buang cache supaya DB lain terbaca."""
    global _cache
    _cache = None


def publik(d: dict) -> dict:
    """Bagian pengaturan yang dibutuhkan peramban pemain."""
    return {"laju_jalan": d["laju_jalan"], "bookmark": d["bookmark"], "pengumuman": d["pengumuman"], "remote_port": d["remote_port"],
            "zombie_aktif": d["zombie_aktif"], "zombie_denda_xp": d["zombie_denda_xp"]}
