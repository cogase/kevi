# Catatan rilis — Kevi

Melengkapi PRD, GDD, dan TDD untuk rilis sesudah 0.2.0. Angka dan aturan di sini adalah yang berlaku di kode.

## 0.14.0 — 9 Oktober 2026

**Generate peta, seperti Agent Pak (kata yosi)**
- Di Edit Map, tombol **🎲 Generate** membuka pembangkit peta berbenih milik Agent Pak (`generator.js`, disalin utuh):
  jenis Alam, Perbukitan, Kota, Taman kota, Pantai, Perumahan, atau Acak; kepadatan Jarang, Sedang, Lebat; ukuran
  ruang kantor (tanpa kantor sampai 9 meja); dan seed. **Seed yang sama selalu menghasilkan peta yang sama.**
  "🎲 Acak ulang" memakai seed baru.
- Hasilnya mengganti seluruh isi peta yang sedang disunting **sebagai draf**: bisa diurungkan, dan baru tersiar ke
  pemain saat Simpan. Ukuran peta tetap; untuk ukuran lain buat peta kosong baru lewat ▤ Peta, aktifkan, lalu
  Generate di sana. Air menjadi ubin penghalang; ruang kantor menjadi objek Ruang yang bisa disunting.
- NPC tidak ikut dipindah: geser lewat dashboard, tab Peta & NPC, bila posisinya jatuh di air atau tembok.
- Perabot yang tidak ada di katalog Kevi dilewati; jumlahnya disebut di baris status.
- Benda kini punya centang **Bisa dilewati** di propertinya (dipakai generator untuk bunga, tangga, terumbu).
- Dok Edit Map tidak lagi bertambah tinggi saat isinya banyak: tiap baris digulir mendatar.
- Belum: Generate untuk rumah pemain (menunggu penyunting rumah yang baru).

## 0.13.0 — 9 Oktober 2026

**Koleksi peta: banyak peta untuk ganti suasana (kata yosi)**
- Di Edit Map, tombol **▤ Peta** membuka koleksi peta. Admin bisa menyimpan sampai 30 peta dan memilih satu yang
  **aktif**, yaitu yang dilihat semua pemain. Berganti peta langsung tersiar ke semua pemain, termasuk yang sedang
  di rumah.
- **Tiap peta unik**: denah, ruang, penghalang, perabot, **NPC, dan titik interaksinya** milik peta itu sendiri.
  Menggeser atau menambah NPC di satu peta tidak mengubah peta lain. Dashboard (tab Peta & NPC) selalu menyunting
  NPC peta yang sedang aktif.
- Peta baru bisa dibuat dari: **Kosong** (tanah lapang 20 sampai 80 ubin per sisi, tanpa NPC), **Kantor bawaan**
  (dengan NPC bawaan), atau **Salinan peta aktif** (termasuk NPC-nya). Nama bisa diganti langsung di daftar.
- Peta yang sedang dipakai sekarang otomatis terdaftar sebagai "Kantor utama". Peta aktif tidak bisa dihapus;
  menghapus peta lain diminta dua kali.
- Koleksi baru bisa dibuka bila draf Edit Map sudah disimpan atau diurungkan.

## 0.12.0 — 9 Oktober 2026

**Perapian Edit Map dan tampilan (kata yosi)**
- **Alat Penghalang** (kelompok Bangun): seret kotak untuk menandai ubin yang tak boleh dilewati. Tampil merah
  bersilang hanya di Edit Map, tidak terlihat oleh pemain. Dihapus dengan alat Hapus, ikut dipindah bersama grup
  bila "Ikutkan lantai & tembok" dicentang, dan bisa diurungkan.
- **Katalog perabot lebih hemat tempat**: kategori pindah ke bilah sisi kiri, isi katalog di kanan berupa ikon kecil
  tanpa tulisan. Nama perabot muncul saat kursor di atas ikonnya.
