/* Kevi — mesin dunia: adegan (kantor / rumah), tabrakan, gerak WASD, tokoh, kamera, dan penggambaran.
 *
 * Kantor = peta Default Agent Pak yang sudah dipanggang (tools/panggang_peta.mjs): dua lapis gambar + data.
 * Rumah = tanah milik pemain, digambar langsung dari datanya (rumah.js).
 * Koordinat tokoh = pojok kiri-atas seni 16x20 (kaki di x+8, y+19), sama dengan aktor Agent Pak.
 */
'use strict';

const KALI_LARI = 1.75;         // lari = jalan x ini, memakai stamina
const STAMINA = { kuras: 26, pulihJalan: 9, pulihDiam: 22, bangkit: 0.3 };   // per detik; bangkit = bagian stamina sebelum boleh lari lagi
const JANGKAU = 13;             // px dari kaki ke benda supaya tombol E berlaku
const ZOOM = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
const kanvas = document.getElementById('dunia');
const ktx = kanvas.getContext('2d');

/* ---------- grid tabrakan ---------- */

function gridBaru(w, h) { return { w, h, sel: new Uint8Array(w * h) }; }
function gridHalang(g, gx, gy, w = 1, h = 1) {
  for (let y = Math.max(0, gy); y < Math.min(g.h, gy + h); y++)
    for (let x = Math.max(0, gx); x < Math.min(g.w, gx + w); x++) g.sel[y * g.w + x] = 1;
}
function gridPadat(g, gx, gy) { return gx < 0 || gy < 0 || gx >= g.w || gy >= g.h || g.sel[gy * g.w + gx] === 1; }
// Jejak perabot sebagai penghalang — aturan yang sama dengan Agent Pak (kantor.js halangJejak): benda tinggi hanya
// menghalangi separuh bawahnya, benda datar (meja tampak atas) seluruh jejaknya.
function gridJejak(g, x, y, w, h, penuh) {
  const alas = penuh || h <= 16 ? h : Math.max(16, Math.round(h / 2));
  const gx0 = Math.floor((x + 2) / T), gx1 = Math.floor((x + w - 3) / T);
  const gy0 = Math.floor((y + h - alas + 2) / T), gy1 = Math.floor((y + h - 3) / T);
  gridHalang(g, gx0, gy0, gx1 - gx0 + 1, gy1 - gy0 + 1);
}

function kakiBebas(x, y) {
  const g = G.grid;
  if (!g) return true;
  const kiri = Math.floor((x + 4) / T), kanan = Math.floor((x + 11) / T);
  const atas = Math.floor((y + 15) / T), bawah = Math.floor((y + 19) / T);
  return !gridPadat(g, kiri, atas) && !gridPadat(g, kanan, atas) && !gridPadat(g, kiri, bawah) && !gridPadat(g, kanan, bawah);
}

// Ubin bebas terdekat dari sebuah titik (NPC & titik muncul tak boleh terkunci di dalam perabot).
function titikBebas(x, y) {
  if (kakiBebas(x, y)) return { x, y };
  for (let r = 1; r < 12; r++)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx * 8, ny = y + dy * 8;
      if (kakiBebas(nx, ny)) return { x: nx, y: ny };
    }
  return { x, y };
}

/* ---------- tokoh ---------- */

function buatEntitas(id, jenis, d) {
  const e = { id, jenis, nama: d.nama || '', jabatan: d.jabatan || '', x: d.x ?? 0, y: d.y ?? 0, tx: d.x ?? 0, ty: d.y ?? 0,
    arah: d.arah || 'bawah', jalan: false, langkah: 0, pose: d.pose || '', gelembung: null, emot: null, level: d.level || 0, data: d };
  e.look = penampilan({ session_id: 'kevi-' + id, nama: d.nama, tampilan: d.tampilan || {} });
  return e;
}
function gantiTampilan(e, nama, tampilan) {
  e.nama = nama;
  e.look = penampilan({ session_id: 'kevi-' + e.id, nama, tampilan: tampilan || {} });
}

function poseEntitas(e) {
  if (e.pose) return e.pose;
  if (e.jalan) {
    const f = Math.floor(e.langkah) % 4;
    return `${e.arah}_${f === 1 ? 'kiri' : (f === 3 ? 'kanan' : 'diam')}`;
  }
  return e.arah + '_diam';
}

