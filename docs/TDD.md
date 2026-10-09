# TDD — Kevi (Kerja Virtual)

Technical Design Document · versi 1 · 9 Oktober 2026
(Permintaan menyebut "TTD"; dibaca sebagai TDD, dokumen rancangan teknis.)

## 1. Gambaran

```
Peramban (kanvas 2D + panel DOM, skrip klasik tanpa bundler)
   |  HTTP JSON  (aksi bernilai: beli, pasang, tanam, ...)
   |  WebSocket  (posisi, obrolan, terminal)
   v
uvicorn + FastAPI  (satu proses, user yosi, pm2 "kevi", port 8800)
   |-- SQLite data/kevi.db (WAL)
   |-- proses anak: ping / traceroute / mtr  (tanpa shell, dibatasi)
   `-- berkas statis: sprite, peta terpanggang, katalog
```

Tidak ada layanan luar, tidak ada CDN, tidak ada sambungan ke Pak Apps.

| Lapis | Pilihan | Alasan |
|---|---|---|
| Server | Python 3.12, FastAPI, uvicorn | Sama dengan Agent Pak; `websockets` tersedia |
| Data | SQLite satu berkas, WAL | Puluhan pemain, satu proses; cadangan cukup salin berkas |
| Klien | JavaScript polos, Canvas 2D | Perakit tokoh Agent Pak dipakai apa adanya; tanpa langkah build |
| Supervisor | pm2 milik yosi | Tanpa root; sama dengan Agent Pak |

## 2. Susunan berkas

```
app/
  konfig.py         variabel lingkungan
  basis.py          skema SQLite
  akun.py           pemakai, hash scrypt, sesi, pembatas coba masuk
  permainan.py      SEMUA aturan: koin, inventory, toko, rumah, kebun, kandang, misi, karakter
  terminal.py       perintah jaringan (daftar tetap, tanpa shell)
  dunia.py          hub WebSocket: adegan, posisi, obrolan, terminal, NPC
  atur.py           pengaturan admin: angka, NPC, titik interaksi, bookmark, pengumuman (tersaring)
  interaksi.py      kuis, arcade, kopi, kirim koin
  laporan_token.py  rekap token dari transkrip Claude Code
  main.py           rute HTTP dan WebSocket
  static/
    gambar/         sprite.png + atlas.json (salinan Agent Pak)
    peta/           kantor_latar.png, kantor_depan.png, kantor.json, katalog.json (hasil panggang)
    js/             inti, tokoh (salinan Agent Pak), mesin, rumah, panel, main, admin
    halaman/        main, masuk, admin, laporan
