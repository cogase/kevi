# PRD — Kevi (Kerja Virtual)

Versi dokumen 1 · 9 Oktober 2026 · status: draf untuk ditinjau yosi

## 1. Ringkasan

Kevi adalah game 2D pixel berbasis peramban tempat karyawan masuk dengan akun sendiri, membuat karakter, lalu
"bekerja" di kantor virtual: berjalan dengan WASD, mengobrol dengan rekan, menjalankan kegiatan kerja nyata
(saat ini perintah jaringan lewat terminal dalam game), mencatat, dan pulang ke rumah berupa tanah kosong
yang dibangun dan dihias dengan koin hasil bertani, beternak, dan menuntaskan misi.

Kevi berdiri sendiri, terpisah dari Pak Apps. Yang diambil dari Agent Pak hanya aset gambar, peta Default,
perakit tokoh, dan tabel ekonomi kebun/kandang.

## 2. Masalah dan peluang

- Agent Pak sudah punya 1.913 sprite, peta kantor, ekonomi koin, kebun, dan kandang, tetapi penontonnya pasif:
  orang melihat agen bekerja, tidak ikut bermain.
- Kegiatan operasional harian (ping, trace) dikerjakan di terminal masing-masing, tanpa ruang bersama.
- Peluangnya: memakai bahan yang sudah ada untuk membuat ruang bersama yang menyenangkan, tempat kegiatan
  kerja ringan tercatat dan diberi imbalan.

## 3. Sasaran

| Kode | Sasaran | Ukuran berhasil |
|---|---|---|
| S1 - Bisa dimainkan | Karyawan masuk, membuat karakter, dan bergerak di kantor dalam waktu kurang dari 2 menit | Alur masuk sampai berjalan tanpa bantuan |
| S2 - Kerja di dalam game | Perintah jaringan dijalankan dari dalam game dan hasilnya bisa disimpan | ping, trace, mtr, dns, port berjalan; keluaran tersimpan ke Note |
| S3 - Rumah milik sendiri | Tiap pemain punya tanah yang ia bangun sendiri | Lantai, tembok, dan 700 lebih perabot bisa dipasang dan diambil kembali |
| S4 - Ekonomi berputar | Koin didapat dari kebun, kandang, dan misi, lalu dibelanjakan di toko | Satu putaran tanam, panen, jual, belanja selesai dalam satu sesi |
| S5 - Ruang bersama | Pemain melihat dan menyapa pemain lain secara langsung | Posisi dan obrolan tersiar ke semua yang berada di tempat yang sama |

Bukan sasaran versi ini: tampilan ponsel dengan kendali sentuh, integrasi SSO Pak Apps, dan pertukaran barang
antarpemain (lihat ROADMAP).

## 4. Pengguna

- **Karyawan (pemain)**: masuk dengan akun buatan admin, bermain di sela kerja.
- **Admin**: membuat akun, mereset password, menonaktifkan akun, melihat laporan token proyek.

## 5. Kebutuhan fungsional

### 5.1 Akun (wajib)
- F1 - Masuk: masuk dengan username dan password; tidak ada pendaftaran mandiri.
- F2 - Kelola pemakai: admin menambah pemakai, mereset password, menonaktifkan (halaman `/admin` dan CLI).
- F3 - Ganti password: pemain mengganti password sendiri.

### 5.2 Karakter (wajib)
- F4 - Buat karakter: nama, warna kulit, warna dan gaya rambut, penutup kepala, kacamata, baju, celana, sepatu,
  dasi, tali ID, earpiece, jubah; pratinjau berjalan empat arah; tombol Acak.
- F5 - Ubah karakter kapan saja lewat Menu tanpa kehilangan koin atau barang.

### 5.3 Dunia (wajib)
- F6 - Peta kantor: peta Default Agent Pak (Office 5), 45 x 46 ubin, lengkap dengan tabrakan dan urutan kedalaman.
- F7 - Gerak: WASD atau panah, Shift untuk berlari; tombol E untuk interaksi dengan benda terdekat.
- F8 - Pemain lain: terlihat bergerak secara langsung; obrolan teks dengan gelembung di atas kepala.
- F9 - NPC: lima NPC berperan (misi, toko, petunjuk terminal, obrolan, jalan pulang).

### 5.4 Kegiatan kerja (wajib)
- F10 - Terminal: dibuka dengan duduk di meja mana pun (45 kursi) atau di rak server. Perintah: `ping`, `trace`,
  `mtr`, `dns`, `port`, `catat`, `clear`, `help`.
- F11 - Keluaran terminal bisa disimpan ke Note dengan `catat`.
- F12 - Daftar perintah mudah ditambah (satu tabel di server).

### 5.5 Inventory dan Note (wajib)
- F13 - Inventory: semua barang milik pemain dengan jumlahnya.
- F14 - Note: catatan pribadi, buat, ubah, hapus; paling banyak 200.