function lukisEntitas(k, e, alfa = 1) {
  const pose = poseEntitas(e);
  const b = bingkaiTokoh(e.look, pose) || bingkaiTokoh(e.look, 'bawah_diam');
  if (!b) return;
  const pantul = e.jalan && /_(kiri|kanan)$/.test(pose) ? -1 : 0;
  k.globalAlpha = alfa;
  if (!e.pose) {
    k.fillStyle = 'rgba(0,0,0,.18)';
    k.beginPath(); k.ellipse(e.x + 8, e.y + 19, 6, 2.5, 0, 0, Math.PI * 2); k.fill();
  }
  k.drawImage(b.kanvas, Math.round(e.x) - b.pad, Math.round(e.y) - b.pad + pantul);
  k.globalAlpha = 1;
  if (e === G.aku && G.tata.bilah && !e.pose) {      // bilah mini: stamina (hijau / merah saat lelah) dan XP (ungu)
    const lv = G.level, st = G.stamina, bx = Math.round(e.x) - 1, by = Math.round(e.y) - 7;
    const xp = lv.lanjut ? (lv.xp - lv.dasar) / (lv.lanjut - lv.dasar) : 1;
    k.fillStyle = 'rgba(7,11,20,.85)'; k.fillRect(bx, by, 18, 5);
    k.fillStyle = st.lelah ? '#ef4444' : '#34d399'; k.fillRect(bx + 1, by + 1, Math.round(16 * Math.max(0, Math.min(1, st.nilai / lv.stamina))), 1);
    k.fillStyle = '#a78bfa'; k.fillRect(bx + 1, by + 3, Math.round(16 * Math.max(0, Math.min(1, xp))), 1);
  }
  if (e.emot) {                       // gelembung emote: muncul memantul, hilang sendiri
    const sisa = e.emot.sampai - performance.now();
    if (sisa <= 0) e.emot = null;
    else lukis(k, e.emot.n, e.x, e.y - 17 - Math.abs(Math.sin(sisa / 160)) * 2);
  }
}

/* ---------- adegan ---------- */

