/* Kevi — benda yang "hidup" di peta: kursi meja kerja, hewan, dan kendaraan.
 * Aturannya mengikuti Agent Pak (tabel kursi meja di kantor.js, hewan.js, kendaraan.js) dan disederhanakan: gerak hewan
 * dan kendaraan dihitung di tiap peramban dan tidak disiarkan, jadi tiap pemain melihat posisinya sendiri-sendiri.
 */
'use strict';

// Kursi meja kerja: [pola nama, pembuat daftar [dx, dy, hadap]]. Titik = pojok kiri-atas tokoh, relatif pojok kiri-atas
// meja. hadap 'atas' = duduk di bawah meja membelakangi layar; 'bawah' = di balik meja menghadap layar.
const KURSI_MEJA = [
  [/^meja_L_balik/, () => [[26, 14, 'atas']]],
  [/^meja_(L|mati|nyala)/, () => [[8, 14, 'atas']]],
  [/^meja_(lurus|kaca$)/, () => [[8, 10, 'atas']]],
  [/^meja_ganda/, () => [[8, -2, 'bawah'], [8, 33, 'atas']]],
  [/^meja_bos/, () => [[16, 7, 'bawah']]],
  [/^meja_direktur/, () => [[16, 12, 'atas']]],
  [/^meja_hadap4/, () => [[8, -2, 'bawah'], [40, -2, 'bawah'], [8, 33, 'atas'], [40, 33, 'atas']]],
  [/^meja_jejer(\d)/, (m) => Array.from({ length: Number(m[1]) }, (_, i) => [8 + 32 * i, 10, 'atas'])],
];
// jenis: [laju px/dtk, jeda min, jeda maks (dtk), hidup di air, bingkai/dtk saat jalan, saat diam]
const HEWAN_LAKU = {
  koi: [10, 2, 6, 1, 4, 2], bebek: [8, 3, 8, 1, 3, 4], kura: [4, 4, 10, 1, 2, 1], angsa: [6, 3, 9, 1, 3, 2],
  kucing: [12, 4, 12, 0, 6, 3], ayam: [10, 2, 5, 0, 6, 3], kelinci: [16, 3, 8, 0, 5, 2], anjing: [14, 3, 9, 0, 6, 3], itik: [8, 3, 8, 0, 5, 3],
  kambing: [8, 4, 12, 0, 4, 1], merpati: [10, 2, 5, 0, 6, 3], sapi: [5, 6, 16, 0, 3, 1],
};
const HEWAN_MAKAN = { ayam: 'patuk', itik: 'patuk', kambing: 'makan', sapi: 'makan' };      // hewan kandang yang kenyang, selagi diam
const UBIN_AIR = /^(lantai_luar_air|lantai_pantai_laut|lantai_pantai_air_dangkal)/;
// jenis: [laju px/dtk, parkir min, parkir maks (dtk), bingkai/dtk]
const KENDARAAN_LAKU = {
  angkot: [42, 3, 10, 8], bajaj: [36, 4, 12, 8], becak: [18, 6, 16, 4], citycar: [50, 5, 14, 8], motor: [64, 3, 9, 12],
  pickup: [46, 5, 14, 8], sedan: [56, 5, 14, 10], suv: [54, 5, 14, 10], traktor: [16, 8, 20, 4], truk_boks: [38, 8, 20, 6],
};
const UBIN_JALAN = /^(lantai_kota_aspal|lantai_luar_jalan_tanah|lantai_alam_tanah_retak|lantai_alam_kerikil)/;
const ARAH_KENDARA = [['kanan', 1, 0], ['bawah', 0, 1], ['kiri', -1, 0], ['atas', 0, -1]];
const POLA_KENDARAAN = /^kendaraan_(.+)_diam$/;

