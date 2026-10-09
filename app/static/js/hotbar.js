/* Kevi — inventory berslot + hotbar (ala Minecraft), makan, dan masak.
 *
 * Inventory: satu jenis barang = satu slot. Urutan slot dan isi hotbar adalah "tata letak" milik pemain, disimpan
 * di server (G.tata) supaya ikut ke perangkat mana pun. Hotbar berisi rujukan ke barang di inventory (bukan salinan):
 * benih harus dipegang untuk ditanam, perabot harus dipegang untuk ditaruh, makanan dipegang lalu F untuk dimakan.
 */
'use strict';

const Hotbar = {
  pilih: -1,             // indeks slot yang sedang dipegang, -1 = tangan kosong
  simpanNanti: null,

  dipegang() { const b = this.pilih >= 0 ? G.tata.hotbar[this.pilih] : null; return b && G.inventori[b] > 0 ? b : null; },

  // Samakan tata letak dengan isi inventory: barang baru masuk slot kosong pertama, barang habis dilepas dari urutan.
  rapikan() {
    const t = G.tata, punya = Object.keys(G.inventori).filter(b => G.inventori[b] > 0), kap = G.tas.kapasitas;
    t.urut = (t.urut || []).map(b => (b && G.inventori[b] > 0 ? b : null));
    while (t.urut.length < kap) t.urut.push(null);
    for (const b of punya) if (!t.urut.includes(b)) { const i = t.urut.indexOf(null); if (i >= 0) t.urut[i] = b; else t.urut.push(b); }
    t.hotbar = (t.hotbar || []).concat(Array(10).fill(null)).slice(0, 10);
  },

  simpan() {
    clearTimeout(this.simpanNanti);
    this.simpanNanti = setTimeout(() => api('/api/inventori/tata', G.tata).catch(() => {}), 600);
  },

  lukis() {
    this.rapikan();
    const wadah = $('#hotbar');
    wadah.replaceChildren(...G.tata.hotbar.map((b, i) => {
      const ada = b && G.inventori[b] > 0;
      const sel = el('button', { kelas: 'hb-sel' + (i === this.pilih ? ' aktif' : '') + (b && !ada ? ' habis' : ''), title: b ? namaBarang(b) : 'Slot kosong — isi dari Inventory (I)',
        on: { click: () => this.pegang(i), dragover: (ev) => ev.preventDefault(), drop: (ev) => { ev.preventDefault(); this.isi(i, ev.dataTransfer.getData('text/kevi-barang')); } } },
        el('kbd', { teks: String((i + 1) % 10) }), b ? ikonBarang(b, 30) : null, ada ? el('small', { teks: G.inventori[b] > 1 ? String(G.inventori[b]) : '' }) : null);
      return sel;
    }));
    const b = this.dipegang();
    $('#hotbar-nama').textContent = b ? namaBarang(b) + this.petunjuk(b) : '';
  },

  petunjuk(b) {
    if (b.startsWith('makan:')) return ' — F untuk makan';
    if (b.startsWith('benih:')) return ' — E di petak kosong untuk menanam';
    if (Rumah.bisaDipasang(b)) return G.adegan !== 'kantor' && G.rumahSaya ? ' — klik untuk menaruh, R putar' : ' — ditaruh di rumahmu';
    return '';
  },

  isi(i, b) {
    if (!b || !(G.inventori[b] > 0)) return;
    const lama = G.tata.hotbar.indexOf(b);
    if (lama >= 0) G.tata.hotbar[lama] = G.tata.hotbar[i];        // tukar tempat bila sudah ada di hotbar
    G.tata.hotbar[i] = b;
    this.simpan(); this.lukis(); this.terapkan();
  },

  pegang(i) {
    this.pilih = this.pilih === i ? -1 : i;
    this.lukis(); this.terapkan();
  },

  // Barang yang dipegang menentukan mode: perabot/lantai/tembok di rumah sendiri = siap ditaruh.
  terapkan() {
    const b = this.dipegang(), diRumah = G.adegan !== 'kantor' && G.rumahSaya;
    if (b && diRumah && Rumah.bisaDipasang(b)) { if (!G.bangun || G.bangun.barang !== b) { Rumah.masukBangun(b); G.bangun.dariHotbar = true; } }
    else if (G.bangun && G.bangun.dariHotbar) Rumah.keluarBangun();
  },

  async pakai() {
    const b = this.dipegang();
    if (!b) { kabar('Pegang sesuatu dulu: tekan 1–0 untuk memilih slot hotbar.'); return; }
    if (!b.startsWith('makan:')) { kabar(namaBarang(b) + this.petunjuk(b).replace(' — ', ': ') + '.'); return; }
    const d = await aksi('/api/inventori/makan', { barang: b });
    if (!d) return;
    const st = G.stamina;
    st.nilai = Math.min(G.level.stamina, st.nilai + d.stamina); st.lelah = false;
    if (d.kopi) st.kopi = Math.max(st.kopi, G.kini) + d.kopi;
    G.aku.emot = { n: 'hati', sampai: performance.now() + 1800 };
    apung('+' + d.stamina + ' stamina', '#a7f3d0');
  },
};

/* ---------- panel Inventory: kisi slot kecil, seret untuk menata atau mengisi hotbar ---------- */

