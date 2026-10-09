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
