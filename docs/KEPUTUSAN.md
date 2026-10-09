# Keputusan — Kevi

Catatan keputusan yang diambil saat membangun 0.1.0 (yosi: "bantu ambil keputusan"), beserta alasannya, dan
hal yang menunggu keputusan yosi. Semua bisa diubah.

## Sudah diputuskan

| Kode | Keputusan | Alasan | Cara mengubah |
|---|---|---|---|
| K1 - Tumpukan teknologi | FastAPI + SQLite + JavaScript polos, sama dengan Agent Pak | Aset dan skrip Agent Pak langsung terpakai; tanpa langkah build; dioperasikan dengan cara yang sudah dikenal | - |
| K2 - Peta dipanggang | Peta Default dipotret dari Agent Pak, bukan menyalin mesin penyusunnya | Mesin Agent Pak sekitar 6.000 baris saling bergantung; hasil potret persis sama dan bisa diulang satu perintah | `tools/panggang.sh` |
| K3 - Rumah digambar sendiri | Rumah memakai mesin kecil milik Kevi (lantai, tembok, perabot) | Rumah harus bisa disunting pemain; kebutuhannya jauh lebih sederhana daripada denah kantor | `rumah.js` |
| K4 - Akun terpisah | Username dan password sendiri, dibuat admin; bukan SSO Pak Apps | Permintaan: proyek terpisah seluruhnya | Lihat ROADMAP bila kelak ingin SSO |
| K5 - Server berkuasa | Koin, stok, harga, hasil panen dihitung server | Mencegah koin dicurangi dari peramban | - |
| K6 - Terminal berdaftar tetap | Hanya ping, trace, mtr, dns, port; tanpa shell; dibatasi dan dicatat | "Terminal dalam game" tidak boleh menjadi pintu masuk ke server | `terminal.py` |
| K7 - Koin terminal lewat misi | Terminal tidak memberi koin per perintah, hanya lewat misi harian | Supaya tidak ada dorongan membanjiri jaringan dengan ping | `MISI` di `permainan.py` |
| K8 - Jam kebun bisa diatur | Bawaan `KEVI_LAJU=60` (sawi 3 menit) | Enak untuk ditinjau; pemakaian harian sebaiknya 6 sampai 12 | `.env` lalu `pm2 restart kevi` |
| K9 - Harga ikut Agent Pak | Perabot, benih, hewan memakai tabel Agent Pak | Rasa ekonomi sama; tidak mengarang angka baru | `permainan.py`, `katalog.json` |
| K10 - Pulang lewat tepi bawah | Berjalan ke bawah dari halaman kantor = pulang; dari rumah = berangkat | Tidak perlu menu; terasa seperti berjalan pulang | `mesin.js cekPinggir` |
| K11 - Satu akun satu layar | Tab baru memutus tab lama | Mencegah satu karakter muncul di dua tempat | `dunia.py sambung` |
| K12 - Bertamu hanya melihat | Tamu bisa masuk rumah pemain lain tetapi tidak bisa mengubah apa pun | Aman sebagai langkah pertama | ROADMAP |
| K13 - Tanpa pratinjau | Tidak ada halaman pratinjau terpisah; tinjauan langsung di aplikasi yang berjalan | Aturan hemat token yosi (2 Okt) | - |
| K14 - Laporan token tanpa rupiah | Laporan menampilkan jumlah token, bukan biaya | Transkrip tidak mencatat harga; angka uang tidak dikarang | Tambah tarif di `laporan_token.py` bila harganya sudah pasti |

## Diputuskan untuk 0.2.0 (yosi: "kamu atur ide-ide interaksinya, bantu ambil keputusan")

| Kode | Keputusan | Alasan |
|---|---|---|
| K15 - Atur peta lewat data | "Ngatur map" = admin menaruh NPC dan titik interaksi di atas peta, bukan menyunting ubin | Menyunting ubin butuh mesin denah Agent Pak; NPC dan titik sudah cukup untuk menambah isi tanpa memanggang ulang |
| K16 - Kunci level di interaksi | Yang dikunci level adalah interaksi (tos, kuis, arcade, suit, browser, perintah terminal lanjutan), bukan kebun atau toko | Pemain baru tetap bisa bertani dan membangun; level terasa sebagai tambahan, bukan penghalang |
| K17 - Jatah harian XP | Kegiatan yang mudah diulang hanya memberi XP sekian kali sehari | Level tidak bisa digiling dengan ping atau tos berulang |
| K18 - Stamina di peramban | Stamina dihitung peramban, tidak diperiksa server | Tidak ada yang bernilai dari lari; memeriksanya di server hanya menambah lalu lintas |
| K19 - Suit bertaruh kecil | Taruhan hanya 0, 10, atau 25 koin | Seru tanpa menjadi judi sungguhan |
| K20 - Browser berbingkai | Browser dalam game = `iframe` ber-sandbox dengan bookmark admin | Peramban di dalam peramban; banyak situs melarang dibingkai, jadi ada tombol Tab baru |
| K21 - Pendaftaran manual | Belum ada halaman daftar | Kata yosi: sekarang manual dulu |
| K22 - Kecepatan jalan naik | Jalan 62 -> 84 piksel per detik, lari 1,75 kali | Kata yosi: jalannya agak pelan |

## Menunggu keputusan yosi

| Kode | Pertanyaan | Bawaan saat ini |
|---|---|---|
| Y1 - Alamat publik | Kevi kini di `http://<alamat-server>:8800` (LAN). Bila ingin dibuka dari luar kantor perlu satu Proxy Host di NPM (misalnya `kevi.dud.co.id` ke `<alamat-server>:8800`, WebSocket dinyalakan), lalu `KEVI_COOKIE_SECURE=1` | Hanya LAN |
| Y2 - Laju kebun | Tetap 60 (cepat) atau turun ke 6 sampai 12 untuk pemakaian harian | 60 |
| Y3 - Nama dan ucapan NPC | Rina, Bu Sari, Mas Dika, Mbak Tia, Pak Budi beserta kalimatnya adalah karangan awal | Bisa diganti sendiri di dashboard admin, tab Peta & NPC |
| Y4 - Sasaran terminal | Bolehkah ke alamat mana pun, atau dibatasi ke jaringan tertentu | Mana pun, dibatasi laju dan dicatat |
| Y5 - Besaran koin | Modal 300, bonus hadir 50, hadiah misi 25 sampai 50 | Seperti tertulis |
| Y6 - Remote git | Repo baru lokal saja, belum ada remote | Tidak di-push ke mana pun |
| Y7 - Isi level 6 ke atas | Level 6 sampai 20 baru memberi koin dan stamina; perlu ide interaksi berikutnya | Lihat ROADMAP |
| Y8 - Angka level | Hadiah naik 40 x level, jatah XP harian, hadiah kuis dan arcade adalah tebakan awal | Seperti tertulis di GDD 7b |

