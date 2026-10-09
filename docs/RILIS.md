# Catatan rilis — Kevi

Melengkapi PRD, GDD, dan TDD untuk rilis sesudah 0.2.0. Angka dan aturan di sini adalah yang berlaku di kode.

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
