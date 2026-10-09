'use strict';
/* Agent Pak — Generate peta otomatis (prosedural, ala Minecraft versi 2D).
 *
 * Satu angka seed = satu dunia: seed yang sama selalu menghasilkan denah yang
 * PERSIS sama (PRNG mulberry32 + noise nilai berlapis buatan sendiri, tanpa
 * Math.random, tanpa CDN). Medan dibentuk dari tiga peta noise — ketinggian,
 * kelembapan, suhu — lalu dipetakan ke bioma:
 *   ketinggian rendah  -> laut/danau (air bergerak) + tepi pasir
 *   ketinggian tinggi  -> dataran tebing berundak (tebing_* dirakit sesuai aturan
 *                         penyambungan tools/lk_tebing.py) + tangga batu
 *   lembap             -> hutan (semak di tepinya), kering+panas -> gurun, sisanya padang
 *   kota               -> grid jalan aspal + trotoar + kavling rumah/taman/kantor
 * Sungai menuruni gradien ketinggian sampai laut/tepi peta; jalan setapak
 * menyambungkan pintu utama, kantor, kota, dan tangga tebing (jembatan kayu
 * bila menyeberang air).
 * 0.78 — "Perumahan": kompleks berpola tetap (jalan masuk + gapura RT, gang berderet rumah, pos ronda, warung,
 *   taman kecil, lampu gang; lihat susunPerumahan). Hanya dipakai bila dipilih; jenis lain & Acak tidak berubah.
 * "Jenis" (Alam, Perbukitan, Kota, Taman kota, Pantai, Acak) hanya menggeser
 * bobot/ambang bioma & parameter noise, bukan templat tetap.
 *
 * Hasil = denah custom biasa (skema app/denahcustom.py) yang masuk ke Edit
 * Layout sebagai perubahan BELUM TERSIMPAN (bisa Urungkan, lalu Simpan).
 * Dihitung sekali saat tombol Buat ditekan, bukan per bingkai.
 */
