/* Kevi — Edit Map: penyunting peta utama (kantor) untuk admin. Cara kerjanya meniru Edit Layout Agent Pak.
 *
 * Yang disunting adalah DRAF: salinan G.peta yang langsung terlihat oleh admin itu sendiri, tetapi baru sampai ke
 * server dan pemain lain saat Simpan. Keluar tanpa menyimpan membuang draf (diminta dua kali bila ada perubahan).
 *   Alat    : Pilih / geser, Pilih area (grup), Hapus
 *   Bangun  : Tembok (tarik garis lurus), Lantai (tarik kotak)
 *   Katalog : perabot (jendela katalog tetap terbuka; klik di peta menaruh, alat tetap aktif)
 * Urungkan (Ctrl+Z) menyimpan sampai 60 langkah. Rumah pemain tetap memakai mode Bangun di rumah.js.
 */
'use strict';

const JEPRET = 8, MAKS_URUNG = 60;
const ARAH = ['Depan', 'Kiri', 'Belakang', 'Kanan'];
const ALAT_SUNTING = [
  ['Alat', [['pilih', '↖', 'Pilih', 'Pilih / geser'], ['area', '⬚', 'Area', 'Pilih area (grup)'], ['hapus', '⌫', 'Hapus', 'Hapus']]],
  ['Bangun', [['ruang', '▢', 'Ruang', 'Ruang (dinding, lantai, pintu)'], ['tembok', '▥', 'Tembok', 'Tembok'], ['lantai', '▦', 'Lantai', 'Lantai'],
    ['halang', '▨', 'Halang', 'Penghalang (ubin yang tak boleh dilewati)']]],
  ['Katalog', [['perabot', '▣', 'Perabot', 'Katalog perabot']]],
];
const PETUNJUK_SUNTING = {
  pilih: 'Klik benda atau ruang untuk memilih, seret untuk memindah. Seret tempat kosong untuk menggeser peta. Panah menggeser pilihan (Shift = 1 ubin). Shift+klik menambah ke grup.',
  ruang: 'Seret di peta untuk menggambar ruang (minimal 3×3 ubin). Dinding, lantai, dan satu pintu dibuat otomatis; ubah lewat alat Pilih.',
  area: 'Seret di peta untuk memilih banyak benda, lalu seret kotaknya untuk memindah semuanya. Klik benda untuk menambah atau melepasnya.',
  hapus: 'Klik benda untuk menghapusnya. Seret untuk menghapus tembok dan lantai ubin demi ubin.',
  tembok: 'Seret di peta untuk menarik garis tembok lurus.',
  lantai: 'Seret di peta untuk menggambar kotak lantai.',
  halang: 'Seret untuk menandai ubin yang tak boleh dilewati (merah, tidak terlihat oleh pemain). Hapus dengan alat Hapus.',
  perabot: 'Klik di peta untuk menaruh. R memutar. Alat tetap aktif untuk menaruh lagi.',
};
const jepret = (v, kisi = JEPRET) => Math.round(v / kisi) * kisi;