const Mesin = {
  tombol: new Set(),
  statis: [],            // benda kantor yang bisa diinteraksi (kursi, mesin penjual, rak)
  dunia: { w: 0, h: 0 },
  terakhirKirim: 0, kirimTerakhir: '',

  sibuk() {
    const a = document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || document.body.classList.contains('ada-panel');
  },

  siapkanKantor() {
    const d = G.kantor, g = gridBaru(d.lebar, d.tinggi);
    d.grid.forEach((baris, y) => { for (let x = 0; x < baris.length; x++) if (baris[x] === '#') g.sel[y * g.w + x] = 1; });
    this.gridKantor = g;
    const st = [];
    for (const s of d.kursiMeja) {
      st.push({ jenis: 'kursi', x: s.x + 8, y: s.y + 14, w: 16, h: 20, label: 'Duduk & buka Komputer', kursi: s,
        aksi: () => Mesin.duduk(s) });
    }
    for (const o of d.ops) {
      const u = ukuranSprite(o.n, o.r);
      if (o.n === 'mesin_penjual') st.push({ jenis: 'toko', x: o.x, y: o.y, w: u.w, h: u.h, label: 'Koperasi (mesin penjual)', aksi: () => Toko.buka() });
      else if (o.n === 'kompor' || o.n === 'microwave') st.push({ jenis: 'masak', x: o.x, y: o.y, w: u.w, h: u.h, label: 'Masak', aksi: () => Masak.buka() });
      else if (o.n === 'mesin_arcade' || o.n === 'tv_konsol') st.push({ jenis: 'arcade', x: o.x, y: o.y, w: u.w, h: u.h, label: 'Main arcade: Cocokkan Kartu', aksi: () => Arcade.buka() });
    }
    for (const r of d.rak) st.push({ jenis: 'rak', x: r.x, y: r.y, w: r.w, h: r.h, label: 'Konsol rak server', aksi: () => Terminal.buka('rak') });
    this.statisKantor = st;
  },

  masukKantor(x, y) {
    const d = G.kantor;
    this.aturTerdekat(null);
    G.adegan = 'kantor'; G.rumah = null; G.rumahSaya = false; G.pemilikRumah = null;
    Rumah.segarkan();                          // grid, ukuran dunia, dan titik interaksi dari G.peta
    // Datang dari rumah = muncul di tepi bawah peta (rumah ada "di bawah" kantor).
    const mulai = titikBebas(x ?? (G.peta.dasar === 'default' ? d.pintuMasuk.x + 8 : (G.peta.lebar / 2) * T - 8), y ?? (G.peta.tinggi - 2) * T);
    Object.assign(G.aku, mulai, { arah: 'atas', pose: '' });
    G.duduk = null;
    document.body.dataset.adegan = 'kantor';
    Hud.adegan();
  },

  async masukRumah(uid, x, y) {
    let d;
    try { d = await api('/api/rumah?milik=' + uid); }
    catch (e) { kabar(e.message, 'galat'); return false; }
    this.aturTerdekat(null);
    G.adegan = 'rumah:' + uid; G.rumah = d.rumah; G.pemilikRumah = d.pemilik; G.rumahSaya = d.milik_saya;
    Rumah.segarkan();
    // Datang dari kantor = muncul di jalan ATAS rumah, menghadap ke tanah.
    const mulai = titikBebas(x ?? (d.rumah.lebar / 2) * T - 8, y ?? 2);
    Object.assign(G.aku, mulai, { arah: 'bawah', pose: '' });
    G.duduk = null;
    document.body.dataset.adegan = 'rumah';
    Hud.adegan();
    return true;
  },

  // Pindah adegan atas kemauan pemain (pintu keluar, papan pulang, bertamu).
  async pindah(adegan, x, y) {
    if (G.bangun) Rumah.keluarBangun(true);
    for (const [id, e] of G.entitas) if (e.jenis === 'pemain') G.entitas.delete(id);
    if (adegan === 'kantor') this.masukKantor(x, y);
    else if (!await this.masukRumah(Number(adegan.slice(6)), x, y)) return;
    Jaring.kirim({ t: 'adegan', adegan: G.adegan, x: G.aku.x, y: G.aku.y });
    kabar(adegan === 'kantor' ? 'Tiba di kantor.' : (G.rumahSaya ? 'Pulang ke rumah.' : 'Bertamu ke rumah ' + G.pemilikRumah.nama + '.'));
  },

  // Titik interaksi yang ditaruh admin lewat dashboard (penanda "!" melayang di peta).
  titikAdmin() {
    const aksi = { arcade: () => Arcade.buka(), kuis: () => Kuis.buka(), toko: () => Toko.buka(), terminal: () => Terminal.buka('rak'), misi: () => Panel.misi() };
    const nama = { arcade: 'Main arcade', kuis: 'Kuis jaringan', toko: 'Koperasi', terminal: 'Terminal', misi: 'Misi harian' };
    return G.titik.map(t => ({ jenis: 'titik', x: t.x, y: t.y, w: 16, h: 16, label: t.label || nama[t.jenis], aksi: aksi[t.jenis], tanda: true }));
  },
  segarkanTitik() { if (G.adegan === 'kantor') { Rumah.susunTitik(); this.aturTerdekat(null); } },

  duduk(s) {
    const a = G.aku;
    G.duduk = { kursi: s, dari: { x: a.x, y: a.y, arah: a.arah } };
    a.x = s.x + 8; a.y = s.y + 14; a.jalan = false;
    a.arah = s.hadap;
    Terminal.buka('meja');
  },
  berdiri() {
    if (!G.duduk) return;
    const a = G.aku;
    Object.assign(a, titikBebas(G.duduk.dari.x, G.duduk.dari.y), { arah: G.duduk.dari.arah, pose: '' });
    G.duduk = null;
  },

  /* ---------- gerak ---------- */

  majukan(dt) {
    const a = G.aku;
    if (!a) return;
    if (G.duduk) {
      const h = G.duduk.kursi.hadap, f = Math.floor(G.kini * (Terminal.sibuk ? 3.6 : 1.5)) % 2;
      a.pose = h === 'bawah' ? (f ? 'duduk_b' : 'duduk_a') : (h === 'kiri' || h === 'kanan') ? h + '_duduk' : (f ? 'main_b' : 'main_a');
    } else {
      a.pose = '';
      let dx = 0, dy = 0;
      if (!this.sibuk()) {
        const t = this.tombol;
        if (t.has('a') || t.has('arrowleft')) dx -= 1;
        if (t.has('d') || t.has('arrowright')) dx += 1;
        if (t.has('w') || t.has('arrowup')) dy -= 1;
        if (t.has('s') || t.has('arrowdown')) dy += 1;
      }
      a.jalan = !!(dx || dy);
      if (a.jalan) {
        if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
        a.arah = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'kiri' : 'kanan') : (dy < 0 ? 'atas' : 'bawah');
        const st = G.stamina, maks = G.level.stamina;
        const mauLari = this.tombol.has('shift') && !st.lelah && st.nilai > 0;
        const lari = mauLari ? KALI_LARI : 1, LAJU_JALAN = G.atur.laju_jalan;
        if (mauLari) { st.nilai = Math.max(0, st.nilai - STAMINA.kuras * dt); if (st.nilai <= 0) st.lelah = true; }
        else st.nilai = Math.min(maks, st.nilai + STAMINA.pulihJalan * (st.kopi > G.kini ? 2 : 1) * dt);
        const terjebak = !kakiBebas(a.x, a.y);        // perabot ditaruh di atas pemain: boleh jalan keluar
        const nx = a.x + dx * LAJU_JALAN * lari * dt, ny = a.y + dy * LAJU_JALAN * lari * dt;
        if (terjebak || kakiBebas(nx, a.y)) a.x = nx;
        if (terjebak || kakiBebas(a.x, ny)) a.y = ny;
        a.langkah += dt * 8 * lari;
        this.cekPinggir();
      } else {
        a.langkah = 0;
        if (!this.pindahBerjalan) this.tungguLepas = false;
        const st = G.stamina;
        st.nilai = Math.min(G.level.stamina, st.nilai + STAMINA.pulihDiam * (st.kopi > G.kini ? 2 : 1) * dt);
      }
    }
    const st = G.stamina;
    if (st.lelah && st.nilai >= G.level.stamina * STAMINA.bangkit) st.lelah = false;
    Hud.stamina();
    // Pemain lain: kejar posisi yang dikabarkan server.
    for (const e of G.entitas.values()) {
      if (e.jenis !== 'pemain') continue;
      const jx = e.tx - e.x, jy = e.ty - e.y;
      if (Math.abs(jx) + Math.abs(jy) > 96) { e.x = e.tx; e.y = e.ty; }
      else { e.x += jx * Math.min(1, dt * 12); e.y += jy * Math.min(1, dt * 12); }
      if (e.jalan) e.langkah += dt * 8;
    }
    if (G.adegan === 'kantor') for (const e of G.entitas.values()) if (e.jenis === 'npc') Npc.hidup(e, dt);
    this.kabarkanPosisi();
    this.cariTerdekat();
  },

  // Tepi bawah peta = jalan pulang (dari kantor) / jalan berangkat (dari rumah).
  cekPinggir() {
    const a = G.aku;
    // tungguLepas: baru tiba dari adegan lain sambil masih menahan tombol — jangan langsung terlempar balik.
    // Kantor: tepi BAWAH = pulang. Rumah: tepi ATAS = berangkat.
    const diTepi = G.adegan === 'kantor' ? a.y + 19 >= this.dunia.h - 5 : a.y + 15 <= 3;
    if (this.pindahBerjalan || this.tungguLepas || !diTepi || Rumah.menyunting) return;      // selagi Edit Map tepi peta tidak memindahkan
    this.pindahBerjalan = true; this.tungguLepas = true;
    const tuju = G.adegan === 'kantor' ? 'rumah:' + G.saya.id : 'kantor';
    this.pindah(tuju).finally(() => { this.pindahBerjalan = false; });
  },

  kabarkanPosisi() {
    const a = G.aku, kini = performance.now();
    if (kini - this.terakhirKirim < 100) return;
    const tanda = Math.round(a.x) + ',' + Math.round(a.y) + ',' + a.arah + ',' + (a.jalan ? 1 : 0) + ',' + a.pose;
    if (tanda === this.kirimTerakhir) return;
    this.kirimTerakhir = tanda; this.terakhirKirim = kini;
    Jaring.kirim({ t: 'pos', x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10, arah: a.arah, jalan: a.jalan, pose: a.pose });
  },

  /* ---------- interaksi ---------- */

  cariTerdekat() {
    const a = G.aku;
    let terbaik = null, jarakTerbaik = JANGKAU;
    if (G.duduk || G.bangun) { this.aturTerdekat(null); return; }
    const kx = a.x + 8, ky = a.y + 17;
    const coba = (b) => {
      const dx = Math.max(b.x - kx, 0, kx - (b.x + b.w)), dy = Math.max(b.y - ky, 0, ky - (b.y + b.h));
      const j = Math.hypot(dx, dy);
      if (j < jarakTerbaik) { jarakTerbaik = j; terbaik = b; }
    };
    for (const b of Rumah.interaksi()) coba(b);
    for (const e of G.entitas.values()) {
      if (e.jenis === 'npc' && G.adegan !== 'kantor') continue;
      coba({ x: e.x + 2, y: e.y + 6, w: 12, h: 14, label: e.jenis === 'npc' ? 'Bicara dengan ' + e.nama : 'Interaksi dengan ' + e.nama,
        aksi: () => (e.jenis === 'npc' ? Npc.bicara(e) : Sosial.menu(e)) });
    }
    this.aturTerdekat(terbaik);
  },
  aturTerdekat(b) {
    // Dibandingkan dengan teks yang TERAKHIR DITAMPILKAN: label petak berubah sendiri (siram -> tumbuh -> panen).
    const label = b ? b.label : null;
    G.terdekat = b;
    if (label === this.labelTampil) return;
    this.labelTampil = label;
    const p = $('#petunjuk');
    p.hidden = !b;
    if (b) p.replaceChildren(el('kbd', { teks: 'E' }), ' ' + b.label);
  },

  /* ---------- gambar ---------- */

  ukur() {
    const w = innerWidth, h = innerHeight, dpr = 1;
    kanvas.width = w * dpr; kanvas.height = h * dpr;
    this.skalaOtomatis = Math.max(2, Math.min(5, Math.floor(Math.min(w / (21 * T), h / (12 * T)))));
    G.kamera.skala = G.zoom || this.skalaOtomatis;
    ktx.imageSmoothingEnabled = false;
  },

  // Zoom: arah +1 / -1 melangkah di ZOOM, 0 = kembali otomatis. Pilihan diingat per perangkat.
  zoom(arah) {
    const kini = G.kamera.skala;
    if (!arah) G.zoom = 0;
    else {
      const i = ZOOM.reduce((b, z, j) => Math.abs(z - kini) < Math.abs(ZOOM[b] - kini) ? j : b, 0);
      G.zoom = ZOOM[Math.max(0, Math.min(ZOOM.length - 1, i + arah))];
    }
    try { localStorage.setItem('kevi.zoom', String(G.zoom)); } catch (e) { /* mode privat */ }
    this.ukur();
    $('#zoom-nilai').textContent = Math.round(G.kamera.skala / this.skalaOtomatis * 100) + '%';
  },

  kamera() {
    const k = G.kamera, a = G.aku, vw = kanvas.width / k.skala, vh = kanvas.height / k.skala;
    const jepit = (v, maks, lihat) => maks <= lihat ? (maks - lihat) / 2 : Math.max(0, Math.min(maks - lihat, v));
    k.x = jepit(a.x + 8 - vw / 2, this.dunia.w, vw);
    k.y = jepit(a.y + 10 - vh / 2, this.dunia.h, vh);
  },

  keLayar(x, y) { const k = G.kamera; return { x: (x - k.x) * k.skala, y: (y - k.y) * k.skala }; },
  keDunia(px, py) { const k = G.kamera; return { x: px / k.skala + k.x, y: py / k.skala + k.y }; },

  gambar() {
    const k = G.kamera, a = G.aku;
    ktx.setTransform(1, 0, 0, 1, 0, 0);
    ktx.fillStyle = G.adegan === 'kantor' ? '#11151f' : '#274b2a';
    ktx.fillRect(0, 0, kanvas.width, kanvas.height);
    if (!a) return;
    this.kamera();
    ktx.setTransform(k.skala, 0, 0, k.skala, -Math.round(k.x * k.skala), -Math.round(k.y * k.skala));
    const semua = [a, ...G.entitas.values()].filter(e => e.jenis !== 'npc' || G.adegan === 'kantor');
    Rumah.gambar(ktx, semua);
    this.gambarApung();
    ktx.setTransform(1, 0, 0, 1, 0, 0);
    this.gambarLabel(semua);
  },

  gambarApung() {
    const kini = performance.now();
    ktx.font = 'bold 7px Inter, sans-serif'; ktx.textAlign = 'center';
    for (let i = apungan.length - 1; i >= 0; i--) {
      const p = apungan[i], umur = (kini - p.lahir) / 1400;
      if (umur >= 1) { apungan.splice(i, 1); continue; }
      ktx.globalAlpha = 1 - umur;
      ktx.fillStyle = '#0b1220'; ktx.fillText(p.teks, p.x + 0.5, p.y - umur * 14 + 0.5);
      ktx.fillStyle = p.warna; ktx.fillText(p.teks, p.x, p.y - umur * 14);
    }
    ktx.globalAlpha = 1;
  },

  // Nama & gelembung obrolan digambar di ruang layar supaya hurufnya tajam di skala berapa pun.
  gambarLabel(semua) {
    const kini = performance.now();
    ktx.textAlign = 'center'; ktx.textBaseline = 'middle';
    for (const e of semua) {
      const p = this.keLayar(e.x + 8, e.y - 3);
      if (e !== G.aku || e.gelembung) {
        ktx.font = '600 11px Inter, sans-serif';
        const teks = e.nama + (e.jenis === 'pemain' && e.level ? ' · Lv ' + e.level : ''), w = ktx.measureText(teks).width + 10;
        ktx.fillStyle = e.jenis === 'npc' ? 'rgba(71,45,20,.82)' : 'rgba(11,18,32,.78)';
        ktx.fillRect(Math.round(p.x - w / 2), Math.round(p.y - 8), Math.round(w), 15);
        ktx.fillStyle = e.jenis === 'npc' ? '#fde68a' : '#f8fafc';
        ktx.fillText(teks, Math.round(p.x), Math.round(p.y));
      }
      const g = e.gelembung;
      if (g && g.sampai > kini) {
        ktx.font = '500 12px Inter, sans-serif';
        const baris = bungkusTeks(ktx, g.teks, 190), tinggi = baris.length * 15 + 8;
        const lebar = Math.max(...baris.map(b => ktx.measureText(b).width)) + 14;
        const x0 = Math.round(p.x - lebar / 2), y0 = Math.round(p.y - 14 - tinggi);
        ktx.fillStyle = '#fffdf5'; ktx.strokeStyle = '#3b2a1a'; ktx.lineWidth = 2;
        ktx.fillRect(x0, y0, lebar, tinggi); ktx.strokeRect(x0, y0, lebar, tinggi);
        ktx.fillStyle = '#1f2937';
        baris.forEach((b, i) => ktx.fillText(b, Math.round(p.x), y0 + 11 + i * 15));
      } else if (g) e.gelembung = null;
    }
  },
};