Object.assign(Rumah, {
  mobil: new Map(),
  kursiMejaSemua: [],

  // Motif lantai di satu ubin dunia (ubin ruang ikut dihitung); '' bila tidak diketahui (peta Default terpanggang).
  lantaiDi(gx, gy) {
    const d = this.d;
    if (!d) return '';
    return (this.efLantai || {})[gx + ',' + (gy - (this.kantor ? 0 : JALUR_ATAS))] || (this.kantor && !this.dasarDefault ? d.lantai_dasar || '' : '');
  },
  ubinAir(gx, gy) { return UBIN_AIR.test(this.lantaiDi(gx, gy)); },
  jalanDi(gx, gy) { return UBIN_JALAN.test(this.lantaiDi(gx, gy)) && !(G.grid && gridPadat(G.grid, gx, gy)); },

  /* ---------- kursi meja kerja ---------- */

  // Tempat duduk sebuah meja yang ditaruh. Meja tak bertabel atau yang diputar memakai satu kursi di sisi depannya.
  kursiMeja(b) {
    const o = b.o;
    if (!/^meja_/.test(o.n) || /^meja_kerja_berdiri/.test(o.n)) return [];
    let titik = null;
    if (!o.r) for (const [pola, buat] of KURSI_MEJA) { const m = pola.exec(o.n); if (m) { titik = buat(m); break; } }
    if (!titik) {
      const tengah = Math.round((b.h - 20) / 2);
      titik = o.r === 2 ? [[Math.round(b.w / 2) - 8, -2, 'bawah']] : o.r === 1 ? [[b.w - 2, tengah, 'kiri']] : o.r === 3 ? [[-14, tengah, 'kanan']] : [[Math.round(b.w / 2) - 8, b.h - 14, 'atas']];
    }
    return titik.map(([dx, dy, hadap]) => ({ x: o.x + dx - 8, y: b.y + dy - 14, hadap, alas: b.alas }));
  },
  // Kursi kosong terdekat dari pemain; null bila semuanya sedang diduduki rekan.
  kursiTerdekat(daftar) {
    const a = G.aku, dipakai = (s) => [...G.entitas.values()].some(e => e.jenis === 'pemain' && Math.abs(e.x - s.x - 8) <= 2 && Math.abs(e.y - s.y - 14) <= 2);
    return daftar.filter(s => !dipakai(s)).sort((p, q) => Math.hypot(p.x + 8 - a.x, p.y + 14 - a.y) - Math.hypot(q.x + 8 - a.x, q.y + 14 - a.y))[0] || null;
  },
  bukaKomputerMeja(daftar) {
    const s = this.kursiTerdekat(daftar);
    if (s) Mesin.duduk(s); else Terminal.buka('rak');
  },

  /* ---------- hewan ---------- */

  // Hewan berjalan-jalan kecil di dalam `kotak`. Hewan air hanya di ubin air (di darat ia diam di tempatnya);
  // hewan darat tidak masuk air dan tidak menembus penghalang. o = { rumah: {x, y}, kandang, kenyang, urut }.
  jelajah(kunci, j, kotak, t, o = {}) {
    const L = HEWAN_LAKU[j] || [10, 3, 8, 0, 5, 3], air = !!L[3] && !o.kandang, laju = L[0] * (air ? 1 : 1.8), dasar = 'hewan_' + j + '_';
    const maksX = Mesin.dunia.w - 14, maksY = Mesin.dunia.h - 14;
    const boleh = (x, y) => {
      const gx = Math.floor((x + 8) / T), gy = Math.floor((y + 10) / T);
      return air ? this.ubinAir(gx, gy) : !(G.grid && gridPadat(G.grid, gx, gy)) && !this.ubinAir(gx, gy);
    };
    const acak = () => ({ x: Math.max(2, Math.min(maksX, kotak.x + Math.random() * kotak.w)), y: Math.max(2, Math.min(maksY, kotak.y + Math.random() * kotak.h)) });
    let s = this.hewan.get(kunci);
    if (!s) {
      if (this.hewan.size > 600) this.hewan.clear();
      s = Object.assign(air && o.rumah ? { x: o.rumah.x, y: o.rumah.y } : acak(), { arah: 'bawah', jalan: false, sampai: t + Math.random() * 3, t });
      for (let c = 0; c < 6 && !air && !boleh(s.x, s.y); c++) Object.assign(s, acak());
      s.tx = s.x; s.ty = s.y;
      this.hewan.set(kunci, s);
    }
    const dt = Math.min(0.1, Math.max(0, t - s.t));
    s.t = t;
    if (this.diamSaja) return { x: Math.round(s.x), y: Math.round(s.y), n: dasar + 'diam' };
    const istirahat = () => { s.jalan = false; s.sampai = t + L[1] + Math.random() * (L[2] - L[1]); };
    if (s.jalan) {
      const dx = s.tx - s.x, dy = s.ty - s.y, jarak = Math.hypot(dx, dy), langkah = laju * dt;
      if (jarak <= langkah) { s.x = s.tx; s.y = s.ty; istirahat(); }
      else {
        const nx = s.x + dx / jarak * langkah, ny = s.y + dy / jarak * langkah;
        if (!boleh(nx, ny) && boleh(s.x, s.y)) istirahat();          // terhalang di tengah jalan: berhenti di sini
        else { s.x = nx; s.y = ny; s.arah = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'kiri' : 'kanan') : (dy < 0 ? 'atas' : 'bawah'); }
      }
    } else if (t >= s.sampai) {
      for (let c = 0; c < 12 && !s.jalan; c++) {
        const p = acak();
        if (boleh(p.x, p.y)) { s.tx = p.x; s.ty = p.y; s.jalan = true; }
      }
      if (!s.jalan) s.sampai = t + 3;
    }
    const makan = !s.jalan && o.kandang && o.kenyang && HEWAN_MAKAN[j] && (Math.floor(t / 4.2) + (o.urut || 0)) % 3 === 0 && atlas[dasar + HEWAN_MAKAN[j]];
    const n = s.jalan && atlas[dasar + s.arah] ? dasar + s.arah : makan ? dasar + HEWAN_MAKAN[j] : dasar + 'diam';
    return { x: Math.round(s.x), y: Math.round(s.y), n: bingkaiHidup(n, t, s.jalan ? L[4] : makan ? 3 : L[5]) };
  },

  /* ---------- kendaraan ---------- */

  // Kendaraan yang disetel "Bergerak" menyusuri ubin jalan dari tempat parkirnya: lurus selama bisa, sesekali berbelok
  // di persimpangan, berhenti sebentar lalu berbalik di jalan buntu, dan sesekali parkir lagi saat melewati rumahnya.
  // Mengembalikan { n, x, y, alas } untuk digambar. Tanpa ubin jalan di bawahnya, kendaraan tetap diam.
  kendara(o, b, t) {
    const jenis = POLA_KENDARAAN.exec(o.n)[1], L = KENDARAAN_LAKU[jenis] || [40, 5, 14, 8];
    const parkir = { n: o.r ? namaPutar(o.n, o.r) : o.n, x: o.x, y: b.y, alas: b.alas };
    if (this.adeganMobil !== G.adegan) { this.adeganMobil = G.adegan; this.mobil.clear(); }
    let s = this.mobil.get(o.id);
    if (!s || s.ox !== o.x || s.oy !== b.y) {                 // baru, atau bendanya dipindah: mulai dari tempat parkir
      const gy = Math.floor((b.y + b.h - 1) / T), lajur = [];
      for (let gx = Math.floor(o.x / T); gx <= Math.floor((o.x + b.w - 1) / T); gx++) if (this.jalanDi(gx, gy)) lajur.push(gx);
      s = { ox: o.x, oy: b.y, rumah: lajur.length ? { gx: lajur[lajur.length >> 1], gy } : null, diRumah: true, jalan: false, sabar: 0, tempuh: 0, t,
        sampai: t + (0.5 + Math.random() * 0.5) * L[1] };
      this.mobil.set(o.id, s);
    }
    const dt = Math.min(0.1, Math.max(0, t - s.t));
    s.t = t;
    if (!s.rumah || this.diamSaja) return parkir;
    if (s.diRumah) {
      if (t < s.sampai) return parkir;
      s.gx = s.rumah.gx; s.gy = s.rumah.gy; s.x = s.gx * T + 8; s.y = s.gy * T + T;
      const awal = o.r === 3 ? 2 : 0, a = [awal, (awal + 2) % 4, 1, 3].find(i => this.jalanDi(s.gx + ARAH_KENDARA[i][1], s.gy + ARAH_KENDARA[i][2]));
      if (a == null) { s.sampai = t + 2; return parkir; }
      Object.assign(s, { a, diRumah: false, tempuh: 0, jalan: false, buntu: false, sampai: t });
    }
    if (!s.jalan && t >= s.sampai) this.putusKendara(o.id, s, t);
    if (s.jalan) {
      const tx = s.ngx * T + 8, ty = s.ngy * T + T, dx = tx - s.x, dy = ty - s.y, jarak = Math.hypot(dx, dy), langkah = L[0] * dt;
      if (jarak > langkah) { s.x += dx / jarak * langkah; s.y += dy / jarak * langkah; }
      else {
        Object.assign(s, { x: tx, y: ty, gx: s.ngx, gy: s.ngy, jalan: false, sampai: t });
        s.tempuh += 1;
        if (s.gx === s.rumah.gx && s.gy === s.rumah.gy && s.tempuh >= 12 && Math.random() < 0.35) { s.diRumah = true; s.sampai = t + L[1] + Math.random() * (L[2] - L[1]); return parkir; }
        this.putusKendara(o.id, s, t);                         // langsung lanjut, tanpa tersendat satu bingkai tiap ubin
      }
    }
    const dasar = 'kendaraan_' + jenis + '_' + ARAH_KENDARA[s.a][0], n = s.jalan ? bingkaiHidup(dasar, t, L[3]) : dasar, u = ukuranSprite(n);
    return { n, x: Math.round(s.x - u.w / 2), y: Math.round(s.y - u.h), alas: s.y };
  },
  // Di tengah ubin: pilih ubin berikutnya (aturan lalu lintas ringkas Agent Pak).
  putusKendara(id, s, t) {
    const ke = (i) => [s.gx + ARAH_KENDARA[i][1], s.gy + ARAH_KENDARA[i][2]], bisa = (i) => this.jalanDi(...ke(i));
    // Cabang = jalan ke samping yang panjang (4 ubin atau lebih); lajur sebelah di jalan lebar bukan cabang.
    const cabang = (i) => { let n = 0; while (n < 8 && this.jalanDi(s.gx + ARAH_KENDARA[i][1] * (n + 1), s.gy + ARAH_KENDARA[i][2] * (n + 1))) n++; return n >= 4; };
    const pilih = (d) => d[Math.floor(Math.random() * d.length)], balik = (s.a + 2) % 4, samping = [(s.a + 3) % 4, (s.a + 1) % 4];
    let a;
    if (bisa(s.a)) { const c = samping.filter(cabang); a = c.length && Math.random() < 0.22 ? pilih(c) : s.a; }
    else if (samping.some(bisa)) a = pilih(samping.filter(bisa));
    else if (!s.buntu) { s.buntu = true; s.sampai = t + 0.6 + Math.random() * 0.8; return; }      // jalan buntu: berhenti sebentar dulu
    else if (!bisa(balik)) { s.sampai = t + 2; return; }
    else a = balik;
    s.buntu = false;
    // Jangan menabrak kendaraan lain: tunggu; sesudah sepuluh kali menunggu, berbalik arah.
    const dihalang = ([gx, gy]) => { for (const [lain, q] of this.mobil) if (lain !== id && !q.diRumah && ((q.gx === gx && q.gy === gy) || (q.jalan && q.ngx === gx && q.ngy === gy))) return true; return false; };
    if (dihalang(ke(a))) {
      s.sabar += 1;
      if (s.sabar <= 10 || !bisa(balik) || dihalang(ke(balik))) { s.sampai = t + 0.4; return; }
      a = balik;
    }
    const [ngx, ngy] = ke(a);
    Object.assign(s, { a, ngx, ngy, jalan: true, sabar: 0 });
  },
});