const Sunting = {
  aktif: false, alat: 'pilih', akar: '', rev: 0, kotor: false, urung: [], pilih: null, grup: null, seret: null,
  sprite: null, r: 0, lantai: null, warna: WARNA_TEMBOK[0], lihatHalang: true, ikutUbin: false, terakhir: [],
  mx: -99, my: -99, pesan: '', tanya: 0, sibuk: false, luar: null, kat: { mode: 'perabot', kategori: '', cari: '' },
  pilihRuang: null, bawaIsi: true, kam: { x: 0, y: 0 },

  get d() { return Rumah.d; },
  inti(d) { return JSON.stringify({ lantai: d.lantai, tembok: d.tembok, benda: d.benda, ruang: d.ruang || [], halang: d.halang || {}, dasar: d.dasar, lantai_dasar: d.lantai_dasar, urut: d.urut }); },
  benda(id) { return this.d.benda.find(o => o.id === id); },
  ruang(id) { return (this.d.ruang || []).find(r => r.id === id); },
  kotakRuang(r) { return { x: r.gx * T, y: r.gy * T, w: r.w * T, h: r.h * T }; },
  // Ruang di bawah titik p; yang terkecil menang supaya ruang di dalam ruang tetap bisa dipilih.
  kenaRuang(p) {
    const gx = Math.floor(p.x / T), gy = Math.floor(p.y / T);
    let hasil = null;
    for (const r of this.d.ruang || []) if (gx >= r.gx && gy >= r.gy && gx < r.gx + r.w && gy < r.gy + r.h && (!hasil || r.w * r.h <= hasil.w * hasil.h)) hasil = r;
    return hasil;
  },
  jepitPintu(r) { for (const q of r.pintu || []) q.pos = Math.max(1, Math.min((q.sisi === 'atas' || q.sisi === 'bawah' ? r.w : r.h) - 2, q.pos)); },

  // Kamera bebas selagi menyunting: W A S D / panah (bila tak ada pilihan) menggeser, Shift lebih cepat.
  geserKamera(dt, tombol) {
    if (!tombol) return;
    const laju = (tombol.has('shift') ? 620 : 300) / Math.max(1, (G.kamera.skala || 2) / 2) * dt;
    if (tombol.has('a') || tombol.has('arrowleft')) this.kam.x -= laju;
    if (tombol.has('d') || tombol.has('arrowright')) this.kam.x += laju;
    if (tombol.has('w') || tombol.has('arrowup')) this.kam.y -= laju;
    if (tombol.has('s') || tombol.has('arrowdown')) this.kam.y += laju;
  },
  kotak(o) { const u = ukuranSprite(o.n, o.r); return { x: o.x, y: o.y, w: u.w, h: u.h }; },
  batas(x, y) { const d = this.d; return { x: Math.max(-8, Math.min(d.lebar * T - 8, x)), y: Math.max(-32, Math.min(d.tinggi * T - 8, y)) }; },
  ubinSah(gx, gy) { const d = this.d; return gx >= 0 && gy >= 0 && gx < d.lebar && gy < d.tinggi; },

  /* ---------- buka, simpan, keluar ---------- */

  buka() {
    Panel.tutup();
    // Satu penyunting untuk dua tempat: peta utama (admin, G.peta) dan rumah sendiri (G.rumah, dengan hitungan belanja).
    this.rumah = !Rumah.kantor;
    this.akar = JSON.stringify(Rumah.d);
    this.rev = Rumah.d.rev || 0;
    this.setD(JSON.parse(this.akar));
    this.belanja = '';
    if (this.rumah && this.alat === 'halang') this.alat = 'pilih';
    Object.assign(this, { aktif: true, alat: 'pilih', kotor: false, urung: [], pilih: null, pilihRuang: null, grup: null, seret: null, luar: null, tanya: 0, sibuk: false, pesan: '' });
    this.kam = { x: G.aku ? G.aku.x + 8 : 0, y: G.aku ? G.aku.y + 10 : 0 };
    Mesin.tombol.clear();
    Rumah.menyunting = true;
    G.bangun = { sunting: true, mx: -99, my: -99 };
    document.body.classList.add('mode-bangun', 'menyunting');
    Rumah.segarkan();
    this.lukisDok();
  },

  async simpan() {
    if (this.sibuk || !this.aktif) return;
    this.sibuk = true;
    this.kabar('menyimpan…');
    try {
      const d = this.d;
      if (this.rumah) {                                  // rumah: server menghitung belanja dan kembalian inventory
        const j = await api('/api/rumah/simpan', { lantai: d.lantai, tembok: d.tembok, benda: d.benda, ruang: d.ruang || [] });
        serap(j);
        this.setD(j.rumah);
        this.pesan = 'Tersimpan.' + (j.belanja ? ' Belanja ' + j.belanja + ' koin.' : '');
        this.belanja = '';
      } else {
        const j = await api('/api/admin/peta/simpan', { rev: this.rev, lantai: d.lantai, tembok: d.tembok, benda: d.benda, ruang: d.ruang || [], halang: d.halang || {}, dasar: d.dasar, lantai_dasar: d.lantai_dasar });
        this.setD(j.peta);
        this.rev = j.peta.rev;
        this.pesan = 'Tersimpan. Pemain lain langsung melihatnya.';
      }
      this.akar = JSON.stringify(this.d);
      Object.assign(this, { kotor: false, urung: [], pilih: null, pilihRuang: null, grup: null, luar: null });
      Rumah.segarkan();
    } catch (e) { this.pesan = 'Gagal: ' + e.message; }
    this.sibuk = false;
    this.lukisDok();
  },

  // Keluar. Draf yang belum disimpan baru dibuang pada permintaan kedua (atau bila dipaksa pindah adegan).
  tutup(paksa) {
    if (!this.aktif) return true;
    if (this.kotor && !paksa && Date.now() - this.tanya > 5000) {
      this.tanya = Date.now();
      this.kabar('Ada perubahan belum disimpan. Tekan Keluar sekali lagi untuk membuangnya.');
      return false;
    }
    if (this.kotor && paksa) kabar('Perubahan peta yang belum disimpan dibuang.', 'galat');
    this.aktif = false;
    this.seret = null;
    Rumah.menyunting = false;
    G.bangun = null;
    document.body.classList.remove('mode-bangun', 'menyunting');
    $('#bangun').replaceChildren();
    this.tutupKatalog();
    if (this.rumah) { if (G.rumah) G.rumah = JSON.parse(this.akar); } else G.peta = this.luar || JSON.parse(this.akar);
    if (this.rumah === !Rumah.kantor) {                  // masih di tempat yang disunting: gambar ulang keadaan tersimpan
      Rumah.segarkan();
      if (G.aku && !kakiBebas(G.aku.x, G.aku.y)) Object.assign(G.aku, titikBebas(G.aku.x, G.aku.y));
    }
    return true;
  },

  // Pasang denah `v` sebagai yang sedang disunting (peta utama atau rumah), dengan bagian yang belum ada diisi kosong.
  setD(v) {
    if (!Array.isArray(v.ruang)) v.ruang = [];
    if (!v.halang || typeof v.halang !== 'object') v.halang = {};
    if (this.rumah) G.rumah = v; else G.peta = v;
  },

  // Rumah: tanya server berapa belanja draf ini (stok inventory dipakai dulu), tampil di kepala dok.
  hitungBelanja() {
    clearTimeout(this.jedaBelanja);
    if (!this.rumah || !this.aktif) return;
    this.jedaBelanja = setTimeout(async () => {
      if (!this.aktif || !this.rumah) return;
      const d = this.d;
      try {
        const j = await api('/api/rumah/biaya', { lantai: d.lantai, tembok: d.tembok, benda: d.benda, ruang: d.ruang || [] });
        this.belanja = j.biaya ? `Belanja ${j.biaya} koin (${j.beli.reduce((a, b) => a + b.n, 0)} barang) · saldo ${j.saldo}${j.cukup ? '' : ' · koin belum cukup'}` : 'Tanpa belanja: semua dari inventory.';
      } catch (e) { this.belanja = 'Belum bisa disimpan: ' + e.message; }
      const b = $('#sunting-belanja');
      if (b) b.textContent = this.belanja;
    }, 350);
  },

  // Peta dari server selagi menyunting: milik sendiri (hasil Simpan) diabaikan, milik orang lain disimpan untuk nanti.
  dariLuar(peta) {
    if (this.rumah) { G.peta = peta; return; }           // sedang menyunting rumah: peta kantor boleh langsung diganti
    if ((peta.rev || 0) === this.rev) return;
    this.luar = peta;
    this.kabar('Peta diubah dari tempat lain. Simpan akan ditolak: keluar dari Edit Map lalu masuk lagi.');
  },

  kabar(teks) {
    this.pesan = teks;
    const e = $('#sunting-kabar');
    if (e) e.textContent = teks;
  },

  /* ---------- ubah & urungkan ---------- */

  dorong() {
    this.urung.push(this.inti(this.d));
    if (this.urung.length > MAKS_URUNG) this.urung.shift();
  },
  sesudah() {
    this.kotor = true;
    this.tanya = 0;
    Rumah.segarkan();
    this.lukisDok();
    this.hitungBelanja();
  },
  ubah(fn) { this.dorong(); fn(this.d); this.sesudah(); },
  urungkan() {
    const s = this.urung.pop();
    if (!s) { this.kabar('Tidak ada yang bisa diurungkan.'); return; }
    Object.assign(this.d, JSON.parse(s));
    this.pilih = null; this.pilihRuang = null; this.grup = null; this.seret = null;
    this.kotor = this.inti(this.d) !== this.inti(JSON.parse(this.akar));
    Rumah.segarkan();
    this.lukisDok();
  },

  /* ---------- mencari benda ---------- */

  kena(p) {
    let hasil = null, luas = Infinity;
    for (const o of this.d.benda) {
      const b = this.kotak(o);
      if (p.x < b.x || p.x >= b.x + b.w || p.y < b.y || p.y >= b.y + b.h) continue;
      if (b.w * b.h <= luas) { hasil = o; luas = b.w * b.h; }
    }
    return hasil;
  },
  bendaDalam(x0, y0, x1, y1) {
    return this.d.benda.filter(o => { const b = this.kotak(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2; return cx >= x0 && cx < x1 && cy >= y0 && cy < y1; });
  },
  anggota() { return this.grup ? this.d.benda.filter(o => this.grup.ids.has(o.id)) : []; },
  pakaiUbin() { return !!(this.grup && this.grup.kotak && this.ikutUbin); },
  kotakGrup() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const o of this.anggota()) { const b = this.kotak(o); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    if (this.pakaiUbin()) { const k = this.grup.kotak; x0 = Math.min(x0, k.x0 * T); y0 = Math.min(y0, k.y0 * T); x1 = Math.max(x1, (k.x1 + 1) * T); y1 = Math.max(y1, (k.y1 + 1) * T); }
    return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  },

  /* ---------- aksi atas pilihan ---------- */

  terkunci(o) {
    if (!o.kunci) return false;
    this.kabar('Benda ini terkunci. Buka centang "Kunci posisi" untuk menggesernya.');
    return true;
  },

  putar() {
    const o = this.pilih != null && this.benda(this.pilih);
    const pilihan = (n) => [0, ...(Rumah.infoBarang(n).putar || [])];
    if (o) {
      const p = pilihan(o.n);
      if (p.length === 1) { this.kabar('Benda ini tidak punya tampak lain.'); return; }
      if (this.terkunci(o)) return;
      this.ubah(() => {
        const a = this.kotak(o);
        o.r = p[(p.indexOf(o.r || 0) + 1) % p.length];
        const b = ukuranSprite(o.n, o.r), t = this.batas(jepret(a.x + (a.w - b.w) / 2), jepret(a.y + (a.h - b.h) / 2));      // pusatnya tetap
        o.x = t.x; o.y = t.y;
      });
    } else if (this.alat === 'perabot' && this.sprite) {
      const p = pilihan(this.sprite);
      if (p.length === 1) { this.kabar('Benda ini tidak punya tampak lain.'); return; }
      this.r = p[(p.indexOf(this.r) + 1) % p.length];
      this.lukisDok();
    }
  },

  duplikat() {
    const asal = this.pilih != null ? [this.benda(this.pilih)].filter(Boolean) : this.anggota();
    if (!asal.length) return;
    if (this.d.benda.length + asal.length > 4000) { this.kabar('Peta sudah penuh (4000 benda).'); return; }
    const baru = [];
    this.ubah((d) => {
      for (const o of asal) {
        const t = this.batas(o.x + T, o.y + T);
        d.urut += 1;
        d.benda.push({ id: d.urut, n: o.n, x: t.x, y: t.y, r: o.r || 0 });
        baru.push(d.urut);
      }
    });
    if (this.pilih != null) this.pilih = baru[0]; else this.grup = { ids: new Set(baru), kotak: null };
    this.lukisDok();
  },

  setLapis(l) {
    const sasaran = this.pilih != null ? [this.benda(this.pilih)].filter(Boolean) : this.anggota();
    if (sasaran.length) this.ubah(() => { for (const o of sasaran) { if (l) o.l = l; else delete o.l; } });
  },

  // Geser ruang sejauh tx, ty ubin (dijepit ke peta). Dengan "bawa isi", benda dan ubin lepas di dalamnya ikut.
  pindahRuang(r, tx, ty) {
    const d = this.d;
    tx = Math.max(-r.gx, Math.min(d.lebar - r.w - r.gx, tx));
    ty = Math.max(-r.gy, Math.min(d.tinggi - r.h - r.gy, ty));
    if (!tx && !ty) return false;
    if (this.bawaIsi) {
      const b = this.kotakRuang(r);
      for (const o of this.bendaDalam(b.x, b.y, b.x + b.w, b.y + b.h)) if (!o.kunci) { const t = this.batas(o.x + tx * T, o.y + ty * T); o.x = t.x; o.y = t.y; }
      this.pindahUbin({ x0: r.gx, y0: r.gy, x1: r.gx + r.w - 1, y1: r.gy + r.h - 1 }, tx, ty);
    }
    r.gx += tx; r.gy += ty;
    return true;
  },

  hapusPilihan() {
    if (this.pilihRuang != null) {
      const r = this.ruang(this.pilihRuang);
      if (!r) return;
      this.pilihRuang = null;
      this.ubah((d) => { d.ruang.splice(d.ruang.indexOf(r), 1); });
      return;
    }
    if (this.pilih != null) {
      const o = this.benda(this.pilih);
      if (!o) return;
      this.ubah((d) => { d.benda.splice(d.benda.indexOf(o), 1); });
      this.pilih = null;
    } else if (this.grup) {
      const ids = this.grup.ids, k = this.pakaiUbin() ? this.grup.kotak : null;
      this.ubah((d) => {
        d.benda = d.benda.filter(o => !ids.has(o.id));
        if (k) this.pindahUbin(k, 0, 0, true);
      });
      this.grup = null;
    } else return;
    this.lukisDok();
  },

  // Pindahkan (atau buang) lantai dan tembok di dalam kotak ubin sejauh tx, ty ubin.
  pindahUbin(k, tx, ty, buang) {
    const d = this.d;
    for (const peta of [d.lantai, d.tembok, d.halang || {}]) {
      const ambil = [];
      for (const kunci of Object.keys(peta)) {
        const [gx, gy] = kunci.split(',').map(Number);
        if (gx < k.x0 || gx > k.x1 || gy < k.y0 || gy > k.y1) continue;
        ambil.push([gx, gy, peta[kunci]]);
        delete peta[kunci];
      }
      if (!buang) for (const [gx, gy, v] of ambil) if (this.ubinSah(gx + tx, gy + ty)) peta[(gx + tx) + ',' + (gy + ty)] = v;
    }
    if (!buang) { k.x0 += tx; k.x1 += tx; k.y0 += ty; k.y1 += ty; }
  },

  // Batasi geseran supaya semua benda (dan kotak ubinnya) tetap di dalam peta.
  jepitGeser(asal, dx, dy) {
    const d = this.d;
    for (const a of asal) {
      dx = Math.max(-8 - a.x, Math.min(d.lebar * T - 8 - a.x, dx));
      dy = Math.max(-32 - a.y, Math.min(d.tinggi * T - 8 - a.y, dy));
    }
    if (this.pakaiUbin()) {
      const k = this.seret && this.seret.kotak0 ? this.seret.kotak0 : this.grup.kotak;
      dx = Math.max(-k.x0 * T, Math.min((d.lebar - 1 - k.x1) * T, dx));
      dy = Math.max(-k.y0 * T, Math.min((d.tinggi - 1 - k.y1) * T, dy));
    }
    return { dx, dy };
  },

  // Geser dengan tombol panah. Benda tunggal per piksel; grup yang membawa ubin selalu per ubin.
  geser(ax, ay, langkah) {
    if (this.pilihRuang != null) {
      const r = this.ruang(this.pilihRuang);
      if (!r || this.terkunci(r)) return;
      this.dorong();
      if (this.pindahRuang(r, ax, ay)) this.sesudah(); else this.urung.pop();
      return;
    }
    if (this.pilih != null) {
      const o = this.benda(this.pilih);
      if (!o || this.terkunci(o)) return;
      const t = this.batas(o.x + ax * langkah, o.y + ay * langkah);
      if (t.x === o.x && t.y === o.y) return;
      this.ubah(() => { o.x = t.x; o.y = t.y; });
    } else if (this.grup) {
      const ubin = this.pakaiUbin(), l = ubin ? T : langkah, bebas = this.anggota().filter(o => !o.kunci);
      const { dx, dy } = this.jepitGeser(bebas.map(o => ({ x: o.x, y: o.y })), ax * l, ay * l);
      if (!dx && !dy) return;
      this.ubah(() => {
        for (const o of bebas) { o.x += dx; o.y += dy; }
        if (ubin) this.pindahUbin(this.grup.kotak, dx / T, dy / T);
      });
    }
  },

  /* ---------- tetikus ---------- */

  posisi(ev) {
    const r = kanvas.getBoundingClientRect(), p = Mesin.keDunia(ev.clientX - r.left, ev.clientY - r.top);
    p.y -= Rumah.oy;                                   // rumah: data berkoordinat tanah, digeser jalur atas
    this.mx = p.x; this.my = p.y;
    return p;
  },
  ubinKursor() { return { gx: Math.floor(this.mx / T), gy: Math.floor(this.my / T) }; },
  letakHantu() {
    const u = ukuranSprite(this.sprite, this.r);
    const kisi = this.sprite === 'kebun_petak' ? T : JEPRET;      // petak kebun selalu tepat di ubin
    return Object.assign(this.batas(jepret(this.mx - u.w / 2, kisi), jepret(this.my - u.h / 2, kisi)), { w: u.w, h: u.h });
  },

  tekan(ev) {
    if (!this.aktif || this.sibuk) return;
    const p = this.posisi(ev);
    if (ev.button === 2) { this.pakaiAlat('pilih'); return; }
    const gulir = () => ({ mode: 'gulir', sx: ev.clientX, sy: ev.clientY, kx: this.kam.x, ky: this.kam.y });
    if (ev.button === 1) { ev.preventDefault(); this.seret = gulir(); return; }      // tombol tengah: geser peta di alat apa pun
    if (ev.button !== 0) return;
    const tambah = ev.shiftKey || ev.ctrlKey || ev.metaKey, u = this.ubinKursor();
    if (this.alat === 'perabot') {
      if (!this.sprite) { this.bukaKatalog('perabot'); return; }
      if (this.d.benda.length >= 4000) { this.kabar('Peta sudah penuh (4000 benda).'); return; }
      const h = this.letakHantu();
      this.ubah((d) => { d.urut += 1; d.benda.push({ id: d.urut, n: this.sprite, x: h.x, y: h.y, r: this.r }); });
    } else if (this.alat === 'pilih') {
      const o = this.kena(p);
      if (o && tambah) {                                   // Shift+klik: mulai atau tambah grup
        const ids = new Set(this.pilih != null ? [this.pilih] : []);
        ids.add(o.id);
        this.pilih = null; this.grup = { ids, kotak: null }; this.alat = 'area';
      } else {
        this.pilih = o ? o.id : null;
        this.grup = null; this.pilihRuang = null;
        const r = o ? null : this.kenaRuang(p);
        if (o) { if (!this.terkunci(o)) { this.dorong(); this.seret = { mode: 'geser', o, dx: p.x - o.x, dy: p.y - o.y, gerak: false }; } }
        else if (r) {                                      // ruang: seret memindah, seret pojok kanan bawah mengubah ukuran
          this.pilihRuang = r.id;
          const b = this.kotakRuang(r), pojok = p.x >= b.x + b.w - 7 && p.y >= b.y + b.h - 7;
          if (!this.terkunci(r)) { this.dorong(); this.seret = { mode: pojok ? 'ukuran' : 'geserRuang', r, gx0: u.gx, gy0: u.gy, tx: 0, ty: 0, gerak: false }; }
        } else this.seret = gulir();                       // tempat kosong: geser peta
      }
      this.lukisDok();
    } else if (this.alat === 'area') {
      const b = this.kotakGrup();
      if (b && !tambah && p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h) {
        const bebas = this.anggota().filter(o => !o.kunci);
        this.dorong();
        this.seret = { mode: 'grup', ax: p.x, ay: p.y, bebas, asal: bebas.map(o => ({ x: o.x, y: o.y })), kotak0: this.pakaiUbin() ? Object.assign({}, this.grup.kotak) : null, dx: 0, dy: 0 };
      } else this.seret = { mode: 'kotak', x0: p.x, y0: p.y, x1: p.x, y1: p.y, tambah };
    } else if (this.alat === 'hapus') {
      this.dorong();
      this.seret = { mode: 'hapus', gerak: false };
      const o = this.kena(p);
      if (o) { if (!this.terkunci(o)) { this.d.benda.splice(this.d.benda.indexOf(o), 1); this.seret.gerak = true; Rumah.segarkan(); } }
      else if (!this.hapusUbin()) {
        const r = this.kenaRuang(p);
        if (r && !this.terkunci(r)) { this.d.ruang.splice(this.d.ruang.indexOf(r), 1); this.seret.gerak = true; Rumah.segarkan(); }
      }
    } else if (this.alat === 'ruang') {
      this.seret = { mode: 'ruang', gx0: u.gx, gy0: u.gy, gx1: u.gx, gy1: u.gy };
    } else if (this.alat === 'tembok') {
      this.seret = { mode: 'garis', gx0: u.gx, gy0: u.gy, gx1: u.gx, gy1: u.gy };
    } else if (this.alat === 'lantai') {
      if (!this.lantai) { this.bukaKatalog('lantai'); return; }
      this.seret = { mode: 'isi', gx0: u.gx, gy0: u.gy, gx1: u.gx, gy1: u.gy };
    } else if (this.alat === 'halang') {
      this.seret = { mode: 'halang', gx0: u.gx, gy0: u.gy, gx1: u.gx, gy1: u.gy };
    }
  },

  hapusUbin() {
    const u = this.ubinKursor(), kunci = u.gx + ',' + u.gy, d = this.d;
    if (kunci in d.tembok) delete d.tembok[kunci];
    else if (d.halang && kunci in d.halang) delete d.halang[kunci];
    else if (kunci in d.lantai) delete d.lantai[kunci];
    else return false;
    this.seret.gerak = true;
    Rumah.segarkan();
    return true;
  },

  gerak(ev) {
    if (!this.aktif) return;
    const p = this.posisi(ev), s = this.seret;
    if (!s) return;
    if (s.mode === 'geser') {
      const t = this.batas(jepret(p.x - s.dx), jepret(p.y - s.dy));
      if (t.x === s.o.x && t.y === s.o.y) return;
      s.o.x = t.x; s.o.y = t.y; s.gerak = true;
      Rumah.segarkan();
    } else if (s.mode === 'grup') {
      const kisi = s.kotak0 ? T : JEPRET, { dx, dy } = this.jepitGeser(s.asal, jepret(p.x - s.ax, kisi), jepret(p.y - s.ay, kisi));
      if (dx === s.dx && dy === s.dy) return;
      s.dx = dx; s.dy = dy;
      s.bebas.forEach((o, i) => { o.x = s.asal[i].x + dx; o.y = s.asal[i].y + dy; });
      Rumah.segarkan();
    } else if (s.mode === 'kotak') { s.x1 = p.x; s.y1 = p.y; }
    else if (s.mode === 'gulir') {
      const sk = G.kamera.skala || 1;
      this.kam.x = s.kx - (ev.clientX - s.sx) / sk; this.kam.y = s.ky - (ev.clientY - s.sy) / sk;
    } else if (s.mode === 'geserRuang') {
      const u = this.ubinKursor(), r = s.r, gx = r.gx, gy = r.gy;
      if (this.pindahRuang(r, u.gx - s.gx0 - s.tx, u.gy - s.gy0 - s.ty)) { s.tx += r.gx - gx; s.ty += r.gy - gy; s.gerak = true; Rumah.segarkan(); }
    } else if (s.mode === 'ukuran') {
      const u = this.ubinKursor(), r = s.r, d = this.d;
      const w = Math.max(3, Math.min(d.lebar - r.gx, u.gx - r.gx + 1)), h = Math.max(3, Math.min(d.tinggi - r.gy, u.gy - r.gy + 1));
      if (w !== r.w || h !== r.h) { r.w = w; r.h = h; this.jepitPintu(r); s.gerak = true; Rumah.segarkan(); }
    } else if (s.mode === 'hapus') this.hapusUbin();
    else if (s.mode === 'garis' || s.mode === 'isi' || s.mode === 'ruang' || s.mode === 'halang') {
      const u = this.ubinKursor();
      s.gx1 = u.gx; s.gy1 = u.gy;
      if (s.mode === 'garis') { if (Math.abs(u.gx - s.gx0) >= Math.abs(u.gy - s.gy0)) s.gy1 = s.gy0; else s.gx1 = s.gx0; }     // dikunci ke sumbu yang dominan
    }
  },

  // Ubin yang tercakup satu seretan (garis tembok atau kotak lantai), dipotong ke batas peta.
  ubinSeret(s) {
    const d = this.d, x0 = Math.max(0, Math.min(s.gx0, s.gx1)), x1 = Math.min(d.lebar - 1, Math.max(s.gx0, s.gx1));
    const y0 = Math.max(0, Math.min(s.gy0, s.gy1)), y1 = Math.min(d.tinggi - 1, Math.max(s.gy0, s.gy1));
    return { x0, y0, x1, y1 };
  },

  lepas() {
    const s = this.seret;
    if (!this.aktif || !s) return;
    this.seret = null;
    if (s.mode === 'gulir') return;
    if (s.mode === 'geser' || s.mode === 'hapus' || s.mode === 'geserRuang' || s.mode === 'ukuran') {
      if (s.gerak) this.sesudah(); else this.urung.pop();
    } else if (s.mode === 'ruang') {
      const k = this.ubinSeret(s), w = k.x1 - k.x0 + 1, h = k.y1 - k.y0 + 1;
      if (w < 3 || h < 3) { this.kabar('Ruang minimal 3×3 ubin.'); return; }
      let id = 0;
      this.alat = 'pilih';
      this.ubah((d) => {
        d.urut += 1; id = d.urut;
        d.ruang.push({ id, gx: k.x0, gy: k.y0, w, h, warna: this.warna, lantai: this.lantai || '', nama: '', pintu: [{ sisi: 'bawah', pos: Math.max(1, Math.floor(w / 2) - 1) }] });
      });
      this.pilihRuang = id;
      this.tutupKatalog();
      this.lukisDok();
    } else if (s.mode === 'grup') {
      if (!s.dx && !s.dy) { this.urung.pop(); return; }
      if (s.kotak0) this.pindahUbin(this.grup.kotak, s.dx / T, s.dy / T);
      this.sesudah();
    } else if (s.mode === 'kotak') {
      const x0 = Math.min(s.x0, s.x1), x1 = Math.max(s.x0, s.x1), y0 = Math.min(s.y0, s.y1), y1 = Math.max(s.y0, s.y1);
      const ids = new Set(s.tambah && this.grup ? this.grup.ids : []);
      let kotak = s.tambah && this.grup ? this.grup.kotak : null;
      if (x1 - x0 < 4 && y1 - y0 < 4) {                    // ketuk: tambah atau lepas satu benda
        const o = this.kena({ x: s.x1, y: s.y1 });
        if (o) { if (ids.has(o.id)) ids.delete(o.id); else ids.add(o.id); } else if (!s.tambah) kotak = null;
      } else {
        for (const o of this.bendaDalam(x0, y0, x1, y1)) ids.add(o.id);
        kotak = { x0: Math.max(0, Math.floor(x0 / T)), y0: Math.max(0, Math.floor(y0 / T)), x1: Math.min(this.d.lebar - 1, Math.floor((x1 - 1) / T)), y1: Math.min(this.d.tinggi - 1, Math.floor((y1 - 1) / T)) };
      }
      this.pilih = null;
      this.grup = ids.size || kotak ? { ids, kotak } : null;
      this.lukisDok();
    } else {
      const k = this.ubinSeret(s);
      if (k.x1 < k.x0 || k.y1 < k.y0) return;
      this.ubah((d) => {
        for (let gy = k.y0; gy <= k.y1; gy++) for (let gx = k.x0; gx <= k.x1; gx++) {
          if (s.mode === 'garis') d.tembok[gx + ',' + gy] = this.warna; else if (s.mode === 'halang') d.halang[gx + ',' + gy] = 1; else d.lantai[gx + ',' + gy] = this.lantai;
        }
      });
    }
  },

  pasang() {
    kanvas.addEventListener('pointerdown', (ev) => this.tekan(ev));
    kanvas.addEventListener('pointermove', (ev) => this.gerak(ev));
    kanvas.addEventListener('pointerleave', () => { if (!this.seret) { this.mx = -99; this.my = -99; } });
    addEventListener('pointerup', () => this.lepas());
  },

  // Tombol papan ketik selagi menyunting. true = sudah ditangani (permainan tidak ikut memprosesnya).
  tombol(ev) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName || '')) return false;
    const k = ev.key.toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); this.urungkan(); return true; }
    if ((ev.ctrlKey || ev.metaKey) && k === 's') { ev.preventDefault(); this.simpan(); return true; }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return false;
    if (k === 'escape') {
      if (this.pilih == null && this.pilihRuang == null && !this.grup && !this.seret) return false;
      if (this.seret && ['geser', 'grup', 'hapus', 'geserRuang', 'ukuran'].includes(this.seret.mode)) { this.seret = null; this.urungkan(); return true; }
      this.pilih = null; this.pilihRuang = null; this.grup = null; this.seret = null;
      this.lukisDok();
      return true;
    }
    if (k === 'delete' || k === 'backspace') { ev.preventDefault(); this.hapusPilihan(); return true; }
    if (k.startsWith('arrow') && (this.pilih != null || this.pilihRuang != null || this.grup)) {
      ev.preventDefault();
      this.geser(k === 'arrowleft' ? -1 : k === 'arrowright' ? 1 : 0, k === 'arrowup' ? -1 : k === 'arrowdown' ? 1 : 0, ev.shiftKey ? T : 1);
      return true;
    }
    return false;
  },

  /* ---------- gambar di atas peta ---------- */

  gambar(k) { k.save(); k.translate(0, Rumah.oy); this.gambarIsi(k); k.restore(); },
  gambarIsi(k) {
    const d = this.d, s = this.seret, sk = G.kamera.skala || 1, garis = 1 / sk;
    const oy = Rumah.oy, J = oy / T, a = Mesin.keDunia(0, 0), b = Mesin.keDunia(kanvas.clientWidth, kanvas.clientHeight);
    a.y -= oy; b.y -= oy;
    const gx0 = Math.max(0, Math.floor(a.x / T)), gy0 = Math.max(0, Math.floor(a.y / T));
    const gx1 = Math.min(d.lebar, Math.ceil(b.x / T)), gy1 = Math.min(d.tinggi, Math.ceil(b.y / T));
    const bingkai = (r, warna, putus) => {
      k.strokeStyle = warna; k.lineWidth = Math.max(1, garis * 2);
      k.setLineDash(putus ? [4, 3] : []);
      k.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      k.setLineDash([]);
    };
    if (this.lihatHalang && G.grid) {                           // ubin yang tak bisa dilewati
      k.fillStyle = 'rgba(239,68,68,.2)';
      for (let gy = gy0; gy < gy1; gy++) for (let gx = gx0; gx < gx1; gx++) if (G.grid.sel[(gy + J) * G.grid.w + gx] === 1) k.fillRect(gx * T, gy * T, T, T);
    }
    k.fillStyle = 'rgba(220,38,38,.42)';                   // penghalang buatan admin: selalu tampil, lebih pekat, bersilang
    for (const kunci of Object.keys(d.halang || {})) {
      const [gx, gy] = kunci.split(',').map(Number);
      if (gx < gx0 || gx >= gx1 || gy < gy0 || gy >= gy1) continue;
      k.fillRect(gx * T, gy * T, T, T);
      k.strokeStyle = 'rgba(254,202,202,.8)'; k.lineWidth = garis; k.beginPath(); k.moveTo(gx * T + 3, gy * T + 3); k.lineTo(gx * T + T - 3, gy * T + T - 3); k.moveTo(gx * T + T - 3, gy * T + 3); k.lineTo(gx * T + 3, gy * T + T - 3); k.stroke();
    }
    k.fillStyle = 'rgba(255,255,255,.13)';                 // garis kisi
    for (let gx = gx0; gx <= gx1; gx++) k.fillRect(gx * T, gy0 * T, garis, (gy1 - gy0) * T);
    for (let gy = gy0; gy <= gy1; gy++) k.fillRect(gx0 * T, gy * T, (gx1 - gx0) * T, garis);
    bingkai({ x: 0, y: 0, w: d.lebar * T, h: d.tinggi * T }, 'rgba(255,255,255,.4)');
    k.fillStyle = '#fde68a';
    for (const o of d.benda) if (o.kunci) k.fillRect(o.x, o.y, 3, 3);

    k.font = '600 6px Inter, sans-serif'; k.textAlign = 'left'; k.textBaseline = 'top';
    for (const r of d.ruang || []) {                       // ruang: bingkai tipis + nama; yang terpilih merah muda dengan pegangan ukuran
      const br = this.kotakRuang(r), dipilih = r.id === this.pilihRuang;
      bingkai(br, dipilih ? '#f472b6' : 'rgba(253,230,138,.4)', dipilih);
      if (r.nama) { k.fillStyle = 'rgba(7,11,20,.75)'; k.fillRect(br.x + 2, br.y + 2, k.measureText(r.nama).width + 4, 9); k.fillStyle = '#fde68a'; k.fillText(r.nama, br.x + 4, br.y + 3.5); }
      if (dipilih) { k.fillStyle = '#f472b6'; k.fillRect(br.x + br.w - 6, br.y + br.h - 6, 6, 6); }
    }
    const o = this.pilih != null && this.benda(this.pilih);
    if (o) bingkai(this.kotak(o), '#f472b6', true);
    if (this.grup) {
      for (const g of this.anggota()) bingkai(this.kotak(g), '#93c5fd');
      const kg = this.kotakGrup();
      if (kg) {
        if (s && s.mode === 'grup' && s.kotak0) { k.fillStyle = 'rgba(96,165,250,.14)'; k.fillRect(s.kotak0.x0 * T + s.dx, s.kotak0.y0 * T + s.dy, (s.kotak0.x1 - s.kotak0.x0 + 1) * T, (s.kotak0.y1 - s.kotak0.y0 + 1) * T); }
        bingkai(kg, '#60a5fa', true);
      }
    }
    if (s && s.mode === 'kotak') {
      const r = { x: Math.min(s.x0, s.x1), y: Math.min(s.y0, s.y1), w: Math.abs(s.x1 - s.x0), h: Math.abs(s.y1 - s.y0) };
      k.fillStyle = 'rgba(96,165,250,.14)'; k.fillRect(r.x, r.y, r.w, r.h);
      if (r.w > 1 && r.h > 1) bingkai(r, '#60a5fa', true);
    }
    if (s && (s.mode === 'garis' || s.mode === 'isi' || s.mode === 'ruang' || s.mode === 'halang')) {
      const u = this.ubinSeret(s), r = { x: u.x0 * T, y: u.y0 * T, w: (u.x1 - u.x0 + 1) * T, h: (u.y1 - u.y0 + 1) * T };
      if (r.w > 0 && r.h > 0) {
        k.globalAlpha = 0.6;
        if (s.mode === 'ruang') { k.globalAlpha = 0.3; k.fillStyle = '#f472b6'; k.fillRect(r.x, r.y, r.w, r.h); k.globalAlpha = 0.8; k.fillStyle = this.warna; k.fillRect(r.x, r.y, r.w, 4); k.fillRect(r.x, r.y + r.h - 4, r.w, 4); k.fillRect(r.x, r.y, 4, r.h); k.fillRect(r.x + r.w - 4, r.y, 4, r.h); }
        else if (s.mode === 'garis') { k.fillStyle = this.warna; k.fillRect(r.x, r.y, r.w, r.h); }
        else if (s.mode === 'halang') { k.fillStyle = '#dc2626'; k.fillRect(r.x, r.y, r.w, r.h); }
        else if ((u.x1 - u.x0 + 1) * (u.y1 - u.y0 + 1) <= 600) { for (let gy = u.y0; gy <= u.y1; gy++) for (let gx = u.x0; gx <= u.x1; gx++) lukis(k, this.lantai, gx * T, gy * T); }
        else { k.fillStyle = '#f472b6'; k.fillRect(r.x, r.y, r.w, r.h); }
        k.globalAlpha = 1;
        bingkai(r, '#fde68a');
      }
      return;
    }
    if (this.mx < 0 || s) return;
    const u = this.ubinKursor(), ubin = { x: u.gx * T, y: u.gy * T, w: T, h: T };
    if (this.alat === 'perabot' && this.sprite) {
      const h = this.letakHantu();
      k.globalAlpha = 0.55; lukis(k, namaPutar(this.sprite, this.r), h.x, h.y); k.globalAlpha = 1;
      bingkai(h, '#fde68a');
    } else if (this.alat === 'tembok' && this.ubinSah(u.gx, u.gy)) { k.globalAlpha = 0.6; k.fillStyle = this.warna; k.fillRect(ubin.x, ubin.y, T, T); k.globalAlpha = 1; bingkai(ubin, '#fde68a'); }
    else if (this.alat === 'lantai' && this.lantai && this.ubinSah(u.gx, u.gy)) { k.globalAlpha = 0.6; lukis(k, this.lantai, ubin.x, ubin.y); k.globalAlpha = 1; bingkai(ubin, '#fde68a'); }
    else if (this.alat === 'hapus' || this.alat === 'pilih' || this.alat === 'area') {
      const di = this.kena({ x: this.mx, y: this.my });
      if (di && di.id !== this.pilih) bingkai(this.kotak(di), this.alat === 'hapus' ? '#fca5a5' : 'rgba(255,255,255,.7)');
      else if (!di && this.alat === 'hapus' && ((u.gx + ',' + u.gy) in d.tembok || (u.gx + ',' + u.gy) in d.lantai || (u.gx + ',' + u.gy) in (d.halang || {}))) bingkai(ubin, '#fca5a5');
    }
  },

  /* ---------- dok alat ---------- */

  pakaiAlat(a) {
    this.alat = a; this.pilih = null; this.pilihRuang = null; this.grup = null; this.seret = null;
    if (a === 'perabot') this.bukaKatalog('perabot');
    else if (a === 'lantai' && !this.lantai) this.bukaKatalog('lantai');
    else if (a !== 'lantai') this.tutupKatalog();
    this.lukisDok();
  },

  pakaiSprite(n) {
    this.sprite = n; this.r = 0; this.alat = 'perabot'; this.pilih = null; this.grup = null;
    this.terakhir = [n, ...this.terakhir.filter(x => x !== n)].slice(0, 8);
    this.lukisDok();
  },

  lukisDok() {
    const wadah = $('#bangun');
    if (!this.aktif || !wadah) return;
    const tb = (teks, kelas, fn, opsi) => el('button', Object.assign({ kelas: 'tombol kecil ' + (kelas || ''), teks, on: { click: (ev) => { ev.currentTarget.blur(); fn(); } } }, opsi || {}));
    const o = this.pilih != null && this.benda(this.pilih), isi = [];
    const ruang = this.alat === 'pilih' && this.pilihRuang != null && this.ruang(this.pilihRuang);
    const diam = { keydown: (ev) => ev.stopPropagation() };
    const palet = (kini, pilih) => [el('div', { kelas: 'bangun-warna' }, WARNA_TEMBOK.map(w => el('button', { kelas: 'warna' + (kini === w ? ' aktif' : ''), gaya: { background: w }, 'aria-label': 'Warna dinding ' + w, on: { click: () => pilih(w) } }))),
      el('input', { type: 'color', value: kini, title: 'Warna lain', 'aria-label': 'Warna dinding lain', on: { change: (ev) => pilih(ev.target.value) } })];
    const lapis = (kini) => [el('span', { kelas: 'redup kecil', teks: 'Layer:' }),
      ...[['bawah', '▼ Bawah'], ['', '◆ Otomatis'], ['atas', '▲ Atas']].map(([l, teks]) => tb(teks, kini === l ? 'aktif' : '', () => this.setLapis(l), { 'data-lapis': l || 'otomatis' }))];
    if (ruang) {
      const r = ruang, SISI = [['atas', 'Atas'], ['bawah', 'Bawah'], ['kiri', 'Kiri'], ['kanan', 'Kanan']];
      isi.push(el('b', { teks: `Ruang ${r.w}×${r.h}` }),
        el('input', { type: 'text', id: 'sunting-nama-ruang', maxlength: 24, placeholder: 'Nama ruang', value: r.nama || '', on: Object.assign({ change: (ev) => { const v = ev.target.value.trim().slice(0, 24); this.ubah(() => { r.nama = v; }); } }, diam) }),
        el('span', { kelas: 'redup kecil', teks: 'Dinding:' }), ...palet(r.warna, (w) => this.ubah(() => { r.warna = w; })),
        tb(r.lantai ? '▦ ' + namaBarang('lantai:' + r.lantai) : '▦ Pilih lantai', '', () => this.bukaKatalog('lantai')),
        r.lantai ? tb('Tanpa lantai', '', () => this.ubah(() => { r.lantai = ''; })) : null,
        el('div', { kelas: 'sunting-pintu' }, el('span', { kelas: 'redup kecil', teks: 'Pintu:' }),
          (r.pintu || []).map((q, i) => el('span', { kelas: 'cip pintu' },
            el('select', { 'aria-label': 'Sisi pintu ' + (i + 1), on: Object.assign({ change: (ev) => this.ubah(() => { q.sisi = ev.target.value; this.jepitPintu(r); }) }, diam) }, SISI.map(([v, t]) => el('option', { value: v, teks: t, selected: q.sisi === v }))),
            tb('−', '', () => this.ubah(() => { q.pos -= 1; this.jepitPintu(r); }), { 'aria-label': 'Geser pintu mundur' }),
            tb('+', '', () => this.ubah(() => { q.pos += 1; this.jepitPintu(r); }), { 'aria-label': 'Geser pintu maju' }),
            tb('✕', 'bahaya', () => this.ubah(() => { r.pintu.splice(i, 1); }), { 'aria-label': 'Hapus pintu' }))),
          (r.pintu || []).length < 4 ? tb('+ Pintu', '', () => this.ubah(() => { (r.pintu = r.pintu || []).push({ sisi: 'bawah', pos: 1 }); }), { id: 'sunting-tambah-pintu' }) : null),
        el('label', { kelas: 'centang-baris' }, el('input', { type: 'checkbox', checked: this.bawaIsi, on: { change: (ev) => { this.bawaIsi = ev.target.checked; } } }), 'Pindah bersama isinya'),
        el('label', { kelas: 'centang-baris' }, el('input', { type: 'checkbox', checked: !!r.kunci, on: { change: (ev) => { const v = ev.target.checked; this.ubah(() => { if (v) r.kunci = true; else delete r.kunci; }); } } }), 'Kunci posisi'),
        tb('Hapus ruang', 'bahaya', () => this.hapusPilihan()),
        el('span', { kelas: 'redup kecil tumbuh', teks: 'Seret ruang untuk memindah; seret pojok kanan bawah untuk mengubah ukuran.' }));
    } else if (this.alat === 'ruang') {
      isi.push(el('span', { kelas: 'redup kecil', teks: 'Dinding:' }), ...palet(this.warna, (w) => { this.warna = w; this.lukisDok(); }),
        this.lantai ? ikonBarang('lantai:' + this.lantai, 30) : null, tb(this.lantai ? '▦ ' + namaBarang('lantai:' + this.lantai) : '▦ Pilih lantai', '', () => this.bukaKatalog('lantai')));
    }
    if (ruang) { /* petunjuk ruang sudah termuat di atas */ } else if (this.alat === 'pilih' && o) {
      const pt = [0, ...(Rumah.infoBarang(o.n).putar || [])];
      isi.push(ikonBarang(o.n, 30), el('b', { teks: namaBarang(o.n) }), el('span', { kelas: 'redup kecil', teks: `x ${o.x}, y ${o.y}` }),
        pt.length > 1 ? tb(ARAH[o.r || 0] + ' · Putar (R)', '', () => this.putar()) : null,
        tb('Duplikat', '', () => this.duplikat()), ...lapis(o.l || ''),
        el('label', { kelas: 'centang-baris' }, el('input', { type: 'checkbox', id: 'sunting-tembus', checked: !!o.t || !!Rumah.infoBarang(o.n).tembus, disabled: !!Rumah.infoBarang(o.n).tembus,
          on: { change: (ev) => { const v = ev.target.checked; this.ubah(() => { if (v) o.t = 1; else delete o.t; }); } } }), 'Bisa dilewati'),
        POLA_KENDARAAN.test(o.n) ? el('label', { kelas: 'centang-baris', title: 'Menyusuri ubin jalan (aspal, jalan tanah, kerikil, tanah retak) dari tempat parkirnya. Taruh kendaraan di atas ubin jalan.' },
          el('input', { type: 'checkbox', id: 'sunting-gerak', checked: !!o.g, on: { change: (ev) => { const v = ev.target.checked; this.ubah(() => { if (v) o.g = 1; else delete o.g; }); } } }), 'Bergerak') : null,
        el('label', { kelas: 'centang-baris' }, el('input', { type: 'checkbox', checked: !!o.kunci, on: { change: (ev) => { const v = ev.target.checked; this.ubah(() => { if (v) o.kunci = true; else delete o.kunci; }); } } }), 'Kunci posisi'),
        tb('Hapus', 'bahaya', () => this.hapusPilihan()));
    } else if (this.alat === 'area' && this.grup) {
      isi.push(el('b', { teks: this.grup.ids.size + ' benda terpilih' }),
        this.grup.kotak ? el('label', { kelas: 'centang-baris' }, el('input', { type: 'checkbox', checked: this.ikutUbin, on: { change: (ev) => { this.ikutUbin = ev.target.checked; this.lukisDok(); } } }), 'Ikutkan lantai & tembok di dalam kotak') : null,
        this.grup.ids.size ? tb('Duplikat', '', () => this.duplikat()) : null,
        ...(this.grup.ids.size ? lapis(null) : []),
        tb('Hapus grup', 'bahaya', () => this.hapusPilihan()),
        tb('Batal pilih', '', () => { this.grup = null; this.lukisDok(); }));
    } else if (this.alat === 'perabot') {
      const pt = this.sprite ? [0, ...(Rumah.infoBarang(this.sprite).putar || [])] : [];
      isi.push(this.sprite ? ikonBarang(this.sprite, 30) : null, el('b', { teks: this.sprite ? namaBarang(this.sprite) : 'Belum ada perabot dipilih' }),
        pt.length > 1 ? tb(ARAH[this.r] + ' · Putar (R)', '', () => this.putar()) : null,
        tb('▦ Katalog', '', () => this.bukaKatalog('perabot')),
        ...this.terakhir.filter(n => n !== this.sprite).map(n => el('button', { kelas: 'slot mini', title: namaBarang(n), on: { click: () => this.pakaiSprite(n) } }, ikonBarang(n, 26))));
    } else if (this.alat === 'tembok') {
      isi.push(el('span', { kelas: 'redup kecil', teks: 'Warna:' }),
        el('div', { kelas: 'bangun-warna' }, WARNA_TEMBOK.map(w => el('button', { kelas: 'warna' + (this.warna === w ? ' aktif' : ''), gaya: { background: w }, 'aria-label': 'Warna tembok ' + w, on: { click: () => { this.warna = w; this.lukisDok(); } } }))),
        el('input', { type: 'color', value: this.warna, title: 'Warna lain', 'aria-label': 'Warna tembok lain', on: { change: (ev) => { this.warna = ev.target.value; this.lukisDok(); } } }));
    } else if (this.alat === 'lantai') {
      isi.push(this.lantai ? ikonBarang('lantai:' + this.lantai, 30) : null, el('b', { teks: this.lantai ? namaBarang('lantai:' + this.lantai) : 'Belum ada motif dipilih' }),
        tb('▦ Pilih motif', '', () => this.bukaKatalog('lantai')));
    }
    if (!ruang) isi.push(el('span', { kelas: 'redup kecil tumbuh', teks: PETUNJUK_SUNTING[this.alat], title: PETUNJUK_SUNTING[this.alat] }));
    wadah.replaceChildren(
      el('div', { kelas: 'sunting-kepala' },
        el('b', { teks: this.rumah ? 'Edit Rumah' : 'Edit Map' }), el('span', { id: 'sunting-kabar', kelas: 'redup kecil tumbuh', role: 'status', teks: this.pesan }),
        this.rumah ? el('span', { id: 'sunting-belanja', kelas: 'cip emas', role: 'status', teks: this.belanja || 'Belanja dihitung saat ada perubahan' }) : null,
        tb('🎲 Generate', '', () => this.bukaGenerator(), { id: 'sunting-generate', title: 'Generate peta otomatis dari seed (alam, kota, pantai, dan lainnya)' }),
        this.rumah ? null : tb('▤ Peta', '', () => this.kelolaPeta(), { id: 'sunting-peta', title: 'Koleksi peta: simpan banyak peta dan pilih yang aktif' }),
        tb('Simpan', 'utama', () => this.simpan(), { id: 'sunting-simpan', disabled: !this.kotor || this.sibuk, title: 'Simpan dan siarkan ke semua pemain (Ctrl+S)' }),
        tb('↶ Urungkan', '', () => this.urungkan(), { id: 'sunting-urung', disabled: !this.urung.length, title: 'Urungkan (Ctrl+Z)' }),
        tb('▦ Penghalang', this.lihatHalang ? 'aktif' : '', () => { this.lihatHalang = !this.lihatHalang; this.lukisDok(); }, { title: 'Lihat ubin yang tak bisa dilewati', 'aria-pressed': String(this.lihatHalang) }),
        tb('✕ Keluar', '', () => Rumah.keluarBangun(), { id: 'sunting-keluar', title: 'Keluar dari Edit Map (B)' })),
      el('div', { kelas: 'sunting-alat' }, ALAT_SUNTING.map(([judul, daftar]) => el('div', { kelas: 'sunting-kelompok' }, el('small', { teks: judul }),
        el('div', {}, daftar.filter(([kunci]) => !(this.rumah && kunci === 'halang')).map(([kunci, tanda, pendek, panjang]) => el('button', { kelas: 'slot alat' + (this.alat === kunci ? ' aktif' : ''), title: panjang, 'data-alat': kunci, 'aria-pressed': String(this.alat === kunci),
          on: { click: (ev) => { ev.currentTarget.blur(); this.pakaiAlat(kunci); } } }, el('span', { kelas: 'tangan', teks: tanda }), el('small', { teks: pendek }))))))),
      el('div', { kelas: 'sunting-pilihan' }, isi));
  },

  /* ---------- Generate peta: pembangkit dunia berbenih milik Agent Pak (generator.js, disalin utuh) ---------- */

  // Ubah denah keluaran GeneratorPeta (ops ala Agent Pak) menjadi isi peta Kevi. Mengembalikan ringkasan.
  terapkanDenah(d, denah) {
    const B = G.katalog.barang, L = new Set(G.katalog.lantai), penuh = (o) => o.gx === 0 && o.gy === 0 && o.w >= d.lebar && (o.h || 1) >= d.tinggi;
    const ubin = (o, fn) => { for (let gy = o.gy; gy < o.gy + (o.h || 1); gy++) for (let gx = o.gx; gx < o.gx + o.w; gx++) if (this.ubinSah(gx, gy)) fn(gx + ',' + gy); };
    // Rumah: benda yang berfungsi (petak kebun, kandang, peti, kotak kiriman) dipertahankan; alas rumput rumah tetap.
    const tetap = this.rumah ? d.benda.filter(o => o.n === 'kebun_petak' || G.toko.kandang[o.n] || (G.toko.peti || []).includes(o.n) || TITIK_JUAL.test(o.n)) : [];
    Object.assign(d, this.rumah ? {} : { dasar: 'kosong' }, { lantai: {}, tembok: {}, halang: {}, ruang: [], benda: tetap });
    let lewat = 0;
    const taruh = (n, x, y, tembus) => {
      if (!B[n] || d.benda.length >= 3900) { lewat++; return; }
      const t = this.batas(Math.round(x), Math.round(y));
      d.urut += 1;
      d.benda.push(Object.assign({ id: d.urut, n, x: t.x, y: t.y, r: 0 }, tembus && !B[n].tembus ? { t: 1 } : {}));
    };
    for (const o of denah.ops) {
      if (o.t === 'lantai') { if (!L.has(o.n)) continue; if (penuh(o)) { if (!this.rumah) d.lantai_dasar = o.n; } else ubin(o, (k) => { d.lantai[k] = o.n; }); }
      else if (o.t === 'halang' && this.rumah) continue;
      else if (o.t === 'halang') ubin(o, (k) => { d.halang[k] = 1; });
      else if (o.t === 'ruang') { d.urut += 1; d.ruang.push({ id: d.urut, gx: o.gx, gy: o.gy, w: o.w, h: o.h, warna: o.warna || WARNA_TEMBOK[0], lantai: L.has(o.lantai) ? o.lantai : '', nama: (o.nama || '').slice(0, 24), pintu: (o.pintu || []).slice(0, 4).map(q => ({ sisi: q.sisi, pos: q.pos })) }); this.jepitPintu(d.ruang[d.ruang.length - 1]); }
      else if (o.t === 'padat' || o.t === 'penuh' || o.t === 'lukis') taruh(o.n, o.x, o.y, o.t === 'lukis');
    }
    for (const m of denah.meja || []) taruh(B['meja_' + m.jenis] ? 'meja_' + m.jenis : 'meja_hadap4', m.x, m.y, false);
    return { benda: d.benda.length, lewat };
  },

  bukaGenerator() {
    if (typeof GeneratorPeta === 'undefined') { kabar('Generator peta belum termuat.', 'galat'); return; }
    const d = this.d, gen = this.gen || (this.gen = { jenis: 'alam', kepadatan: 'sedang', meja: 3, benih: String(GeneratorPeta.benihAcak()) });
    const isi = el('div', { kelas: 'generator' }), diam = { keydown: (ev) => ev.stopPropagation() };
    const buat = () => {
      const benih = GeneratorPeta.normalBenih(gen.benih);
      gen.benih = String(benih);
      const h = GeneratorPeta.buat({ jenis: gen.jenis, lebar: d.lebar, tinggi: d.tinggi, kepadatan: gen.kepadatan, benih, atlas, kursi: Array(gen.meja * 4).fill('') });
      let ringkas;
      this.pilih = null; this.pilihRuang = null; this.grup = null;
      this.ubah((dd) => { ringkas = this.terapkanDenah(dd, h.denah); });
      this.kabar(`Peta ${GeneratorPeta.JENIS[gen.jenis].nama} dibuat (seed ${benih}, ${d.lebar}×${d.tinggi}, ${ringkas.benda} benda${ringkas.lewat ? ', ' + ringkas.lewat + ' dilewati' : ''}). Belum tersimpan: tekan Simpan, atau Urungkan.`);
      lukis();
    };
    const lukis = () => isi.replaceChildren(
      el('p', { kelas: 'redup kecil', teks: `Seed yang sama selalu menghasilkan peta yang sama. Hasilnya MENGGANTI seluruh isi peta ini (${d.lebar}×${d.tinggi} ubin) sebagai draf: bisa diurungkan, dan baru tersiar saat Simpan. NPC tidak ikut dipindah.` }),
      el('div', { kelas: 'kisi generator-jenis' }, Object.entries(GeneratorPeta.JENIS).map(([k, j]) => el('button', { type: 'button', kelas: 'kartu' + (gen.jenis === k ? ' aktif' : ''), 'data-jenis': k, title: j.ket,
        on: { click: () => { gen.jenis = k; lukis(); } } }, el('span', { kelas: 'tangan', teks: j.ikon }), el('b', { teks: j.nama })))),
      el('label', {}, 'Kepadatan', el('select', { id: 'gen-kepadatan', on: Object.assign({ change: (ev) => { gen.kepadatan = ev.target.value; } }, diam) },
        [['jarang', 'Jarang'], ['sedang', 'Sedang'], ['lebat', 'Lebat']].map(([v, t]) => el('option', { value: v, teks: t, selected: gen.kepadatan === v })))),
      el('label', {}, 'Ruang kantor', el('select', { id: 'gen-meja', on: Object.assign({ change: (ev) => { gen.meja = Number(ev.target.value); } }, diam) },
        [[0, 'Tanpa kantor'], [2, 'Kecil (2 meja)'], [3, 'Sedang (3 meja)'], [6, 'Besar (6 meja)'], [9, 'Sangat besar (9 meja)']].map(([v, t]) => el('option', { value: v, teks: t, selected: gen.meja === v })))),
      el('label', {}, 'Seed', el('input', { type: 'text', id: 'gen-benih', inputmode: 'numeric', value: gen.benih, on: Object.assign({ change: (ev) => { gen.benih = ev.target.value; } }, diam) })),
      el('div', { kelas: 'baris-tombol' },
        el('button', { type: 'button', kelas: 'tombol utama', id: 'gen-buat', teks: 'Buat', on: { click: buat } }),
        el('button', { type: 'button', kelas: 'tombol', id: 'gen-acak', teks: '🎲 Acak ulang', title: 'Seed baru = dunia baru', on: { click: () => { gen.benih = String(GeneratorPeta.benihAcak()); buat(); } } })),
      el('p', { kelas: 'redup kecil', role: 'status', teks: this.pesan }));
    Panel.buka('🎲 Generate peta', el('div', { kelas: 'formulir' }, isi), { kelas: 'ringkas' });
    lukis();
  },

  /* ---------- koleksi peta: banyak peta tersimpan, satu yang aktif ---------- */

  async kelolaPeta() {
    if (this.kotor) { this.kabar('Simpan atau urungkan dulu perubahan peta ini sebelum membuka koleksi peta.'); return; }
    let d;
    try { d = await api('/api/admin/peta/daftar'); } catch (e) { kabar(e.message, 'galat'); return; }
    const isi = el('div', { kelas: 'koleksi' }), diam = { keydown: (ev) => ev.stopPropagation() };
    const panggil = async (jalur, badan, ok) => { try { const j = await api(jalur, badan); if (ok) kabar(ok); return j; } catch (e) { kabar(e.message, 'galat'); return null; } };
    let yakin = 0;
    const aktifkan = async (p) => {
      const j = await panggil('/api/admin/peta/aktifkan', { id: p.id });
      if (!j) return;
      Panel.tutup();
      this.tutup(true);
      G.peta = j.denah;
      Rumah.segarkan();
      if (G.aku && !kakiBebas(G.aku.x, G.aku.y)) Object.assign(G.aku, titikBebas(G.aku.x, G.aku.y));
      this.buka();
      kabar('Peta "' + p.nama + '" kini aktif untuk semua pemain.', 'hadiah');
    };
    const lukis = () => {
      const nama = el('input', { type: 'text', id: 'koleksi-nama', maxlength: 40, placeholder: 'Nama peta baru', on: diam });
      const lebar = el('input', { type: 'number', min: 20, max: 80, value: 45, 'aria-label': 'Lebar (ubin)', on: diam }), tinggi = el('input', { type: 'number', min: 20, max: 80, value: 46, 'aria-label': 'Tinggi (ubin)', on: diam });
      const ukuran = el('span', { kelas: 'koleksi-ukuran' }, lebar, ' × ', tinggi, ' ubin');
      const dari = el('select', { id: 'koleksi-dari', 'aria-label': 'Asal peta', on: Object.assign({ change: () => { ukuran.hidden = dari.value !== 'kosong'; } }, diam) },
        el('option', { value: 'kosong', teks: 'Kosong (tanah lapang, tanpa NPC)' }), el('option', { value: 'default', teks: 'Kantor bawaan (dengan NPC bawaan)' }), el('option', { value: 'salin', teks: 'Salinan peta aktif (termasuk NPC-nya)' }));
      isi.replaceChildren(
        el('p', { kelas: 'redup kecil', teks: 'Peta aktif adalah yang dilihat semua pemain. Tiap peta punya denah, penghalang, NPC, dan titik interaksinya sendiri.' }),
        el('div', { kelas: 'daftar' }, d.peta.map(p => el('div', { kelas: 'baris', 'data-peta': p.id },
          el('input', { type: 'text', kelas: 'tumbuh', maxlength: 40, value: p.nama, 'aria-label': 'Nama peta', on: Object.assign({ change: async (ev) => { const j = await panggil('/api/admin/peta/nama', { id: p.id, nama: ev.target.value }, 'Nama peta diganti.'); if (j) d = j; lukis(); } }, diam) }),
          el('span', { kelas: 'redup kecil', teks: `${p.lebar}×${p.tinggi} · ${p.benda} benda · ${p.npc} NPC` }),
          p.aktif ? el('span', { kelas: 'cip hijau', teks: 'aktif' }) : el('button', { kelas: 'tombol kecil utama', teks: 'Aktifkan', 'data-aksi': 'aktifkan', on: { click: () => aktifkan(p) } }),
          p.aktif ? null : el('button', { kelas: 'tombol kecil bahaya', teks: yakin === p.id ? 'Yakin hapus?' : 'Hapus', 'data-aksi': 'hapus', on: { click: async () => {
            if (yakin !== p.id) { yakin = p.id; lukis(); return; }
            const j = await panggil('/api/admin/peta/hapus', { id: p.id }, 'Peta dihapus.');
            yakin = 0; if (j) d = j; lukis();
          } } })))),
        el('h4', { teks: `Peta baru (${d.peta.length} / ${d.maks})` }),
        el('form', { kelas: 'formulir', on: { submit: async (ev) => {
          ev.preventDefault();
          const j = await panggil('/api/admin/peta/baru', { nama: nama.value, dari: dari.value, lebar: Number(lebar.value), tinggi: Number(tinggi.value) }, 'Peta baru tersimpan. Aktifkan untuk mulai menyuntingnya.');
          if (j) { d = j; lukis(); }
        } } }, nama, dari, ukuran, el('button', { kelas: 'tombol utama', teks: 'Buat peta' })));
    };
    Panel.buka('Koleksi peta', isi, { kelas: 'ringkas' });
    lukis();
  },

  /* ---------- jendela katalog (tetap terbuka selagi menaruh) ---------- */

  tutupKatalog() { const j = $('#sunting-katalog'); if (j) j.remove(); },

  bukaKatalog(mode) {
    this.tutupKatalog();
    const kat = this.kat;
    kat.mode = mode;
    const kisi = el('div', { kelas: 'kisi rapat' });
    const lukisKisi = () => {
      const q = kat.cari.toLowerCase().split(/\s+/).filter(Boolean), B = G.katalog.barang;
      let daftar = mode === 'lantai' ? G.katalog.lantai.slice()
        : Object.keys(B).filter(n => !kat.kategori || B[n].k.startsWith(kat.kategori + '/')).sort((x, y) => B[x].k.localeCompare(B[y].k) || x.localeCompare(y));
      daftar = daftar.filter(n => q.every(x => (n.replace(/_/g, ' ') + ' ' + (mode === 'lantai' ? '' : B[n].k)).toLowerCase().includes(x)));
      // Rumah: hanya yang dimiliki atau dijual toko (yang lain tak mungkin dipasang).
      if (this.rumah && mode !== 'lantai') daftar = daftar.filter(n => (G.inventori[n] || 0) > 0 || hargaBeli(n) != null);
      const dipilih = mode === 'lantai' ? this.lantai : this.sprite;
      kisi.replaceChildren(...daftar.slice(0, 240).map(n => {
        const b = mode === 'lantai' ? 'lantai:' + n : n;
        // Rumah: lantai gratis tetapi motifnya terbuka menurut level; perabot memakai stok lalu dibeli. Admin di peta utama bebas.
        const kunci = this.rumah && mode === 'lantai' && levelBarang(b) > G.level.level ? levelBarang(b) : 0;
        const ket = namaBarang(b) + (!this.rumah ? '' : mode === 'lantai' ? (kunci ? ' · terbuka di level ' + kunci : ' · gratis')
          : ' · punya ' + (G.inventori[b] || 0) + (hargaBeli(b) != null ? ' · ' + hargaBeli(b) + ' koin' : ''));
        return el('button', { kelas: 'kartu' + (n === dipilih ? ' aktif' : '') + (kunci ? ' gembok' : ''), title: ket, 'aria-label': ket, 'data-n': n, 'aria-disabled': kunci ? 'true' : null, on: { click: () => {
          if (kunci) { this.kabar(namaBarang(b) + ' terbuka di level ' + kunci + '.'); return; }
          const r = mode === 'lantai' && this.alat === 'pilih' && this.pilihRuang != null ? this.ruang(this.pilihRuang) : null;
          if (r) this.ubah(() => { r.lantai = n; });        // katalog dibuka dari properti ruang: motif untuk ruang itu
          else if (mode === 'lantai') { this.lantai = n; if (this.alat !== 'ruang') { this.alat = 'lantai'; this.pilih = null; this.grup = null; } this.lukisDok(); }
          else this.pakaiSprite(n);
          lukisKisi();
        } } }, ikonBarang(b, 28));      // nama cukup di hover (title) supaya ruang kerja lega
      }), daftar.length > 240 ? el('p', { kelas: 'redup kecil', teks: `+${daftar.length - 240} lagi. Persempit dengan kategori atau cari.` }) : '',
      daftar.length ? '' : el('p', { kelas: 'redup', teks: 'Tidak ada yang cocok.' }));
    };
    const diam = { keydown: (ev) => ev.stopPropagation() };
    // Kategori di bilah sisi kiri (hanya untuk perabot); isi katalog di kanan.
    const B0 = G.katalog.barang, hitung = (nama) => Object.keys(B0).filter(n => !nama || B0[n].k.startsWith(nama + '/')).length;
    const sisi = mode === 'lantai' ? null : el('nav', { kelas: 'kat-sisi', 'aria-label': 'Kategori perabot' },
      [{ nama: '' }, ...G.katalog.kategori].map(k => el('button', { kelas: k.nama === kat.kategori ? 'aktif' : '', 'data-kategori': k.nama, title: (k.nama || 'Semua perabot') + ' (' + hitung(k.nama) + ')',
        teks: k.nama || 'Semua', on: { click: (ev) => { kat.kategori = k.nama; for (const s of sisi.children) s.classList.toggle('aktif', s === ev.currentTarget); kisi.scrollTop = 0; lukisKisi(); } } })));
    const cari = el('input', { type: 'search', placeholder: mode === 'lantai' ? 'Cari motif lantai…' : 'Cari perabot…', value: kat.cari, on: Object.assign({ input: (ev) => { kat.cari = ev.target.value; lukisKisi(); } }, diam) });
    lukisKisi();
    const kepala = el('header', {}, el('b', { teks: mode === 'lantai' ? 'Motif lantai' : 'Katalog perabot' }), el('button', { kelas: 'tutup', 'aria-label': 'Tutup katalog', teks: '✕', on: { click: () => this.tutupKatalog() } }));
    const jendela = el('section', { id: 'sunting-katalog', kelas: 'bingkai tipis' + (sisi ? ' bersisi' : ''), 'aria-label': 'Katalog' }, kepala,
      el('div', { kelas: 'kat-badan' }, sisi, el('div', { kelas: 'kat-isi' }, el('div', { kelas: 'saring' }, cari), kisi)));
    document.body.append(jendela);
    bisaDigeser(jendela, kepala, 'sunting-katalog');
  },
};

Sunting.pasang();