tools/              panggang.sh, panggang_peta.mjs, pemakai.py, laporan_token.py, simpan.sh
tests/              pytest + uji peramban headless
docs/               PRD, GDD, TDD, KEPUTUSAN, ROADMAP, ASET, laporan token
```

## 3. Peta kantor: dipanggang, bukan disalin mesinnya

Peta Default Agent Pak (Office 5) dihasilkan oleh sekitar 6.000 baris skrip yang saling bergantung lewat ruang
nama global. Menyalin mesinnya berarti memelihara dua salinan. Sebagai gantinya `tools/panggang.sh`:

1. menyalakan Agent Pak dari `/opt/agent-pak` sebagai instans uji (port 8015, DB kosong sementara, semua
   sambungan keluar dimatikan, rahasia acak sekali pakai); instans produksi dan datanya tidak disentuh;
2. membuka halaman itu di Chromium headless dan memotret hasil susunannya:
   - `kantor_latar.png`: lantai, tembok, perabot (di bawah tokoh);
   - `kantor_depan.png`: dinding bawah ruang dan benda tinggi (di atas tokoh);
   - `kantor.json`: grid tabrakan 45 x 46, benda lapis depan beserta alasnya, 45 kursi, ruang, rak, animasi;
3. mengekspor `katalog.json`: 708 perabot dengan ukuran, kategori, harga, sifat tembus atau datar, varian putar,
   dan jumlah bingkai animasi, semuanya dari aturan Agent Pak sendiri.

Bila peta atau sprite Agent Pak berubah: `tools/panggang.sh`, salin ulang `sprite.png` dan `atlas.json`, selesai.

**Urutan kedalaman di kantor** (`mesin.js gambarKantor`): latar, animasi rak, tokoh urut sumbu y, lapis depan,
lalu tokoh yang kakinya berada di depan benda tinggi digambar ulang di atasnya. Tokoh di balik dinding tetap
tertutup; pemain sendiri ditampilkan samar supaya tidak hilang.

## 4. Rumah

Rumah disimpan sebagai satu dokumen JSON per pemain (`rumah.data`):

```json
{ "v": 1, "lebar": 30, "tinggi": 22,
  "lantai": { "gx,gy": "lantai_parket" }, "tembok": { "gx,gy": "#8b9bb4" },
  "benda": [ { "id": 7, "n": "sofa_krem", "x": 96, "y": 120, "r": 0 } ], "urut": 7,
  "petak": { "7": { "t": "sawi", "tumbuh": 41.5, "cek": 1791500000, "basah": 1791500700 } },
  "kandang": { "9": { "hewan": [ { "j": "ayam", "kenyang": 0, "proses": 0, "siap": 0, "cek": 0 } ] } } }
