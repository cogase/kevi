/* Kevi — denah yang bisa disunting: rumah tiap pemain DAN peta utama (kantor).
 *
 * Satu penggambar untuk keduanya. Bedanya hanya datanya (`Rumah.d`):
 *   rumah  -> G.rumah, tanah rumput + pagar + jalan; pemilik menyunting dengan barang dari inventory.
 *   kantor -> G.peta, dasar "default" (peta Agent Pak terpanggang, ditimpa tambahan admin) atau "kosong"
 *             (admin membangun dari nol); admin menyunting bebas dari seluruh katalog, tanpa biaya, lewat
 *             Edit Map (sunting.js) yang bekerja pada draf dan baru tersiar saat disimpan.
 * Data selalu salinan jawaban server; berkas ini tidak pernah mengubahnya sendiri.
 */
'use strict';

const JALUR_ATAS = 3;                       // rumah: baris di ATAS tanah (jalan dari kantor + pagar bergerbang)
const ALAS_TANAH = /^(karpet|keset|em_tikar_|tidur_karpet|kebun_petak|kebun_jalan|kebun_batu_pijakan|kota_zebra|kota_manhole)/;
const TITIK_JUAL = /^kebun_(kotak_kiriman|peti_tani|peti_hasil|lumbung_)/;
const WARNA_TEMBOK = ['#8b9bb4', '#c98a4b', '#b5651d', '#7c9a6a', '#b0606a', '#e8e2d0', '#4a5568'];
// Perabot yang "berfungsi" bila ditaruh admin di peta utama (nama sprite Agent Pak).
const FUNGSI_BENDA = [
  [/^mesin_penjual/, 'Koperasi (mesin penjual)', () => Toko.buka()],
  [/^(mesin_arcade|tv_konsol)/, 'Main arcade: Cocokkan Kartu', () => Arcade.buka()],
  [/^rak_server/, 'Konsol rak server', () => Terminal.buka('rak')],
  [/^(kompor|microwave)/, 'Masak', () => Masak.buka()],
  [/^(meja_(kerja|direktur|bos|L|lurus|jejer|hadap4|cluster|teknisi|tulis|noc|resepsionis)|monitor)/, 'Buka Komputer', () => Terminal.buka('rak')],
];