function bungkusTeks(k, teks, lebar) {
  const hasil = [];
  let baris = '';
  for (const kata of String(teks).split(' ')) {
    const coba = baris ? baris + ' ' + kata : kata;
    if (baris && k.measureText(coba).width > lebar) { hasil.push(baris); baris = kata; }
    else baris = coba;
  }
  if (baris) hasil.push(baris);
  return hasil.slice(0, 5);
}

/* ---------- jaringan (satu WebSocket) ---------- */

const Jaring = {
  ws: null, jeda: 1000, tersambung: false,

  sambung() {
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    this.ws = ws;
    ws.onopen = () => { this.jeda = 1000; };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.terima(m); };
    ws.onclose = (ev) => {
      this.tersambung = false;
      Hud.sambungan(false);
      if (this.diganti || ev.code === 4401) return;
      setTimeout(() => this.sambung(), this.jeda);
      this.jeda = Math.min(15000, this.jeda * 1.7);
    };
  },
  kirim(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },

  terima(m) {
    switch (m.t) {
      case 'halo':
        this.tersambung = true; Hud.sambungan(true);
        for (const [id, e] of G.entitas) if (e.jenis === 'pemain') G.entitas.delete(id);
        Npc.pasang(m.npc || []);
        G.titik = m.titik || []; if (m.atur) G.atur = m.atur;
        if (m.peta) { if (Rumah.menyunting) Sunting.dariLuar(m.peta); else { G.peta = m.peta; if (G.adegan === 'kantor') Rumah.segarkan(); } }
        Mesin.segarkanTitik();
        for (const p of m.pemain) this.tambahPemain(p);
        if (!this.pernahHalo) { this.pernahHalo = true; for (const r of m.riwayat || []) Obrolan.catat(r.nama, r.teks, 'lama', 'semua'); }
        // Sambung ulang: server memulai dari adegan tersimpan; kabarkan adegan yang sedang tampil.
        if (m.saya.adegan !== G.adegan) this.kirim({ t: 'adegan', adegan: G.adegan, x: G.aku.x, y: G.aku.y });
        break;
      case 'adegan':
        for (const [id, e] of G.entitas) if (e.jenis === 'pemain') G.entitas.delete(id);
        for (const p of m.pemain) this.tambahPemain(p);
        break;
      case 'masuk': this.tambahPemain(m.pemain); if (m.pemain.adegan === G.adegan) Obrolan.catat('', m.pemain.nama + ' datang.', 'sistem'); break;
      case 'keluar': G.entitas.delete('p:' + m.id); break;
      case 'pos': {
        const e = G.entitas.get('p:' + m.id);
        if (e) { e.tx = m.x; e.ty = m.y; e.arah = m.arah; e.jalan = m.jalan; e.pose = m.pose || ''; }
        break;
      }
      case 'obrol': {
        const e = m.id === G.saya.id ? G.aku : G.entitas.get('p:' + m.id);
        if (m.saluran === 'bisik') { Obrolan.bisikMasuk(m); break; }
        if (e) e.gelembung = { teks: m.teks, sampai: performance.now() + 5500 };
        Obrolan.catat(m.nama, m.teks, m.id === G.saya.id ? 'saya' : '', m.saluran);
        break;
      }
      case 'emot': { const e = m.id === G.saya.id ? G.aku : G.entitas.get('p:' + m.id); if (e) e.emot = { n: m.n, sampai: performance.now() + 2600 }; break; }
      case 'tos': for (const id of [m.a, m.b]) { const e = id === G.saya.id ? G.aku : G.entitas.get('p:' + id); if (e) e.emot = { n: 'hati', sampai: performance.now() + 2200 }; } break;
      case 'rupa': { const e = G.entitas.get('p:' + m.id); if (e) gantiTampilan(e, m.nama, m.tampilan); break; }
      case 'dunia': Npc.pasang(m.npc || []); G.titik = m.titik || []; G.atur = m.atur || G.atur; Mesin.segarkanTitik(); break;
      case 'level': aturKoin(m.saldo); aturLevel(m.level, m.naik); break;
      case 'naik': { const e = G.entitas.get('p:' + m.id); if (e) { e.level = m.level; e.emot = { n: 'kilau', sampai: performance.now() + 3000 }; } Obrolan.catat('', m.nama + ' naik ke level ' + m.level + '!', 'sistem'); break; }
      case 'kiriman': aturKoin(m.saldo); kabar(m.dari + ' mengirim ' + m.koin + ' koin untukmu.', 'hadiah'); break;
      case 'umum': kabar('Pengumuman: ' + m.teks, 'hadiah'); Obrolan.catat('Admin', m.teks, 'npc', 'semua'); break;
      case 'info': kabar(m.teks, 'galat'); break;
      case 'sistem': Obrolan.catat('Info', m.teks, 'umum', 'semua'); break;
      case 'peta': if (Rumah.menyunting) { Sunting.dariLuar(m.peta); break; }      // draf penyunting tidak ditimpa siaran
        G.peta = m.peta; if (G.adegan === 'kantor') { Rumah.segarkan(); if (!kakiBebas(G.aku.x, G.aku.y)) Object.assign(G.aku, titikBebas(G.aku.x, G.aku.y)); } break;
      case 'ditendang': this.diganti = true; Hud.terputus(m.alasan); break;
      case 'suit_ajak': case 'suit_tunggu': case 'suit_mulai': case 'suit_hasil': case 'suit_batal': Sosial.suit(m); break;
      case 'hadiah':
        kabar('Misi tuntas: ' + m.judul + ' (+' + m.koin + ' koin)', 'hadiah');
        aturKoin(m.saldo);
        api('/api/saya').then(d => { G.misi = d.misi; document.dispatchEvent(new CustomEvent('kevi:segar')); }).catch(() => {});
        break;
      case 'term': Terminal.tulis(m.baris, m.kelas); break;
      case 'term_bersih': Terminal.bersih(); break;
      case 'term_selesai': Terminal.selesai(); break;
      case 'ganti_tab': this.diganti = true; Hud.terputus('Kevi dibuka di tab lain. Tab ini berhenti.'); break;
    }
  },

  tambahPemain(p) {
    if (p.id === G.saya.id || p.adegan !== G.adegan) return;
    const e = buatEntitas('p' + p.id, 'pemain', p);
    e.id = p.id; e.look = penampilan({ session_id: 'kevi-' + p.id, nama: p.nama, tampilan: p.tampilan || {} });
    e.jalan = !!p.jalan; e.level = p.level || 0;
    G.entitas.set('p:' + p.id, e);
  },
};

