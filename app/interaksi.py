"""Interaksi berhadiah di luar kebun: kuis jaringan, mesin arcade, kopi pantry, kirim koin.

Hadiah selalu diputuskan server. Yang bisa dipalsukan peramban (lama bermain arcade) diukur dengan jam server,
dan semua yang berhadiah punya jatah harian.
"""
from __future__ import annotations

import random
import secrets
import sqlite3
import time

from . import atur, permainan
from .permainan import Ditolak

# (soal, pilihan, indeks jawaban benar)
KUIS = [
    ("Perintah mana yang menunjukkan lompatan (hop) menuju sebuah alamat?", ["ping", "traceroute", "nslookup", "arp"], 1),
    ("Berapa jumlah alamat yang bisa dipakai host di jaringan /30?", ["1", "2", "4", "6"], 1),
    ("Port bawaan HTTPS adalah...", ["22", "80", "443", "8080"], 2),
    ("Port bawaan SSH adalah...", ["21", "22", "23", "25"], 1),
    ("Protokol yang dipakai ping adalah...", ["TCP", "UDP", "ICMP", "ARP"], 2),
    ("Apa kepanjangan DNS?", ["Domain Name System", "Dynamic Network Service", "Data Name Server", "Domain Network Setup"], 0),
    ("Subnet mask untuk /24 adalah...", ["255.0.0.0", "255.255.0.0", "255.255.255.0", "255.255.255.252"], 2),
    ("Alamat 192.168.1.1 termasuk golongan...", ["Publik", "Privat", "Loopback", "Multicast"], 1),
    ("Alamat loopback IPv4 adalah...", ["0.0.0.0", "127.0.0.1", "169.254.0.1", "255.255.255.255"], 1),
    ("Protokol routing antar-AS di internet adalah...", ["OSPF", "RIP", "BGP", "EIGRP"], 2),
    ("Lapisan OSI tempat router bekerja adalah lapisan...", ["2 (Data Link)", "3 (Network)", "4 (Transport)", "7 (Application)"], 1),
    ("Lapisan OSI tempat switch biasa bekerja adalah lapisan...", ["1 (Physical)", "2 (Data Link)", "3 (Network)", "5 (Session)"], 1),
    ("Protokol yang memetakan alamat IP ke alamat MAC adalah...", ["DNS", "DHCP", "ARP", "NAT"], 2),
    ("Protokol yang membagikan alamat IP otomatis adalah...", ["DHCP", "SNMP", "NTP", "FTP"], 0),
    ("Satuan redaman sinyal serat optik adalah...", ["Mbps", "dB", "Hz", "ms"], 1),
    ("TTL pada paket IP berkurang setiap kali melewati...", ["switch", "router", "kabel", "firewall saja"], 1),
    ("Berapa bit panjang alamat IPv6?", ["32", "64", "128", "256"], 2),
    ("Protokol untuk memantau perangkat jaringan (CPU, trafik) adalah...", ["SMTP", "SNMP", "SIP", "SSH"], 1),
    ("VLAN dipakai untuk...", ["Mempercepat kabel", "Memisahkan jaringan secara logis", "Mengenkripsi data", "Menambah alamat IP"], 1),
    ("Packet loss 0% dan latensi rendah berarti tautan...", ["Putus", "Sehat", "Penuh", "Salah rute"], 1),
    ("Port bawaan DNS adalah...", ["53", "67", "123", "161"], 0),
    ("Kabel UTP Cat6 umumnya mendukung sampai...", ["10 Mbps", "100 Mbps", "1 Gbps atau lebih", "Hanya telepon"], 2),
    ("NAT berguna untuk...", ["Menerjemahkan alamat privat ke publik", "Mempercepat DNS", "Membagi VLAN", "Mengukur redaman"], 0),
    ("Perintah untuk melihat alamat IP sebuah nama host adalah...", ["dns / nslookup", "ping -c", "mtr", "port"], 0),
]
HADIAH_KUIS = 6                     # koin per jawaban benar (selama jatah harian masih ada)
HARGA_KOPI = 5
LAMA_KOPI = 90                      # detik: stamina pulih dua kali lebih cepat
# Arcade "Cocokkan Kartu": (batas detik, koin, xp); diukur jam server sejak mulai().
ARCADE_TINGKAT = ((35, 30, 25), (60, 20, 18), (10 ** 9, 10, 12))
ARCADE_MIN_DETIK = 6                # 8 pasang tak mungkin selesai lebih cepat dari ini
KIRIM_MAKS_SEKALI = 100

_kuis: dict[int, tuple[int, list[int]]] = {}        # uid -> (indeks soal, urutan pilihan yang ditampilkan)
_arcade: dict[int, tuple[str, float]] = {}          # uid -> (token, waktu mulai)


def kuis_ambil(kon: sqlite3.Connection, uid: int) -> dict:
    permainan.butuh_level(kon, uid, "kuis")
    i = random.randrange(len(KUIS))
    urut = list(range(len(KUIS[i][1])))
    random.shuffle(urut)
    _kuis[uid] = (i, urut)
    maks = atur.baca(kon)["kuis_per_hari"]
    return {"soal": KUIS[i][0], "pilihan": [KUIS[i][1][j] for j in urut], "sisa": permainan.sisa_jatah(kon, uid, "kuis", maks)}


