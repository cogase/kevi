# GDD — Kevi (Kerja Virtual)

Game Design Document · versi 1 · 9 Oktober 2026

## 1. Konsep

**Satu kalimat**: datang ke kantor pixel, kerjakan tugas jaringan sungguhan, lalu pulang membangun rumah dari
hasil kebun.

**Rasa yang dituju**: santai dan hangat seperti game bertani, tetapi berlatar kantor sendiri. Tidak ada kalah,
tidak ada tenggat, tidak ada hukuman selain tanaman yang berhenti tumbuh ketika kering.

**Pilar**
1. Kantor yang dikenal: peta Default Agent Pak, dengan ruang dan perabot yang sama.
2. Kerja itu bagian dari main: terminal nyata, bukan tiruan.
3. Rumah adalah kanvas kosong: tidak ada bangunan bawaan, semuanya ditaruh pemain.
4. Imbalan kecil yang sering: tiap sesi singkat menghasilkan sesuatu.

## 2. Putaran permainan

```
masuk -> bonus hadir -> lihat misi (Rina)
      -> kerja di meja (terminal)  ----> misi tuntas -> koin
      -> belanja di Koperasi (Bu Sari)
      -> pulang -> tanam, siram, panen, urus kandang -> jual -> koin
      -> bangun dan hias rumah -> kembali ke kantor
```

Satu putaran pendek (5 sampai 10 menit) cukup untuk menanam, menjalankan satu dua perintah, dan memanen sawi.

## 3. Kendali

| Tombol | Fungsi |
|---|---|
| W A S D atau panah | Jalan |
| Shift | Lari (1,75 kali), memakai stamina |
| 1 sampai 8 | Emote: seru, tanya, hati, tawa, nada, zzz, ide, kilau |
| L | Level dan daftar yang terbuka |
| Tab (di kotak obrolan) | Ganti saluran Sekitar / Semua |
| E | Interaksi dengan benda atau tokoh terdekat (petunjuk muncul di atas layar) |
| Enter | Obrolan |
| I / N / M | Inventory / Note / Misi |
| B | Mode Bangun (hanya di rumah sendiri) |
| R | Putar perabot yang sedang dipegang |
| Klik / seret | Taruh; seret untuk mengecat lantai dan tembok |
| Klik kanan | Kembali ke alat tangan (ambil) |
| Esc | Tutup panel, tutup terminal, berdiri dari kursi |

## 4. Karakter

Tokoh berukuran 16 x 20 piksel, dirakit dari tubuh dasar berwarna kunci ditambah lapisan aksesori, lalu
diwarnai sesuai pilihan (perakit tokoh Agent Pak). Pilihan pemain:

- 5 warna kulit, 7 warna rambut, 6 gaya rambut
- 7 penutup kepala (tanpa, topi bisbol, kupluk, headset, kerudung, fedora, helm proyek) dengan 13 warna
- 4 kacamata, 19 warna baju, 7 celana, 6 sepatu
- dasi, tali ID, earpiece, jubah

Nama karakter 2 sampai 20 karakter. Tampilan bisa diubah kapan pun tanpa biaya.

## 5. Dunia

### 5.1 Kantor
Peta 45 x 46 ubin dengan delapan ruang: Ruang Bos, Pantry, DC dan Cek, Produktivitas, Transit, Cari,
Resepsionis, serta halaman depan. Ada 45 kursi kerja; duduk di kursi mana pun membuka terminal.

| NPC | Tempat | Peran |
|---|---|---|
| Rina, Customer Service | Meja resepsionis | Membuka misi harian |
| Bu Sari, Koperasi | Pojok rekreasi, dekat mesin penjual | Membuka toko |
| Mas Dika, NOC | Ruang DC | Kuis jaringan (tiap ucapan ketiga menyodorkan soal; mulai level 2) |
| Mbak Tia, Pantry | Pantry | Kopi 5 koin: stamina penuh, pulih dua kali lebih cepat 90 detik |
| Pak Budi, Satpam | Depan pintu | Bicara dua kali: diantar pulang |

Mesin penjual juga membuka Koperasi. Rak server membuka terminal sebagai "konsol rak". Mesin arcade dan TV
konsol membuka mini game. NPC dan titik interaksi tambahan bisa ditaruh admin dari dashboard.

### 5.2 Rumah
Tanah rumput 30 x 22 ubin, berpagar di sisi bawah dengan gerbang di tengah. Di bawah gerbang ada jalan tanah:
berjalan terus ke bawah berarti berangkat ke kantor. Sebaliknya, berjalan ke bawah dari halaman kantor
berarti pulang.