function campurWarna(a, b, t) {
  const p = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

const Rumah = {
  latar: document.createElement('canvas'),
  urut: [], alas: [], titik: [], menyunting: false,

  get kantor() { return G.adegan === 'kantor'; },
  get d() { return this.kantor ? G.peta : G.rumah; },
  get dasarDefault() { return this.kantor && G.peta.dasar === 'default'; },
  bolehBangun() { return this.kantor ? G.saya.peran === 'admin' : G.rumahSaya; },
  // Data rumah berkoordinat tanah (0,0 = pojok tanah); di dunia tanah itu digeser ke bawah sejauh jalur atas.
  get oy() { return this.kantor ? 0 : JALUR_ATAS * T; },

  acak(gx, gy) { let h = (gx * 73856093) ^ (gy * 19349663); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; },
  infoBarang(n) { return G.katalog.barang[n] || {}; },
  alasTanah(n) { return ALAS_TANAH.test(n) || (this.infoBarang(n).k || '') === 'Dekorasi/Karpet & tikar'; },
  gerbang() { const cx = Math.floor(G.rumah.lebar / 2); return [cx - 1, cx]; },

  // Dipanggil tiap kali datanya berganti: bangun ulang lapis tanah, grid tabrakan, dan daftar gambar.
  segarkan() {
    const d = this.d;
    if (!d) return;
    const kantor = this.kantor, J = kantor ? 0 : JALUR_ATAS, oy = J * T, W = d.lebar, H = d.tinggi + J, g = gridBaru(W, H), k = this.latar.getContext('2d');
    this.latar.width = W * T; this.latar.height = H * T;
    k.imageSmoothingEnabled = false;
    if (this.dasarDefault) {
      k.drawImage(G.gbr.latar, 0, 0);
      g.sel.set(Mesin.gridKantor.sel);
    } else if (kantor) {
      const n = atlas[d.lantai_dasar] ? d.lantai_dasar : 'lantai_luar_rumput';
      for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) lukis(k, n, gx * T, gy * T);
    } else {
      const gerbang = this.gerbang();
      for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
        const r = this.acak(gx, gy);
        let n = r < 0.05 ? 'lantai_luar_rumput_bunga' : r < 0.22 ? 'lantai_luar_rumput_b' : 'lantai_luar_rumput';
        if (gy < J - 1 || (gy === J - 1 && gerbang.includes(gx))) n = 'lantai_luar_jalan_tanah';
        lukis(k, atlas[n] ? n : 'lantai_luar_rumput', gx * T, gy * T);
      }
    }
    const ef = this.ubinEfektif(d);
    for (const [kunci, n] of Object.entries(ef.lantai)) { const [gx, gy] = kunci.split(',').map(Number); lukis(k, n, gx * T, gy * T + oy); }
    const peta = new Map(Object.entries(ef.tembok));
    for (const [kunci, warna] of peta) {
      const [gx, gy] = kunci.split(',').map(Number);
      this.lukisTembok(k, peta, gx, gy, warna, oy);
      gridHalang(g, gx, gy + J);
    }
    if (!kantor) {                               // pagar di atas tanah, kecuali celah gerbang
      const gerbang = this.gerbang();
      for (let gx = 0; gx < W; gx++) {
        if (gerbang.includes(gx)) continue;
        lukis(k, atlas.luar_pagar_kayu_h ? 'luar_pagar_kayu_h' : 'kandang_pagar_kayu', gx * T, (J - 1) * T);
        gridHalang(g, gx, J - 1);
      }
    }
    this.urut = []; this.alas = [];
    for (const o of d.benda) {
      const u = ukuranSprite(o.n, o.r), info = this.infoBarang(o.n);
      // Lapis (o.l, hanya peta utama): "bawah" digambar bersama alas, "atas" di atas semua tokoh; tabrakannya tetap.
      const b = { o, w: u.w, h: u.h, y: o.y + oy, alas: o.l === 'atas' ? 1e9 + o.id : o.y + oy + u.h };
      const alasTanah = this.alasTanah(o.n);
      if (alasTanah || o.l === 'bawah') this.alas.push(b); else this.urut.push(b);
      if (!alasTanah && !info.tembus) gridJejak(g, o.x, b.y, u.w, u.h, !!info.datar);
    }
    this.alas.sort((p, q) => p.o.id - q.o.id);
    G.grid = g;
    Mesin.dunia = { w: W * T, h: H * T };
    this.susunTitik();
  },

  // Ubin pintu satu ruang (peta utama): dua ubin per pintu pada sisi yang dipilih, sebagai himpunan kunci "gx,gy".
  pintuRuang(r) {
    const s = new Set();
    for (const q of r.pintu || []) {
      const datar = q.sisi === 'atas' || q.sisi === 'bawah', panjang = datar ? r.w : r.h;
      for (let i = 0; i < (panjang >= 5 ? 2 : 1); i++) {
        const pos = Math.max(1, Math.min(panjang - 2, q.pos + i));
        s.add(datar ? (r.gx + pos) + ',' + (q.sisi === 'atas' ? r.gy : r.gy + r.h - 1) : (q.sisi === 'kiri' ? r.gx : r.gx + r.w - 1) + ',' + (r.gy + pos));
      }
    }
    return s;
  },

  // Lantai dan tembok yang benar-benar digambar: turunan dari ruang (d.ruang), ditimpa ubin yang ditaruh satu per satu.
  ubinEfektif(d) {
    if (!d.ruang || !d.ruang.length) return { lantai: d.lantai, tembok: d.tembok };
    const lantai = {}, tembok = {};
    for (const r of d.ruang) {
      const pintu = this.pintuRuang(r);
      for (let gy = r.gy; gy < r.gy + r.h; gy++) for (let gx = r.gx; gx < r.gx + r.w; gx++) {
        const kunci = gx + ',' + gy, tepi = gx === r.gx || gy === r.gy || gx === r.gx + r.w - 1 || gy === r.gy + r.h - 1;
        if (r.lantai) lantai[kunci] = r.lantai;
        if (tepi && !pintu.has(kunci)) tembok[kunci] = r.warna; else delete tembok[kunci];
      }
    }
    return { lantai: Object.assign(lantai, d.lantai), tembok: Object.assign(tembok, d.tembok) };
  },

  // Satu ubin tembok — rumus lukisUbinTembok Agent Pak (tataletak.js): muka dinding bila bertetangga mendatar,
  // dinding tipis bila bertetangga tegak, keduanya di sudut supaya sambungannya menyatu.
  lukisTembok(k, peta, x, y, warna, oy = 0) {
    const ada = (dx, dy) => peta.has((x + dx) + ',' + (y + dy));
    const datar = ada(-1, 0) || ada(1, 0), tegak = ada(0, -1) || ada(0, 1);
    const gelap = campurWarna(warna, '#0b1220', 0.6), muka = campurWarna(warna, '#0b1220', 0.25), terang = campurWarna(warna, '#ffffff', 0.45);
    const px = x * T, py = y * T + oy;
    if (datar || !tegak) {
      k.fillStyle = gelap; k.fillRect(px, py, T, T);
      const kiri = ada(-1, 0) ? 0 : 2, kanan = ada(1, 0) ? 0 : 2;
      k.fillStyle = muka; k.fillRect(px + kiri, py + 9, T - kiri - kanan, 6);
      k.fillStyle = terang; k.fillRect(px + kiri, py + 9, T - kiri - kanan, 1);
    }
    if (tegak) {
      const atas = ada(0, -1) ? 0 : 1, bawah = ada(0, 1) ? T : (datar ? 9 : T - 2);
      k.fillStyle = gelap; k.fillRect(px + 5, py + atas, 6, bawah - atas);
      k.fillStyle = terang; k.fillRect(px + 5, py + atas, 1, bawah - atas);
    }
  },

  /* ---------- gambar ---------- */

  gambar(k, semua) {
    const d = this.d, t = G.kini, petak = d.petak || {}, kandang = d.kandang || {}, bawaan = this.dasarDefault;
    k.drawImage(this.latar, 0, 0);
    if (bawaan) for (const an of G.kantor.animasi) lukis(k, namaPutar(an.n[Math.floor(t * an.laju) % an.n.length], an.r), an.x, an.y);
    for (const b of this.alas) {
      const o = b.o, pt = petak[o.id];
      if (o.n === 'kebun_petak') lukis(k, pt && pt.basah ? 'kebun_petak_basah' : 'kebun_petak', o.x, b.y);
      else lukis(k, namaPutar(bingkaiHidup(o.n, t), o.r), o.x, b.y);
    }
    const daftar = [];
    for (const b of this.urut) {
      const o = b.o;
      let n = o.n;
      const kd = kandang[o.id];
      if (kd && kd.hewan.some(h => h.siap > 0)) { const v = n + (n === 'kandang_ayam' ? '__telur' : '__susu'); if (atlas[v]) n = v; }
      daftar.push({ alas: b.alas, lukis: () => lukis(k, o.r ? namaPutar(n, o.r) : bingkaiHidup(n, t), o.x, b.y) });
      if (kd) kd.hewan.forEach((h, i) => {
        const nh = bingkaiHidup('hewan_' + h.j + '_diam', t + i * 0.37, 2), uh = ukuranSprite(nh);
        const hx = o.x + 2 + i * Math.max(12, (b.w - 4) / Math.max(1, kd.hewan.length)), hy = b.alas + 2;
        daftar.push({ alas: hy + uh.h, lukis: () => { k.globalAlpha = h.kenyang ? 1 : 0.7; lukis(k, nh, hx, hy); k.globalAlpha = 1; } });
      });
    }
    for (const b of this.alas) {
      const o = b.o, pt = petak[o.id];
      if (o.n !== 'kebun_petak' || !pt || !pt.t) continue;
      const n = 'tani_' + pt.t + '_' + pt.tahap, u = ukuranSprite(n);
      daftar.push({ alas: b.y + 13, lukis: () => { lukis(k, n, o.x, b.y + T - u.h); if (pt.matang && Math.floor(t * 2) % 2) lukis(k, 'kilau', o.x, b.y - 12); } });
    }
    for (const e of semua) daftar.push({ alas: e.y + 19, lukis: () => lukisEntitas(k, e, e === G.aku && this.menyunting ? 0.35 : 1) });      // selagi Edit Map karakter sendiri beku dan samar
    daftar.sort((p, q) => p.alas - q.alas);
    for (const b of daftar) b.lukis();
    if (bawaan) this.lapisDepan(k, semua);
    for (const b of this.titik) if (b.tanda) lukis(k, 'seru', b.x, b.y - 14 - Math.abs(Math.sin(t * 2.4)) * 3);
    if (G.bangun) { if (G.bangun.sunting) Sunting.gambar(k); else this.gambarBangun(k); }
  },

  // Peta terpanggang: lapis depan menimpa semua tokoh. Tokoh yang kakinya DI DEPAN benda tinggi digambar ulang di
  // atasnya; yang di balik dinding/benda tetap tertutup — kecuali pemain sendiri, ditampilkan samar supaya tak hilang.
  lapisDepan(k, semua) {
    const d = G.kantor, a = G.aku;
    k.drawImage(G.gbr.depan, 0, 0);
    for (const e of semua) {
      const kaki = e.y + 19;
      let kena = false, diBalik = false;
      const tumpang = (r) => e.x < r.x + r.w && e.x + 16 > r.x && e.y < r.y + r.h && e.y + 20 > r.y;
      for (const b of d.berdiri) if (tumpang(b)) { kena = true; if (b.alas == null || kaki < b.alas) diBalik = true; }
      for (const b of d.dindingDepan) if (tumpang(b)) { kena = true; if (kaki < b.y + b.h) diBalik = true; }
      if (kena && !diBalik) lukisEntitas(k, e);
      else if (kena && e === a) lukisEntitas(k, e, 0.45);
    }
  },

  /* ---------- titik interaksi ---------- */

  susunTitik() {
    const d = this.d, daftar = [];
    if (this.kantor) {
      if (this.dasarDefault) daftar.push(...Mesin.statisKantor);
      daftar.push(...Mesin.titikAdmin());
      for (const b of this.urut) {
        const f = FUNGSI_BENDA.find(([re]) => re.test(b.o.n));
        if (f) daftar.push({ x: b.o.x, y: b.y, w: b.w, h: b.h, label: f[1], aksi: f[2] });
      }
    } else {
      const gb = this.gerbang();
      daftar.push({ x: gb[0] * T, y: (JALUR_ATAS - 1) * T, w: 2 * T, h: T, label: 'Berangkat ke kantor (jalan terus ke atas)', aksi: () => Mesin.pindah('kantor') });
      if (G.rumahSaya) for (const b of [...this.alas, ...this.urut]) {
        const o = b.o;
        if (o.n === 'kebun_petak') daftar.push({ x: o.x + 2, y: b.y + 2, w: 12, h: 12, petak: o, get label() { return Rumah.labelPetak(o); }, aksi: (ev) => Rumah.aksiPetak(o, ev) });
        else if (/^(kompor|microwave)/.test(o.n)) daftar.push({ x: o.x, y: b.y, w: b.w, h: b.h, label: 'Masak', aksi: () => Masak.buka() });
        else if ((G.toko.peti || []).includes(o.n)) daftar.push({ x: o.x, y: b.y, w: b.w, h: b.h, label: 'Buka peti', aksi: () => Peti.buka(o) });
        else if (TITIK_JUAL.test(o.n)) daftar.push({ x: o.x, y: b.y, w: b.w, h: b.h, label: 'Jual hasil panen', aksi: () => Rumah.jualHasil() });
        else if (G.toko.kandang[o.n]) daftar.push({ x: o.x, y: b.y, w: b.w, h: b.h, label: 'Urus ' + G.toko.kandang[o.n].nama.toLowerCase(), aksi: () => Rumah.panelKandang(o) });
      }
    }
    this.titik = daftar;
  },
  interaksi() { return this.titik; },

  labelPetak(o) {
    const pt = (G.rumah && G.rumah.petak[o.id]) || {};
    if (pt.matang) return 'Panen ' + G.toko.tanaman[pt.t].nama.toLowerCase();
    if (!pt.t) return 'Tanam benih';
    if (!pt.basah) return 'Siram ' + G.toko.tanaman[pt.t].nama.toLowerCase() + ' (kering, tak tumbuh)';
    return G.toko.tanaman[pt.t].nama + ' tumbuh, sisa ' + lamaTeks(pt.sisa);
  },

  async aksiPetak(o, ev) {
    const pt = G.rumah.petak[o.id] || {};
    if (pt.matang) { const d = await aksi('/api/kebun/panen', { id: o.id }); if (d) apung('+1 ' + namaBarang(d.dapat), '#bbf7d0', o.x + 8, o.y + this.oy); return; }
    if (!pt.t) {
      const pegang = Hotbar.dipegang();
      if (!pegang || !pegang.startsWith('benih:')) {
        kabar(Object.keys(G.inventori).some(b => b.startsWith('benih:') && G.inventori[b] > 0) ? 'Pegang benihnya dulu: taruh di hotbar (I) lalu pilih dengan tombol 1–0.' : 'Tidak punya benih. Beli di Koperasi (Bu Sari di kantor).', 'galat');
        return;
      }
      const pakai = pegang.slice(6);
      if (await aksi('/api/kebun/tanam', { id: o.id, t: pakai }) && !pt.basah) kabar('Tertanam. Siram supaya tumbuh (E lagi).');
      return;
    }
    if (!pt.basah) { if (await aksi('/api/kebun/siram', { id: o.id })) apung('disiram', '#bae6fd', o.x + 8, o.y + this.oy); return; }
    kabar(this.labelPetak(o) + '.');
  },

  pilihBenih(o, benih) {
    Panel.buka('Tanam benih', el('div', { kelas: 'kisi' }, benih.map(b => {
      const t = G.toko.tanaman[b.slice(6)];
      return el('button', { kelas: 'kartu', on: { click: async () => { Rumah.benih = b.slice(6); Panel.tutup(); await aksi('/api/kebun/tanam', { id: o.id, t: b.slice(6) }); } } },
        ikonBarang(b, 40), el('b', { teks: t.nama }), el('small', { teks: `x${G.inventori[b]} · ${lamaTeks(t.jam * G.toko.jam_kebun)}` }));
    })), { sempit: true });
  },

  async jualHasil() {
    const d = await aksi('/api/toko/jual-hasil', {});
    if (d) kabar('Hasil terjual: +' + d.dapat + ' koin.', 'hadiah');
  },

  panelKandang(o) {
    const isi = el('div');
    const lukisIsi = () => {
      const info = G.toko.kandang[o.n], kd = G.rumah.kandang[o.id] || { hewan: [] };
      const siap = kd.hewan.reduce((a, h) => a + h.siap, 0);
      isi.replaceChildren(
        el('p', { kelas: 'redup', teks: `${kd.hewan.length}/${info.kapasitas} ekor · pakan di inventory: ${G.inventori.pakan || 0} porsi. Hewan hanya berproduksi selama kenyang.` }),
        el('div', { kelas: 'daftar' }, kd.hewan.map(h => el('div', { kelas: 'baris' }, ikon('hewan_' + h.j + '_diam', 36),
          el('span', { teks: G.toko.hewan[h.j].nama }), el('span', { kelas: h.kenyang ? 'cip hijau' : 'cip merah', teks: h.kenyang ? 'kenyang' : 'lapar' }),
          el('span', { kelas: 'cip', teks: `${h.siap} ${G.toko.produk[G.toko.hewan[h.j].produk].nama.toLowerCase()} siap` })))),
        el('div', { kelas: 'baris-tombol' },
          el('button', { kelas: 'tombol', teks: 'Beri pakan', on: { click: async () => { await aksi('/api/kandang/pakan', { id: o.id }); lukisIsi(); } } }),
          el('button', { kelas: 'tombol utama', teks: `Ambil hasil (${siap})`, disabled: !siap, on: { click: async () => { await aksi('/api/kandang/ambil', { id: o.id }); lukisIsi(); } } })),
        el('h4', { teks: 'Beli hewan' }),
        el('div', { kelas: 'kisi' }, info.hewan.map(j => {
          const h = G.toko.hewan[j];
          return el('button', { kelas: 'kartu', disabled: kd.hewan.length >= info.kapasitas, on: { click: async () => { await aksi('/api/kandang/beli', { id: o.id, j }); lukisIsi(); } } },
            ikon('hewan_' + j + '_diam', 40), el('b', { teks: h.nama }), el('small', { kelas: 'harga', teks: h.harga }),
            el('small', { teks: `${G.toko.produk[h.produk].nama} / ${lamaTeks(h.jam * G.toko.jam_kebun)}` }));
        })));
    };
    lukisIsi();
    Panel.buka(G.toko.kandang[o.n].nama, isi, { sempit: true });
  },

  /* ---------- mode Bangun ---------- */

  bisaDipasang(b) { return b === 'tembok' || b.startsWith('lantai:') || !!G.katalog.barang[b]; },
  ubin(b) { return b === 'tembok' || (b || '').startsWith('lantai:'); },

  masukBangun(barang) {
    if (!this.bolehBangun()) { kabar(this.kantor ? 'Peta utama hanya bisa disunting admin.' : 'Mode Bangun hanya di rumah sendiri.', 'galat'); return; }
    if (this.kantor) { Sunting.buka(); return; }        // peta utama: penyunting berdraf (sunting.js)
    Panel.tutup();
    G.bangun = { barang: barang || null, r: 0, mx: -99, my: -99, warna: (G.bangun && G.bangun.warna) || WARNA_TEMBOK[0], tekan: false };
    document.body.classList.add('mode-bangun');
    this.lukisBilah();
  },
  keluarBangun(paksa) {
    if (G.bangun && G.bangun.sunting) { Sunting.tutup(paksa); return; }
    G.bangun = null;
    document.body.classList.remove('mode-bangun');
    $('#bangun').replaceChildren();
  },
  pakai(b) {
    const bg = G.bangun;
    bg.barang = b; bg.r = 0;
    this.lukisBilah();
  },

  // Bilah mode Bangun di rumah. Barang dipilih lewat hotbar (tombol 1–0); peta utama memakai dok Edit Map (sunting.js).
  lukisBilah() {
    const bg = G.bangun, wadah = $('#bangun');
    if (!bg || bg.sunting) return;
    if (bg.barang && !(G.inventori[bg.barang] > 0)) { bg.barang = null; if (bg.dariHotbar) { this.keluarBangun(); Hotbar.lukis(); return; } }
    wadah.replaceChildren(
      el('div', { kelas: 'bangun-judul' }, el('b', { teks: 'Mode Bangun' }),
        el('span', { kelas: 'redup', teks: bg.barang ? 'Klik untuk menaruh · R putar · klik kanan batal' : 'Tangan: klik benda untuk mengambilnya' })),
      el('div', { kelas: 'bangun-daftar' },
        el('button', { kelas: 'slot' + (bg.barang ? '' : ' aktif'), title: 'Ambil / hapus', on: { click: () => this.pakai(null) } }, el('span', { kelas: 'tangan', teks: '✋' }), el('small', { teks: 'Ambil' })),
        el('span', { kelas: 'redup', teks: 'Pilih perabot, lantai, atau tembok dari hotbar (tombol 1–0) untuk menaruhnya.' })),
      bg.barang === 'tembok' ? el('div', { kelas: 'bangun-warna' }, WARNA_TEMBOK.map(w => el('button', { kelas: 'warna' + (bg.warna === w ? ' aktif' : ''), gaya: { background: w }, 'aria-label': 'Warna tembok ' + w, on: { click: () => { bg.warna = w; this.lukisBilah(); } } }))) : null,
      el('button', { kelas: 'tombol utama', teks: 'Selesai (B)', on: { click: () => this.keluarBangun() } }));
  },

  // Posisi hantu (benda yang akan ditaruh) dari posisi kursor di dunia.
  letakHantu() {
    const bg = G.bangun;
    const my = bg.my - this.oy;                  // hasilnya koordinat TANAH (yang dikirim ke server)
    if (this.ubin(bg.barang)) return { gx: Math.floor(bg.mx / T), gy: Math.floor(my / T) };
    const u = ukuranSprite(bg.barang, bg.r), kisi = bg.barang === 'kebun_petak' ? T : 8;
    return { x: Math.round((bg.mx - u.w / 2) / kisi) * kisi, y: Math.round((my - u.h / 2) / kisi) * kisi, w: u.w, h: u.h };
  },

  gambarBangun(k) {
    const bg = G.bangun, d = this.d, oy = this.oy;
    k.strokeStyle = 'rgba(255,255,255,.35)'; k.lineWidth = 1;
    k.strokeRect(0.5, oy + 0.5, d.lebar * T - 1, d.tinggi * T - 1);
    if (bg.mx < 0) return;
    if (!bg.barang) {
      const kena = this.diBawahKursor();
      if (kena) { k.strokeStyle = '#fca5a5'; k.strokeRect(kena.x + 0.5, kena.y + oy + 0.5, kena.w - 1, kena.h - 1); }
      return;
    }
    const h = this.letakHantu();
    k.globalAlpha = 0.65;
    if (bg.barang === 'tembok') { k.fillStyle = bg.warna; k.fillRect(h.gx * T, h.gy * T + oy, T, T); }
    else if (bg.barang.startsWith('lantai:')) lukis(k, bg.barang.slice(7), h.gx * T, h.gy * T + oy);
    else lukis(k, namaPutar(bg.barang, bg.r), h.x, h.y + oy);
    k.globalAlpha = 1;
    k.strokeStyle = '#fde68a';
    if (h.gx !== undefined) k.strokeRect(h.gx * T + 0.5, h.gy * T + oy + 0.5, T - 1, T - 1);
    else k.strokeRect(h.x + 0.5, h.y + oy + 0.5, h.w - 1, h.h - 1);
  },

  diBawahKursor() {
    const bg = G.bangun, d = this.d, my = bg.my - this.oy;      // hasilnya koordinat tanah
    let kena = null;
    for (const b of [...this.alas, ...this.urut]) {
      const o = b.o;
      if (bg.mx < o.x || bg.mx >= o.x + b.w || my < o.y || my >= o.y + b.h) continue;
      if (!kena || b.w * b.h <= kena.w * kena.h) kena = { id: o.id, x: o.x, y: o.y, w: b.w, h: b.h };
    }
    if (kena) return kena;
    const gx = Math.floor(bg.mx / T), gy = Math.floor(my / T), kunci = gx + ',' + gy;
    if (d.tembok[kunci] || d.lantai[kunci]) return { gx, gy, x: gx * T, y: gy * T, w: T, h: T };
    return null;
  },

  // Kirim satu aksi bangun: rumah lewat aksi pemain (inventory), peta utama lewat rute admin (gratis).
  async kirimBangun(jenis, badan) {
    if (!this.kantor) return aksi('/api/rumah/' + jenis, badan);
    try {
      const d = await api('/api/admin/peta/' + jenis, badan);
      G.peta = d.peta; this.segarkan();
      return d;
    } catch (e) { kabar(e.message, 'galat'); return null; }
  },

  async klikBangun() {
    const bg = G.bangun;
    if (!bg || bg.sibuk || bg.mx < 0) return;
    bg.sibuk = true;
    try {
      if (!bg.barang) {
        const kena = this.diBawahKursor();
        if (kena) await this.kirimBangun('angkat', kena.id !== undefined ? { id: kena.id } : { gx: kena.gx, gy: kena.gy });
      } else {
        const h = this.letakHantu();
        if (h.gx !== undefined) {
          const kunci = h.gx + ',' + h.gy, d = this.d;
          if (h.gx < 0 || h.gy < 0 || h.gx >= d.lebar || h.gy >= d.tinggi) return;
          if (bg.barang === 'tembok' ? d.tembok[kunci] === bg.warna || (!this.kantor && d.tembok[kunci]) : d.lantai[kunci] === bg.barang.slice(7)) return;   // seret: lewati ubin yang sudah jadi
          await this.kirimBangun('pasang', { barang: bg.barang, gx: h.gx, gy: h.gy, warna: bg.warna });
        } else await this.kirimBangun('pasang', { barang: bg.barang, x: h.x, y: h.y, r: bg.r });
      }
    } finally { bg.sibuk = false; }
    if (G.bangun && !this.kantor) this.lukisBilah();
  },

  putar() {
    const bg = G.bangun;
    if (bg && bg.sunting) { Sunting.putar(); return; }
    if (!bg || !bg.barang || this.ubin(bg.barang)) return;
    const pilihan = [0, ...(this.infoBarang(bg.barang).putar || [])];
    bg.r = pilihan[(pilihan.indexOf(bg.r) + 1) % pilihan.length];
    if (pilihan.length === 1) kabar('Benda ini tidak punya tampak lain.');
  },

  pasangKursor() {
    const posisi = (ev) => {
      if (!G.bangun || G.bangun.sunting) return;
      const r = kanvas.getBoundingClientRect(), p = Mesin.keDunia(ev.clientX - r.left, ev.clientY - r.top);
      G.bangun.mx = p.x; G.bangun.my = p.y;
    };
    kanvas.addEventListener('pointermove', (ev) => {
      posisi(ev);
      const bg = G.bangun;
      if (bg && bg.tekan && (this.ubin(bg.barang) || !bg.barang)) this.klikBangun();    // seret: cat lantai/tembok
    });
    kanvas.addEventListener('pointerdown', (ev) => {
      if (!G.bangun || G.bangun.sunting) return;
      posisi(ev);
      if (ev.button === 2) { this.pakai(null); return; }
      G.bangun.tekan = true;
      this.klikBangun();
    });
    addEventListener('pointerup', () => { if (G.bangun) G.bangun.tekan = false; });
    kanvas.addEventListener('contextmenu', (ev) => { if (G.bangun) ev.preventDefault(); });
  },
};

// Kebun & kandang berjalan di server; potret rumah disegarkan berkala supaya tahap tumbuh ikut maju di layar.
setInterval(async () => {
  if (!G.rumah || document.hidden || G.bangun) return;
  try {
    const d = await api('/api/rumah?milik=' + G.pemilikRumah.id);
    if (G.rumah && G.pemilikRumah && d.pemilik.id === G.pemilikRumah.id) { G.rumah = d.rumah; Rumah.segarkan(); }
  } catch (e) { /* dicoba lagi putaran berikut */ }
}, 5000);
