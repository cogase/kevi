/* Kevi — handphone: tombol berbentuk handphone di layar (muncul setelah perangkatnya dibeli di toko elektronik, yang
 * baru terbuka di level tertentu). Dua kegunaan: kirim pesan ke pemain lain di mana pun (tersimpan, jadi yang luring
 * membacanya saat masuk lagi), dan menghubungi NPC dari jauh (membuka layanan NPC itu tanpa berjalan ke mejanya).
 * Aturan pesan di server (app/hp.py).
 */
'use strict';

const Hp = {
  belum: 0, tab: 'pesan', lawan: null,
  LAYANAN: { toko: 'Koperasi', pakaian: 'Toko pakaian', battle: 'Item battle', elektronik: 'Toko elektronik', misi: 'Misi harian', kuis: 'Kuis jaringan', kopi: 'Pesan kopi', pulang: 'Antar pulang', obrol: 'Mengobrol' },

  punya() { return (G.inventori[(G.toko.hp || {}).barang || 'hp'] || 0) > 0; },

  pasang() {
    const tombol = el('button', { id: 'hp-tombol', title: 'Handphone (H)', 'aria-label': 'Handphone', hidden: true, on: { click: (ev) => { ev.currentTarget.blur(); this.buka(); } } },
      el('span', { kelas: 'hp-layar' }), el('span', { id: 'hp-lencana', hidden: true }));
    document.body.append(tombol);
    document.addEventListener('kevi:segar', () => this.segarkan());
    this.segarkan();
    if (this.punya()) this.muatBelum();
  },
  segarkan() {
    const t = $('#hp-tombol');
    if (!t) return;
    const punya = this.punya();
    if (punya && t.hidden) this.muatBelum();
    t.hidden = !punya;
    const l = $('#hp-lencana');
    l.hidden = !this.belum; l.textContent = this.belum > 9 ? '9+' : String(this.belum);
  },
  async muatBelum() { try { const d = await api('/api/hp'); this.belum = d.belum || 0; this.segarkan(); } catch (e) { /* belum punya: abaikan */ } },

  // Toko Koh Andi.
  toko() {
    const h = G.toko.hp || { harga: 0, level: 1 }, b = h.barang || 'hp', isi = el('div', {});
    const lukis = () => {
      const punya = this.punya(), kunci = h.level > G.level.level;
      isi.replaceChildren(
        el('p', { kelas: 'redup', teks: 'Handphone untuk mengirim pesan ke rekan di mana pun (yang sedang luring membacanya saat masuk lagi) dan menghubungi NPC tanpa berjalan ke mejanya. Sesudah dibeli, tombol handphone muncul di kanan layar.' }),
        el('div', { kelas: 'kisi' }, el('button', { kelas: 'kartu' + (kunci ? ' gembok' : ''), id: 'hp-beli', disabled: punya || (!kunci && h.harga > G.koin), title: 'Handphone' + (kunci ? ' — terbuka di level ' + h.level : ''),
          on: { click: async () => { if (kunci) { kabar('Handphone baru bisa dibeli di level ' + h.level + '.', 'galat'); return; } const d = await aksi('/api/toko/beli', { barang: b, jumlah: 1 }); if (d) { kabar('Handphone dibeli. Tombolnya ada di kanan layar (atau tekan H).', 'hadiah'); lukis(); } } } },
          el('span', { kelas: 'ikon ikon-senjata', teks: '📱', gaya: { width: '40px', height: '40px', fontSize: '26px' } }), el('b', { teks: 'Handphone' }), el('small', { kelas: 'harga', teks: h.harga }),
          kunci ? el('span', { kelas: 'cip level-kunci', teks: 'Lv ' + h.level }) : null, punya ? el('span', { kelas: 'punya', teks: 'punya' }) : null)));
    };
    lukis();
    Panel.buka('Koh Andi: toko elektronik', isi);
  },

  async buka() {
    if (!this.punya()) { kabar('Kamu belum punya handphone. Beli di Koh Andi (toko elektronik).', 'galat'); return; }
    this.lawan = null; this.tab = 'pesan';              // selalu mulai dari Pesan
    this.isi = el('div', { kelas: 'hp' });
    Panel.buka('Handphone', this.isi, { sempit: true });
    await this.lukis();
  },
  kepala() {
    return el('div', { kelas: 'tab' }, [['pesan', 'Pesan' + (this.belum ? ' (' + this.belum + ')' : '')], ['npc', 'Hubungi NPC']].map(([id, nama]) =>
      el('button', { kelas: this.tab === id ? 'aktif' : '', 'data-tab': id, teks: nama, on: { click: () => { this.tab = id; this.lawan = null; this.lukis(); } } })));
  },
  async lukis() {
    if (!this.isi || !this.isi.isConnected) return;
    if (this.tab === 'npc') { this.isi.replaceChildren(this.kepala(), this.daftarNpc()); return; }
    if (this.lawan != null) return this.lukisUtas();
    let d;
    try { d = await api('/api/hp'); } catch (e) { kabar(e.message, 'galat'); return; }
    this.belum = d.belum || 0; this.segarkan();
    if (!this.isi.isConnected || this.tab !== 'pesan' || this.lawan != null) return;
    this.isi.replaceChildren(this.kepala(), el('div', { kelas: 'daftar' }, d.kontak.length ? d.kontak.map(k => el('button', { kelas: 'baris hp-kontak', 'data-kontak': k.id, on: { click: () => { this.lawan = k.id; this.lukis(); } } },
      el('span', { kelas: 'cip ' + (k.daring ? 'hijau' : ''), teks: k.daring ? 'daring' : 'luring' }), el('span', { kelas: 'tumbuh', teks: k.nama + ' · Lv ' + k.level }), k.belum ? el('span', { kelas: 'cip merah', teks: k.belum + ' baru' }) : null))
      : el('p', { kelas: 'redup', teks: 'Belum ada rekan lain yang punya handphone.' })));
  },
  async lukisUtas() {
    let d;
    try { d = await api('/api/hp?id=' + this.lawan); } catch (e) { kabar(e.message, 'galat'); this.lawan = null; return this.lukis(); }
    this.belum = d.belum || 0; this.segarkan();
    if (!this.isi.isConnected || this.lawan !== d.id) return;
    const jam = (w) => new Date(w * 1000).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const log = el('div', { kelas: 'hp-utas', 'aria-live': 'polite' }, d.pesan.length ? d.pesan.map(p => el('div', { kelas: 'hp-pesan' + (p.saya ? ' saya' : '') }, el('span', { teks: p.teks }), el('small', { teks: jam(p.waktu) })))
      : el('p', { kelas: 'redup', teks: 'Belum ada pesan. Tulis yang pertama.' }));
    const isian = el('input', { type: 'text', id: 'hp-isi', maxLength: 240, placeholder: 'Tulis pesan untuk ' + d.nama + '…', autocomplete: 'off' });
    const kirim = async (ev) => {
      ev.preventDefault();
      const teks = isian.value.trim();
      if (!teks) return;
      try { await api('/api/hp/kirim', { ke: d.id, teks }); isian.value = ''; await this.lukisUtas(); } catch (e) { kabar(e.message, 'galat'); }
    };
    this.isi.replaceChildren(this.kepala(),
      el('div', { kelas: 'baris' }, el('button', { kelas: 'tombol kecil', teks: '‹ Kontak', on: { click: () => { this.lawan = null; this.lukis(); } } }), el('b', { kelas: 'tumbuh', teks: d.nama })),
      log, el('form', { kelas: 'hp-kirim', on: { submit: kirim } }, isian, el('button', { kelas: 'tombol kecil utama', teks: 'Kirim' })));
    log.scrollTop = log.scrollHeight;
    isian.focus();
  },
  // NPC peta ini: tombol membuka layanannya dari jauh, sama seperti berbicara langsung.
  daftarNpc() {
    const npc = [...G.entitas.values()].filter(e => e.jenis === 'npc');
    return el('div', { kelas: 'daftar' }, npc.length ? npc.map(e => {
      const d = e.data || {}, layanan = this.LAYANAN[d.peran] || 'Mengobrol';
      return el('div', { kelas: 'baris' }, el('span', { kelas: 'tumbuh', teks: e.nama + (d.jabatan ? ' · ' + d.jabatan : '') }),
        el('button', { kelas: 'tombol kecil', 'data-npc': e.id, teks: layanan, on: { click: () => this.hubungi(e) } }));
    }) : el('p', { kelas: 'redup', teks: 'Tidak ada NPC yang bisa dihubungi.' }));
  },
  hubungi(e) {
    const d = e.data || {};
    Panel.tutup();
    if (d.peran === 'toko') Toko.buka();
    else if (d.peran === 'pakaian') Pakaian.buka(true);
    else if (d.peran === 'battle') Battle.toko();
    else if (d.peran === 'elektronik') this.toko();
    else if (d.peran === 'misi') Panel.misi();
    else if (d.peran === 'kuis') Kuis.tawarkan(e);
    else if (d.peran === 'kopi') Sosial.kopi(e);
    else if (d.peran === 'pulang') Mesin.pindah('rumah:' + G.saya.id);
    else { const u = d.ucap || ['Halo!']; kabar(e.nama + ': ' + u[Math.floor(Math.random() * u.length)]); }
  },

  // Pesan WebSocket. Mengembalikan true bila pesannya milik handphone.
  terima(m) {
    if (m.t !== 'hp_pesan') return false;
    const terbuka = this.isi && this.isi.isConnected && this.tab === 'pesan';
    if (terbuka && this.lawan === m.dari) { this.lukisUtas(); return true; }       // sedang membuka percakapan itu: langsung tampil dan terbaca
    this.belum += 1; this.segarkan();
    kabar('Pesan dari ' + m.nama + ': ' + (m.teks.length > 60 ? m.teks.slice(0, 60) + '…' : m.teks), 'hadiah');
    if (typeof Suara !== 'undefined') Suara.efek('koin');
    if (terbuka) this.lukis();
    return true;
  },
};