Paket awal: 300 koin, 6 petak kebun, 1 Kotak Kiriman, 6 benih sawi, 3 benih wortel, 1 bangku taman.

## 6. Kegiatan kerja

Terminal adalah jendela hijau di bagian bawah layar; tokoh tetap terlihat duduk di mejanya.

| Perintah | Yang dilakukan |
|---|---|
| `ping <host>` | 4 paket ICMP |
| `trace <host>` | traceroute, paling banyak 20 lompatan |
| `mtr <host>` | ringkasan rute dan kehilangan paket, 5 putaran |
| `dns <host>` | alamat IP sebuah nama |
| `port <host> <n>` | cek port TCP |
| `catat [judul]` | simpan keluaran terakhir ke Note |

Kegiatan baru cukup ditambahkan sebagai perintah (lihat TDD bagian 6). Rencana: `whois`, cek sertifikat, cek
status perangkat dari modul lain.

## 7. Ekonomi

### 7.1 Sumber koin

| Sumber | Besar |
|---|---|
| Modal awal | 300 |
| Bonus hadir | 50 per hari |
| Misi harian | 25 sampai 50 per misi, tiga misi per hari |
| Bonus tiga misi tuntas | 60 |
| Jual hasil kebun | 25 sampai 220 per panen |
| Jual hasil kandang | 18 sampai 120 per produk |

Misi yang mungkin muncul: ping, trace, ngobrol dengan 2 rekan atau NPC, siram 3 petak, panen 2 hasil, tulis
1 catatan, jual hasil senilai 50 koin, pasang 2 perabot. Tiap pemain mendapat tiga misi berbeda per hari,
dipilih dari tanggal dan id pemain. Terminal hanya memberi koin lewat misi, supaya tidak ada dorongan
membanjiri jaringan dengan ping.

### 7.2 Kebun

Tanaman hanya tumbuh selama petak basah. Sekali disiram, petak basah 12 jam kebun. Penyiram membasahi delapan
petak di sekelilingnya terus-menerus.

| Tanaman | Jam tumbuh | Benih | Jual | Berbuah lagi |
|---|---|---|---|---|
| Sawi | 3 | 10 | 30 | tidak |
| Wortel | 4 | 15 | 45 | tidak |
| Cabai | 6 | 25 | 25 | tiap 3 jam |
| Terong | 7 | 30 | 60 | tidak |
| Tomat | 8 | 30 | 35 | tiap 4 jam |
| Stroberi | 9 | 50 | 45 | tiap 5 jam |
| Jagung | 10 | 40 | 110 | tidak |
| Labu | 16 | 60 | 220 | tidak |
| Pohon jeruk | 24 | 150 | 60 | tiap 8 jam |
| Pohon mangga | 36 | 200 | 90 | tiap 10 jam |

**Jam kebun** bukan jam dinding. Panjangnya diatur `KEVI_LAJU`: bawaan 60, artinya satu jam kebun sama dengan
satu menit nyata (sawi matang 3 menit). Untuk pemakaian harian disarankan 6 sampai 12 (sawi 15 sampai 30 menit).

### 7.3 Kandang

| Hewan | Harga | Hasil | Tiap | Pakan per hari | Kandang |
|---|---|---|---|---|---|
| Ayam | 120 | Telur (18) | 12 jam | 1 | Kandang ayam, 4 ekor, 350 koin |
| Bebek | 160 | Telur bebek (25) | 12 jam | 1 | Kandang ayam |
| Kambing | 450 | Susu kambing (70) | 24 jam | 2 | Kandang ternak, 2 ekor, 900 koin |
| Sapi | 800 | Susu sapi (120) | 24 jam | 3 | Kandang ternak |

Pakan 8 koin per porsi. Hewan berproduksi hanya selama kenyang (24 jam kebun sejak diberi pakan). Hasil
menumpuk paling banyak satu hari produksi. Hewan tidak sakit dan tidak mati.

### 7.4 Belanja

- Perabot: 708 jenis dari katalog Agent Pak dengan harga yang sama (3 sampai 900 koin).
- Lantai 2 koin per ubin (55 motif), tembok 3 koin per ubin (7 warna dipilih saat memasang).
- Barang dijual kembali separuh harga.

## 7a. Stamina dan lari

Jalan 84 piksel per detik (bisa diatur admin), lari 1,75 kalinya. Stamina 100 di level 1, bertambah 6 tiap
level. Lari menguras 26 per detik; berjalan memulihkan 9 per detik, diam 22 per detik. Bila stamina habis,
pemain "lelah" (bilah merah) dan baru bisa lari lagi setelah stamina kembali 30 persen. Kopi Mbak Tia mengisi
penuh dan menggandakan pemulihan selama 90 detik.

