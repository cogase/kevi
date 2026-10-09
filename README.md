# Kevi — Kerja Virtual

Game 2D pixel berbasis peramban: karyawan masuk, membuat karakter, bekerja di kantor virtual (terminal jaringan
dalam game), lalu pulang membangun rumah dari hasil kebun dan kandang. Berdiri sendiri, terpisah dari Pak Apps;
aset gambar dan peta diambil dari Agent Pak.

## Menjalankan

```bash
python3 -m venv venv && venv/bin/pip install -r requirements.txt
cp .env.example .env                                   # sesuaikan bila perlu
venv/bin/python -m tools.pemakai tambah yosi --admin   # password acak dicetak sekali
pm2 start ekosistem.config.js && pm2 save
```

Buka `http://<alamat-server>:8800`.

## Sehari-hari

| Keperluan | Perintah |
|---|---|
| Restart sesudah mengubah kode | `pm2 restart kevi` |
| Lihat log | `pm2 logs kevi --lines 50` |
| Tambah akun | `venv/bin/python -m tools.pemakai tambah <username>` atau halaman `/admin` |
| Reset password | `venv/bin/python -m tools.pemakai sandi <username>` |
| Uji menyeluruh | `tests/uji.sh` |
| Panggang ulang peta dari Agent Pak | `tools/panggang.sh` |
| Hitung ulang laporan token | `venv/bin/python -m tools.laporan_token` atau tombol di `/laporan` |
| Cadangan data | salin `data/kevi.db` |

## Dokumen

- `docs/PRD.md` — kebutuhan produk
- `docs/GDD.md` — rancangan permainan
- `docs/TDD.md` — rancangan teknis
- `docs/RILIS.md` — catatan rilis 0.3.0 dan 0.4.0 (remote, domain, hotbar, level)
- `docs/KEPUTUSAN.md` — keputusan yang diambil dan yang menunggu yosi
- `docs/ROADMAP.md` — rencana berikutnya
- `docs/ASET.md` — asal aset dan cara memperbarui dari Agent Pak