- **Kontrol zoom sembunyi sendiri**: muncul saat kursor mendekati pojok kanan bawah atau saat zoom berubah (roda
  tetikus, tombol + dan −), lalu menghilang lagi setelah dua detik. Di layar sentuh tetap tampil.

## 0.11.0 — 9 Oktober 2026

**Toko pakaian dan lemari (kata yosi: ubah karakter jangan gratis, supaya ada progres)**
- **Kak Mira**, NPC penjual pakaian baru di lobi kantor (dekat pintu depan). Tekan E untuk membuka toko. Di server
  yang daftar NPC-nya sudah disunting admin, Kak Mira ditambahkan satu kali saat versi ini pertama dinyalakan;
  bila admin menghapusnya, ia tidak muncul lagi. Posisinya bisa digeser di dashboard, tab Peta & NPC.
- **Lemari terpisah dari inventory.** Yang dibeli masuk lemari dan tidak memakan slot inventory.
- Yang dijual (harga dalam koin): kaus 30, kemeja 40 (level 2), celana 25, sepatu 20, gaya rambut 40, topi bisbol 50,
  kupluk 45, kerudung 50, headset 60 (level 2), topi fedora 80 (level 3), helm proyek 90 (level 3), kacamata 40,
  kacamata bulat 45, kacamata hitam 80 (level 4), tali ID 15, dasi 35 (level 2), earpiece 45 (level 3), jubah 250
  (level 6).
- **Ganti pakaian hanya dari isi lemari**: lewat Profil ("Ganti pakaian"), lewat perabot lemari di rumah (tekan E),
  atau langsung di toko. Server menolak tampilan yang memuat bagian yang belum dibeli.
- **Tetap gratis**: warna kulit, warna rambut, warna topi/kerudung, dan melepas apa pun ("Ubah karakter" di Profil).
- **Karakter baru** memilih satu setel dasar gratis (kaus, celana, sepatu, gaya rambut); aksesori dibeli belakangan.
- **Karakter yang sudah ada** mewarisi semua yang sedang ia kenakan saat versi ini dipasang, tanpa membayar.

## 0.10.0 — 9 Oktober 2026

**Profil pemain (permintaan yosi)**
- Menu, "Profil saya": tampang karakter, level, total XP, koin, lama bermain, slot inventory, lalu statistik kerja
  (perintah terminal, tanam, panen, hasil ternak, nilai jualan), santai (masak, makan, arcade, kopi), dan rumah
  (perabot, ubin, petak kebun, hewan). "Ubah karakter" dan sakelar bilah mini pindah ke sini.
- Profil rekan: tekan E di dekatnya, pilih "Lihat profil". Menampilkan hal yang sama, plus tombol bertamu bila ia
  sedang daring. Profil tidak memuat username maupun data akun.
- Lama bermain baru dihitung sejak versi ini (satu menit tiap menit daring).

**Feedback (permintaan yosi: seperti Bug Catcher, tetapi di dalam Kevi sendiri)**
- Menu, "Kirim saran / lapor bug": pilih jenis (saran atau bug), tulis 5 sampai 1.000 karakter. Tempat, posisi
  karakter, dan versi Kevi ikut tercatat. Paling banyak 5 kiriman per 10 menit per pemain.
- Dashboard admin, tab **Feedback** (angka di tab = yang masih baru): waktu, pengirim, jenis, isi, tempat, versi,
  status. Tombol: Tandai dibaca, Selesai (yang selesai turun ke bawah), Buka lagi, Catatan admin.
- Tidak tersambung ke sistem lain; semuanya di basis data Kevi.

## 0.9.0 — 9 Oktober 2026

**Edit Map lebih dekat ke Edit Layout Agent Pak (kata yosi: "ada layer, ruangan"; "karakter tidak bisa dimainkan")**
- **Karakter beku selagi menyunting.** W A S D dan panah menggeser kamera (Shift lebih cepat), bukan karakter.
  Seret tempat kosong dengan alat Pilih, atau seret dengan tombol tengah tetikus di alat apa pun, juga menggeser
  peta. Kamera boleh melewati tepi peta, jadi sudut peta tidak tertutup menu. Karakter tampil samar di tempatnya
  dan kembali dimainkan begitu Edit Map ditutup.
