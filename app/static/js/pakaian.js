/* Kevi — lemari & toko pakaian. Pakaian dan aksesori dibeli di penjual pakaian (NPC berperan "pakaian") dan disimpan
 * di lemari, terpisah dari inventory. Panel yang sama dipakai untuk dua keperluan:
 *   Pakaian.buka(true)  — di penjual: yang belum dimiliki bisa dibeli;
 *   Pakaian.buka(false) — dari Profil atau perabot lemari di rumah: hanya berganti dari yang dimiliki.
 * Server yang memutuskan (permainan.buat_karakter menolak bagian yang belum ada di lemari).
 */
'use strict';

const JENIS_PAKAIAN = [['baju', 'Baju'], ['celana', 'Celana'], ['sepatu', 'Sepatu'], ['gaya_rambut', 'Gaya rambut'], ['kepala', 'Penutup kepala'], ['mata', 'Kacamata'], ['aksesori', 'Aksesori']];
const TANPA_PAKAIAN = { gaya_rambut: 'Pendek biasa', kepala: 'Tanpa', mata: 'Tanpa' };

const Pakaian = {
  async buka(toko) {
    let d;
    try { d = await api('/api/lemari'); } catch (e) { kabar(e.message, 'galat'); return; }
    const t = Object.assign({}, G.karakter.tampilan), isi = el('div', { kelas: 'pakaian' });
    const kv = el('canvas', { width: 64, height: 88, kelas: 'profil-potret', 'aria-label': 'Tampang karakter' });
    const potret = () => {
      const b = bingkaiTokoh(penampilan({ session_id: 'lemari', nama: G.karakter.nama, tampilan: t }), 'bawah_diam'), k = kv.getContext('2d');
      k.imageSmoothingEnabled = false; k.clearRect(0, 0, kv.width, kv.height);
      if (!b) return;
      const s = Math.max(1, Math.floor(Math.min(kv.width / b.kanvas.width, kv.height / b.kanvas.height))), w = b.kanvas.width * s, h = b.kanvas.height * s;
      k.drawImage(b.kanvas, 0, 0, b.kanvas.width, b.kanvas.height, Math.round((kv.width - w) / 2), Math.round((kv.height - h) / 2), w, h);      // tepat di tengah bingkai
    };
    const dipakai = (jenis, kode) => (jenis === 'aksesori' ? !!t[kode] : (t[jenis] || '') === kode);
    // Kenakan (atau lepas, untuk aksesori yang sedang dipakai) lalu simpan ke server.
    const kenakan = async (jenis, kode) => {
      const coba = Object.assign({}, t);
      if (jenis === 'aksesori') coba[kode] = !coba[kode]; else coba[jenis] = kode;
      try {
        const j = await api('/api/karakter', { nama: G.karakter.nama, tampilan: coba });
        Object.assign(t, j.karakter.tampilan);
        G.karakter = j.karakter; gantiTampilan(G.aku, j.karakter.nama, j.karakter.tampilan);
        lukisIsi();
      } catch (e) { kabar(e.message, 'galat'); }
    };
    const beli = async (jenis, b) => {
      const j = await aksi('/api/lemari/beli', { jenis, kode: b.kode });
      if (!j) return;
      d = j.lemari;
      kabar(b.nama + ' masuk lemari. Klik untuk memakainya.', 'hadiah');
      lukisIsi();
    };
    const lukisIsi = () => {
      potret();
      isi.replaceChildren(
        el('div', { kelas: 'profil-kepala' }, kv, el('div', {},
          el('b', { teks: toko ? 'Toko pakaian' : 'Lemari' }),
          el('p', { kelas: 'redup kecil', teks: toko ? 'Klik yang sudah dimiliki untuk memakainya; yang berharga bisa dibeli. Koin: ' + G.koin + '.'
            : 'Klik untuk berganti dari isi lemarimu. Pakaian baru dijual penjual pakaian di kantor.' }))),
        ...JENIS_PAKAIAN.map(([jenis, judul]) => {
          const milik = d.milik[jenis] || [], warna = jenis === 'baju' || jenis === 'celana' || jenis === 'sepatu';
          const butir = d.katalog[jenis].filter(b => toko || milik.includes(b.kode));
          const kartu = (b, punya) => {
            const pakai = dipakai(jenis, b.kode), kunci = !punya && b.level > G.level.level;
            return el('button', { kelas: 'kartu pakaian-kartu' + (pakai ? ' aktif' : '') + (punya ? '' : ' belum') + (kunci ? ' gembok' : ''), 'data-jenis': jenis, 'data-kode': b.kode,
              title: b.nama + (punya ? (pakai ? ' (dipakai)' : ' (di lemari)') : ' · ' + b.harga + ' koin' + (kunci ? ' · level ' + b.level : '')),
              on: { click: () => { if (punya) kenakan(jenis, b.kode); else if (kunci) kabar(b.nama + ' terbuka di level ' + b.level + '.', 'galat'); else beli(jenis, b); } } },
            warna ? el('span', { kelas: 'pakaian-warna', gaya: { background: b.kode } }) : el('b', { teks: b.nama }),
            el('small', { kelas: punya ? '' : 'harga', teks: punya ? (pakai ? 'dipakai' : 'di lemari') : (kunci ? 'Lv ' + b.level : String(b.harga)) }));
          };
          const tanpa = TANPA_PAKAIAN[jenis] !== undefined ? kartu({ kode: '', nama: TANPA_PAKAIAN[jenis], harga: 0, level: 1 }, true) : null;
          if (!butir.length && !tanpa) return '';
          return el('div', { kelas: 'pakaian-jenis' }, el('h4', { teks: judul + (toko ? '' : ` (${milik.length})`) }),
            el('div', { kelas: 'kisi pakaian-kisi' }, tanpa, butir.map(b => kartu(b, milik.includes(b.kode)))));
        }));
    };
    Panel.buka(toko ? 'Kak Mira · Toko pakaian' : 'Lemari pakaian', isi, { kelas: 'ringkas' });
    lukisIsi();
  },
};
