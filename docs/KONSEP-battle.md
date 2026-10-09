# Konsep — Battle: serangan zombie

Status: **RANCANGAN, menunggu kata yosi.** Belum ada yang dibangun. Sumber: permintaan yosi 9 Oktober 2026.

## Yang diminta

1. Tiap beberapa menit zombie menyerang kantor. Pemain mengalahkannya dengan tangan kosong atau item battle.
2. Item battle dibeli di NPC khusus battle. Tiap item punya damage sendiri; tangan kosong paling kecil. Zombie punya HP.
3. Animasi: ayunan memukul, efek kena di zombie, zombie kalah (jatuh lalu hilang perlahan).
4. Menang: dapat EXP dan koin jatuh, nilainya kecil dulu.
5. Audio: suara zombie dan musik menegangkan saat zombie datang; musik tenang saat tidak ada zombie.
6. Admin mengatur dari dashboard: acak, atau tiap sekian menit.

## Rancangan

### Zombie milik server

Zombie tidak boleh dihitung di peramban (tiap pemain akan melihat zombie yang berbeda, dan hadiah bisa dicurangi).
Server menyimpan daftar zombie di ingatan (`Dunia.zombie`: id, x, y, hp, hp_maks, sasaran, keadaan) dan satu putaran
latar (pola `putar_lapar`) yang:

- memunculkan **gelombang** hanya di adegan kantor dan hanya bila ada pemain daring di kantor;
- menggerakkan tiap zombie ke pemain terdekat (langkah kasar per 250 ms, peramban menghaluskan geraknya);
- menyiarkan lewat WebSocket: `zombie_muncul`, `zombie_pos`, `zombie_kena`, `zombie_mati`, `gelombang_selesai`.

Zombie tidak disimpan ke basis data: restart server = gelombang berakhir tanpa hadiah.

### Memukul

Peramban mengirim `pukul` (tombol **Spasi**, tombol baru di layar sentuh). Server yang memutuskan: zombie terdekat di
depan pemain dalam jangkauan senjata, jeda antarpukulan dipenuhi, lalu HP zombie dikurangi sebesar damage senjata yang
sedang dipegang di hotbar. Peramban hanya memutar animasi dari jawaban server.

### Senjata (item battle)

Jenis barang baru `senjata:<kode>` di inventory dan hotbar. Dipegang = dipakai. Tidak habis dipakai.

| Senjata | Damage | Jeda | Jangkauan | Harga | Level |
|---|---|---|---|---|---|
| Tangan kosong | 1 | 0,5 dtk | 18 px | gratis | 1 |
| Sapu | 2 | 0,5 dtk | 26 px | 150 | 1 |
| Kunci inggris | 3 | 0,6 dtk | 20 px | 400 | 3 |
| Tongkat bisbol | 5 | 0,7 dtk | 26 px | 900 | 5 |
| Kabel LAN (cambuk) | 4 | 0,4 dtk | 34 px | 1.400 | 7 |
| Pemadam api | 8 | 1,0 dtk | 24 px | 2.500 | 10 |

Angka adalah tebakan awal. Dijual oleh **NPC battle** baru (peran `battle`, nama usulan "Bang Jago", satpam kantor),
ditambahkan sekali ke peta aktif dengan pola yang sama seperti penjual pakaian.

### Zombie

| Jenis | HP | Laju | Serangan | EXP | Koin jatuh |
|---|---|---|---|---|---|
| Zombie biasa | 6 | 28 px/dtk | 8 Health per gigitan | 5 | 3–6 |
| Zombie gesit (mulai gelombang ke-3 hari itu) | 4 | 46 px/dtk | 6 | 6 | 4–8 |
| Zombie besar (satu per gelombang besar) | 20 | 18 px/dtk | 15 | 20 | 15–25 |

Jumlah per gelombang = 2 + jumlah pemain di kantor (paling banyak 12). EXP untuk semua yang ikut memukul zombie itu;
koin jatuh di lantai dan diambil pemain pertama yang menginjaknya. EXP battle punya jatah harian seperti kegiatan lain
supaya level tidak bisa digiling.

### Health pindah ke server