- **Alat Ruang.** Tarik kotak (minimal 3×3 ubin): dinding keliling, lantai, dan satu pintu dibuat otomatis. Ruang
  adalah satu objek: pilih dengan alat Pilih, seret untuk memindah (centang "Pindah bersama isinya" membawa benda
  dan ubin di dalamnya), seret pojok kanan bawah untuk mengubah ukuran, panah menggeser satu ubin. Properti: nama,
  warna dinding, motif lantai (atau tanpa lantai), sampai 4 pintu (sisi, geser − / +, hapus), kunci posisi, hapus.
  Alat Hapus pada ruang membuang seluruh ruang. Ubin tembok dan lantai yang ditaruh satu per satu menimpa milik ruang.
- **Layer per benda:** ▼ Bawah (digambar di bawah semua benda), ◆ Otomatis (menurut kedalaman, bawaan), ▲ Atas
  (di atas semua tokoh). Berlaku juga untuk grup. Tabrakan tidak berubah oleh layer.
- Belum ada dibanding Agent Pak: wallpaper dan tinggi dinding ruang, daun pintu, Label, Titik santai, Tempat kerja,
  lantai bertingkat.

**Kontrol sentuh untuk ponsel dan tablet (kata yosi: "mode mobile gak bisa kontrol karakternya")**
- Joystick di kiri bawah (delapan arah), tombol **E** (interaksi, atau berdiri dari kursi), **F** (pakai atau makan
  barang yang dipegang), dan **Lari** (tahan). Muncul otomatis di layar sentuh; tersembunyi saat panel atau
  Komputer terbuka. Di Edit Map joystick menggeser kamera.

## 0.8.0 — 9 Oktober 2026

**Peti (permintaan yosi: barang berlebih disimpan di peti, peti dibeli di NPC)**
- Perabot peti dijual Bu Sari di Koperasi, tab "Makanan & tas", bagian Peti: peti kayu gudang, peti kayu taman,
  kotak kolong, kotak mainan, dan empat macam loker. Harganya mengikuti harga perabot biasa.
- Taruh di rumah sendiri (mode Bangun), lalu tekan E di dekatnya: panel dua kisi, isi peti dan Inventory. Klik
  barang memindah seluruh tumpukan, Shift+klik satu, atau seret ke kisi seberang.
- Tiap peti memuat 20 jenis barang (tiap jenis menumpuk seperti slot inventory). Boleh punya banyak peti.
- Peti yang masih berisi tidak bisa diangkat. Tamu tidak bisa melihat isi peti.

## 0.7.0 — 9 Oktober 2026

**Health dan Stamina dipisah (jawaban yosi atas Y11: health = lelah, stamina = lapar)**
- **Stamina = lapar**, kini dihitung dan disimpan di server. Turun 0,5 per menit selama daring, dan tiap bekerja:
  perintah terminal 1, tiap menit sesi remote 1, tanam 0,5, panen 0,5, masak 0,5, siram 0,3, ambil hasil kandang 0,3,
  pasang perabot 0,2. Makanan mengisinya (roti +25, nasi bungkus +55, masakan +60 sampai +150). Batasnya 100 di
  level 1, bertambah 6 tiap level.
- **Mulai lapar** (di bawah 25%): lelah pulih lebih lambat (0,6 kali). **Kelaparan** (stamina 0): tidak bisa lari,
  lelah pulih seperempat kecepatan, dan XP dari kerja tinggal separuh. Tidak ada mati. Pemain diberi tahu sekali
  saat mulai lapar dan sekali saat kelaparan.