### 5.6 Rumah (wajib)
- F15 - Tanah kosong 30 x 22 ubin milik tiap pemain; dicapai dengan berjalan keluar kantor ke arah bawah.
- F16 - Mode Bangun: menaruh perabot (kisi 8 px, bisa diputar), lantai dan tembok per ubin (seret untuk
  mengecat), mengambil kembali ke inventory.
- F17 - Bertamu: melihat rumah pemain lain yang sedang daring (hanya melihat).

### 5.7 Ekonomi (wajib)
- F18 - Kebun: 10 tanaman; tanam, siram, panen; tumbuh hanya selama petak basah; penyiram otomatis.
- F19 - Kandang: ayam, bebek, kambing, sapi; beri pakan, ambil hasil.
- F20 - Koperasi: beli benih, pakan, perabot, lantai, tembok; jual hasil dan barang.
- F21 - Misi harian: tiga misi acak per hari per pemain, bonus bila ketiganya tuntas; bonus hadir harian.
- F22 - Riwayat koin: tiap perubahan koin tercatat beserta alasannya.

### 5.8 Laporan (permintaan yosi 9 Oktober)
- F23 - Halaman `/laporan`: total token Claude yang dipakai mengerjakan proyek, per sesi, per jam, per model.

### 5.9 Tambahan 0.2.0 (permintaan yosi 9 Oktober, pagi)
- F24 - Dashboard admin (`/admin`): ringkasan seluruh permainan (daring, koin beredar, arus koin harian, kegiatan
  terminal dan obrolan), papan peringkat, kelola pemakai (tambah, password, koin, XP, peran, nonaktif, putuskan),
  pengumuman, pengaturan permainan tanpa restart, dan log (terminal, koin, obrolan).
- F25 - Atur peta: admin menambah, menggeser, menyunting, dan menghapus NPC (nama, jabatan, peran, ucapan,
  tampilan) serta titik interaksi (arcade, kuis, toko, terminal, misi) langsung di atas gambar peta kantor;
  perubahan tersiar ke semua pemain saat disimpan.
- F26 - Obrolan dua saluran: Sekitar (yang berada di tempat yang sama) dan Semua (seluruh pemain daring),
  dengan 15 pesan terakhir saluran Semua saat masuk.
- F27 - Interaksi antarpemain: emote (tombol 1–8), tos, tantang suit dengan taruhan, kirim koin, bertamu.
- F28 - Interaksi NPC baru: kuis jaringan (Mas Dika), kopi pemulih stamina (Mbak Tia).
- F29 - Mini game: arcade "Cocokkan Kartu" di mesin arcade dan TV konsol.
- F30 - Browser dalam game: tab Browser di Komputer (meja kerja), dengan bookmark yang diatur admin.
- F31 - Lari dengan stamina: Shift untuk lari; stamina terkuras, pulih saat berjalan atau diam.
- F32 - Leveling: XP dari hampir semua kegiatan; naik level memberi koin, menambah stamina, dan membuka
  interaksi (tos, kuis, trace, arcade, mtr, kirim koin, suit, browser, port).
- F33 - Bingkai antarmuka memakai tema Farming Agent Pak (kayu, tekstur ubin, tombol piksel, sulur, lentera).
- Pendaftaran mandiri: belum dibuka (keputusan yosi: manual dulu); akun dibuat admin.

## 6. Kebutuhan nonfungsional

- N1 - Mandiri: satu proses, satu berkas SQLite, tanpa layanan luar, tanpa CDN (jaringan server tertutup).
- N2 - Keamanan: password di-hash scrypt; sesi lewat cookie HttpOnly; server yang memutuskan semua hal bernilai;
  terminal tidak pernah menjalankan shell.
- N3 - Kinerja: 60 bingkai per detik di laptop kantor; satu kanvas, latar kantor digambar dari dua gambar jadi.
- N4 - Ringan dioperasikan: berjalan sebagai user biasa di bawah pm2; uji otomatis tidak menyentuh data sungguhan.

## 7. Risiko

| Risiko | Penanganan |
|---|---|
| Terminal dipakai untuk memindai jaringan | Hanya lima perintah tetap, batas 10 per menit per pemain, 4 proses serentak, semua tercatat di `log_terminal`; bisa dimatikan dengan `KEVI_TERMINAL=0` |
| Koin dicurangi dari peramban | Peramban hanya mengusulkan aksi; harga, stok, dan hasil dihitung server |
| Peta Agent Pak berubah | Peta dipanggang ulang dengan satu perintah (`tools/panggang.sh`) |
| Alamat LAN tidak terjangkau dari luar kantor | Perlu satu host proxy di NPM (keputusan yosi, lihat KEPUTUSAN butir Y1) |

## 8. Rilis

- 0.1.0: seluruh kebutuhan wajib 5.1 sampai 5.8, satu akun admin.
- 0.2.0: butir 5.9 (dashboard admin, atur peta, interaksi, mini game, browser, stamina, leveling, tema Farming).
- Berikutnya: lihat `ROADMAP.md`.