/* ---------- NPC ---------- */

const Npc = {
  // Samakan NPC di layar dengan daftar dari server (admin bisa menambah, menggeser, atau menghapus kapan saja).
  pasang(daftar) {
    const ada = new Set(daftar.map(n => 'npc:' + n.id));
    for (const [id, e] of G.entitas) if (e.jenis === 'npc' && !ada.has(id)) G.entitas.delete(id);
    for (const n of daftar) {
      const lama = G.entitas.get('npc:' + n.id), baru = this.buat(n);
      if (lama) baru.giliran = lama.giliran;
      G.entitas.set('npc:' + n.id, baru);
    }
  },
  buat(n) {
    const e = buatEntitas(n.id, 'npc', n);
    e.look = penampilan({ session_id: 'kevi-npc-' + n.id, nama: n.nama, tampilan: n.tampilan || {} });
    if (G.adegan === 'kantor') Object.assign(e, titikBebas(n.x, n.y));
    e.giliran = 0;
    return e;
  },
  // Kegiatan idle seperti Agent Pak: tiap ~9 detik NPC memilih antara berjalan ke titik dekat tempatnya atau berhenti
  // dengan pose santai (cek HP, lihat jam, baca, kopi, meregang). Pilihan diturunkan dari jam dan id NPC, jadi semua
  // pemain melihat hal yang kurang lebih sama tanpa perlu disiarkan server.
  POSE_IDLE: ['', '', 'cek_hp', 'lihat_jam', 'baca', 'kopi', 'peregangan', 'garuk', 'main_hp', 'santai'],
  hidup(e, dt) {
    const kini = performance.now();
    if (e.diamSampai > kini) { e.jalan = false; e.pose = ''; return; }                 // sedang diajak bicara
    const d = e.data, babak = Math.floor(Date.now() / 9000) + (hashTeks(d.id) % 7);
    if (e.babak !== babak) {
      e.babak = babak;
      const acak = prng(hashTeks(d.id + ':' + babak));
      if (acak() < 0.45) { e.tuju = { x: (e.rumahX ?? e.x) + Math.round((acak() - 0.5) * 72), y: (e.rumahY ?? e.y) + Math.round((acak() - 0.5) * 56) }; e.poseIdle = ''; }
      else { e.tuju = null; e.poseIdle = this.POSE_IDLE[Math.floor(acak() * this.POSE_IDLE.length)]; e.arah = e.poseIdle ? e.arah : d.arah || 'bawah'; }
    }
    if (e.rumahX === undefined) { e.rumahX = e.x; e.rumahY = e.y; }
    if (e.tuju) {
      const jx = e.tuju.x - e.x, jy = e.tuju.y - e.y, jarak = Math.hypot(jx, jy);
      if (jarak < 1.5) { e.tuju = null; e.jalan = false; e.langkah = 0; return; }
      const langkah = Math.min(jarak, 30 * dt), nx = e.x + jx / jarak * langkah, ny = e.y + jy / jarak * langkah;
      const simpan = G.grid;
      if (kakiBebas(nx, ny)) { e.x = nx; e.y = ny; e.jalan = true; e.pose = ''; e.langkah += dt * 6; e.arah = Math.abs(jx) > Math.abs(jy) ? (jx < 0 ? 'kiri' : 'kanan') : (jy < 0 ? 'atas' : 'bawah'); }
      else { e.tuju = null; e.jalan = false; }
      G.grid = simpan;
    } else { e.jalan = false; e.pose = e.poseIdle && atlas['tokoh_' + e.poseIdle] ? e.poseIdle : ''; }
  },
  bicara(e) {
    e.diamSampai = performance.now() + 7000; e.pose = ''; e.jalan = false;
    const d = e.data, a = G.aku;
    e.arah = Math.abs(a.x - e.x) > Math.abs(a.y - e.y) ? (a.x < e.x ? 'kiri' : 'kanan') : (a.y < e.y ? 'atas' : 'bawah');
    const teks = d.ucap[e.giliran % d.ucap.length];
    e.giliran++;
    e.gelembung = { teks, sampai: performance.now() + 5200 };
    Obrolan.catat(e.nama + ' (' + e.jabatan + ')', teks, 'npc');
    Jaring.kirim({ t: 'sapa', siapa: 'npc:' + d.id });
    if (d.peran === 'toko') Toko.buka();
    else if (d.peran === 'misi') Panel.misi();
    else if (d.peran === 'kuis') Kuis.tawarkan(e);
    else if (d.peran === 'kopi') Sosial.kopi(e);
    else if (d.peran === 'pulang' && e.giliran > 1) Mesin.pindah('rumah:' + G.saya.id);
  },
};