```

- Klien menggambar rumah langsung dari data itu (`rumah.js`): lapis tanah digambar sekali ke kanvas bayangan,
  benda dan tokoh diurutkan menurut alas tiap bingkai.
- Tabrakan memakai aturan jejak Agent Pak: benda tinggi menghalangi separuh bawahnya, benda datar seluruh
  jejaknya, benda tembus dan alas lantai tidak menghalangi.
- Tembok memakai rumus ubin tembok Agent Pak (sambungan sudut otomatis).

**Waktu malas**: tidak ada timer di server. Tiap kali rumah dibaca atau diubah, `_maju_kebun` dan
`_maju_kandang` menghitung berapa lama petak basah atau hewan kenyang sejak pemeriksaan terakhir, lalu
menambahkannya ke pertumbuhan. Hasilnya sama dengan timer, tanpa beban saat tidak ada yang bermain.

## 5. Basis data

| Tabel | Isi |
|---|---|
| `pemakai` | username, hash password, peran (admin, pemain), aktif |
| `sesi` | hash token sesi, pemilik, kedaluwarsa |
| `karakter` | nama, tampilan (JSON), koin, adegan dan posisi terakhir, statistik |
| `inventori` | (pemakai, barang) -> jumlah |
| `rumah` | dokumen JSON rumah |
| `catatan` | Note |
| `buku_kas` | tiap perubahan koin beserta alasannya |
| `misi` | misi harian per (pemakai, hari WIB) |
| `log_terminal` | siapa menjalankan perintah apa ke sasaran mana |
| `pengaturan` | kunci dan nilai JSON pengaturan admin |
| `obrolan` | 2.000 baris obrolan terakhir (untuk admin dan riwayat saluran Semua) |

`karakter.xp` ditambahkan di 0.2.0 lewat `basis._migrasi` (ALTER TABLE bila kolom belum ada).

Kode barang: nama sprite untuk perabot; `benih:<tanaman>`, `panen:<tanaman>`, `lantai:<nama>`, `tembok`,
`pakan`, dan nama produk kandang.

## 6. Terminal

`terminal.py` bukan shell. Alurnya:

1. `urai()` memecah baris menjadi perintah dan argumen; alias umum dipetakan (`traceroute` ke `trace`, dst.).
2. Perintah harus ada di daftar: `ping`, `trace`, `mtr`, `dns`, `port`. Selain itu ditolak.
3. `sasaran_sah()` hanya menerima IPv4, IPv6, atau nama host yang cocok pola; apa pun berawalan `-` ditolak.
4. Proses dijalankan dengan `create_subprocess_exec` dan daftar argumen tetap (misalnya
   `ping -c 4 -W 2 -n -- <sasaran>`), tanpa shell, tanpa stdin.
5. Batas: 10 perintah per menit per pemain, 4 proses serentak, 40 detik per perintah, 200 baris keluaran.
6. `dns` dan `port` tidak memanggil proses luar sama sekali (resolver dan soket Python).

Menambah kegiatan baru: tambahkan cabang di `_argumen()` atau fungsi async seperti `_dns()`, daftarkan namanya
di `jalankan()`, dan tulis satu baris di `BANTUAN`.

## 7. Protokol WebSocket (`/ws`)

Klien ke server:

| Pesan | Isi |
|---|---|
| `pos` | x, y, arah, jalan, pose (paling sering 10 kali per detik, hanya bila berubah) |
| `adegan` | pindah ke `kantor` atau `rumah:<id>` |
| `obrol` | teks, paling panjang 160 karakter |
| `sapa` | menyapa NPC (untuk misi) |
| `term`, `term_batal` | satu baris perintah terminal; hentikan proses |

Server ke klien: `halo` (diri sendiri, NPC, pemain di adegan), `adegan`, `masuk`, `keluar`, `pos`, `obrol`,
`term`, `term_bersih`, `term_selesai`, `hadiah`, `ganti_tab`.

Satu akun satu sambungan: tab baru memutus tab lama. Siaran hanya ke pemain di adegan yang sama.

## 7a. Tambahan 0.2.0

**Level** (`permainan.py`): `ambang(n) = 50 n (n - 1)`; `tambah_xp` membayar koin tiap level yang dilewati.
Kegiatan yang mudah diulang punya jatah harian (`XP_JATAH`), disimpan di dokumen misi hari itu (`hitung`).
`BUKA` adalah satu-satunya tabel kunci level; server memeriksanya lewat `butuh_level`, peramban hanya
memakainya untuk menampilkan gembok.

**Pengaturan** (`atur.py`): disimpan per kunci, selalu melewati `saring()` baik saat ditulis maupun dibaca.
Satu nilai tak sah membatalkan seluruh simpanan. `terapkan()` memasang laju kebun, modal awal, dan sakelar
terminal ke `konfig` saat itu juga. Sesudah simpan, `Dunia.siar_dunia()` mengirim pesan `dunia` (NPC, titik,
pengaturan publik) ke semua pemain.

**Pesan WebSocket baru**: klien ke server `emot`, `tos`, `suit_ajak`, `suit_jawab`, `suit_pilih`, dan `obrol`
kini membawa `saluran`. Server ke klien: `dunia`, `rupa`, `emot`, `tos`, `level`, `naik`, `kiriman`, `umum`,
`info`, `ditendang`, `suit_ajak`, `suit_tunggu`, `suit_mulai`, `suit_hasil`, `suit_batal`.

**Yang dijaga server pada interaksi baru**
- Tos dan suit hanya dengan pemain di adegan yang sama dalam jarak 56 piksel.
- Suit: saldo kedua pemain diperiksa saat mengajak dan lagi saat membayar; satu permainan per pemain; batal
  sendiri setelah 45 detik atau bila salah satu putus.
- Arcade: lama bermain diukur jam server sejak `arcade_mulai`; token sekali pakai; kurang dari 6 detik ditolak.
- Kuis: soal dan urutan pilihan disimpan server; satu soal hanya bisa dijawab sekali.
- Kirim koin: 1 sampai 100 per kiriman, batas harian, tidak bisa ke diri sendiri.
- Browser: `iframe` ber-`sandbox` tanpa `allow-top-navigation`; hanya `http(s)`; halaman Kevi sendiri mengirim
  `X-Frame-Options: DENY` sehingga tidak bisa dibingkai di dalamnya.

**Rute admin baru**: `GET /api/admin/dasbor`, `GET` dan `POST /api/admin/pengaturan`, `POST /api/admin/tendang`;
`POST /api/admin/pemakai/ubah` kini juga menerima `koin` (selisih), `xp` (nilai), dan `peran`.

## 8. Keamanan

| Hal | Penanganan |
|---|---|
| Password | scrypt (N 16384, r 8, p 1) dengan garam per akun; minimal 8 karakter |
| Sesi | token acak 256 bit; yang disimpan hash SHA-256; cookie HttpOnly, SameSite=Lax; `Secure` bila `KEVI_COOKIE_SECURE=1` |
| Coba masuk | 8 kali gagal per 10 menit per username dan per alamat; pesan galat sama untuk username dan password salah |
| CSRF | SameSite=Lax ditambah pemeriksaan `Origin` terhadap `Host` untuk semua permintaan bukan GET dan untuk WebSocket |
| Kecurangan | Harga, stok, hasil panen, hadiah misi dihitung server di dalam satu transaksi; peramban tidak pernah mengirim angka koin |
| XSS | Semua teks pemain dipasang lewat `textContent` atau digambar di kanvas; tidak ada `innerHTML` |
| Akses | Rute admin memeriksa peran; Note dan rumah selalu disaring dengan id pemilik |
| Terminal | Lihat bagian 6; semua perintah tercatat |

Batas yang diketahui: posisi pemain dipercayakan ke peramban (tidak ada yang bernilai dari posisi); `port`
memungkinkan cek satu port per perintah ke alamat mana pun yang terjangkau server, dibatasi laju dan tercatat.

## 9. Konfigurasi (`.env` di akar proyek)

| Variabel | Bawaan | Arti |
|---|---|---|
| `KEVI_PORT`, `KEVI_BIND` | 8800, 0.0.0.0 | Alamat dengar |
| `KEVI_DB` | `data/kevi.db` | Berkas basis data |
| `KEVI_LAJU` | 60 | Satu jam kebun = 3600 / LAJU detik |
| `KEVI_KOIN_AWAL` | 300 | Modal karakter baru |
| `KEVI_COOKIE_SECURE` | 0 | Wajib 1 bila disajikan lewat HTTPS |
| `KEVI_TERMINAL` | 1 | 0 mematikan terminal |
| `KEVI_TERMINAL_PER_MENIT`, `_SERENTAK`, `_BATAS_DETIK` | 10, 4, 40 | Batas terminal |

## 10. Pengujian

`tests/uji.sh` menjalankan dua lapis terhadap DB sementara:

1. **pytest** (75 uji): aturan permainan, akun dan sesi, pagar asal permintaan, hak admin, saringan terminal,
   rekap token.
2. **Peramban headless** (64 pemeriksaan, termasuk stamina, level, kuis, arcade, browser, emote, tos, suit,
   kirim koin, saluran obrolan, dan dashboard admin): masuk, buat karakter, jalan dan tabrakan, duduk dan terminal
   (termasuk masukan berbahaya), Note, toko, obrolan, pulang, mode Bangun, tanam sampai jual, misi, dua pemain
   saling melihat dan mengobrol, bertamu tanpa bisa mengubah, dan nol galat JavaScript.

## 11. Operasi

```bash
pm2 start <folder-kevi>/ekosistem.config.js && pm2 save     # nyalakan
pm2 restart kevi                                              # sesudah mengubah kode Python
venv/bin/python -m tools.pemakai tambah <username>            # akun baru (password acak dicetak sekali)
cp data/kevi.db cadangan-$(date +%F).db                       # cadangan (aman saat berjalan: mode WAL)
tests/uji.sh                                                  # uji menyeluruh
tools/panggang.sh                                             # panggang ulang peta dari Agent Pak
```

Berkas statis disajikan dengan penanda `?v=<sidik>` yang dihitung saat server mulai; setelah mengubah berkas
statis, restart supaya peramban mengambil versi baru.
