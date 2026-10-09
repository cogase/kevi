# Roadmap — Kevi

Urutan usulan sesudah 0.1.0. Tiap butir berdiri sendiri; urutannya boleh ditukar.

## Selesai di 0.2.0
Dashboard admin dan atur peta, obrolan dua saluran, emote, tos, suit, kirim koin, kuis, arcade, browser dalam
game, lari dengan stamina, leveling, tema Farming, tampilan karakter langsung terlihat rekan.

## 0.3 — Kenyamanan bermain
- Pendaftaran mandiri (dengan persetujuan admin atau kode undangan).
- Kendali sentuh (joystick layar) supaya bisa dimainkan di ponsel.
- Musik dan efek suara (Agent Pak punya lima lagu chiptune WebAudio).
- Pindahkan perabot tanpa ambil lalu taruh (API `pindah` sudah ada, tinggal antarmukanya).
- Isi level 6 sampai 20: gelar, pakaian khusus, tanah lebih luas, mini game kedua (pingpong dan biliar dua pemain
  di meja yang sudah ada di peta), papan peringkat di dalam game.

## 0.4 — Kegiatan kerja bertambah
- Perintah baru: `whois`, cek sertifikat TLS, `curl` kepala HTTP.
- Papan tugas: tugas yang dititipkan admin (misalnya "cek tautan ke cabang X") dengan hadiah koin.
- Riwayat terminal bersama: siapa mengecek apa hari ini (dari `log_terminal`).
- Duduk di kursi santai, sofa, dan meja makan (114 titik santai sudah ada di data peta).

## 0.5 — Ekonomi lebih dalam
- Mutu panen (biasa, perak, emas), gagak dan orang-orangan sawah, petani sewaan (semua ada di Agent Pak).
- Hewan peliharaan yang berjalan di halaman.
- Kendaraan dan jalan di tanah rumah.
- Pencapaian dan papan peringkat (panen terbanyak, rumah terlengkap).

## 0.6 — Sosial
- Bertamu dengan izin: tamu boleh menyiram atau memberi hadiah barang.
- Tukar barang antarpemain; pesan pribadi.
- Acara bersama: rapat pagi di ruang rapat, makan siang di pantry.
- Rumah bertingkat dan tanah yang bisa diperluas dengan koin.

## Teknis
- Mesin denah penuh Agent Pak di sisi Kevi, supaya kantor juga bisa disunting admin tanpa memanggang ulang.
- SSO Pak Apps sebagai pilihan masuk kedua.
- Cadangan `data/kevi.db` terjadwal (bisa menumpang `~/bin/cadangan-pakapps.sh`).
- Dashboard admin: sunting ubin peta kantor, ekspor log, grafik kegiatan per hari.
