# Aset — asal dan cara memperbarui

Kevi tidak membuat gambar sendiri. Semua berasal dari Agent Pak (`/opt/agent-pak`, 0.94.0 `dbd52d6`), milik yosi.

| Di Kevi | Asal di Agent Pak | Cara diambil |
|---|---|---|
| `app/static/gambar/sprite.png`, `atlas.json` | `app/static/gambar/` | Disalin utuh (1.913 bingkai) |
| `app/static/peta/kantor_latar.png`, `kantor_depan.png`, `kantor.json` | Peta Default (Office 5) yang disusun `tataletak.js`, `officecustom.js`, `kantor.js` | Dipanggang `tools/panggang.sh` |
| `app/static/peta/katalog.json` | `katalog.js` (kategori), `harga.py` (harga), `kantor.js` (sifat tembus dan datar) | Diekspor saat memanggang |
| `app/static/js/tokoh.js` | `app/static/js/tokoh.js` | Disalin utuh; jangan disunting di Kevi |
| `app/static/tema/gambar/*.png` | `app/static/tema/farming/gambar/` | Disalin (bingkai kayu, koin, tekstur) |
| `app/static/huruf/` | `app/static/huruf/` | Disalin; Inter dan JetBrains Mono, lisensi SIL OFL 1.1 ikut di folder |
| Tabel tanaman, hewan, produk | `app/kebun.py`, `app/kandang.py` | Disalin ke `app/permainan.py` |
| Rumus ubin tembok, aturan jejak tabrakan | `tataletak.js lukisUbinTembok`, `kantor.js halangJejak` | Ditulis ulang di `rumah.js` dan `mesin.js` dengan rumus yang sama |

## Memperbarui dari Agent Pak

```bash
cp /opt/agent-pak/app/static/gambar/{sprite.png,atlas.json} app/static/gambar/
cp /opt/agent-pak/app/static/js/tokoh.js app/static/js/tokoh.js
tools/panggang.sh
tests/uji.sh
pm2 restart kevi
```

Catatan: perabot yang dihapus dari atlas Agent Pak tetapi masih ada di rumah pemain tidak akan tergambar.
Sebelum memperbarui, periksa nama yang hilang dengan membandingkan `katalog.json` lama dan baru.

## Yang tidak diambil

Mesin kantor Agent Pak (aktor agen, kurir, agenda, cuaca, editor denah, pantau modul), data produksi apa pun,
dan sambungan ke hub Pak Apps.

## Sprite milik Kevi sendiri (0.21.0)

Zombie (lima varian), senjata (ikon dan yang dipegang), efek kena, dan koin dibuat sesi Agent Design untuk Kevi:
digambar lewat kode (Python + PIL), tanpa aset pihak ketiga. Skrip pembuatnya ada di folder serah Agent Design, bukan
di repo ini. Tiap PNG disajikan sendiri dari `app/static/gambar/kevi/` dan didaftarkan di `daftar.json`; peramban
memasukkannya ke atlas dengan nama berkasnya (`inti.js muatAset`). Memasang ulang dari folder serah:

```bash
tools/pasang_sprite.py <folder-serah>
tests/uji.sh
```

Yang dipakai: zombie dan senjata yang dipegang dari set bergaris tepi 1 px (senada tokoh Agent Pak), ikon senjata dan
efek dari set mentah. Nama berkas yang dikenali ada di kepala `tools/pasang_sprite.py`.