## 7b. Level

Total XP untuk mencapai level n adalah 50 x n x (n - 1): level 2 = 100, 3 = 300, 4 = 600, 5 = 1.000,
sampai level 20. Tiap naik level: koin 40 x level, stamina +6.

| Kegiatan | XP | Jatah harian |
|---|---|---|
| Perintah terminal berhasil | 12 | 15 kali |
| Misi harian tuntas | 40 | 3 misi |
| Hadir harian | 20 | 1 kali |
| Panen | 6 | - |
| Hasil kandang | 3 per produk | - |
| Tanam / siram | 2 / 1 | - |
| Jual hasil | 1 per 10 koin | - |
| Pasang perabot | 2 | 30 kali |
| Tulis Note | 3 | 5 kali |
| Sapa NPC atau rekan | 4 | 8 kali |
| Tos | 8 | 5 kali |
| Suit | 6 | 5 kali |
| Kuis benar | 10 (+6 koin) | 5 kali |
| Arcade | 25 / 18 / 12 (+30 / 20 / 10 koin) | 3 kali |

| Level | Yang terbuka |
|---|---|
| 1 | Jalan, lari, obrolan, emote, terminal (ping, dns), kebun, kandang, Koperasi, rumah |
| 2 | Tos, kuis jaringan, perintah `trace` |
| 3 | Arcade Cocokkan Kartu, perintah `mtr`, kirim koin ke rekan |
| 4 | Tantang suit (taruhan 0, 10, atau 25 koin), Browser di Komputer |
| 5 | Perintah `port` |

Level 6 sampai 20 belum punya isi baru selain koin dan stamina; isinya menunggu ide berikutnya (ROADMAP).

## 7c. Interaksi baru

**Antarpemain** (tekan E di dekat rekan untuk membuka menunya):
- Sapa: kalimat sapaan otomatis di saluran Sekitar.
- Tos: keduanya memunculkan hati dan mendapat XP (sekali per pasangan per sesi masuk).
- Tantang suit: batu, gunting, kertas. Yang ditantang boleh menolak. Taruhan berpindah dari yang kalah.
- Kirim koin: 1 sampai 100 per kiriman, paling banyak 200 per hari (bisa diatur admin).
- Bertamu ke rumahnya.

**Arcade Cocokkan Kartu**: 16 kartu tertutup, 8 pasang gambar hasil kebun. Selesai di bawah 35 detik = 30 koin,
di bawah 60 detik = 20 koin, selebihnya 10 koin. Waktu diukur server. Tiga kali berhadiah per hari.

**Kuis jaringan**: 24 soal pilihan ganda (port, subnet, OSI, protokol). Lima jawaban benar berhadiah per hari.

**Browser**: tab kedua di Komputer. Bookmark dari admin, ditambah kolom alamat bebas. Situs yang melarang
dibingkai tampil kosong; tombol "Tab baru" membukanya di tab peramban sungguhan.

## 8. Antarmuka

- **Bilah atas**: nama, level (klik untuk daftar yang terbuka), tempat, bilah XP ungu dan stamina hijau, koin
  (klik untuk riwayat), tombol Bangun, Inventory, Note, Misi, Menu.
- **Petunjuk E** di bawah bilah atas, menyebut aksi yang akan terjadi.
- **Obrolan** di kiri bawah; gelembung di atas kepala selama lima detik.
- **Panel** berbingkai kayu di tengah untuk toko, inventory, Note, misi, menu, dan pembuat karakter.
- **Bilah Bangun** di bawah saat mode Bangun: alat tangan, isi inventory yang bisa dipasang, warna tembok.
- Angka koin melayang di atas kepala tiap kali koin berubah.

## 9. Gaya visual dan suara

Seluruh gambar memakai lembar sprite Agent Pak (ubin 16 px, garis tepi gelap, palet hangat). Antarmuka mengikuti
tema Farming Agent Pak: bingkai kayu, panel bertekstur ubin wajik, kepala panel cokelat, tombol piksel berpaku
kuningan (emas untuk aksi utama, merah muda untuk yang aktif), sulur dan lentera di bilah atas. Huruf Inter dan
JetBrains Mono (lokal).
Suara belum ada di versi ini (lihat ROADMAP).

## 10. Hal yang sengaja belum ada

Mutu panen (perak, emas), gagak, petani sewaan, kendaraan, cuaca, siang dan malam, hewan peliharaan berjalan,
dan musik. Semuanya ada di Agent Pak dan bisa dibawa bertahap.