const Inventori = {
  buka() {
    Hotbar.rapikan();
    const isi = el('div', { kelas: 'inv' });
    const lukisIsi = () => {
      if (!isi.isConnected && isi.children.length) return;
      Hotbar.rapikan();
      const t = G.tata, kap = G.tas.kapasitas, terisi = Object.keys(G.inventori).filter(b => G.inventori[b] > 0).length;
      const sel = (b, i, hotbar) => {
        const c = el('div', { kelas: 'inv-sel' + (b ? ' isi' : '') + (hotbar ? ' hb' : ''), title: b ? namaBarang(b) + ' x' + (G.inventori[b] || 0) : '', draggable: !!b,
          on: {
            dragstart: (ev) => { ev.dataTransfer.setData('text/kevi-barang', b); ev.dataTransfer.setData('text/kevi-dari', (hotbar ? 'h' : 'i') + i); },
            dragover: (ev) => ev.preventDefault(),
            drop: (ev) => {
              ev.preventDefault();
              const bawa = ev.dataTransfer.getData('text/kevi-barang'), dari = ev.dataTransfer.getData('text/kevi-dari');
              if (!bawa) return;
              if (hotbar) Hotbar.isi(i, bawa);
              else if (dari[0] === 'i') { const j = Number(dari.slice(1)); [t.urut[i], t.urut[j]] = [t.urut[j], t.urut[i]]; Hotbar.simpan(); }
              lukisIsi();
            },
            click: () => { if (b) this.pilihBarang(b, lukisIsi); },
          } }, hotbar ? el('kbd', { teks: String((i + 1) % 10) }) : null, b ? ikonBarang(b, 26) : null, b && G.inventori[b] > 1 ? el('small', { teks: String(G.inventori[b]) }) : null);
        return c;
      };
      isi.replaceChildren(
        el('p', { kelas: 'redup kecil', teks: `${terisi} / ${kap} slot terisi. Seret barang untuk menata, atau seret ke hotbar di bawah. Klik barang untuk pilihan.` }),
        el('div', { kelas: 'inv-kisi' }, t.urut.slice(0, Math.max(kap, t.urut.length)).map((b, i) => sel(b, i, false))),
        el('h4', { teks: 'Hotbar (tombol 1–0)' }),
        el('div', { kelas: 'inv-kisi hotbar' }, t.hotbar.map((b, i) => sel(b && G.inventori[b] > 0 ? b : null, i, true))),
        el('div', { kelas: 'baris-tombol' },
          el('button', { kelas: 'tombol kecil', teks: 'Rapikan', on: { click: () => { t.urut = t.urut.filter(Boolean).sort(); Hotbar.simpan(); lukisIsi(); } } }),
          G.tas.harga ? el('span', { kelas: 'redup kecil', teks: `Butuh tempat? Tas +10 slot dijual Bu Sari di Koperasi (${G.tas.harga} koin).` }) : null));
      Hotbar.lukis();
    };
    Panel.buka('Inventory', isi, { kelas: 'ringkas' });
    lukisIsi();
    document.addEventListener('kevi:segar', lukisIsi);
    Panel.saatTutup = () => document.removeEventListener('kevi:segar', lukisIsi);
  },

  pilihBarang(b, segar) {
    const kosong = G.tata.hotbar.findIndex((x, i) => !x || !(G.inventori[x] > 0));
    const tb = [el('button', { kelas: 'tombol kecil utama', teks: 'Ke hotbar', on: { click: () => { Hotbar.isi(kosong >= 0 ? kosong : 9, b); kabar(namaBarang(b) + ' masuk hotbar.'); segar(); } } })];
    if (b.startsWith('makan:')) tb.push(el('button', { kelas: 'tombol kecil hijau', teks: 'Makan', on: { click: async () => { const i = G.tata.hotbar.indexOf(b); const lama = Hotbar.pilih; if (i < 0) Hotbar.isi(kosong >= 0 ? kosong : 9, b); Hotbar.pilih = G.tata.hotbar.indexOf(b); await Hotbar.pakai(); Hotbar.pilih = lama; segar(); } } }));
    const jual = hargaJual(b);
    kabar(namaBarang(b) + ' x' + G.inventori[b] + (jual ? ' · harga jual ' + jual : ''));
    const lama = $('.inv-aksi'); if (lama) lama.remove();
    $('.inv').append(el('div', { kelas: 'baris-tombol inv-aksi' }, ikonBarang(b, 30), el('b', { teks: namaBarang(b) }), ...tb));
  },
};

/* ---------- masak ---------- */

const Masak = {
  buka() {
    const isi = el('div');
    const lukisIsi = () => {
      const t = G.toko;
      isi.replaceChildren(el('p', { kelas: 'redup', teks: 'Masakan memulihkan stamina lebih banyak daripada jajanan, dan membuat stamina pulih lebih cepat sesudahnya. Pegang di hotbar lalu tekan F untuk makan.' }),
        el('div', { kelas: 'daftar' }, Object.entries(t.resep).map(([kode, bahan]) => {
          const m = t.makanan[kode], cukup = Object.entries(bahan).every(([b, n]) => (G.inventori[b] || 0) >= n);
          return el('div', { kelas: 'baris' + (cukup ? '' : ' terkunci') }, ikon(m.ikon, 30),
            el('div', { kelas: 'tumbuh' }, el('b', { teks: m.nama }), el('div', { kelas: 'redup kecil', teks: Object.entries(bahan).map(([b, n]) => `${n} ${namaBarang(b).toLowerCase()} (${G.inventori[b] || 0})`).join(' + ') })),
            el('span', { kelas: 'cip hijau', teks: '+' + m.stamina + ' stamina' }),
            el('button', { kelas: 'tombol kecil utama', teks: 'Masak', disabled: !cukup, on: { click: async () => { const d = await aksi('/api/inventori/masak', { resep: kode }); if (d) { kabar(m.nama + ' matang, masuk inventory.', 'hadiah'); lukisIsi(); } } } }));
        })));
    };
    lukisIsi();
    Panel.buka('Masak', isi, { kelas: 'ringkas' });
  },
};