def kuis_jawab(kon: sqlite3.Connection, uid: int, pilih) -> dict:
    if uid not in _kuis:
        raise Ditolak("Belum ada soal. Minta soal dulu.")
    i, urut = _kuis.pop(uid)
    if not isinstance(pilih, int) or not 0 <= pilih < len(urut):
        raise Ditolak("Pilihan tidak sah.")
    benar = urut[pilih] == KUIS[i][2]
    hasil = {"benar": benar, "jawaban": KUIS[i][1][KUIS[i][2]], "koin_dapat": 0, "xp_dapat": 0}
    if benar and permainan.jatah_harian(kon, uid, "kuis", atur.baca(kon)["kuis_per_hari"]):
        permainan.ubah_koin(kon, uid, HADIAH_KUIS, "kuis jaringan")
        permainan.tambah_xp(kon, uid, permainan.XP["kuis"])
        hasil.update(koin_dapat=HADIAH_KUIS, xp_dapat=permainan.XP["kuis"])
    hasil["sisa"] = permainan.sisa_jatah(kon, uid, "kuis", atur.baca(kon)["kuis_per_hari"])
    return hasil


def arcade_mulai(kon: sqlite3.Connection, uid: int) -> dict:
    permainan.butuh_level(kon, uid, "arcade")
    token = secrets.token_urlsafe(12)
    _arcade[uid] = (token, time.time())
    return {"token": token, "sisa": permainan.sisa_jatah(kon, uid, "arcade", atur.baca(kon)["arcade_per_hari"]),
            "tingkat": [{"detik": t[0], "koin": t[1], "xp": t[2]} for t in ARCADE_TINGKAT[:2]]}


def arcade_selesai(kon: sqlite3.Connection, uid: int, token) -> dict:
    tercatat = _arcade.pop(uid, None)
    if not tercatat or tercatat[0] != token:
        raise Ditolak("Permainan itu sudah tidak berlaku.")
    lama = time.time() - tercatat[1]
    if lama < ARCADE_MIN_DETIK:
        raise Ditolak("Terlalu cepat untuk dipercaya.")
    hasil = {"detik": round(lama, 1), "koin_dapat": 0, "xp_dapat": 0}
    if permainan.jatah_harian(kon, uid, "arcade", atur.baca(kon)["arcade_per_hari"]):
        _, koin, xp = next(t for t in ARCADE_TINGKAT if lama <= t[0])
        permainan.ubah_koin(kon, uid, koin, "arcade: Cocokkan Kartu")
        permainan.tambah_xp(kon, uid, xp)
        hasil.update(koin_dapat=koin, xp_dapat=xp)
    hasil["sisa"] = permainan.sisa_jatah(kon, uid, "arcade", atur.baca(kon)["arcade_per_hari"])
    permainan.tambah_statistik(kon, uid, "arcade")
    return hasil


def kopi(kon: sqlite3.Connection, uid: int) -> dict:
    permainan.ubah_koin(kon, uid, -HARGA_KOPI, "kopi pantry")
    permainan.tambah_statistik(kon, uid, "kopi")
    return {"kopi": LAMA_KOPI}


def kirim_koin(kon: sqlite3.Connection, uid: int, ke, jumlah) -> dict:
    permainan.butuh_level(kon, uid, "kirim_koin")
    if not isinstance(jumlah, int) or isinstance(jumlah, bool) or not 1 <= jumlah <= KIRIM_MAKS_SEKALI:
        raise Ditolak(f"Jumlah 1–{KIRIM_MAKS_SEKALI} koin.")
    if not isinstance(ke, int) or ke == uid:
        raise Ditolak("Penerima tidak sah.")
    penerima = kon.execute("SELECT nama FROM karakter WHERE pemakai_id = ?", (ke,)).fetchone()
    if not penerima:
        raise Ditolak("Penerima tidak ditemukan.")
    d = permainan.baca_misi(kon, uid)
    terkirim = int(d.setdefault("hitung", {}).get("kirim", 0))
    maks = atur.baca(kon)["kirim_koin_maks"]
    if terkirim + jumlah > maks:
        raise Ditolak(f"Batas kirim hari ini {maks} koin; sisa {max(0, maks - terkirim)}.")
    d["hitung"]["kirim"] = terkirim + jumlah
    permainan._simpan_misi(kon, uid, d)
    pengirim = kon.execute("SELECT nama FROM karakter WHERE pemakai_id = ?", (uid,)).fetchone()["nama"]
    permainan.ubah_koin(kon, uid, -jumlah, f"kirim ke {penerima['nama']}")
    permainan.ubah_koin(kon, ke, jumlah, f"kiriman dari {pengirim}")
    return {"terkirim": jumlah, "ke": ke, "nama": penerima["nama"], "dari": pengirim}