- **Health = lelah**: meter lari yang lama (turun saat lari, pulih saat diam atau berjalan), sekarang bernama
  Health. Masih dihitung di peramban; akan pindah ke server bersama fitur lawan monster. Kopi Mbak Tia dan efek
  "pulih cepat" dari masakan berlaku untuk Health.
- Menu atas menampilkan tiga bilah: XP (ungu), Health (hijau, merah saat lelah), Stamina (kuning, jingga saat
  lapar). Bilah mini di atas karakter ikut menjadi tiga baris.
- Dashboard admin: `POST /api/admin/pemakai/ubah` menerima `stamina` (belum ada tombolnya di tabel).
- Karakter yang sudah ada mulai dalam keadaan kenyang.

**Keterangan remote (kata yosi):** akun tanpa TOTP yang membuka remote kini mendapat "Set dulu TOTP untuk
SSH/telnet" dan panel pemasangan langsung terbuka.

## 0.6.1 — 9 Oktober 2026

**Perbaikan: Remote SSH tidak pernah tersambung.** Sejak 0.3.0 setiap sambungan SSH putus seketika (telnet tidak
terkena). Sebabnya: Kevi menyiapkan terminal untuk program `ssh` dengan cara yang hanya benar di mesin asyncio
bawaan; uvicorn di produksi memakai uvloop, dan di sana proses `ssh` gagal dinyalakan ("Exception occurred in
preexec_fn"). Terminal kini dibuka lewat nama pty-nya, benar di kedua mesin. Uji penjaga menjalankan proses ber-pty
di bawah uvloop, dan perintah `ssh` yang sama diuji sampai muncul prompt password.

## 0.6.0 — 9 Oktober 2026

**Edit Map: penyunting peta utama setara Edit Layout Agent Pak (kata yosi: "tools edit map masih belum lengkap")**
- Admin di kantor menekan B (atau tombol "Edit Map" di menu atas). Yang disunting adalah DRAF: langsung terlihat oleh
  admin itu, tetapi baru tersimpan dan tersiar ke pemain lain saat **Simpan** (Ctrl+S). Keluar dengan draf yang belum
  disimpan diminta dua kali, lalu draf dibuang.
- Alat: **Pilih / geser** (klik memilih, seret memindah dengan jepret 8 piksel, panah menggeser 1 piksel, Shift+panah
  1 ubin), **Pilih area** (seret kotak untuk memilih banyak benda, seret kotaknya untuk memindah semuanya; centang
  "Ikutkan lantai & tembok" memindah atau menghapus ubin di dalam kotak juga), **Hapus** (klik benda; seret untuk
  tembok dan lantai), **Tembok** (tarik garis lurus, pilihan warna bebas), **Lantai** (tarik kotak, pilih motif),
  **Perabot** (jendela katalog tetap terbuka: kategori, cari, klik di peta menaruh berulang, daftar terakhir dipakai).
- Benda terpilih: Putar (R, pusatnya tetap), Duplikat, Kunci posisi, Hapus (Delete). Grup: Duplikat, Hapus grup.
- **Urungkan** (Ctrl+Z) sampai 60 langkah. Esc melepas pilihan atau membatalkan seretan. Klik kanan kembali ke Pilih.
- **Penghalang**: ubin yang tak bisa dilewati diberi warna merah tipis (bisa dimatikan). Garis kisi selalu tampil.
- Selagi Edit Map terbuka, tepi bawah peta tidak memindahkan admin ke rumah, dan siaran peta dari admin lain tidak
  menimpa draf. Simpan ditolak bila peta sudah diubah dari tempat lain (nomor revisi), supaya dua admin tidak saling
  menimpa.
- Belum ada dibanding Agent Pak: alat Ruang, Pintu, Karpet berbingkai, Label, Titik santai, lapis depan/belakang,
  ubah ukuran peta dari dalam penyunting (ukuran dan dasar peta tetap di dashboard, tab Peta & NPC).
- Mode Bangun di rumah pemain tidak berubah.

**Tampilan (kata yosi)**
- Semua jendela (Inventory, Koperasi, Masak, katalog Edit Map, dan panel lain) bisa **digeser** lewat kepalanya; letak
  terakhir diingat selama halaman terbuka. Inventory, Koperasi, dan Masak diperkecil (lebar 500, tinggi paling 62%
  layar). Latar gelap di belakang jendela dibuat lebih tipis.
- **Menu atas bisa di-minimize** (tombol ▴ di ujung kanan; ▾ Menu membukanya lagi). Pilihan diingat di peramban.
  Tombol pintas (I, N, M, B) tetap jalan saat menu diciutkan.
- **Hotbar agak transparan**; kembali pekat saat disentuh kursor.

## 0.5.0 — 9 Oktober 2026

**Kode sekali pakai (TOTP) — jawaban yosi atas Y10: "ya"**
- Tiap akun bisa memasang kode sekali pakai lewat Menu, "Kode sekali pakai (TOTP)": ketik password, kunci tampil
  SEKALI (ketik ke aplikasi autentikator, jenis berbasis waktu; tautan `otpauth://` juga disediakan), lalu buktikan
  dengan satu kode. Standar RFC 6238: SHA-1, 6 angka, 30 detik. Belum ada gambar QR.
- Akun yang sudah memasang: masuk butuh password DAN kode. Isian kode baru muncul setelah password benar.
- **Remote kini wajib TOTP, admin sekalipun.** Akun tanpa TOTP ditolak remote. Akun ber-TOTP harus membuktikan kode
  dalam 10 menit terakhir di sesi peramban itu; kalau sudah lewat, kode diminta lagi sebelum sambungan dibuka.
- Kode yang sudah dipakai tidak bisa dipakai ulang; 8 kode salah dalam 10 menit menahan akun itu sementara.
- Melepas TOTP: Menu yang sama, butuh password dan kode. Remote mati untuk akun itu sampai dipasang lagi.
- Jalan pulih bila perangkat autentikator hilang: admin lain menekan "Hapus TOTP" di dashboard (tab pemakai), atau
  dari server `venv/bin/python -m tools.pemakai totp-hapus <username>`. Admin tidak bisa menghapus TOTP dirinya
  sendiri lewat dashboard.
- Belum dipaksa: admin atau akun berizin remote yang BELUM memasang TOTP masih bisa masuk dengan password saja
  (hanya remote-nya yang tertutup). Lihat Y13.

## 0.4.0 — 9 Oktober 2026

**Inventory berslot dan hotbar (ala Minecraft)**
- Satu jenis barang = satu slot (menumpuk). 20 slot awal; tas +10 slot dijual di Koperasi (tab "Makanan & tas"),
  harga 2.000 x urutan tas, paling banyak 6 tas (80 slot). Inventory penuh menolak jenis barang baru.
- Panel Inventory (I): kisi ikon kecil, seret untuk menata, seret ke baris hotbar, tombol Rapikan.
- Hotbar 10 slot di bawah layar, tombol 1 sampai 0. Tekan lagi untuk melepas. Tata letak dan isi hotbar disimpan
  di server (ikut ke perangkat mana pun).
- Benih harus dipegang untuk ditanam (E di petak kosong). Perabot, lantai, tembok yang dipegang di rumah sendiri
  langsung siap ditaruh (klik; R putar). Tombol B di rumah = alat tangan untuk mengambil kembali.
- Emote pindah ke Shift + 1 sampai 8. Zoom otomatis pindah dari tombol 0 ke tombol `\` (atau klik angka zoom).

**Makanan dan masak**
- Jajanan di Koperasi: roti (6 koin, +25 stamina), nasi bungkus (14 koin, +55).
- Masak di kompor atau microwave (pantry kantor, atau kompor di rumah): tumis sawi, sup wortel, sambal terong,
  telur dadar, jagung bakar, jus stroberi, kolak labu. Masakan memberi +60 sampai +150 stamina dan membuat stamina
  pulih dua kali lebih cepat selama 45 sampai 120 detik. Memasak memberi 4 XP.
- Makan: pegang makanan di hotbar, tekan F.

**Bilah mini di atas karakter**: stamina (hijau, merah saat lelah) dan XP (ungu). Bisa dimatikan per pemain di Menu.
Belum ada sistem "health"; bilah itu akan ditambahkan bila mekanik kesehatan dibuat.

**NPC beraktivitas**: tiap sekitar 9 detik NPC memilih berjalan ke titik di dekat tempatnya atau berhenti dengan
pose santai (cek HP, lihat jam, baca, kopi, meregang). Saat diajak bicara ia berhenti dan menghadap pemain.

**Perbaikan**: petunjuk tombol E kini ikut berubah ketika keadaan petak yang sama berubah (siram menjadi panen).

## 0.3.0 — 9 Oktober 2026

- **Peta utama bisa disunting admin.** Di kantor, admin menekan B: taruh perabot, lantai, tembok dari seluruh katalog
  Agent Pak tanpa biaya; perubahan langsung terlihat semua pemain. Di dashboard (tab Peta & NPC) admin memilih dasar
  peta: "Default" (kantor Agent Pak ditambah tambahan admin) atau "Kosong" (20 sampai 80 ubin per sisi, lantai dasar
  dipilih), dan bisa membuang semua tambahan. Perabot tertentu berfungsi bila ditaruh: mesin penjual (Koperasi),
  mesin arcade dan TV konsol (arcade), rak server dan meja kerja (Komputer), kompor (masak).
- **Zoom**: roda tetikus, tombol + dan −, atau kontrol di kanan bawah; berlaku juga saat menyunting.
- **Pulang lewat atas**: berjalan ke bawah dari kantor memunculkan pemain di jalan ATAS rumah; berjalan terus ke
  atas dari rumah tiba di tepi bawah kantor. Sesudah pindah, tepi baru aktif lagi setelah tombol gerak dilepas.
- **Perabot terkunci level** (membeli; yang sudah dimiliki tetap bisa dipasang):

  | Harga sampai | 20 | 40 | 70 | 110 | 180 | 300 | 450 | di atasnya |
  |---|---|---|---|---|---|---|---|---|
  | Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |

  Pengecualian: tembok, lantai, pakan, petak kebun, Kotak Kiriman, makanan = level 1; penyiram 2; kandang ayam 3;
  kandang ternak 5; benih sawi dan wortel 1, cabai dan terong 2, tomat dan stroberi 3, jagung 4, labu 5, jeruk 6,
  mangga 7.
- **Leveling diperlambat tiga kali**: total XP untuk level n = 150 x n x (n − 1). Level 2 = 300, 3 = 900,
  4 = 1.800, 5 = 3.000.
- **Obrolan**: pemilih emoticon; bisik `/w nama pesan` dan balas `/r pesan` (atau menu rekan, "Bisik"). Bisikan
  hanya dikirim ke pengirim dan penerima dan TIDAK disimpan, jadi tidak tampil di log admin.
- **Pesan sistem berulang**: daftar pesan dan jedanya diatur admin; disiarkan bergiliran ke semua pemain daring.
- **Laporan token**: angka utama kini "token pekerjaan" (keluar + tulis cache + masuk); baca ulang riwayat (cache)
  ditampilkan terpisah.

### Remote SSH / Telnet

Tab ketiga di Komputer (duduk di meja). Terminal sungguhan (xterm.js, disalin lokal) ke perangkat jaringan.

Pagar yang berlaku:
1. Hanya admin, atau pemakai yang diberi "Izinkan remote" di dashboard. Sakelar "Remote menyala" mematikan semuanya.
2. Sasaran harus di jaringan yang didaftarkan admin (bawaan: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) dan port
   yang diizinkan (bawaan 22 dan 23). Nama host di-resolve dulu; alamat IP-nya yang diperiksa dan dipakai.
   Loopback, link-local, dan multicast selalu ditolak.
3. SSH berjalan tanpa shell, tanpa konfigurasi dan tanpa kunci milik akun server (hanya password yang diketik),
   tanpa penerusan port atau agent, tanpa karakter escape. Algoritma lama (SHA-1, CBC, ssh-rsa) ditambahkan supaya
   perangkat jaringan tua bisa dituju.
4. Telnet ditangani langsung oleh Kevi, bukan program `telnet` (yang punya jalan keluar ke shell).
5. Tiap sesi tercatat di tab Log (siapa, ke mana, kapan). Isi layar dan password tidak disimpan.
6. Paling banyak 3 sesi per pemakai, 12 seluruh server; putus sendiri setelah 20 menit diam atau 6 jam.

**Risiko yang perlu disadari.** Begitu Kevi dibuka lewat domain publik, fitur ini menjadi jalan dari internet ke
jaringan dalam yang dijaga oleh password akun Kevi (ditambah kredensial perangkat itu sendiri). Itu menggantikan
VPN dengan satu lapis login web. Saran: password admin yang kuat dan tidak dipakai di tempat lain, persempit daftar
jaringan ke segmen perangkat yang memang perlu, dan beri izin remote hanya ke orang yang perlu. Sejak 0.5.0 remote
juga wajib kode sekali pakai (TOTP). Telnet mengirim password
tanpa enkripsi dari server ke perangkat, sama seperti telnet biasa.

### Domain kevi.dud.co.id

Yang sudah disiapkan di Kevi: cookie otomatis `Secure` bila permintaan datang lewat HTTPS (header
`X-Forwarded-Proto`), jadi alamat LAN `http://<alamat-server>:8800` tetap bisa dipakai; alamat asli pengunjung dibaca
dari `X-Forwarded-For` hanya bila permintaan datang dari proxy di `KEVI_PROXY_TEPERCAYA` (bawaan `<alamat-NPM>`).

Yang perlu dikerjakan yosi:
1. DNS: `kevi.dud.co.id` ke alamat NPM (sama seperti subdomain lain).
2. NPM, Proxy Host baru: Domain `kevi.dud.co.id`, Scheme `http`, Forward `<alamat-server>`, Port `8800`,
   **Websockets Support: nyala**, Block Common Exploits boleh nyala, SSL: sertifikat Let's Encrypt + Force SSL.
3. Bila NPM terlihat oleh server dari alamat selain `<alamat-NPM>`, isi `.env`:
   `KEVI_PROXY_TEPERCAYA=<alamat NPM>` lalu `pm2 restart kevi`. Tanpa ini Kevi tetap jalan; hanya pembatas coba
   masuk yang menghitung semua pengunjung sebagai satu alamat.

## Menunggu keputusan yosi (tambahan)

| Kode | Pertanyaan | Bawaan saat ini |
|---|---|---|
| Y9 - Jaringan remote | Jaringan mana yang boleh dituju remote | Semua alamat privat |
| Y10 - TOTP | Perlukah kode sekali pakai untuk akun berizin remote sebelum domain dibuka | DIJAWAB "ya"; dibuat di 0.5.0 |
| Y13 - Paksa TOTP saat masuk | Haruskah admin dan akun berizin remote DIPAKSA memasang TOTP sebelum bisa bermain atau membuka dashboard | Tidak dipaksa; tanpa TOTP hanya remote yang tertutup |
| Y11 - Health | Bilah "health" diminta, tetapi belum ada mekanik kesehatan; mau dibuat seperti apa | Hanya stamina dan XP |
| Y12 - Angka makanan dan tas | Harga tas, harga jajanan, dan nilai stamina masakan adalah tebakan awal | Seperti tertulis |
| Y13 - Bisikan | Bisikan tidak disimpan dan tidak terlihat admin; mau tetap begitu | Tidak disimpan |
