/* Kevi — peti: perabot peti di rumah sendiri menyimpan barang yang tak muat di inventory.
 * Dua kisi (Inventory dan isi peti). Klik = pindahkan seluruh tumpukan, Shift+klik = satu, atau seret ke kisi seberang.
 * Aturannya di server (permainan.peti): 20 jenis barang per peti; peti berisi tidak bisa diangkat.
 */
'use strict';

const Peti = {
  buka(o) {
    const isi = el('div', { kelas: 'peti' });
    const pindah = (barang, arah, jumlah) => aksi('/api/rumah/peti', { id: o.id, barang, jumlah, arah });
    const lukisIsi = () => {
      if (!isi.isConnected && isi.children.length) return;
      if (!G.rumah || !G.rumah.benda.some(b => b.id === o.id)) { Panel.tutup(); return; }
      const dalam = (G.rumah.peti || {})[o.id] || {}, inv = G.inventori;
      // sisi = tempat barang berada sekarang; arah = ke mana ia dipindah bila diklik
      const kisi = (data, sisi, arah, kosong) => {
        const kunci = Object.keys(data).filter(b => data[b] > 0).sort();
        return el('div', { kelas: 'inv-kisi peti-kisi', 'data-sisi': sisi, on: {
          dragover: (ev) => ev.preventDefault(),
          drop: (ev) => {
            ev.preventDefault();
            const b = ev.dataTransfer.getData('text/kevi-barang'), dari = ev.dataTransfer.getData('text/kevi-sisi');
            if (b && dari && dari !== sisi) pindah(b, dari === 'inv' ? 'masuk' : 'keluar', (dari === 'inv' ? inv : dalam)[b]);
          } } },
        kunci.length ? kunci.map(b => el('div', { kelas: 'inv-sel isi', title: namaBarang(b) + ' x' + data[b], draggable: true, 'data-barang': b, on: {
          dragstart: (ev) => { ev.dataTransfer.setData('text/kevi-barang', b); ev.dataTransfer.setData('text/kevi-sisi', sisi); },
          click: (ev) => pindah(b, arah, ev.shiftKey ? 1 : data[b]),
        } }, ikonBarang(b, 26), data[b] > 1 ? el('small', { teks: String(data[b]) }) : null)) : el('p', { kelas: 'redup kecil', teks: kosong }));
      };
      isi.replaceChildren(
        el('p', { kelas: 'redup kecil', teks: 'Klik barang untuk memindah seluruh tumpukan, Shift+klik untuk satu, atau seret ke kisi seberang.' }),
        el('h4', { teks: `Isi peti (${Object.keys(dalam).length} / ${G.toko.peti_jenis || 20} jenis)` }),
        kisi(dalam, 'peti', 'keluar', 'Peti kosong.'),
        el('h4', { teks: `Inventory (${Object.keys(inv).filter(b => inv[b] > 0).length} / ${G.tas.kapasitas} slot)` }),
        kisi(inv, 'inv', 'masuk', 'Inventory kosong.'));
    };
    Panel.buka('Peti: ' + namaBarang(o.n), isi, { kelas: 'ringkas' });
    lukisIsi();
    document.addEventListener('kevi:segar', lukisIsi);
    Panel.saatTutup = () => document.removeEventListener('kevi:segar', lukisIsi);
  },
};

/* Kotak kiriman di kebun: pilih sendiri hasil kebun dan kandang yang mau dijual (kata yosi), seperti tab Jual di Bu Sari.
 * Dua kisi: Inventory (hasil yang dimiliki) dan Kotak (yang akan dijual). Klik = pindahkan seluruh tumpukan,
 * Shift+klik = satu. Kotak hanya ada di peramban sampai tombol Jual ditekan; server memeriksa lagi jumlahnya.
 */
const KotakJual = {
  buka() {
    const kotak = {}, isi = el('div', { kelas: 'peti' });
    const hasil = (b) => (b.startsWith('panen:') || !!(G.toko.produk || {})[b]) && hargaJual(b) != null;
    const lukis = () => {
      for (const b of Object.keys(kotak)) { kotak[b] = Math.min(kotak[b], G.inventori[b] || 0); if (!kotak[b]) delete kotak[b]; }
      const sisa = {};
      for (const b of Object.keys(G.inventori)) if (hasil(b) && G.inventori[b] - (kotak[b] || 0) > 0) sisa[b] = G.inventori[b] - (kotak[b] || 0);
      const total = Object.keys(kotak).reduce((n, b) => n + hargaJual(b) * kotak[b], 0), jumlah = Object.values(kotak).reduce((n, v) => n + v, 0);
      const kisi = (data, sisi, kosong) => el('div', { kelas: 'inv-kisi peti-kisi', 'data-sisi': sisi },
        Object.keys(data).length ? Object.keys(data).sort().map(b => el('div', { kelas: 'inv-sel isi', title: namaBarang(b) + ' x' + data[b] + ' · ' + hargaJual(b) + ' koin per buah', 'data-barang': b, on: { click: (ev) => {
          const n = ev.shiftKey ? 1 : data[b];
          kotak[b] = Math.max(0, (kotak[b] || 0) + (sisi === 'inv' ? n : -n));
          lukis();
        } } }, ikonBarang(b, 26), data[b] > 1 ? el('small', { teks: String(data[b]) }) : null)) : el('p', { kelas: 'redup kecil', teks: kosong }));
      isi.replaceChildren(
        el('p', { kelas: 'redup kecil', teks: 'Klik hasil panen untuk memasukkannya ke kotak (Shift+klik = satu). Klik isi kotak untuk mengeluarkannya. Yang terjual hanya isi kotak.' }),
        el('h4', { teks: 'Kotak kiriman (' + jumlah + ' barang)' }),
        kisi(kotak, 'kotak', 'Kotak masih kosong.'),
        el('div', { kelas: 'baris-tombol' },
          el('button', { kelas: 'tombol kecil', id: 'kotak-semua', teks: 'Masukkan semua', disabled: !Object.keys(sisa).length, on: { click: () => { for (const b of Object.keys(sisa)) kotak[b] = G.inventori[b]; lukis(); } } }),
          el('button', { kelas: 'tombol kecil', teks: 'Kosongkan', disabled: !jumlah, on: { click: () => { for (const b of Object.keys(kotak)) delete kotak[b]; lukis(); } } }),
          el('span', { kelas: 'tumbuh' }),
          el('button', { kelas: 'tombol utama', id: 'kotak-jual', teks: 'Jual: +' + total + ' koin', disabled: !jumlah, on: { click: async () => {
            const d = await aksi('/api/kebun/jual-pilihan', { daftar: Object.assign({}, kotak) });
            if (d) { kabar('Hasil terjual: +' + d.dapat + ' koin.', 'hadiah'); for (const b of Object.keys(kotak)) delete kotak[b]; lukis(); }
          } } })),
        el('h4', { teks: 'Inventory: hasil kebun dan kandang' }),
        kisi(sisa, 'inv', 'Tidak ada hasil kebun atau kandang di inventory.'));
    };
    Panel.buka('Kotak kiriman: jual hasil', isi, { kelas: 'ringkas' });
    lukis();
  },
};