Sekarang Health (lelah) dihitung di peramban. Untuk battle harus di server: kolom `karakter.health`, berkurang karena
gigitan, pulih perlahan dan lebih cepat saat duduk atau makan. Lari tetap memakai lelah yang dihitung peramban (bilah
yang sama, nilainya diambil yang lebih kecil).

**Health habis = pingsan**: layar gelap sebentar, bangun di lobi dengan Health separuh, tidak kehilangan koin maupun
barang, dan tidak bisa memukul selama 10 detik. Tidak ada mati.

### Aman dari gangguan

- Zombie hanya di kantor. Rumah pemain selalu aman.
- Pemain yang sedang duduk di meja kerja dan membuka Komputer atau Remote **tidak digigit** (supaya kerja sungguhan
  tidak terganggu), tetapi juga tidak mendapat hadiah.
- Selagi admin membuka Edit Map, gelombang ditunda.
- Zombie menghormati penghalang peta (tembok, perabot) dengan pencarian jalan sederhana di grid.

### Animasi dan sprite (perlu Agent Design)

- Zombie: jalan 4 arah (2 bingkai), kena (kedip putih), jatuh (2 bingkai) lalu memudar 1 detik.
- Ayunan: satu sprite lengkung ayunan per arah, diwarnai menurut senjata; ikon tiap senjata untuk inventory.
- Efek kena: percikan kecil 3 bingkai; angka damage melayang (pola `apung` yang sudah ada).
- Koin jatuh: memakai ikon koin yang sudah ada, memantul sekali.

Sprite baru butuh jalur masuk ke atlas Kevi (sekarang atlas dipanggang dari Agent Pak).

### Audio

Kevi belum punya audio. Agent Pak **tidak menyimpan berkas musik**: musiknya dibangkitkan langsung di peramban
(Web Audio, `musik.js`). Usul: salin pembangkit itu untuk musik tenang, lalu buat dengan cara yang sama musik tegang
(tempo cepat, nada minor) dan suara zombie (geraman dari derau + osilator rendah), jadi tidak ada berkas dari luar dan
tidak ada soal lisensi. Peramban menolak memutar sebelum ada interaksi, jadi musik mulai setelah klik atau tombol
pertama. Sakelar bisu dan volume di Menu, diingat di peramban; bawaan: menyala dengan volume rendah.

### Pengaturan admin (tab Pengaturan di dashboard)

| Kunci | Bawaan | Arti |
|---|---|---|
| `zombie_aktif` | mati | Sakelar utama. Bawaan mati sampai yosi menyalakannya. |
| `zombie_mode` | `interval` | `interval` = tiap sekian menit; `acak` = acak antara separuh dan dua kali angka itu. |
| `zombie_menit` | 15 | Jarak antargelombang (3–240). |
| `zombie_jumlah` | 0 | 0 = otomatis menurut jumlah pemain; selain itu jumlah tetap (1–12). |
| `zombie_hp` | 100 | Persen pengali HP (50–400). |
| `zombie_hadiah` | 100 | Persen pengali EXP dan koin (0–300). |
| `zombie_jam` | kosong | Jam boleh menyerang, mis. `09-17`; kosong = kapan saja. |

Ditambah tombol **Panggil gelombang sekarang** untuk mencoba.

## Tahap membangun

1. **B1** Health di server + pingsan. Belum ada zombie; yang berubah hanya tempat hitungnya.
2. **B2** Zombie server (muncul, jalan, gigit, mati) + pukulan tangan kosong + hadiah + pengaturan admin, memakai
   sprite sementara dari yang sudah ada.
3. **B3** Senjata + NPC battle.
4. **B4** Audio (musik tenang, tegang, suara zombie, sakelar).
5. **B5** Sprite dan animasi final dari Agent Design.

## Pertanyaan untuk yosi

1. Health habis = pingsan lalu bangun di lobi tanpa kehilangan apa pun. Setuju, atau ada hukuman (mis. kehilangan
   sedikit koin)?
2. Pemain yang sedang membuka Komputer atau Remote kebal gigitan. Setuju?
3. Musik dan suara dibangkitkan di peramban seperti Agent Pak (tanpa berkas audio). Setuju, atau yosi punya berkas
   sendiri?
4. Daftar senjata, harga, dan damage di atas: ada yang mau diganti?
5. Zombie hanya di jam tertentu (mis. jam kerja) atau kapan saja ada pemain?