const GeneratorPeta = (() => {
  const T = 16;
  const ANGGARAN_OPS = 2950;                     // batas server 3000 ops per lantai
  const UKURAN = { kecil: [40, 28], sedang: [64, 40], besar: [96, 60] };
  const KEPADATAN = { jarang: 0.55, sedang: 1, lebat: 1.6 };

  /* ---------- acak berbenih ---------- */
  function mulberry32(a) {
    a >>>= 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Seed boleh diketik bebas: angka 0..4294967295 dipakai apa adanya, teks lain di-hash (FNV-1a).
  function normalBenih(v) {
    const s = String(v == null ? '' : v).trim();
    if (/^\d{1,10}$/.test(s) && Number(s) <= 4294967295) return Number(s);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function benihAcak() {
    const c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] : 0;
    return (c ^ Math.floor(Math.random() * 4294967296)) >>> 0;
  }

  /* ---------- noise nilai berlapis (fBm) ---------- */
  function hash2(ix, iy, s) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function noise(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, okt) {
    let t = 0, amp = 1, f = 1, n = 0;
    for (let i = 0; i < okt; i++) { t += amp * noise(x * f, y * f, (s + i * 1013) | 0); n += amp; amp *= 0.5; f *= 2.03; }
    return t / n;
  }
  // Satu peta noise W x H, dinormalkan ke 0..1 (min-maks) supaya ambang = kuantil yang stabil.
  function medan(W, H, s, skala, okt) {
    const a = new Float32Array(W * H);
    const ox = hash2(s, 7, 3) * 1000, oy = hash2(s, 11, 5) * 1000;
    let lo = Infinity, hi = -Infinity;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = fbm(ox + x * skala, oy + y * skala, s, okt);
      a[y * W + x] = v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    const r = hi - lo || 1;
    for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / r;
    return a;
  }
  function kuantil(arr, q, pakai) {
    const v = [];
    for (let i = 0; i < arr.length; i++) if (!pakai || pakai(i)) v.push(arr[i]);
    if (!v.length) return 1;
    v.sort((a, b) => a - b);
    return v[Math.max(0, Math.min(v.length - 1, Math.floor(q * v.length)))];
  }

  /* ---------- jenis peta = bobot bioma, bukan templat ---------- */
  const JENIS = {
    alam: { nama: 'Alam', ikon: '🌲', ket: 'Hutan, padang, sungai & danau',
      skala: 0.075, laut: 0.13, bukit: 0.10, bukit2: 0.25, maksBukit: 3, lembap: 0.10, suhu: -0.05, gurun: 0.25,
      kota: 0, taman: 0, sungai: 2, pantai: 0, pasir: 1, hewan: 1, singgah: 3 },
    perbukitan: { nama: 'Perbukitan', ikon: '⛰️', ket: 'Tebing berundak, tangga batu, lembah',
      skala: 0.065, laut: 0.05, bukit: 0.6, bukit2: 0.5, maksBukit: 10, dinding: 2, lembap: 0.02, suhu: -0.12, gurun: 0.1,
      kota: 0, taman: 0, sungai: 1, pantai: 0, pasir: 1, hewan: 0.8, singgah: 2 },
    kota: { nama: 'Kota', ikon: '🏙️', ket: 'Grid jalan, trotoar, rumah & toko',
      skala: 0.06, laut: 0.06, bukit: 0.05, bukit2: 0.2, maksBukit: 2, lembap: -0.05, suhu: 0, gurun: 0.1,
      kota: 0.88, taman: 0.12, tamanAcak: 0.06, sungai: 0, pantai: 0, pasir: 1, hewan: 0.4, singgah: 0 },
    taman: { nama: 'Taman kota', ikon: '⛲', ket: 'Taman luas di tengah kota',
      skala: 0.06, laut: 0.05, bukit: 0.04, bukit2: 0.2, maksBukit: 1, lembap: 0.05, suhu: 0, gurun: 0.05,
      kota: 0.9, taman: 0.6, tamanAcak: 0.15, blok: 0.8, sungai: 0, pantai: 0, pasir: 1, hewan: 0.6, singgah: 0 },
    pantai: { nama: 'Pantai', ikon: '🏖️', ket: 'Laut bergerak, pasir, karang & kelapa',
      skala: 0.07, laut: 0.36, bukit: 0.08, bukit2: 0.25, maksBukit: 2, lembap: -0.04, suhu: 0.2, gurun: 0.4,
      kota: 0, taman: 0, sungai: 1, pantai: 1, pasir: 4, hewan: 0.7, singgah: 2 },
    // 0.78 — tanpa air/tebing/sungai: seluruh peta darat, kompleks disusun susunPerumahan (bukan grid kota).
    perumahan: { nama: 'Perumahan', ikon: '🏘️', ket: 'Gang kompleks, rumah berderet, pos ronda & warung',
      skala: 0.06, laut: 0, bukit: 0, bukit2: 0.2, maksBukit: 0, lembap: 0.02, suhu: 0, gurun: 0.05,
      kota: 0, taman: 0, sungai: 0, pantai: 0, pasir: 1, hewan: 0.5, singgah: 0, perumahan: 1 },
    acak: { nama: 'Acak', ikon: '🎲', ket: 'Campuran bobot dari seed' },
  };
  const DASAR = ['alam', 'perbukitan', 'kota', 'taman', 'pantai'];
  // 0.77 — tempat kerja bertema yang letaknya menuntut medan tertentu ditaruh di luar kompleks (pasangTk).
  const LETAK_KHUSUS = new Set(['tepi_air', 'pasir_dekat_air', 'tepi_hutan']);
  function presetUntuk(jenis, rng) {
    if (jenis !== 'acak' && JENIS[jenis]) return { ...JENIS[jenis] };
    // Acak: campur dua jenis dasar dengan bobot dari seed (angka diinterpolasi, sisanya dipilih).
    const a = JENIS[DASAR[Math.floor(rng() * 5)]], b = JENIS[DASAR[Math.floor(rng() * 5)]], t = rng();
    const p = {};
    for (const k of Object.keys(a)) p[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * t : (t < 0.5 ? a[k] : b[k]);
    p.maksBukit = Math.round(p.maksBukit); p.sungai = Math.round(p.sungai); p.pasir = Math.max(1, Math.round(p.pasir));
    p.pantai = p.pantai > 0.5 ? 1 : 0;
    if (p.kota < 0.45) p.kota = 0;
    return p;
  }

  // Kode sel
  const DARAT = 0, LAUT = 1, DANAU = 2, SUNGAI = 3, PASIR = 4, SETAPAK = 5, JEMBATAN = 6, TEBING = 7,
    JALAN = 8, TROTOAR = 9, LOT = 10, KANTOR = 11, CADANG = 12;
  const AIR = (k) => k === LAUT || k === DANAU || k === SUNGAI;

  // Persegi terbesar di dalam topeng (histogram + tumpukan), dijepit ke batas lebar/tinggi.
  function persegiTerbesar(mask, W, H, capW, capH) {
    const hg = new Int32Array(W);
    let best = null, skor = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) hg[x] = mask[y * W + x] ? hg[x] + 1 : 0;
      const st = [];
      for (let x = 0; x <= W; x++) {
        const cur = x < W ? hg[x] : 0;
        while (st.length && hg[st[st.length - 1]] >= cur) {
          const h = hg[st.pop()];
          const kiri = st.length ? st[st.length - 1] + 1 : 0, w = x - kiri;
          const s = Math.min(w, capW) * Math.min(h, capH);
          if (h && s > skor) { skor = s; best = { x: kiri, y: y - h + 1, w, h }; }
        }
        st.push(x);
      }
    }
    if (!best) return null;
    if (best.w > capW) { best.x += Math.floor((best.w - capW) / 2); best.w = capW; }
    if (best.h > capH) { best.y += Math.floor((best.h - capH) / 2); best.h = capH; }
    return best;
  }

  // Jarak BFS (4 arah) dari sel sumber; `lewat(i)` = boleh dilalui.
  function jarakBFS(W, H, sumber, lewat) {
    const d = new Int32Array(W * H).fill(1e9), q = new Int32Array(W * H);
    let ek = 0, ka = 0;
    for (let i = 0; i < W * H; i++) if (sumber(i)) { d[i] = 0; q[ek++] = i; }
    while (ka < ek) {
      const i = q[ka++], x = i % W, y = (i - x) / W;
      const tetangga = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of tetangga) if (j >= 0 && d[j] > d[i] + 1 && (!lewat || lewat(j))) { d[j] = d[i] + 1; q[ek++] = j; }
    }
    return d;
  }

  function ukuranAtlas(atlas, n) {
    const a = atlas && atlas[n];
    if (!a) return null;
    const p = a.pad || 0;
    return { w: a.w - 2 * p, h: a.h - 2 * p };
  }

  /* ======================================================================
   * buat(op) -> { denah, info }
   *   op.jenis, op.ukuran ('kecil'|'sedang'|'besar') atau op.lebar/op.tinggi,
   *   op.kepadatan, op.benih, op.atlas (nama sprite -> {w,h,pad}),
   *   op.kursi (divisi per kursi kantor lama), op.pertahankan (ops penghubung lantai), op.nama
   * ==================================================================== */
  function buat(op) {
    const mulai = (typeof performance !== 'undefined' ? performance : Date).now();
    const atlas = op.atlas || {};
    const ada = (n) => !!atlas[n];
    const benih = normalBenih(op.benih);
    const rng = mulberry32(benih ^ 0x5bd1e995);
    const P = presetUntuk(op.jenis || 'alam', rng);
    const [uw, uh] = UKURAN[op.ukuran] || UKURAN.sedang;
    const W = Math.max(12, Math.min(120, Math.round(op.lebar || uw)));
    const H = Math.max(12, Math.min(200, Math.round(op.tinggi || uh)));
    const N = W * H, id = (x, y) => y * W + x;
    const padat = KEPADATAN[op.kepadatan] || 1;
    const kecil = W * H < 1400;

    const e = medan(W, H, benih + 11, P.skala, 4);
    const m = medan(W, H, benih + 23, P.skala * 0.8, 3);
    const su = medan(W, H, benih + 37, P.skala * 0.5, 2);
    const detil = medan(W, H, benih + 51, 0.2, 2);
    const gerombol = medan(W, H, benih + 67, 0.14, 3);
    if (P.pantai) {                                // laut dari satu sisi peta, garis pantai tetap bergelombang
      const sisi = Math.floor(rng() * 4);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const g = [y / (H - 1), 1 - y / (H - 1), x / (W - 1), 1 - x / (W - 1)][sisi];
        e[id(x, y)] = e[id(x, y)] * 0.45 + 0.55 * g;
      }
    }

    const kode = new Uint8Array(N);
    const ubin = new Array(N).fill(null);
    const larang = new Uint8Array(N);              // sel yang tak boleh diberi hiasan acak
    const terisi = new Uint8Array(N);              // jejak benda (tak boleh tumpang tindih)
    const atasBukit = new Uint8Array(N);           // rumput di puncak dataran (boleh dihias)
    const ops = [], opsBenda = [], meja = [];

    /* ---- 1. air: ketinggian rendah ---- */
    const ambangAir = kuantil(e, P.laut);
    for (let i = 0; i < N; i++) if (e[i] < ambangAir) kode[i] = LAUT;
    // buang genangan kecil, pisahkan laut (menyentuh tepi) dari danau
    const komp = new Int32Array(N).fill(-1);
    for (let s = 0; s < N; s++) {
      if (kode[s] !== LAUT || komp[s] >= 0) continue;
      const tumpuk = [s], isi = []; komp[s] = s; let tepi = false;
      while (tumpuk.length) {
        const i = tumpuk.pop(), x = i % W, y = (i - x) / W; isi.push(i);
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) tepi = true;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1])
          if (j >= 0 && kode[j] === LAUT && komp[j] < 0) { komp[j] = s; tumpuk.push(j); }
      }
      const jadi = isi.length < 10 ? DARAT : tepi ? LAUT : DANAU;
      for (const i of isi) kode[i] = jadi;
    }
    let kotaPaksa = null;
    if (P.kota >= 0.6) {
      const kw = Math.round(W * P.kota), kh = Math.round(H * P.kota);
      const kx = Math.floor((W - kw) / 2 + (rng() - 0.5) * (W - kw) * 0.8), ky = Math.floor((H - kh) / 2 + (rng() - 0.5) * (H - kh) * 0.8);
      kotaPaksa = { x: Math.max(0, kx), y: Math.max(0, ky), w: kw, h: kh };
      for (let y = kotaPaksa.y - 3; y < kotaPaksa.y + kh + 3; y++) for (let x = kotaPaksa.x - 3; x < kotaPaksa.x + kw + 3; x++)
        if (x >= 0 && y >= 0 && x < W && y < H) kode[id(x, y)] = DARAT;
    }
    const jLaut = jarakBFS(W, H, (i) => kode[i] === LAUT);
    const jDanau = jarakBFS(W, H, (i) => kode[i] === DANAU);
    for (let i = 0; i < N; i++) if (kode[i] === DARAT && (jLaut[i] <= P.pasir || jDanau[i] <= 1)) kode[i] = PASIR;
    const jAir = jarakBFS(W, H, (i) => AIR(kode[i]));

    const tandai = (x, y, w, h, k, tile) => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = id(xx, yy);
        if (k != null) kode[i] = k;
        if (tile) ubin[i] = tile;
      }
    };

    /* ---- 2a. penghubung lantai lama (tangga/lift) dipertahankan di tempatnya (sejajar lantai lain) ---- */
    const simpul = [];
    for (const o of (op.pertahankan || [])) {
      const u = ukuranAtlas(atlas, o.n);
      if (!u || o.x == null) continue;
      const gx = Math.max(0, Math.floor(o.x / T) - 1), gy = Math.max(0, Math.floor(o.y / T) - 1);
      const gw = Math.ceil(u.w / T) + 2, gh = Math.ceil(u.h / T) + 2;
      tandai(gx, gy, gw, gh, CADANG, 'lantai_luar_paving');
      for (let yy = gy; yy < Math.min(H, gy + gh); yy++) for (let xx = gx; xx < Math.min(W, gx + gw); xx++) { larang[id(xx, yy)] = 1; terisi[id(xx, yy)] = 1; }
      opsBenda.push({ ...o });
      simpul.push(id(Math.min(W - 1, gx + 1), Math.min(H - 1, gy + gh - 1)));
    }

    /* ---- 2. kantor (meja pegawai tetap ada) ---- */
    const kursi = Array.isArray(op.kursi) ? op.kursi.slice(0, 120) : [];
    let kantor = null;
    // 0.77 — "Tempat kerja: Bertema": meja kantor diganti tempat kerja per divisi (lihat rencanakanTk). Bawaan
    // "Kantor" tak menyentuh jalur ini sama sekali (fixture lama identik; rng dunia tak ikut terpakai).
    const bertema = op.tempatKerja === 'bertema' && kursi.length > 0;
    // 0.78 — Perumahan bertema: tiap divisi mendapat RUMAH (isiPerumahan), bukan kompleks tempat kerja modul.
    const rencanaTk = bertema && !P.perumahan ? rencanakanTk() : null;
    if (rencanaTk) kantor = kompleksTk(rencanaTk);
    else if (kursi.length && !bertema) {
      // Meja hadap4 (4 kursi berhadapan, lebar 4 ubin): kantor ringkas, tak menelan peta.
      const nMeja = Math.ceil(kursi.length / 4), kol = Math.min(nMeja, nMeja > 4 ? 4 : 3), bar = Math.ceil(nMeja / kol);
      kantor = { w: 2 + kol * 6, h: 5 + bar * 6, kol, bar, nMeja };
      kantor.pintuPos = Math.floor(kantor.w / 2) - 1;
    }

    /* ---- 3. kota ---- */
    let kota = null;
    if (P.kota > 0) {
      const mask = new Uint8Array(N);
      for (let i = 0; i < N; i++) mask[i] = kode[i] === DARAT && jAir[i] > 2 ? 1 : 0;
      const r = persegiTerbesar(mask, W, H, Math.round(W * P.kota), Math.round(H * P.kota));
      if (kotaPaksa) kota = kotaPaksa;
      else if (r && r.w >= 18 && r.h >= 14) kota = r;
    }
    const lot = [];
    if (kota) susunKota();
    const rumahan = P.perumahan ? susunPerumahan() : null;      // 0.78

    /* ---- 4. kantor di luar kota (tempat datar terdekat ke tengah) ---- */
    if (kantor && !kantor.gx) {
      const w = kantor.w + 2, h = kantor.h + 3;
      const blok = new Int32Array((W + 1) * (H + 1));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = kode[id(x, y)], buruk = !(k === DARAT || k === PASIR) || jAir[id(x, y)] < 2 ? 1 : 0;
        blok[(y + 1) * (W + 1) + x + 1] = buruk + blok[y * (W + 1) + x + 1] + blok[(y + 1) * (W + 1) + x] - blok[y * (W + 1) + x];
      }
      let terbaik = null, dBaik = Infinity;
      for (let y = 1; y + h < H; y++) for (let x = 1; x + w < W; x++) {
        const s = blok[(y + h) * (W + 1) + x + w] - blok[y * (W + 1) + x + w] - blok[(y + h) * (W + 1) + x] + blok[y * (W + 1) + x];
        if (s) continue;
        const d = Math.abs(x + w / 2 - W / 2) + Math.abs(y + h / 2 - H * 0.55) + e[id(x + (w >> 1), y + (h >> 1))] * (W + H) * 0.35;
        if (d < dBaik) { dBaik = d; terbaik = { x, y }; }
      }
      if (terbaik) {
        kantor.gx = terbaik.x + 1; kantor.gy = terbaik.y + 1;
        tandai(terbaik.x, terbaik.y, w, h, CADANG, null);
        tandai(kantor.gx, kantor.gy, kantor.w, kantor.h, KANTOR, null);
      } else {
        // Tak ada tempat datar: paksa di tempat yang paling sedikit merusak (air/jalan di situ ditimpa) supaya meja
        // tetap punya ruang — tapi tangga/lift lantai lain (CADANG) tak pernah ditimpa.
        const rugi = new Float64Array((W + 1) * (H + 1));
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const k = kode[id(x, y)], c = k === CADANG ? 1e6 : k === DARAT || k === PASIR ? 0 : k === JALAN || k === TROTOAR || k === LOT ? 3 : 2;
          rugi[(y + 1) * (W + 1) + x + 1] = c + rugi[y * (W + 1) + x + 1] + rugi[(y + 1) * (W + 1) + x] - rugi[y * (W + 1) + x];
        }
        let pilih = [Math.max(1, Math.floor((W - kantor.w) / 2)), Math.max(1, Math.floor((H - kantor.h) / 2) - 1)], rB = Infinity;
        for (let y = 1; y + h < H; y++) for (let x = 1; x + w < W; x++) {
          const r = rugi[(y + h) * (W + 1) + x + w] - rugi[y * (W + 1) + x + w] - rugi[(y + h) * (W + 1) + x] + rugi[y * (W + 1) + x]
            + (Math.abs(x + w / 2 - W / 2) + Math.abs(y + h / 2 - H / 2)) * 0.01;
          if (r < rB) { rB = r; pilih = [x + 1, y + 1]; }
        }
        [kantor.gx, kantor.gy] = pilih;
        tandai(kantor.gx - 1, kantor.gy - 1, kantor.w + 2, kantor.h + 3, CADANG, 'lantai_luar_rumput');
        tandai(kantor.gx, kantor.gy, kantor.w, kantor.h, KANTOR, null);
      }
    }

    /* ---- 5. pintu utama di tepi bawah (atau atas) ---- */
    let pintu = null;
    {
      const sasaranX = rumahan ? rumahan.R + 1 : kantor && kantor.gx ? kantor.gx + kantor.pintuPos : Math.floor(W / 2);
      const bolehPintu = (k) => k === DARAT || k === PASIR || k === JALAN || k === CADANG;
      for (const [gy, sisi, bdiri] of [[H - 2, 'atas', H - 3], [0, 'bawah', 2]]) {
        let best = null, dB = Infinity;
        for (let gx = 1; gx <= W - 4; gx++) {
          let ok = bolehPintu(kode[id(gx + 1, bdiri)]);
          for (let yy = gy; yy < gy + 2 && ok; yy++) for (let xx = gx; xx < gx + 3; xx++) if (!bolehPintu(kode[id(xx, yy)])) ok = false;
          if (ok && Math.abs(gx + 1 - sasaranX) < dB) { dB = Math.abs(gx + 1 - sasaranX); best = gx; }
        }
        if (best != null) { pintu = { gx: best, gy, sisi, diri: id(best + 1, bdiri) }; break; }
      }
      if (pintu) {
        for (let yy = pintu.gy; yy < pintu.gy + 2; yy++) for (let xx = pintu.gx; xx < pintu.gx + 3; xx++) {
          const i = id(xx, yy);
          if (kode[i] !== JALAN) { kode[i] = CADANG; ubin[i] = ubin[i] || 'lantai_luar_paving'; }
          larang[i] = 1;
        }
      }
    }

    /* ---- 7. sungai: menuruni ketinggian sampai laut/danau/tepi peta ---- */
    const bebasSungai = (k) => k === DARAT || k === PASIR;
    const jTujuan = jarakBFS(W, H, (i) => {
      const x = i % W, y = (i - x) / W;
      return (kode[i] === LAUT || kode[i] === DANAU || x === 0 || y === 0 || x === W - 1 || y === H - 1) && !(kode[i] === CADANG || kode[i] === JALAN);
    }, (i) => bebasSungai(kode[i]));
    const lebarSungai = kecil ? 1 : 2;
    const ambangTinggi = kuantil(e, 0.8);
    for (let s = 0; s < P.sungai; s++) {
      const calon = [];
      for (let i = 0; i < N; i++) if (kode[i] === DARAT && e[i] >= ambangTinggi && jAir[i] > 5 && jTujuan[i] < 1e9 && jTujuan[i] > 8) calon.push(i);
      if (!calon.length) break;
      let cur = calon[Math.floor(rng() * calon.length)], langkah = 0, samping = 0;
      const lewat = new Uint8Array(N);
      while (cur >= 0 && jTujuan[cur] > 0 && langkah++ < 600) {
        const x = cur % W, y = (cur - x) / W;
        if (bebasSungai(kode[cur])) {
          kode[cur] = SUNGAI;
          if (lebarSungai > 1) {            // lebar 2: tambah sel di sisi kanan/bawah bila bebas
            const j = x < W - 1 && bebasSungai(kode[cur + 1]) ? cur + 1 : y < H - 1 && bebasSungai(kode[cur + W]) ? cur + W : -1;
            if (j >= 0) kode[j] = SUNGAI;
          }
        }
        lewat[cur] = 1;
        let next = -1, skor = Infinity;
        for (const j of [x > 0 ? cur - 1 : -1, x < W - 1 ? cur + 1 : -1, y > 0 ? cur - W : -1, y < H - 1 ? cur + W : -1]) {
          if (j < 0 || lewat[j] || jTujuan[j] > jTujuan[cur] || (jTujuan[j] === jTujuan[cur] && samping >= 4)) continue;
          const kelok = gerombol[j] * 0.5 + rng() * 0.15;
          const sk = e[j] + kelok + (jTujuan[j] === jTujuan[cur] ? 0.12 : 0);
          if (sk < skor) { skor = sk; next = j; }
        }
        if (next >= 0) samping = jTujuan[next] === jTujuan[cur] ? samping + 1 : 0;
        cur = next;
      }
      if (cur >= 0 && bebasSungai(kode[cur])) kode[cur] = SUNGAI;
    }

    /* ---- 8. dataran tebing berundak ---- */
    const bukit = [];
    if (P.bukit > 0.01) {
      const ambangBukit = kuantil(e, 1 - P.bukit, (i) => kode[i] === DARAT);
      const dekatLarang = jarakBFS(W, H, (i) => kode[i] !== DARAT);
      const mask = new Uint8Array(N);
      for (let y = 1; y < H - 2; y++) for (let x = 1; x < W - 1; x++) {
        const i = id(x, y);
        mask[i] = kode[i] === DARAT && e[i] >= ambangBukit && dekatLarang[i] >= 2 ? 1 : 0;
      }
      const capW = Math.max(8, Math.min(28, Math.round(W * 0.42))), capH = Math.max(7, Math.min(18, Math.round(H * 0.45)));
      for (let n = 0; n < P.maksBukit; n++) {
        const r = persegiTerbesar(mask, W, H, capW, capH);
        if (!r || r.w < 6 || r.h < 6) break;
        bukit.push({ ...r, tingkat: 1 });
        for (let yy = r.y - 2; yy < r.y + r.h + 2; yy++) for (let xx = r.x - 2; xx < r.x + r.w + 2; xx++)
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) mask[id(xx, yy)] = 0;
        tandai(r.x, r.y, r.w, r.h, TEBING, 'lantai_luar_rumput');
        // undakan kedua di atas rumput dataran pertama
        const ambang2 = kuantil(e, 1 - P.bukit2, (i) => { const x = i % W, y = (i - x) / W; return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; });
        const m2 = new Uint8Array(N);
        const k1 = P.dinding > 1.5 ? 2 : 1;
        for (let yy = r.y + 2; yy <= r.y + r.h - 4 - k1; yy++) for (let xx = r.x + 2; xx <= r.x + r.w - 3; xx++) m2[id(xx, yy)] = e[id(xx, yy)] >= ambang2 ? 1 : 0;
        const r2 = persegiTerbesar(m2, W, H, r.w - 4, r.h - 4 - k1);
        if (r2 && r2.w >= 5 && r2.h >= 4) bukit.push({ ...r2, tingkat: 2, induk: bukit[bukit.length - 1] });
        bukit[bukit.length - 1 - (r2 && r2.w >= 5 && r2.h >= 4 ? 1 : 0)].k = k1;
      }
    }

    /* ---- 9. bioma darat + ubin dasar ---- */
    const bioma = new Uint8Array(N);               // 0 padang, 1 hutan, 2 gurun
    for (let i = 0; i < N; i++) {
      const tt = su[i] + P.suhu, mm = m[i] + P.lembap;
      bioma[i] = (tt > 0.72 - P.gurun * 0.3 && mm < 0.42) ? 2 : mm > 0.56 ? 1 : 0;
    }
    for (let ulang = 0; ulang < 2; ulang++) {       // haluskan: mayoritas 3x3 (tak ada bintik satu sel)
      const baru = bioma.slice();
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const hit = [0, 0, 0];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) hit[bioma[id(x + dx, y + dy)]]++;
        baru[id(x, y)] = hit[0] >= hit[1] && hit[0] >= hit[2] ? 0 : hit[1] >= hit[2] ? 1 : 2;
      }
      bioma.set(baru);
    }

    /* ---- 10. tebing: rakit ubin sesuai aturan penyambungan ---- */
    const tebingOps = [];
    const ubinTebing = (n, gx, gy, lewat) => {
      tebingOps.push({ t: lewat ? 'lukis' : 'penuh', n, x: gx * T, y: gy * T });
      larang[id(gx, gy)] = 1;
    };
    for (const b of bukit) {
      const { x, y, w, h } = b;
      // Muka tebing k baris (dinding boleh ditumpuk): bibir, k x dinding, kaki.
      const k = b.k || 1, bibir = y + h - 2 - k, kaki = y + h - 1, dindingY = [];
      for (let d = 1; d <= k; d++) dindingY.push(bibir + d);
      const lebar = w >= 9 && ada('tebing_tangga_batu_lebar');
      const sx = x + 2 + Math.floor(rng() * Math.max(1, w - 4 - (lebar ? 1 : 0)));
      b.tangga = sx; b.lebarTangga = lebar ? 2 : 1;
      for (let xx = x; xx < x + w; xx++) {
        const sfx = xx === x ? 'kiri' : xx === x + w - 1 ? 'kanan' : 'tengah';
        ubinTebing(sfx === 'tengah' ? 'tebing_belakang_tengah' : 'tebing_pojok_luar_' + sfx, xx, y);
        if (xx >= sx && xx < sx + b.lebarTangga) continue;
        ubinTebing('tebing_atas_' + sfx, xx, bibir);
        for (const dy of dindingY) ubinTebing('tebing_dinding_' + sfx, xx, dy);
        ubinTebing('tebing_kaki_' + sfx, xx, kaki);
      }
      for (let yy = y + 1; yy < bibir; yy++) { ubinTebing('tebing_sisi_kiri', x, yy); ubinTebing('tebing_sisi_kanan', x + w - 1, yy); }
      const nm = lebar ? 'tebing_tangga_batu_lebar' : 'tebing_tangga_batu';
      ubinTebing(nm + '_atas', sx, bibir, true); for (const dy of dindingY) ubinTebing(nm, sx, dy, true); ubinTebing(nm + '_kaki', sx, kaki, true);
      if (lebar) for (const yy of [bibir, ...dindingY, kaki]) larang[id(sx + 1, yy)] = 1;
      for (let d = 0; d < b.lebarTangga; d++) larang[id(sx + d, bibir - 1)] = 1;   // pijakan puncak tangga tetap lapang
      for (let yy = y + 1; yy < bibir; yy++) for (let xx = x + 1; xx < x + w - 1; xx++) if (!larang[id(xx, yy)]) atasBukit[id(xx, yy)] = 1;
    }
    // Rumput di bawah undakan kedua bukan lagi "atas bukit" pertama (sudah larang lewat ubinTebing),
    // tapi puncaknya ditandai lagi oleh loop di atas. Jalan kecil di puncak: tangga bawah -> tangga atas.
    for (const b of bukit) if (b.tingkat === 2) {
      const a = b.induk, yAtas = a.y + a.h - 3 - (a.k || 1), yBawah = b.y + b.h;
      let cx = a.tangga;
      for (let yy = yAtas; yy >= yBawah; yy--) jalurPuncak(cx, yy);
      const arah = Math.sign(b.tangga - cx);
      while (cx !== b.tangga) { cx += arah; jalurPuncak(cx, yBawah); }
    }
    function jalurPuncak(x, y) {
      const i = id(x, y);
      if (kode[i] !== TEBING || larang[i]) return;
      ubin[i] = 'lantai_luar_jalan_tanah'; larang[i] = 1; atasBukit[i] = 0;
    }

    /* ---- 10b. titik singgah (bangku + lampu) di alam: tujuan jalan setapak ---- */
    const nSinggah = Math.round(P.singgah || 0);
    for (let s = 0, coba = 0; s < nSinggah && coba < 300; coba++) {
      const x = 2 + Math.floor(rng() * (W - 6)), y = 2 + Math.floor(rng() * (H - 5));
      let ok = true;
      for (let yy = y - 1; yy < y + 3 && ok; yy++) for (let xx = x - 1; xx < x + 4 && ok; xx++) {
        const i = id(xx, yy);
        if (!(kode[i] === DARAT || kode[i] === PASIR) || larang[i] || terisi[i]) ok = false;
      }
      if (!ok || simpul.some(q => Math.abs(q % W - x) + Math.abs(((q / W) | 0) - y) < 12)) continue;
      const ub = ukuranAtlas(atlas, 'luar_bangku_taman'), ul = ukuranAtlas(atlas, 'lampu_taman');
      if (!ub) break;
      opsBenda.push({ t: 'padat', n: 'luar_bangku_taman', x: x * T, y: y * T + T - ub.h });
      terisi[id(x, y)] = terisi[id(x + 1, y)] = 1;
      if (ul) { opsBenda.push({ t: 'padat', n: 'lampu_taman', x: (x + 2) * T, y: (y + 1) * T - ul.h }); terisi[id(x + 2, y)] = terisi[id(x + 2, y - 1)] = 1; }
      for (let xx = x - 1; xx < x + 4; xx++) larang[id(xx, y + 1)] = 1;
      simpul.push(id(x, y + 1));
      s++;
    }

    /* ---- 11. jalan setapak: sambungkan pintu, kantor, kota, tangga ---- */
    if (kantor && kantor.gx && !kantor.diKota) simpul.push(id(kantor.gx + kantor.pintuPos, kantor.gy + kantor.h));
    if (kota) simpul.push(id(kota.x + (kota.w >> 1), kota.y + kota.h - 1));
    for (const b of bukit) if (b.tingkat === 1 && b.y + b.h < H) simpul.push(id(b.tangga, b.y + b.h));
    const jaringan = new Uint8Array(N);
    const biaya = (k) => k === SETAPAK || k === JALAN || k === JEMBATAN ? 0.4 : k === DARAT || k === CADANG ? 1
      : k === PASIR ? 1.3 : k === TROTOAR ? 0.9 : k === SUNGAI || k === DANAU ? 7 : -1;
    const tambahJaringan = (i) => {
      jaringan[i] = 1;
      if (kode[i] === JALAN && kota) for (let yy = kota.y; yy < kota.y + kota.h; yy++) for (let xx = kota.x; xx < kota.x + kota.w; xx++)
        if (kode[id(xx, yy)] === JALAN) jaringan[id(xx, yy)] = 1;
    };
    const awal = pintu ? pintu.diri : simpul.shift();
    if (awal != null) tambahJaringan(awal);
    simpul.sort((a, b) => Math.abs(a % W - awal % W) + Math.abs(((a / W) | 0) - ((awal / W) | 0))
      - (Math.abs(b % W - awal % W) + Math.abs(((b / W) | 0) - ((awal / W) | 0))));
    for (const s of simpul) {
      if (s == null || jaringan[s]) continue;
      const jalur = cariJalur(s);
      if (!jalur) continue;
      for (const i of jalur) {
        const k = kode[i];
        if (k === DARAT || k === PASIR || k === CADANG) { kode[i] = SETAPAK; ubin[i] = 'lantai_luar_jalan_tanah'; }
        else if (k === SUNGAI || k === DANAU) { kode[i] = JEMBATAN; ubin[i] = 'lantai_pantai_dermaga'; }
        larang[i] = 1;
        tambahJaringan(i);
      }
    }
    // Dijkstra dengan penalti belok (jalan lebih lurus) sampai menyentuh jaringan.
    function cariJalur(mulaiI) {
      const S = N * 4, dist = new Float64Array(S).fill(Infinity), asal = new Int32Array(S).fill(-1);
      const heap = [];
      const dorong = (d, s) => { heap.push([d, s]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
      const ambil = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let k = c; if (l < heap.length && heap[l][0] < heap[k][0]) k = l; if (r < heap.length && heap[r][0] < heap[k][0]) k = r; if (k === c) break; [heap[k], heap[c]] = [heap[c], heap[k]]; c = k; } } return top; };
      for (let d = 0; d < 4; d++) { dist[mulaiI * 4 + d] = 0; dorong(0, mulaiI * 4 + d); }
      const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
      while (heap.length) {
        const [d, s] = ambil();
        if (d > dist[s]) continue;
        const i = s >> 2, dir = s & 3;
        if (jaringan[i] && i !== mulaiI) {
          const hasil = []; let t = s;
          while (t >= 0) { hasil.push(t >> 2); t = asal[t]; }
          return hasil;
        }
        const x = i % W, y = (i - x) / W;
        for (let nd = 0; nd < 4; nd++) {
          const nx = x + DX[nd], ny = y + DY[nd];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = id(nx, ny), c = biaya(kode[j]);
          if (c < 0 && !jaringan[j]) continue;
          const nd2 = d + Math.max(c, 0.4) + (nd !== dir ? 0.35 : 0) + (e[j] * 0.3);
          const ns = j * 4 + nd;
          if (nd2 < dist[ns]) { dist[ns] = nd2; asal[ns] = s; dorong(nd2, ns); }
        }
      }
      return null;
    }

    /* ---- 11b. benda kota & taman (sebelum ubin dikeluarkan: taman mengubah ubin jalannya) ---- */
    // Perkiraan ops ubin dipakai sebelum ubin dikeluarkan (bagian 12).
    let perkiraanUbin = 400;
    const anggaran = () => ANGGARAN_OPS - Math.max(ops.length, perkiraanUbin) - tebingOps.length - opsBenda.length;
    // longgar: hanya baris dasar (tempat berdiri) yang harus cocok; tajuk di atasnya cukup bebas dari
    // benda/jalan/air (pohon kelapa di pasir sempit boleh menaungi rumput di belakangnya).
    function bisaTaruh(gx, gy, cw, ch, cocok, longgar) {
      if (gx < 0 || gy < 0 || gx + cw > W || gy + ch > H) return false;
      for (let yy = gy; yy < gy + ch; yy++) for (let xx = gx; xx < gx + cw; xx++) {
        const i = id(xx, yy);
        if (terisi[i]) return false;
        if (longgar && yy < gy + ch - 1) { if (larang[i] || AIR(kode[i])) return false; continue; }
        if (cocok ? !cocok(i) : larang[i]) return false;
      }
      return true;
    }
    // Taruh sprite n dengan pojok kiri-atas jejak di sel (gx,gy); sprite rata bawah pada jejaknya.
    function taruh(n, gx, gy, t = 'padat', cocok = null, ekstra = null, longgar = false) {
      const u = ukuranAtlas(atlas, n);
      if (!u || anggaran() <= 0) return false;
      const cw = Math.ceil(u.w / T), ch = Math.ceil(u.h / T);
      if (!bisaTaruh(gx, gy, cw, ch, cocok, longgar)) return false;
      for (let yy = gy; yy < gy + ch; yy++) for (let xx = gx; xx < gx + cw; xx++) terisi[id(xx, yy)] = 1;
      const geser = cw * T - u.w > 0 ? Math.floor(rng() * (cw * T - u.w + 1)) : 0;
      opsBenda.push({ t, n, x: gx * T + geser, y: gy * T + ch * T - u.h, ...(ekstra || {}) });
      return true;
    }
    const pilihBobot = (daftar) => {
      const sah = daftar.filter(([n]) => ada(n));
      let tot = 0; for (const [, b] of sah) tot += b;
      let r = rng() * tot;
      for (const [n, b] of sah) { r -= b; if (r <= 0) return n; }
      return sah.length ? sah[sah.length - 1][0] : null;
    };

    for (const l of lot) isiLot(l);
    if (rencanaTk) pasangTk();
    if (rumahan) isiPerumahan();

    /* ---- 12. ubin akhir per sel ---- */
    const jDarat = jarakBFS(W, H, (i) => !AIR(kode[i]));
    for (let i = 0; i < N; i++) {
      if (ubin[i]) continue;
      const k = kode[i];
      ubin[i] = k === LAUT ? (jDarat[i] <= 1 ? 'lantai_pantai_air_dangkal' : 'lantai_pantai_laut')
        : k === DANAU || k === SUNGAI ? 'lantai_luar_air'
        : k === PASIR ? (jLaut[i] <= 1 ? 'lantai_pantai_pasir_basah' : 'lantai_luar_pasir')
        : k === SETAPAK ? 'lantai_luar_jalan_tanah'
        : bioma[i] === 1 ? 'lantai_luar_rumput_b'
        : bioma[i] === 2 ? (detil[i] > 0.55 ? 'lantai_alam_tanah_retak' : 'lantai_luar_pasir')
        : detil[i] > 0.8 ? 'lantai_luar_rumput_bunga' : 'lantai_luar_rumput';
      if (!ada(ubin[i])) ubin[i] = 'lantai_luar_rumput';
    }
    // Ubin yang paling banyak jadi satu alas penuh; sisanya persegi-persegi rakus (hemat ops).
    const hitung = new Map();
    for (const u of ubin) hitung.set(u, (hitung.get(u) || 0) + 1);
    const alas = [...hitung.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    ops.push({ t: 'lantai', n: alas, gx: 0, gy: 0, w: W, h: H });
    rakus((i) => ubin[i] !== alas, (i) => ubin[i], (x, y, w, h, n) => ops.push({ t: 'lantai', n, gx: x, gy: y, w, h }));
    perkiraanUbin = 0;
    // Air tak bisa dilalui (jembatan tetap bisa).
    rakus((i) => AIR(kode[i]), () => 'air', (x, y, w, h) => ops.push({ t: 'halang', gx: x, gy: y, w, h }));
    function rakus(ikut, kunci, keluar) {
      const sudah = new Uint8Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = id(x, y);
        if (sudah[i] || !ikut(i)) continue;
        const k = kunci(i);
        let w = 1;
        while (x + w < W && !sudah[i + w] && ikut(i + w) && kunci(i + w) === k) w++;
        let h = 1;
        for (;;) {
          if (y + h >= H) break;
          let ok = true;
          for (let xx = x; xx < x + w; xx++) { const j = id(xx, y + h); if (sudah[j] || !ikut(j) || kunci(j) !== k) { ok = false; break; } }
          if (!ok) break;
          h++;
        }
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) sudah[id(xx, yy)] = 1;
        keluar(x, y, w, h, k);
      }
    }

    /* ---- 13. kantor: ruang + meja berdivisi ---- */
    if (kantor && kantor.gx && !bertema) {
      ops.push({ t: 'ruang', gx: kantor.gx, gy: kantor.gy, w: kantor.w, h: kantor.h, warna: '#94a3b8',
        lantai: 'lantai_kayu_hangat', nama: 'Kantor', pintu: [{ sisi: 'bawah', pos: kantor.pintuPos }] });
      for (let yy = kantor.gy; yy < kantor.gy + kantor.h; yy++) for (let xx = kantor.gx; xx < kantor.gx + kantor.w; xx++) { larang[id(xx, yy)] = 1; terisi[id(xx, yy)] = 1; }
    }
    if (kantor && !bertema) {
      const gx0 = kantor.gx || 1, gy0 = kantor.gy || 1;
      let k = 0;
      for (let j = 0; j < kantor.nMeja; j++) {
        const div = kursi.slice(k, k + 4);
        while (div.length < 4) div.push('');
        const kol = j % kantor.kol, bar = Math.floor(j / kantor.kol);
        meja.push({ jenis: 'hadap4', x: (gx0 + 2 + kol * 6) * T, y: (gy0 + 4 + bar * 6) * T, divisi: div });
        k += 4;
      }
    }

    /* ---- 14. hiasan alam (sisa anggaran ops) ---- */

    const HIAS = {
      0: [['luar_semak', 4], ['luar_bunga_kuning', 2], ['luar_bunga_merah', 2], ['luar_rumput_tinggi', 4], ['luar_batu', 1],
        ['luar_pohon', 1.4], ['luar_pohon_apel', 0.5], ['luar_pohon_mangga', 0.5], ['luar_pohon_muda', 0.9], ['luar_semak_bugenvil', 0.4]],
      1: [['luar_pohon', 4], ['luar_pohon_cemara', 3], ['luar_pohon_rimbun', 2], ['luar_pohon_gugur', 1], ['luar_pohon_beringin', 0.35],
        ['luar_pohon_muda', 1.4], ['luar_semak', 1.5], ['batu_berlumut', 0.5], ['luar_pohon_berry', 0.7]],
      2: [['batu_tumpuk', 2], ['luar_batu_besar', 1], ['batu_kerikil', 2], ['luar_rumput_tinggi', 1.4], ['luar_pohon_palem', 0.6], ['luar_batu', 1.5]],
      pasir: [['luar_pohon_kelapa', 3], ['luar_pohon_palem', 2], ['pantai_kerang_besar', 1], ['batu_karang_kecil', 1.5], ['batu_karang_tinggi', 1],
        ['pantai_payung_kursi', 1], ['pantai_istana_pasir', 0.5], ['pantai_papan_selancar', 0.5]],
      bukit: [['luar_pohon_cemara', 3], ['luar_pohon_pinus_salju', 1], ['luar_semak', 2], ['luar_batu', 2], ['batu_tumpuk', 1], ['luar_rumput_tinggi', 2], ['luar_pohon', 1]],
    };
    const HEWAN_DARAT = ['hewan_kelinci_diam', 'hewan_kambing_diam', 'hewan_ayam_diam', 'hewan_kucing_diam', 'hewan_anjing_diam'].filter(ada);
    const HEWAN_AIR = ['hewan_bebek_diam', 'hewan_angsa_diam', 'hewan_koi_diam'].filter(ada);
    const bolehAlam = (i) => !larang[i] && (kode[i] === DARAT || kode[i] === PASIR || atasBukit[i]);
    // Hutan: dekat tepi hutan (padang) semak lebih sering = transisi halus.
    const dHutan = jarakBFS(W, H, (i) => kode[i] === DARAT && bioma[i] === 1);
    const urutan = [];
    for (let i = 0; i < N; i++) urutan.push(i);
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = urutan[i]; urutan[i] = urutan[j]; urutan[j] = t; }
    for (const i of urutan) {
      if (anggaran() <= 0) break;
      if (terisi[i] || larang[i]) continue;
      const x = i % W, y = (i - x) / W, k = kode[i], g = gerombol[i];
      let daftar = null, p = 0, cocok = bolehAlam;
      if (atasBukit[i]) { daftar = HIAS.bukit; p = 0.1 * (0.5 + g); }
      else if (k === PASIR) { daftar = HIAS.pasir; p = 0.03 + 0.08 * P.pantai; cocok = (j) => !larang[j] && kode[j] === PASIR; }
      else if (k === DARAT) {
        const b = bioma[i];
        if (P.pantai && jLaut[i] < 9) { daftar = [['luar_pohon_kelapa', 3], ['luar_pohon_palem', 2], ['luar_semak', 2], ['luar_rumput_tinggi', 2]]; p = 0.08; }
        else if (b === 1) { daftar = HIAS[1]; p = 0.08 + 0.45 * Math.max(0, g - 0.25); }
        else if (b === 2) { daftar = HIAS[2]; p = 0.03; }
        else {
          daftar = HIAS[0]; p = 0.035 + (g > 0.7 ? 0.08 : 0);
          if (dHutan[i] <= 2 && rng() < 0.5) { daftar = [['luar_semak', 3], ['luar_semak_bugenvil', 1], ['luar_pohon_muda', 1]]; p = 0.18; }
        }
      } else if ((k === DANAU) && HEWAN_AIR.length && rng() < 0.012 * P.hewan) {
        taruh(HEWAN_AIR[Math.floor(rng() * HEWAN_AIR.length)], x, y, 'padat', (j) => kode[j] === DANAU);
        continue;
      } else if (k === LAUT && jDarat[i] >= 2 && rng() < 0.012) {
        taruh(rng() < 0.5 ? 'batu_karang_laut' : 'pantai_terumbu', x, y, 'lukis', (j) => kode[j] === LAUT);
        continue;
      }
      if (!daftar) continue;
      if (rng() < 0.004 * P.hewan * padat && HEWAN_DARAT.length && k === DARAT) {
        taruh(HEWAN_DARAT[Math.floor(rng() * HEWAN_DARAT.length)], x, y, 'padat', cocok);
        continue;
      }
      if (rng() >= p * padat) continue;
      const n = pilihBobot(daftar), u = n && ukuranAtlas(atlas, n);
      if (u) taruh(n, x - Math.floor((Math.ceil(u.w / T) - 1) / 2), y - Math.ceil(u.h / T) + 1, 'padat', cocok, null, true);
    }

    /* ---- 15. rakit denah ---- */
    for (const o of tebingOps) ops.push(o);
    // Benda digambar urut dari atas ke bawah supaya yang di depan menutupi yang di belakang.
    opsBenda.sort((a, b) => (a.y + (ukuranAtlas(atlas, a.n) || { h: 0 }).h) - (b.y + (ukuranAtlas(atlas, b.n) || { h: 0 }).h) || a.x - b.x);
    for (const o of opsBenda) ops.push(o);
    const denah = { v: 1, lebar: W, tinggi: H, yDinding: null, pintuX: Math.max(1, Math.min(W - 4, Math.floor(W / 2))),
      ops, meja, spot: [], label: [] };
    while (ops.length > 3000) ops.pop();
    if (op.nama) denah.nama = String(op.nama).slice(0, 40);
    if (pintu) denah.pintuUtama = { gx: pintu.gx, gy: pintu.gy, sisi: pintu.sisi };
    const ms = (typeof performance !== 'undefined' ? performance : Date).now() - mulai;
    return { denah, info: { benih, jenis: op.jenis || 'alam', ms: Math.round(ms), ops: denah.ops.length, lebar: W, tinggi: H,
      bukit: bukit.length, kota: !!kota } };

    /* ---------------- tempat kerja bertema (0.77) ---------------- */
    // Jenis peta untuk mencocokkan medan `gaya` metadata (Acak: diturunkan dari bobot hasil campuran).
    function jenisTema() {
      if (DASAR.includes(op.jenis || 'alam')) return op.jenis || 'alam';
      if (P.pantai) return 'pantai';
      if (P.kota >= 0.45) return P.taman >= 0.4 ? 'taman' : 'kota';
      return P.maksBukit >= 5 ? 'perbukitan' : 'alam';
    }
    // Daftar tempat kerja: tiap divisi mendapat tempat kerja MODULNYA (saran_divisi, gaya cocok dengan jenis peta),
    // kapasitas cukup untuk semua kursinya; divisi "umum", kursi bebas, dan divisi yang modulnya tak cocok dengan
    // jenis peta memakai tempat kerja UMUM jenis peta itu (paling sedikit 2 supaya peta tak sepi). PRNG sendiri:
    // medan & hiasan dunia seed yang sama tetap sama dengan mode Kantor.
    function rencanakanTk() {
      const rt = mulberry32(benih ^ 0x2c1b3c6d), tema = jenisTema();
      const seni = op.seniTk || (typeof TEMPAT_KERJA_SENI !== 'undefined' ? TEMPAT_KERJA_SENI : {});
      const cocok = Object.keys(seni).sort().filter(k => k.startsWith('kerja_') && ada(k) && (seni[k].gaya || []).includes(tema))
        .map(k => [k, seni[k]]);
      const umum = cocok.filter(([, m]) => (m.saran_divisi || []).includes('umum'));
      const hitung = new Map();
      for (const d of kursi) hitung.set(d, (hitung.get(d) || 0) + 1);
      const daftar = [], antre = [];
      for (const [d, jml] of hitung) {
        const cal = d && d !== 'umum' ? cocok.filter(([, m]) => (m.saran_divisi || []).includes(d)) : [];
        if (!cal.length) { for (let j = 0; j < jml; j++) antre.push(d); continue; }
        let sisa = jml, i = Math.floor(rt() * cal.length);
        while (sisa > 0) {
          const [n, m] = cal[i++ % cal.length], isi = Math.min(m.kapasitas, sisa);
          daftar.push({ n, m, divisi: Array.from({ length: m.kapasitas }, (_, j) => (j < isi ? d : '')) });
          sisa -= isi;
        }
      }
      const acakUmum = umum.slice();
      for (let a = acakUmum.length - 1; a > 0; a--) { const b = Math.floor(rt() * (a + 1)); [acakUmum[a], acakUmum[b]] = [acakUmum[b], acakUmum[a]]; }
      for (let k = 0; acakUmum.length && (antre.length || k < 2); k++) {
        const [n, m] = acakUmum[k % acakUmum.length];
        daftar.push({ n, m, divisi: Array.from({ length: m.kapasitas }, () => (antre.length ? antre.shift() : '')) });
      }
      return daftar.slice(0, 40);                                  // denahcustom.MAKS_TEMPAT_KERJA
    }
    // Kompleks kerja pengganti ruang Kantor: rak-rak (tinggi menurun), jeda 1 ubin antar benda, 2 baris jalan antar
    // rak (pintu bangunan & titik kerja di sisi bawah). Letak kompleks dicari kode kantor yang sudah ada.
    function kompleksTk(rencana) {
      const isi = rencana.filter(r => !LETAK_KHUSUS.has(r.m.letak));
      for (const r of isi) { r.u = ukuranAtlas(atlas, r.n); r.cw = Math.ceil(r.u.w / T); r.ch = Math.ceil(r.u.h / T); }
      const luas = isi.reduce((a, r) => a + (r.cw + 1) * (r.ch + 2), 0);
      const batas = Math.max(8, Math.min(W - 8, Math.ceil(Math.sqrt(luas * 1.8))));
      const urut = isi.map((r, i) => [r, i]).sort((a, b) => b[0].ch - a[0].ch || a[1] - b[1]).map(([r]) => r);
      let x = 1, y = 1, rak = 0, lebar = 2;
      const jalanRak = [];
      for (const r of urut) {
        if (x > 1 && x + r.cw > batas + 1) { jalanRak.push(y + rak); y += rak + 2; x = 1; rak = 0; }
        r.gx = x; r.gy = y; x += r.cw + 1; rak = Math.max(rak, r.ch); lebar = Math.max(lebar, x);
      }
      if (urut.length) jalanRak.push(y + rak);
      const w = Math.max(6, lebar), h = y + rak + 2;
      return { w, h, pintuPos: Math.floor(w / 2) - 1, tk: urut, jalanRak };
    }
    function tarukTk(r, gx, gy) {
      const u = ukuranAtlas(atlas, r.n), cw = Math.ceil(u.w / T), ch = Math.ceil(u.h / T);
      for (let yy = gy; yy < gy + ch; yy++) for (let xx = gx; xx < gx + cw; xx++) { terisi[id(xx, yy)] = 1; larang[id(xx, yy)] = 1; }
      meja.push({ jenis: 'tk:' + r.n, x: gx * T + Math.floor((cw * T - u.w) / 2), y: gy * T + ch * T - u.h, divisi: r.divisi.slice() });
    }
    function pasangTk() {
      const gx0 = kantor.gx || 1, gy0 = kantor.gy || 1;
      for (let yy = gy0; yy < Math.min(H, gy0 + kantor.h); yy++) for (let xx = gx0; xx < Math.min(W, gx0 + kantor.w); xx++) {
        larang[id(xx, yy)] = 1;
        if (kantor.jalanRak.includes(yy - gy0) && xx > gx0 && xx < gx0 + kantor.w - 1 && !kantor.diKota) ubin[id(xx, yy)] = 'lantai_luar_jalan_tanah';
      }
      for (const r of kantor.tk) if (gx0 + r.gx + r.cw <= W && gy0 + r.gy + r.ch <= H) tarukTk(r, gx0 + r.gx, gy0 + r.gy);
      const pusat = [gx0 + kantor.w / 2, gy0 + kantor.h / 2];
      const jHutan = rencanaTk.some(r => r.m.letak === 'tepi_hutan') ? jarakBFS(W, H, (i) => kode[i] === DARAT && bioma[i] === 1) : null;
      const bebas = (i) => !terisi[i] && !larang[i];
      const darat = (i) => (kode[i] === DARAT || kode[i] === PASIR) && bebas(i) && !atasBukit[i];
      const lewat = (i) => kode[i] === DARAT || kode[i] === PASIR || kode[i] === SETAPAK || kode[i] === JALAN || kode[i] === TROTOAR
        || kode[i] === JEMBATAN || kode[i] === LOT;
      // 0.77.1 — margin aman dari tepi peta (tepi atas tertutup panel di layar): puncak sprite >= max(2 ubin, tinggi
      // sprite) dari tepi atas, jejak >= 2 ubin dari tepi kiri/kanan/bawah.
      const cari = (cw, ch, sel, syarat, tinggiPx = ch * T) => {
        let terbaik = null, dB = Infinity;
        const gyMin = Math.max(1, Math.ceil((Math.max(2 * T, tinggiPx) + tinggiPx) / T) - ch);
        for (let gy = gyMin; gy + ch <= H - 2; gy++) for (let gx = 2; gx + cw <= W - 2; gx++) {
          const d = Math.abs(gx + cw / 2 - pusat[0]) + Math.abs(gy + ch / 2 - pusat[1]);
          if (d >= dB) continue;
          let ok = true;
          for (let yy = gy; yy < gy + ch && ok; yy++) for (let xx = gx; xx < gx + cw && ok; xx++) if (!sel(id(xx, yy))) ok = false;
          if (ok && syarat(gx, gy)) { dB = d; terbaik = [gx, gy]; }
        }
        return terbaik;
      };
      const barisLewat = (gx, gy, cw) => { for (let k = 0; k < cw; k++) { const i = id(gx + k, gy); if (!lewat(i) || terisi[i]) return false; } return true; };
      for (const r of rencanaTk.filter(r => LETAK_KHUSUS.has(r.m.letak))) {
        const u = ukuranAtlas(atlas, r.n), cw = Math.ceil(u.w / T), ch = Math.ceil(u.h / T);
        let spot = null;
        if (r.m.jenis === 'berdiri' && r.m.letak === 'tepi_air' && r.n.includes('dermaga')) {
          // Dermaga: seluruh jejak di atas air, pangkalnya (baris di atasnya) daratan -> dek jadi jembatan (bisa dilalui).
          spot = cari(cw, ch, (i) => (kode[i] === LAUT || kode[i] === DANAU) && !terisi[i], (gx, gy) => gy >= 1 && barisLewat(gx, gy - 1, cw), u.h);
          if (spot) for (let yy = spot[1]; yy < spot[1] + ch; yy++) for (let xx = spot[0]; xx < spot[0] + cw; xx++) {
            const i = id(xx, yy);
            ubin[i] = kode[i] === LAUT ? 'lantai_pantai_air_dangkal' : 'lantai_luar_air'; kode[i] = JEMBATAN;
          }
        } else {
          const dekatAir = r.m.letak === 'tepi_air' ? 2 : r.m.letak === 'pasir_dekat_air' ? 3 : 0;
          spot = cari(cw, ch, darat, (gx, gy) => {
            if (!barisLewat(gx, gy + ch, cw)) return false;
            const b = id(gx + (cw >> 1), gy + ch - 1);
            if (dekatAir) return jAir[b] <= dekatAir && (r.m.letak !== 'pasir_dekat_air' || kode[b] === PASIR);
            return jHutan[b] >= 1 && jHutan[b] <= 4;
          }, u.h);
        }
        if (spot) { tarukTk(r, spot[0], spot[1]); continue; }
        // Medan yang diminta tak ada: tempat kerja umum kecil (kuda-kuda lukis, kap 1) di dekat kompleks, satu per
        // kursi berpenghuni, supaya kapasitas tiap divisi tetap cukup.
        const n = ['kerja_kuda_kuda_lukis', 'kerja_theodolit'].find(ada);
        if (!n) continue;
        const u2 = ukuranAtlas(atlas, n), c2 = Math.ceil(u2.w / T), h2 = Math.ceil(u2.h / T);
        const isiDiv = r.divisi.filter(Boolean);
        for (const d of isiDiv.length ? isiDiv : ['']) {
          const s2 = cari(c2, h2, darat, (gx, gy) => barisLewat(gx, gy + h2, c2), u2.h);
          if (s2) tarukTk({ n, divisi: [d] }, s2[0], s2[1]);
        }
      }
    }

    /* ---------------- perumahan (0.78) ---------------- */
    // Kompleks dari atas ke bawah: [rumah 5 baris + gang 3 baris] x n (gang tiap 8 baris, rumah berderet DI ATAS gang,
    // pintunya menghadap gang) -> jalur fasilitas 3 baris (taman kecil, pos ronda di mulut jalan masuk, warung di sudut)
    // -> jalan setapak 2 baris. Jalan masuk tegak 4 ubin memotong semua gang sampai tepi bawah (gapura RT di mulutnya,
    // pintu utama di bawahnya). Rumah lebar 4 ubin + sela 1 (tiang lampu gang tiap 2 rumah). Mode Kantor: ruang Kantor
    // di kanan, dasarnya menempel gang (pintunya di gang), jalan masuk bergeser ke tengah sisa lebar. Gang teratas di
    // baris >= 9 supaya puncak rumah (ruko 72 px) tak tertutup panel atas; semua jejak >= 2 ubin dari tepi.
    function susunPerumahan() {
      const gang = [];
      for (let g = H - 11; g >= 9; g -= 8) gang.unshift(g);
      if (!gang.length) return null;
      const PAV = ada('lantai_kota_paving_blok') ? 'lantai_kota_paving_blok' : 'lantai_luar_paving';
      const kiri = 2, kanan = W - 3, F = H - 8, J = H - 5, atas = gang[0] - 5;
      let kx = null;
      if (kantor) {
        const g = [...gang, J].find(q => q - kantor.h >= 2);        // dasar ruang = tepi atas gang (atau jalan bawah)
        if (g !== undefined && kantor.w + 12 <= W - 4) {
          kantor.gx = W - 2 - kantor.w; kantor.gy = g - kantor.h; kantor.diKota = true; kx = kantor.gx;
        }
      }
      const ujung = kx !== null ? kx - 2 : kanan;
      const R = Math.max(kiri + 1, kiri + Math.floor((ujung - kiri + 1) / 2) - 2);
      const jalan = (x, y, w, h) => {
        tandai(x, y, w, h, JALAN, PAV);
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) larang[id(xx, yy)] = 1;
      };
      tandai(kiri, atas, kanan - kiri + 1, F + 3 - atas, LOT, 'lantai_luar_rumput');
      for (const g of gang) jalan(kiri, g, kanan - kiri + 1, 3);
      jalan(kiri, J, kanan - kiri + 1, 2);
      jalan(R, gang[0], 4, H - 2 - gang[0]);
      if (kx !== null) tandai(kantor.gx, kantor.gy, kantor.w, kantor.h, KANTOR, null);
      return { R, gang, F, J, kiri, kanan, kx };
    }
    // Rumah per divisi (Bertema): pasangan kursi -> rumah kap 2 (tipe 36/minimalis/ruko, acak berbenih), sisa satu
    // kursi -> rumah panggung (kap 1); bila tempat kurang, dua sisa dari divisi berbeda berbagi satu rumah kap 2.
    // Urut divisi = urut kursi, jadi rumah satu divisi berjajar di gang yang sama (papan divisi = papan nama gang).
    function rencanaRumah(nPos) {
      const rt = mulberry32(benih ^ 0x6a09e667);
      const seni = op.seniTk || (typeof TEMPAT_KERJA_SENI !== 'undefined' ? TEMPAT_KERJA_SENI : {});
      const rumah = Object.keys(seni).sort().filter(k => seni[k].hunian && ada(k));
      const dua = rumah.filter(k => seni[k].kapasitas >= 2), satu = rumah.filter(k => seni[k].kapasitas === 1);
      if (!dua.length && !satu.length) return [];
      const ambil = (daftar) => daftar[Math.floor(rt() * daftar.length)];
      const isi = (n, ds) => ({ n, m: seni[n], divisi: Array.from({ length: seni[n].kapasitas }, (_, j) => ds[j] || '') });
      const hitung = new Map();
      for (const d of kursi) hitung.set(d, (hitung.get(d) || 0) + 1);
      const daftar = [];
      for (const [d, jml] of hitung) {
        let sisa = jml;
        while (sisa >= 2 && dua.length) { const r = isi(ambil(dua), []); r.divisi = r.divisi.map((_, j) => (j < sisa ? d : '')); sisa -= r.divisi.filter(Boolean).length; daftar.push(r); }
        while (sisa > 0) { daftar.push({ tunggal: d }); sisa--; }
      }
      const hasil = [];
      for (let i = 0; i < daftar.length; i++) {
        const r = daftar[i];
        if (!('tunggal' in r)) { hasil.push(r); continue; }
        const lawan = daftar[i + 1];
        if ((daftar.length - i > nPos - hasil.length || !satu.length) && dua.length && lawan && 'tunggal' in lawan) {
          hasil.push(isi(ambil(dua), [r.tunggal, lawan.tunggal])); i++;          // tempat kurang: berbagi rumah
        } else hasil.push(satu.length ? isi(ambil(satu), [r.tunggal]) : isi(ambil(dua), [r.tunggal]));
      }
      return hasil;
    }
    function isiPerumahan() {
      const Rm = rumahan, kerja = (y0, y1) => Rm.kx !== null && y1 >= kantor.gy && y0 < kantor.gy + kantor.h ? Rm.kx - 2 : Rm.kanan;
      const lot = (i) => kode[i] === LOT && !terisi[i];
      const muat = (gx, gy, cw, ch) => { for (let yy = gy; yy < gy + ch; yy++) for (let xx = gx; xx < gx + cw; xx++) if (!lot(id(xx, yy))) return false; return true; };
      // Letak rumah: tiap gang, sisi kiri lalu kanan jalan masuk, kiri ke kanan.
      const posisi = [];
      for (const g of Rm.gang) {
        for (const [a, b] of [[Rm.kiri, Rm.R - 2], [Rm.R + 5, kerja(g - 5, g - 1)]]) {
          const deret = [];
          for (let x = a; x + 3 <= b; x += 5) deret.push({ gx: x, g, sela: x + 4 <= b ? x + 4 : null });
          deret.forEach((q, k) => { q.lampu = k % 2 === 1 && k < deret.length - 1; });
          posisi.push(...deret);
        }
      }
      const RUMAH = ['kerja_rumah_tipe36', 'kerja_rumah_minimalis', 'kerja_ruko_kecil', 'kerja_rumah_panggung'].filter(ada);
      const seni = op.seniTk || (typeof TEMPAT_KERJA_SENI !== 'undefined' ? TEMPAT_KERJA_SENI : {});
      const maks = Math.min(posisi.length, 40);                   // denahcustom.MAKS_TEMPAT_KERJA
      // Bertema: rumah per divisi dulu; sisa kavling (dan seluruh kavling di mode Kantor) = rumah kosong ber-slot bebas
      // (warga kompleks; menampung divisi yang meluap). Harga Generate tetap per lantai, jadi rumah kosong tak menambah tagihan.
      const kosong = () => { const n = RUMAH[Math.floor(rng() * RUMAH.length)]; return { n, divisi: Array.from({ length: (seni[n] || { kapasitas: 1 }).kapasitas }, () => '') }; };
      const daftar = bertema ? rencanaRumah(maks) : [];
      while (daftar.length < maks && RUMAH.length) daftar.push(kosong());
      let k = 0;
      for (const q of posisi) {
        if (k >= Math.min(daftar.length, maks)) break;
        const r = daftar[k], u = ukuranAtlas(atlas, r.n);
        if (!u) { k++; continue; }
        const cw = Math.ceil(u.w / T), ch = Math.ceil(u.h / T);
        if (!muat(q.gx, q.g - ch, cw, ch)) continue;
        tarukTk(r, q.gx, q.g - ch); q.isi = true; k++;
      }
      // Tiang lampu gang di sela tiap 2 rumah (hanya di antara dua rumah yang berdiri).
      for (let i = 0; i < posisi.length; i++) {
        const q = posisi[i], b = posisi[i + 1];
        if (q.lampu && q.isi && b && b.isi && b.g === q.g && q.sela !== null) taruh('lampu_luar_tiang_gang', q.sela, q.g - 3, 'padat', lot);
      }
      // Jalur fasilitas: taman kecil di ujung kiri, pos ronda di mulut jalan masuk, warung di sudut kanan, taman kedua
      // di kanan jalan masuk bila lebar; tiang lampu di samping pos ronda & warung; sisa baris bawah dipagari.
      const F = Rm.F, sKiri = [Rm.kiri, Rm.R - 1], sKanan = [Rm.R + 4, kerja(F, F + 2)];
      const pasang = (n, gx, t = 'padat') => { const u = ukuranAtlas(atlas, n); if (!u) return false; const cw = Math.ceil(u.w / T); return gx >= Rm.kiri && gx + cw - 1 <= Rm.kanan && taruh(n, gx, F + 3 - Math.ceil(u.h / T), t, lot); };
      // Mode Kantor di peta sempit: pos ronda wajib ada; kalau mulut jalan masuk terlalu sempit, pindah ke kanannya.
      const posDi = sKiri[1] - 3 >= sKiri[0] ? sKiri[1] - 3 : sKanan[0];
      pasang('luar_pos_ronda', posDi);
      pasang('lampu_luar_tiang_gang', sKiri[1] - 5);
      pasang('luar_warung_kopi', sKanan[1] - 3);
      pasang('lampu_luar_tiang_gang', sKanan[1] - 5);
      if (sKiri[1] - sKiri[0] >= 12) pasang('luar_taman_ketapang', sKiri[0]);
      if (sKanan[1] - sKanan[0] >= 14) pasang('luar_taman_ketapang', sKanan[0] + 1);
      for (const [a, b] of [sKiri, sKanan]) for (let x = a; x + 1 <= b; x += 3) taruh('luar_pagar_rumah', x, F + 2, 'padat', lot);
      // Gapura RT melintang di mulut jalan masuk (tembus: dilalui orang).
      const ug = ukuranAtlas(atlas, 'luar_gapura_rt');
      if (ug) taruh('luar_gapura_rt', Rm.R, H - 2 - Math.ceil(ug.h / T), 'lukis', (i) => kode[i] === JALAN && !terisi[i]);
      // Halaman: semak & bunga di rumput yang tersisa di baris rumah.
      for (const g of Rm.gang) for (let yy = g - 5; yy < g; yy++) for (let xx = Rm.kiri; xx <= Rm.kanan; xx++)
        if (rng() < 0.05 * padat) taruh(pilihBobot([['luar_semak', 3], ['luar_bunga_merah', 1], ['luar_bunga_kuning', 1], ['luar_pohon_muda', 1.5], ['luar_pot_tanah_liat', 0.6]]), xx, yy, 'padat', lot);
    }

    /* ---------------- kota ---------------- */
    function susunKota() {
      const C = kota;
      // Pembagian blok: jalan aspal 2 ubin di antara blok (dan di keliling kota).
      const bagi = (panjang, target) => {
        const n = Math.max(1, Math.floor((panjang - 2) / (target + 2)));
        const sisa = panjang - 2 * (n + 1), dasar = Math.floor(sisa / n);
        const out = []; let pos = 2;
        for (let i = 0; i < n; i++) { const w = dasar + (i < sisa - dasar * n ? 1 : 0); out.push([pos, w]); pos += w + 2; }
        return out;
      };
      const blok = P.blok || 1;
      const kolom = bagi(C.w, Math.round((12 + Math.floor(rng() * 5)) * blok)), baris = bagi(C.h, Math.round((9 + Math.floor(rng() * 3)) * blok));
      const nC = kolom.length, nR = baris.length;
      const grup = new Int32Array(nC * nR).fill(-1);
      const kelompok = [];
      const rentang = (i0, j0, a, b) => {
        const x = C.x + kolom[i0][0], y = C.y + baris[j0][0];
        const x1 = C.x + kolom[i0 + a - 1][0] + kolom[i0 + a - 1][1], y1 = C.y + baris[j0 + b - 1][0] + baris[j0 + b - 1][1];
        return { x, y, w: x1 - x, h: y1 - y };
      };
      const cariGrup = (a, b, jenis, acak, jauh) => {
        let best = null, dB = Infinity;
        for (let j = 0; j + b <= nR; j++) for (let i = 0; i + a <= nC; i++) {
          let bebas = true;
          for (let jj = j; jj < j + b; jj++) for (let ii = i; ii < i + a; ii++) if (grup[jj * nC + ii] >= 0) bebas = false;
          if (!bebas) continue;
          const rr = rentang(i, j, a, b);
          for (let yy = rr.y; yy < rr.y + rr.h && bebas; yy++) for (let xx = rr.x; xx < rr.x + rr.w; xx++) if (kode[id(xx, yy)] === CADANG) { bebas = false; break; }
          if (!bebas) continue;      // tangga/lift lantai lain ada di situ
          const d = (jauh ? -1 : 1) * (Math.abs(i + a / 2 - nC / 2) + Math.abs(j + b / 2 - nR / 2)) + (acak ? rng() * 2 : 0);
          if (d < dB) { dB = d; best = [i, j]; }
        }
        if (!best) return null;
        const g = kelompok.length;
        for (let jj = best[1]; jj < best[1] + b; jj++) for (let ii = best[0]; ii < best[0] + a; ii++) grup[jj * nC + ii] = g;
        const r = { ...rentang(best[0], best[1], a, b), jenis };
        kelompok.push(r);
        return r;
      };
      const pasangKantor = () => {
      // Kantor: gabungan blok terkecil yang muat ruangnya.
      if (kantor) {
        let pilih = null;
        for (let luas = 1; luas <= nC * nR && !pilih; luas++) for (let a = 1; a <= nC && !pilih; a++) {
          if (luas % a) continue;
          const b = luas / a;
          if (b > nR) continue;
          const coba = rentang(0, 0, a, b);
          if (coba.w - 2 >= kantor.w && coba.h - 2 >= kantor.h) pilih = [a, b];
        }
        if (pilih) {
          const r = cariGrup(pilih[0], pilih[1], 'kantor', true, P.taman >= 0.4);
          if (r) {
            kantor.gx = r.x + 1 + Math.floor((r.w - 2 - kantor.w) / 2);
            kantor.gy = r.y + r.h - 1 - kantor.h;
            kantor.diKota = true;
          }
        }
      }
      };
      const pasangTaman = () => {
      if (P.taman > 0) {
        const a = Math.max(1, Math.ceil(nC * P.taman - 0.2)), b = Math.max(1, Math.ceil(nR * P.taman - 0.2));
        // Coba dari ukuran terbesar yang diminta, mengecil sampai muat.
        const ukuranTaman = [];
        for (let aa = Math.min(a, nC); aa >= 1; aa--) for (let bb = Math.min(b, nR); bb >= 1; bb--) ukuranTaman.push([aa, bb]);
        ukuranTaman.sort((p1, p2) => p2[0] * p2[1] - p1[0] * p1[1]);
        for (const [aa, bb] of ukuranTaman) if (cariGrup(aa, bb, 'taman', true)) break;
      }
      };
      pasangKantor(); pasangTaman();   // taman dominan: kantor menepi ke pojok, taman tetap di tengah
      for (let j = 0; j < nR; j++) for (let i = 0; i < nC; i++) if (grup[j * nC + i] < 0) {
        const g = kelompok.length;
        grup[j * nC + i] = g;
        kelompok.push({ ...rentang(i, j, 1, 1), jenis: rng() < (P.tamanAcak || 0) ? 'taman' : 'rumah' });
      }
      const cadang = kode.slice();          // tangga/lift lantai lain tetap di tempatnya
      tandai(C.x, C.y, C.w, C.h, JALAN, 'lantai_kota_aspal');
      for (const r of kelompok) {
        tandai(r.x, r.y, r.w, r.h, TROTOAR, 'lantai_trotoar');
        tandai(r.x + 1, r.y + 1, r.w - 2, r.h - 2, LOT, r.jenis === 'kantor' ? 'lantai_luar_paving' : 'lantai_luar_rumput');
        lot.push(r);
      }
      for (let i = 0; i < N; i++) if (cadang[i] === CADANG) { kode[i] = CADANG; ubin[i] = 'lantai_luar_paving'; }
      if (kantor && kantor.diKota) tandai(kantor.gx, kantor.gy, kantor.w, kantor.h, KANTOR, null);
    }

    function isiLot(r) {
      const dalam = (i) => kode[i] === LOT && !larang[i];
      if (r.jenis === 'taman') isiTaman({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 });
      else if (r.jenis === 'rumah') {
        // rumah/toko rata bawah menempel trotoar, dari kiri ke kanan
        let x = r.x + 1;
        const yBawah = r.y + r.h - 1;
        const RUMAH = ['luar_rumah_merah', 'luar_rumah_biru', 'luar_rumah_toko', 'luar_rumah_lab'].filter(ada);
        let coba = 0;
        while (x < r.x + r.w - 1 && coba++ < 8) {
          const muat = RUMAH.filter(n => { const u = ukuranAtlas(atlas, n); return Math.ceil(u.w / T) <= r.x + r.w - 1 - x && Math.ceil(u.h / T) <= r.h - 2; });
          if (!muat.length) break;
          const n = muat[Math.floor(rng() * muat.length)], u = ukuranAtlas(atlas, n);
          const cw = Math.ceil(u.w / T), ch = Math.ceil(u.h / T);
          if (taruh(n, x, yBawah - ch, 'padat', dalam)) x += cw + (rng() < 0.5 ? 1 : 0);
          else x++;
        }
        // halaman: pohon & semak kecil di sisa ruang
        for (let yy = r.y + 1; yy < r.y + r.h - 1; yy++) for (let xx = r.x + 1; xx < r.x + r.w - 1; xx++)
          if (rng() < 0.08 * padat) taruh(pilihBobot([['luar_semak', 3], ['luar_pohon_muda', 2], ['luar_bunga_merah', 1], ['luar_bunga_kuning', 1], ['luar_pot_tanah_liat', 0.6]]), xx, yy, 'padat', dalam);
      }
      else if (r.jenis === 'kantor') {
        // pelataran kantor: peneduh, pot, bangku, lampu taman (bukan paving kosong)
        for (let yy = r.y + 1; yy < r.y + r.h - 1; yy++) for (let xx = r.x + 1; xx < r.x + r.w - 1; xx++)
          if (rng() < 0.06 * padat) taruh(pilihBobot([['luar_pohon_muda', 3], ['luar_pot_tanah_liat', 2], ['luar_bangku_taman', 1.5], ['lampu_taman', 1.5], ['luar_semak', 1.5], ['luar_pohon_rimbun', 0.6]]), xx, yy, 'padat', dalam);
      }
      // Trotoar sisi bawah lot: lampu jalan, pohon trotoar, bangku, tempat sampah (menjulang ke dalam lot).
      const yT = r.y + r.h - 1;
      const bolehTrotoar = (i) => kode[i] === TROTOAR || kode[i] === LOT;
      for (let xx = r.x + 1; xx < r.x + r.w - 1; xx++) {
        const s = (xx - r.x) % 6;
        const n = s === 1 ? 'luar_lampu_jalan' : s === 4 ? 'luar_pohon_muda' : s === 3 && rng() < 0.3 ? 'luar_tempat_sampah' : null;
        if (!n) continue;
        const u = ukuranAtlas(atlas, n);
        if (!u) continue;
        const ch = Math.ceil(u.h / T);
        taruh(n, xx, yT - ch + 1, 'padat', bolehTrotoar);
      }
    }

    function isiTaman(Q) {
      if (Q.w < 4 || Q.h < 4) return;
      const dalam = (i) => (kode[i] === LOT || kode[i] === TROTOAR) && !larang[i];
      const cx = Q.x + Math.floor(Q.w / 2) - 1, cy = Q.y + Math.floor(Q.h / 2) - 1;
      const jalanT = (x, y, w, h, n) => {
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
          if (xx < Q.x || yy < Q.y || xx >= Q.x + Q.w || yy >= Q.y + Q.h) continue;
          ubin[id(xx, yy)] = n; larang[id(xx, yy)] = 1;
        }
      };
      const besar = Q.w >= 16 && Q.h >= 12;
      if (besar) {                                   // jalan melingkar
        jalanT(Q.x + 2, Q.y + 2, Q.w - 4, 1, 'lantai_luar_paving'); jalanT(Q.x + 2, Q.y + Q.h - 3, Q.w - 4, 1, 'lantai_luar_paving');
        jalanT(Q.x + 2, Q.y + 2, 1, Q.h - 4, 'lantai_luar_paving'); jalanT(Q.x + Q.w - 3, Q.y + 2, 1, Q.h - 4, 'lantai_luar_paving');
      }
      if (Q.w >= 7) jalanT(cx, Q.y, 2, Q.h, 'lantai_kota_batu_alam');
      if (Q.h >= 7) jalanT(Q.x, cy, Q.w, 2, 'lantai_kota_batu_alam');
      if (Q.w >= 8 && Q.h >= 8) {                    // plaza + air mancur di tengah
        jalanT(cx - 1, cy - 1, 4, 4, 'lantai_luar_paving');
        const u = ukuranAtlas(atlas, 'luar_air_mancur');
        if (u) {
          for (let yy = cy; yy < cy + 2; yy++) for (let xx = cx; xx < cx + 2; xx++) terisi[id(xx, yy)] = 1;
          opsBenda.push({ t: 'penuh', n: 'luar_air_mancur', x: cx * T + Math.floor((32 - u.w) / 2), y: cy * T + 32 - u.h });
        }
        for (const [lx, ly] of [[cx - 2, cy - 2], [cx + 3, cy - 2], [cx - 2, cy + 2], [cx + 3, cy + 2]]) taruh('lampu_taman', lx, ly - 1, 'padat', dalam);
      }
      // kuadran: gazebo, kolam, bedeng bunga, bangku, pohon
      const kuad = [[Q.x, Q.y, cx - Q.x, cy - Q.y], [cx + 2, Q.y, Q.x + Q.w - cx - 2, cy - Q.y],
        [Q.x, cy + 2, cx - Q.x, Q.y + Q.h - cy - 2], [cx + 2, cy + 2, Q.x + Q.w - cx - 2, Q.y + Q.h - cy - 2]];
      const bangun = ['luar_gazebo', 'luar_kolam', 'bedeng', 'bedeng'];
      for (let a = bangun.length - 1; a > 0; a--) { const b = Math.floor(rng() * (a + 1)); [bangun[a], bangun[b]] = [bangun[b], bangun[a]]; }
      kuad.forEach(([kx, ky, kw, kh], qi) => {
        // Cari tempat yang muat di kuadran, dari tengah kuadran ke luar (jalan taman tak tertimpa).
        const cariSpot = (cw, ch) => {
          let best = null, dB = Infinity;
          for (let yy = ky; yy + ch <= ky + kh; yy++) for (let xx = kx; xx + cw <= kx + kw; xx++) {
            let ok = true;
            for (let y2 = yy; y2 < yy + ch && ok; y2++) for (let x2 = xx; x2 < xx + cw && ok; x2++) { const i = id(x2, y2); if (terisi[i] || !dalam(i)) ok = false; }
            const d = Math.abs(xx + cw / 2 - (kx + kw / 2)) + Math.abs(yy + ch / 2 - (ky + kh / 2));
            if (ok && d < dB) { dB = d; best = [xx, yy]; }
          }
          return best;
        };
        const b = bangun[qi];
        if (b === 'bedeng') {
          const s = cariSpot(3, 2);
          if (s) {
            for (let yy = s[1]; yy < s[1] + 2; yy++) for (let xx = s[0]; xx < s[0] + 3; xx++) ubin[id(xx, yy)] = 'lantai_luar_rumput_bunga';
            for (let yy = s[1]; yy < s[1] + 2; yy++) for (let xx = s[0]; xx < s[0] + 3; xx++)
              if (rng() < 0.6) taruh(rng() < 0.5 ? 'luar_bunga_merah' : 'luar_bunga_kuning', xx, yy, 'lukis', dalam);
          }
        } else {
          const u = ukuranAtlas(atlas, b);
          const s = u && cariSpot(Math.ceil(u.w / T), Math.ceil(u.h / T));
          if (s) taruh(b, s[0], s[1], b === 'luar_kolam' ? 'penuh' : 'padat', dalam);
        }
        // bangku menghadap jalan silang
        if (Q.h >= 7) for (let xx = kx + 1; xx + 1 < kx + kw; xx += 5) if (rng() < 0.7) taruh('luar_bangku_taman', xx, qi < 2 ? cy - 1 : cy + 2, 'padat', dalam);
      });
      // pohon di sisa rumput taman (tepi dulu = barisan peneduh)
      for (let yy = Q.y; yy < Q.y + Q.h; yy++) for (let xx = Q.x; xx < Q.x + Q.w; xx++) {
        const tepi = xx <= Q.x + 1 || yy <= Q.y + 1 || xx >= Q.x + Q.w - 2 || yy >= Q.y + Q.h - 2;
        if (rng() < (tepi ? 0.22 : 0.07) * padat)
          taruh(pilihBobot([['luar_pohon_sakura', 2], ['luar_pohon_rimbun', 1.5], ['luar_pohon', 2], ['luar_pohon_muda', 1.5], ['luar_semak', 2], ['luar_semak_bugenvil', 1]]), xx, yy, 'padat', dalam);
      }
      if (HEWAN_TAMAN.length) for (let n = 0; n < 2; n++) taruh(HEWAN_TAMAN[Math.floor(rng() * HEWAN_TAMAN.length)], cx - 1 + Math.floor(rng() * 4), cy + (n ? 2 : -1), 'padat', (i) => !terisi[i]);
    }
  }
  const HEWAN_TAMAN = ['hewan_merpati_diam', 'hewan_kucing_diam'];

  /* ======================================================================
   * UI — jendela "Generate peta" di Edit Layout
   * ==================================================================== */
  const Ui = { jenis: 'alam', ukuran: 'sedang', kepadatan: 'sedang', benih: null, tempatKerja: 'kantor' };
  const TEMPAT_KERJA = { kantor: 'Kantor', bertema: 'Bertema' };
  function elm(tag, sifat = {}, ...anak) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(sifat)) {
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
      else if (k in e) e[k] = v; else e.setAttribute(k, v);
    }
    for (const a of anak) if (a != null) e.append(a);
    return e;
  }
  function jendela() {
    let w = document.getElementById('ed-generator');
    if (!w) { w = elm('div', { id: 'ed-generator', className: 'ed-sifat ed-generator editor tersembunyi', role: 'dialog', 'aria-label': 'Generate peta' }); document.body.append(w); }
    return w;
  }
  function tutup() { const w = document.getElementById('ed-generator'); if (w) w.classList.add('tersembunyi'); }
  function ukuranTerkunci() {
    const akar = typeof akarEditor === 'function' ? akarEditor() : null;
    return akar && (Editor.tingkat || (akar.tingkat || []).length) ? akar : null;
  }
  function isi() {
    const w = jendela();
    w.innerHTML = '';
    if (Ui.benih == null) Ui.benih = benihAcak();
    const kunci = ukuranTerkunci();
    const kartu = elm('div', { className: 'gen-jenis', role: 'radiogroup', 'aria-label': 'Jenis peta' });
    for (const [k, j] of Object.entries(JENIS)) {
      kartu.append(elm('button', { type: 'button', role: 'radio', className: 'gen-kartu' + (Ui.jenis === k ? ' aktif' : ''),
        'aria-checked': String(Ui.jenis === k), title: j.ket, on: { click: () => { Ui.jenis = k; isi(); } } },
      elm('span', { className: 'gen-ikon', textContent: j.ikon }), elm('b', { textContent: j.nama }), elm('small', { textContent: j.ket })));
    }
    const pilihUkuran = elm('select', { disabled: !!kunci, on: { change: (e) => { Ui.ukuran = e.target.value; } } },
      ...Object.entries(UKURAN).map(([k, [a, b]]) => elm('option', { value: k, selected: Ui.ukuran === k, textContent: `${k[0].toUpperCase() + k.slice(1)} · ${a}×${b} ubin` })));
    const segmen = elm('div', { className: 'gen-segmen', role: 'radiogroup', 'aria-label': 'Kepadatan' },
      ...Object.keys(KEPADATAN).map(k => elm('button', { type: 'button', role: 'radio', className: Ui.kepadatan === k ? 'aktif' : '',
        'aria-checked': String(Ui.kepadatan === k), textContent: k[0].toUpperCase() + k.slice(1), on: { click: () => { Ui.kepadatan = k; isi(); } } })));
    const segmenTk = elm('div', { className: 'gen-segmen', role: 'radiogroup', 'aria-label': 'Tempat kerja' },
      ...Object.entries(TEMPAT_KERJA).map(([k, nama]) => elm('button', { type: 'button', role: 'radio', className: Ui.tempatKerja === k ? 'aktif' : '',
        'aria-checked': String(Ui.tempatKerja === k), textContent: nama,
        title: k === 'kantor' ? 'Ruang Kantor berisi meja kerja (seperti sebelumnya)'
          : Ui.jenis === 'perumahan' ? 'Tiap divisi mendapat rumah di gang kompleks (bekerja di dalam, malam pulang ke rumahnya)'
          : 'Tiap divisi mendapat tempat kerja modulnya (rumah genset, menara radio, ...) + tempat kerja umum sesuai jenis peta',
        on: { click: () => { Ui.tempatKerja = k; isi(); } } })));
    const masukan = elm('input', { type: 'text', inputMode: 'numeric', value: String(Ui.benih), 'aria-label': 'Seed', spellcheck: false,
      on: { change: (e) => { Ui.benih = normalBenih(e.target.value); e.target.value = String(Ui.benih); } } });
    const salin = elm('button', { type: 'button', textContent: 'Salin', title: 'Salin seed', on: { click: async (e) => {
      const t = e.currentTarget;
      try { await navigator.clipboard.writeText(String(Ui.benih)); t.textContent = 'Tersalin'; } catch (_) { masukan.select(); t.textContent = 'Pilih & salin'; }
      setTimeout(() => { t.textContent = 'Salin'; }, 1400);
    } } });
    const acak = elm('button', { type: 'button', textContent: '🎲 Acak ulang', title: 'Seed baru = dunia baru', on: { click: () => { Ui.benih = benihAcak(); masukan.value = String(Ui.benih); jalankan(); } } });
    const baris = (label, ...isiB) => elm('label', { className: 'gen-baris' }, elm('span', { textContent: label }), ...isiB);
    w.append(
      elm('div', { className: 'sifat-kepala' }, elm('span', { textContent: '🎲 Generate peta' }),
        elm('button', { type: 'button', className: 'gen-tutup', textContent: '✕', 'aria-label': 'Tutup', on: { click: tutup } })),
      elm('div', { className: 'gen-isi' },
        kartu,
        baris('Ukuran', pilihUkuran),
        kunci ? elm('small', { className: 'gen-catatan', textContent: `Kantor bertingkat: ukuran ikut lantai 1 (${kunci.lebar}×${kunci.tinggi}).` }) : null,
        baris('Kepadatan', segmen),
        baris('Tempat kerja', segmenTk),
        baris('Seed', elm('div', { className: 'gen-benih' }, masukan, salin)),
        // 1 Okt — keterangan seed di balik ikon "?" (infopop.js) di kanan label "Seed"; #gen-info tinggal kabar hasil Buat.
        elm('small', { className: 'gen-catatan', 'data-info': 'Seed', 'data-info-di': 'label', textContent: 'Seed yang sama selalu menghasilkan peta yang sama. Hasil masuk sebagai denah belum tersimpan.' }),
        elm('div', { className: 'gen-aksi' },
          elm('button', { type: 'button', className: 'utama', textContent: 'Buat', on: { click: () => { Ui.benih = normalBenih(masukan.value); jalankan(); } } }),
          acak),
        elm('small', { className: 'gen-catatan', id: 'gen-info' })));
  }
  function buka() {
    if (typeof Editor === 'undefined' || !Editor.aktif) return;
    // 0.70.0 — Kantor saya (bukan pemilik): generate hanya bila dijual pemilik (server tetap menolak bila tidak).
    if (typeof KantorSaya !== 'undefined' && !KantorSaya.bolehGenerate()) {
      kabarEditor('Generate peta belum dijual pemilik kantor. Susun kantormu dengan perabot dari katalog.');
      return;
    }
    const w = jendela();
    if (!w.classList.contains('tersembunyi')) { tutup(); return; }
    isi();
    w.classList.remove('tersembunyi');
  }
  function jalankan() {
    if (typeof Editor === 'undefined' || !Editor.aktif) return;
    const akar = akarEditor();
    const lama = Editor.data;
    const kunci = ukuranTerkunci();
    const kursi = [];
    for (const mj of (lama.meja || [])) for (const d of (mj.divisi || [''])) kursi.push(d);
    const { denah, info } = buat({ jenis: Ui.jenis, ukuran: Ui.ukuran, kepadatan: Ui.kepadatan, benih: Ui.benih, atlas,
      lebar: kunci ? kunci.lebar : null, tinggi: kunci ? kunci.tinggi : null, kursi, nama: Editor.tingkat ? null : akar.nama,
      tempatKerja: Ui.tempatKerja,
      pertahankan: (lama.ops || []).filter(o => /^antar_/.test(o.n || '') && o.x !== undefined) });
    const lantai1 = !Editor.tingkat;
    const simpanTingkat = lantai1 ? akar.tingkat : null, gaya = lantai1 ? akar.pintuGaya : null;
    ubahDenah((dd) => {
      for (const k of Object.keys(dd)) delete dd[k];
      Object.assign(dd, salinJSON(denah));
      if (!lantai1) { delete dd.pintuUtama; delete dd.nama; }
      if (simpanTingkat) dd.tingkat = simpanTingkat;
      if (gaya) dd.pintuGaya = gaya;
    });
    Editor.pilihan = null;
    Editor.generate = true;
    const nama = JENIS[info.jenis].nama;
    const teks = `Peta ${nama} (seed ${info.benih}, ${info.lebar}×${info.tinggi}, ${info.ops} ops, ${info.ms} ms) — belum tersimpan, tekan Simpan. Bisa diurungkan.`;
    kabarEditor(teks);
    const inf = document.getElementById('gen-info');
    if (inf) inf.textContent = `Dibuat dalam ${info.ms} ms · ${info.ops} ops. Seed ${info.benih}.`;
    const masuk = document.querySelector('#ed-generator input');
    if (masuk) masuk.value = String(info.benih);
    // Kantor saya (bukan pemilik): beri tahu tagihan koin yang akan dibayar saat Simpan.
    // 0.70.0 — isi hasil generate dibayar harga tetap pemilik (+ perabot lain per item, dikurangi kembalian).
    const pemilik = (window.AGENTPAK || {}).peran === 'pemilik';
    if (!pemilik && typeof kantorSaya === 'function' && kantorSaya()) {
      const rp = (n) => Number(n || 0).toLocaleString('id-ID');
      fetch(AKAR + '/api/kantor-saya/biaya' + KantorSaya.penandaGenerate(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(akarEditor()) })
        .then(r => r.json().then(j => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (!ok) { if (j && j.galat) kabarEditor(teks + ' ' + j.galat); return; }
          if (!j.belanja) return;
          const bl = j.belanja, b = bl.bersih, g = bl.generate || {};
          const lain = bl.beli - (g.tagih || 0);
          const rinci = g.tagih ? ` (generate ${rp(g.tagih)}${lain ? ` + perabot lain ${rp(lain)}` : ''}${bl.kembali ? ` − kembali ${rp(bl.kembali)}` : ''})` : '';
          kabarEditor(teks + (b > 0 ? ` Akan ditagih ${rp(b)} koin${rinci} saat disimpan (saldo ${rp(j.saldo)})${j.cukup ? '' : ' — koin belum cukup'}.`
            : b < 0 ? ` Saat disimpan kamu mendapat kembali ${rp(-b)} koin.` : ' Tanpa biaya koin.'));
        }).catch(() => {});
    }
    if (typeof KantorSaya !== 'undefined') KantorSaya.jadwalBelanja();
  }

  return { buat, buka, tutup, JENIS, UKURAN, KEPADATAN, TEMPAT_KERJA, normalBenih, benihAcak, _mulberry32: mulberry32, _fbm: fbm };
})();
if (typeof globalThis !== 'undefined') globalThis.GeneratorPeta = GeneratorPeta;
