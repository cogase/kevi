/* Kevi — feedback: pemain mengirim saran atau laporan bug dari dalam game (Menu). Admin membacanya di dashboard.
 * Tempat dan posisi karakter ikut dikirim supaya laporan bug bisa ditelusuri.
 */
'use strict';

const Umpan = {
  buka() {
    const jenis = el('select', { id: 'umpan-jenis', 'aria-label': 'Jenis' }, el('option', { value: 'saran', teks: 'Saran / ide' }), el('option', { value: 'bug', teks: 'Lapor bug' }));
    const teks = el('textarea', { id: 'umpan-teks', rows: 6, maxlength: 1000, placeholder: 'Ceritakan sarannya, atau untuk bug: apa yang kamu lakukan, apa yang terjadi, dan apa yang seharusnya terjadi.' });
    Panel.buka('Kirim saran atau lapor bug', el('form', { kelas: 'formulir', on: { submit: async (ev) => {
      ev.preventDefault();
      try {
        await api('/api/umpan-balik', { jenis: jenis.value, teks: teks.value, adegan: G.adegan, x: G.aku ? Math.round(G.aku.x) : null, y: G.aku ? Math.round(G.aku.y) : null });
        Panel.tutup();
        kabar('Terkirim. Terima kasih, admin akan membacanya.', 'hadiah');
      } catch (e) { kabar(e.message, 'galat'); }
    } } },
    el('p', { kelas: 'redup', teks: 'Kirimanmu dibaca admin untuk mengembangkan Kevi. Tempat dan posisi karaktermu ikut tercatat.' }),
    jenis, teks, el('button', { kelas: 'tombol utama', teks: 'Kirim' })), { sempit: true });
  },
};
