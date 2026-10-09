/* Kevi — profil pemain: tampang, level, dan statistik kegiatan. Profil sendiri dibuka dari Menu, profil rekan dari
 * menu rekan (E di dekatnya). Profil sendiri juga tempat mengubah karakter dan sakelar bilah mini.
 */
'use strict';

const Profil = {
  lama(menit) {
    menit = menit || 0;
    const j = Math.floor(menit / 60), m = menit % 60;
    return j ? `${j} jam ${m} menit` : `${m} menit`;
  },

  async buka(id) {
    let d;
    try { d = await api('/api/profil' + (id ? '?id=' + id : '')); } catch (e) { kabar(e.message, 'galat'); return; }
    const s = d.statistik || {}, lv = d.level, sendiri = d.id === G.saya.id, rb = (n) => (n || 0).toLocaleString('id-ID');
    const potret = el('canvas', { width: 64, height: 88, kelas: 'profil-potret', 'aria-label': 'Tampang ' + d.nama });
    const b = bingkaiTokoh(penampilan({ session_id: 'profil-' + d.id, nama: d.nama, tampilan: d.tampilan || {} }), 'bawah_diam');
    if (b) { const k = potret.getContext('2d'); k.imageSmoothingEnabled = false; k.drawImage(b.kanvas, 0, 0, b.kanvas.width, b.kanvas.height, 4, 4, b.kanvas.width * 2, b.kanvas.height * 2); }
    const kelompok = [
      ['Permainan', [['Level', lv.level], ['Total XP', rb(lv.xp)], ['Koin', rb(d.koin)], ['Lama bermain', this.lama(s.menit)], ['Slot inventory', d.slot]]],
      ['Kerja', [['Perintah terminal', rb(s.terminal)], ['Tanam', rb(s.tanam)], ['Panen', rb(s.panen)], ['Hasil ternak', rb(s.produk)], ['Nilai jualan', rb(s.jual) + ' koin']]],
      ['Santai', [['Masak', rb(s.masak)], ['Makan', rb(s.makan)], ['Arcade', rb(s.arcade)], ['Kopi', rb(s.kopi)]]],
      ['Rumah', [['Perabot terpasang', rb(d.rumah.benda)], ['Ubin lantai & tembok', rb(d.rumah.ubin)], ['Petak kebun', rb(d.rumah.petak)], ['Hewan', rb(d.rumah.hewan)]]],
    ];
    Panel.buka('Profil ' + d.nama, el('div', { kelas: 'profil' },
      el('div', { kelas: 'profil-kepala' }, potret,
        el('div', {}, el('b', { teks: d.nama }), el('div', {}, el('span', { kelas: 'cip level', teks: 'Lv ' + lv.level }), ' ',
          d.peran === 'admin' ? el('span', { kelas: 'cip', teks: 'admin' }) : null, ' ', el('span', { kelas: 'cip ' + (d.daring ? 'hijau' : ''), teks: d.daring ? 'daring' : 'luring' })),
        el('p', { kelas: 'redup kecil', teks: 'Bergabung ' + new Date(d.dibuat * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) }))),
      kelompok.map(([judul, baris]) => el('div', { kelas: 'profil-kelompok' }, el('h4', { teks: judul }),
        el('dl', {}, baris.flatMap(([n, v]) => [el('dt', { teks: n }), el('dd', { teks: String(v) })])))),
      sendiri ? el('div', { kelas: 'baris-tombol' },
        el('button', { kelas: 'tombol kecil', teks: 'Ubah karakter', on: { click: () => Buat.buka(false) } }),
        el('button', { kelas: 'tombol kecil', id: 'profil-bilah', teks: 'Bilah di atas karakter: ' + (G.tata.bilah ? 'nyala' : 'mati'), on: { click: (ev) => { G.tata.bilah = !G.tata.bilah; Hotbar.simpan(); ev.currentTarget.textContent = 'Bilah di atas karakter: ' + (G.tata.bilah ? 'nyala' : 'mati'); } } }))
        : el('div', { kelas: 'baris-tombol' }, d.daring ? el('button', { kelas: 'tombol kecil', teks: 'Bertamu ke rumahnya', on: { click: () => { Panel.tutup(); Mesin.pindah('rumah:' + d.id); } } }) : null)),
    { kelas: 'ringkas' });
  },
};
