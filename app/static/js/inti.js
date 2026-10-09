/* Kevi — inti: aset, keadaan bersama, pembantu DOM & API.
 *
 * Semua skrip Kevi berbagi satu ruang nama global (skrip klasik, tanpa bundler), sama seperti Agent Pak,
 * supaya tokoh.js bisa dipakai apa adanya: ia membaca `atlas` dan `lembar` dari global.
 */
'use strict';

const T = 16;                          // satu ubin
const VERSI_ASET = document.documentElement.dataset.aset || '';
const V = VERSI_ASET ? '?v=' + VERSI_ASET : '';

let lembar = null, atlas = null;       // dipakai tokoh.js

// Keadaan permainan di peramban. Yang bernilai (koin, inventori, rumah) selalu salinan jawaban server.
const G = {
  saya: null,            // { id, username, peran }
  karakter: null,        // { nama, tampilan }
  koin: 0, inventori: {}, misi: null, toko: null,
  katalog: null, kantor: null, gbr: {},
  adegan: 'kantor',      // 'kantor' | 'rumah:<id>'
  rumah: null, pemilikRumah: null, rumahSaya: false,
  entitas: new Map(),    // id -> entitas (pemain lain & NPC); pemain sendiri = G.aku
  aku: null,
  grid: null,
  kamera: { x: 0, y: 0, skala: 3 },
  duduk: null,           // kursi yang sedang diduduki
  bangun: null,          // mode bangun: { barang, r } | { ambil: true }
  terdekat: null,        // benda yang bisa diinteraksi (tombol E)
  kini: 0,
  level: { xp: 0, level: 1, dasar: 0, lanjut: 100, stamina: 100 },
  buka: {}, namaBuka: {}, hadiahNaik: 40,
  atur: { laju_jalan: 84, bookmark: [], pengumuman: '' },
  titik: [],             // titik interaksi tambahan dari admin
  health: { nilai: 100, lelah: false, kopi: 0 },   // lelah karena lari; dihitung di sini, pulih saat diam
  stamina: { nilai: 100, maks: 100 },              // lapar; dihitung server, turun karena kerja dan lama daring
  peta: null,            // peta utama (kantor): dasar + tambahan admin
  zoom: 0,               // 0 = otomatis
  remote: false,         // boleh memakai remote SSH/telnet
  totp: false,           // akun ini memasang kode sekali pakai
  tas: { jumlah: 0, kapasitas: 20, harga: 300 },
  tata: { urut: [], hotbar: [], bilah: true },      // tata letak inventory, isi hotbar, pilihan tampilan
};

// Interaksi yang terkunci level: true bila sudah terbuka untuk pemain ini.
function terbuka(kunci) { return G.level.level >= (G.buka[kunci] || 1); }
function pesanKunci(kunci) { return (G.namaBuka[kunci] || kunci) + ' terbuka di level ' + (G.buka[kunci] || 1) + '.'; }

function aturLevel(lv, naik) {
  if (!lv) return;
  const xpNaik = lv.xp - G.level.xp;
  G.level = lv;
  const cip = $('#hud-level');
  if (cip) {
    cip.textContent = 'Lv ' + lv.level;
    const isi = $('#hud-xp i'), lebar = lv.lanjut ? (lv.xp - lv.dasar) / (lv.lanjut - lv.dasar) : 1;
    isi.style.transform = 'scaleX(' + Math.max(0, Math.min(1, lebar)).toFixed(3) + ')';
    $('#hud-xp').title = lv.lanjut ? `${lv.xp - lv.dasar} / ${lv.lanjut - lv.dasar} XP menuju level ${lv.level + 1}` : 'Level tertinggi';
    $('#hud-xp-angka').textContent = lv.lanjut ? `${lv.xp - lv.dasar}/${lv.lanjut - lv.dasar}` : 'Maks';
  }
  if (xpNaik > 0 && G.aku && !naik) apung('+' + xpNaik + ' XP', '#c4b5fd', G.aku.x + 8, G.aku.y - 12);
  if (naik) {
    G.health.nilai = lv.stamina;
    if (G.aku) G.aku.emot = { n: 'kilau', sampai: performance.now() + 3000 };
    if (typeof Panel !== 'undefined') Panel.naikLevel(lv.level);
  }
}

/* ---------- DOM ---------- */

function el(tag, atribut, ...anak) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atribut || {})) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'kelas') e.className = v;
    else if (k === 'teks') e.textContent = v;
    else if (k === 'gaya') Object.assign(e.style, v);
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const a of anak.flat()) if (a != null && a !== false) e.append(a);
  return e;
}
const $ = (s) => document.querySelector(s);

/* ---------- API ---------- */

async function api(jalur, badan) {
  const opsi = badan === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(badan) };
  let r;
  try { r = await fetch(jalur, opsi); }
  catch (e) { throw new Error('Server tidak terjangkau.'); }
  if (r.status === 401) { location.href = '/masuk'; throw new Error('Sesi habis.'); }
  let d = {};
  try { d = await r.json(); } catch (e) { /* jawaban tanpa badan */ }
  if (!r.ok) throw new Error(d.galat || ('Galat ' + r.status));
  return d;
}

// Aksi permainan: panggil API, serap koin/inventori/misi/rumah dari jawaban, tampilkan galat sebagai kabar.
async function aksi(jalur, badan) {
  try {
    const d = await api(jalur, badan || {});
    serap(d);
    return d;
  } catch (e) { kabar(e.message, 'galat'); return null; }
}

function serap(d) {
  if (!d) return;
  if (typeof d.koin === 'number') aturKoin(d.koin);
  if (d.inventori) G.inventori = d.inventori;
  if (d.tas) G.tas = d.tas;
  if (d.tata) G.tata = d.tata;
  if (d.misi) G.misi = d.misi;
  if (d.level) aturLevel(d.level, d.naik);
  if (d.stamina && typeof d.stamina === 'object') aturStamina(d.stamina);
  if (d.rumah && G.rumahSaya) { G.rumah = d.rumah; if (typeof Rumah !== 'undefined') Rumah.segarkan(); }
  document.dispatchEvent(new CustomEvent('kevi:segar'));
}

// Server berversi lain dari halaman ini (sesudah rilis; WS putus lalu menyambung ulang): pita menonjol sampai dimuat ulang.
// Halaman HTML disajikan no-store, jadi muat ulang biasa sudah membawa alamat aset `?v=` yang baru.
const Versi = {
  periksa(versi, aset) {
    const ini = document.documentElement.dataset.versi || '';
    if (!versi || (versi === ini && (!aset || aset === VERSI_ASET)) || $('#versi-baru')) return;
    document.body.append(el('div', { id: 'versi-baru', role: 'alert' },
      el('b', { teks: versi !== ini ? `Versi baru Kevi ${versi} tersedia.` : 'Kevi baru saja diperbarui.' }),
      el('span', { teks: 'Muat ulang: Ctrl + Shift + R (atau tutup dan buka lagi peramban).' }),
      el('button', { kelas: 'tombol kecil utama', teks: 'Muat ulang', on: { click: () => location.reload() } })));
    document.body.classList.add('ada-versi-baru');
    const ukur = () => document.body.style.setProperty('--versi-tinggi', $('#versi-baru').offsetHeight + 'px');      // menu atas turun setinggi pita
    ukur(); addEventListener('resize', ukur);
  },
};

// Stamina (lapar) dari server. Memberi tahu sekali saat mulai lapar dan sekali saat habis.
function aturStamina(s) {
  const lama = G.stamina, bagian = (v) => (v.nilai <= 0 ? 0 : v.nilai < v.maks * 0.25 ? 1 : 2);
  G.stamina = { nilai: s.nilai, maks: s.maks };
  if (lama.dimuat && bagian(G.stamina) < bagian(lama)) {
    kabar(G.stamina.nilai <= 0 ? 'Kelaparan: tidak bisa lari, lelah lambat pulih, XP kerja tinggal separuh. Makan dulu (pegang makanan, tekan F).'
      : 'Mulai lapar. Makan sesuatu: pegang makanan di hotbar lalu tekan F.', 'galat');
  }
  G.stamina.dimuat = true;
  if (typeof Hud !== 'undefined' && $('#hud-stamina')) Hud.lapar();
}
// Seberapa cepat lelah pulih, menurut rasa lapar.
function faktorLapar() { const s = G.stamina; return s.nilai <= 0 ? 0.25 : s.nilai < s.maks * 0.25 ? 0.6 : 1; }

function aturKoin(n) {
  const beda = n - G.koin;
  G.koin = n;
  const k = $('#hud-koin');
  if (k) k.textContent = n.toLocaleString('id-ID');
  if (beda && G.aku) apung((beda > 0 ? '+' : '') + beda, beda > 0 ? '#fde68a' : '#fca5a5');
}

/* ---------- kabar (toast) & angka melayang ---------- */

function kabar(teks, jenis) {
  const wadah = $('#kabar');
  if (!wadah || !teks) return;
  const k = el('div', { kelas: 'kabar-butir' + (jenis ? ' ' + jenis : ''), teks });
  wadah.append(k);
  setTimeout(() => k.classList.add('pudar'), 3200);
  setTimeout(() => k.remove(), 3800);
}

const apungan = [];
function apung(teks, warna, x, y) {
  const a = G.aku;
  apungan.push({ teks, warna: warna || '#fff', x: x ?? (a ? a.x + 8 : 0), y: y ?? (a ? a.y - 4 : 0), lahir: performance.now() });
}

/* ---------- aset ---------- */

function muatGambar(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(src + ' gagal dimuat'));
    i.src = src;
  });
}

async function muatAset() {
  const j = (u) => fetch(u + V).then(r => { if (!r.ok) throw new Error(u + ' gagal dimuat'); return r.json(); });
  [lembar, atlas, G.kantor, G.katalog, G.gbr.latar, G.gbr.depan] = await Promise.all([
    muatGambar('/static/gambar/sprite.png' + V), j('/static/gambar/atlas.json'),
    j('/static/peta/kantor.json'), j('/static/peta/katalog.json'),
    muatGambar('/static/peta/kantor_latar.png' + V), muatGambar('/static/peta/kantor_depan.png' + V),
  ]);
  // Sprite milik Kevi sendiri (zombie, senjata; dipasang tools/pasang_sprite.py): tiap PNG satu berkas, masuk atlas
  // dengan nama berkasnya dan gambarnya sendiri (medan `g`). Gagal memuatnya tidak menghentikan permainan.
  // Zombie dan senjata yang dipegang bergaris tepi 1 px (medan `pad`), seperti tokoh Agent Pak.
  try {
    const nama = await j('/static/gambar/kevi/daftar.json');
    await Promise.all(nama.map(async (n) => { try { const g = await muatGambar('/static/gambar/kevi/' + n + '.png' + V); atlas[n] = { x: 0, y: 0, w: g.naturalWidth, h: g.naturalHeight, g, pad: /^zombie_|_pegang$/.test(n) ? 1 : 0 }; } catch (e) { /* satu berkas hilang: lewati */ } }));
  } catch (e) { /* belum ada sprite Kevi */ }
}

/* ---------- sprite ---------- */

// Gambar satu bingkai atlas; (x, y) = pojok kiri-atas seninya (pad atlas dikurangi sendiri).
function lukis(k, nama, x, y) {
  const p = atlas[nama];
  if (!p) return false;
  const pad = p.pad || 0;
  k.drawImage(p.g || lembar, p.x, p.y, p.w, p.h, Math.round(x) - pad, Math.round(y) - pad, p.w, p.h);
  return true;
}

function putarR(r) { return ((r | 0) % 4 + 4) % 4; }
function namaPutar(n, r) { r = putarR(r); return r && atlas[n + '__r' + r] ? n + '__r' + r : n; }
function ukuranSprite(n, r) {
  const p = atlas[namaPutar(n, r)] || atlas[n];
  if (!p) return { w: T, h: T };
  const pad = p.pad || 0;
  return { w: p.w - 2 * pad, h: p.h - 2 * pad };
}
// Bingkai animasi perabot (nama__f1, __f2, …) pada waktu t detik.
function bingkaiHidup(n, t, laju) {
  if (!atlas[n + '__f1']) return n;
  let jml = 1;
  while (atlas[n + '__f' + jml]) jml++;
  const i = Math.floor(t * (laju || 3)) % jml;
  return i ? n + '__f' + i : n;
}

// Ikon sprite sebagai elemen DOM (latar = lembar sprite), dipaskan ke kotak `maks` px.
function ikon(nama, maks = 40) {
  const p = atlas[nama];
  const kotak = el('span', { kelas: 'ikon', gaya: { width: maks + 'px', height: maks + 'px' } });
  if (!p) return kotak;
  // Sprite kecil diperbesar dengan kelipatan setengah (tetap tajam); sprite yang lebih besar dari kotaknya dikecilkan
  // sampai pas. Selalu ditambatkan di tengah kotak (lihat .ikon > span), berapa pun ukuran aslinya.
  const pas = maks / Math.max(p.w, p.h), s = pas >= 1 ? Math.min(3, Math.floor(pas * 2) / 2) : pas;
  kotak.append(el('span', { gaya: {
    width: p.w + 'px', height: p.h + 'px', backgroundImage: p.g ? `url(${p.g.src})` : `url(/static/gambar/sprite.png${V})`,
    backgroundPosition: `-${p.x}px -${p.y}px`, transform: `translate(-50%, -50%) scale(${+s.toFixed(4)})`,
  } }));
  return kotak;
}

// Sementara, sampai ikon pixel senjata ada: glif.
const IKON_SENJATA = { sapu: '🧹', kunci_inggris: '🔧', tongkat_bisbol: '🏏', kabel_lan: '➰', pemadam_api: '🧯' };
// Ikon untuk kode barang inventori (perabot, benih:, panen:, lantai:, tembok, pakan, produk kandang).
function ikonBarang(b, maks) {
  if (b.startsWith('makan:')) return ikon(((G.toko.makanan || {})[b.slice(6)] || {}).ikon || 'ikon_panen_pakan', maks);
  if (b.startsWith('benih:')) return ikon('tani_' + b.slice(6) + '_1', maks);
  if (b.startsWith('panen:')) return ikon('ikon_panen_' + b.slice(6), maks);
  if (b.startsWith('lantai:')) return ikon(b.slice(7), maks);
  if (b === 'tembok') return el('span', { kelas: 'ikon ikon-tembok', gaya: { width: (maks || 40) + 'px', height: (maks || 40) + 'px' } });
  if (b === 'pakan') return ikon('ikon_panen_pakan', maks);
  if (b === 'hp') return el('span', { kelas: 'ikon ikon-senjata', teks: '📱', gaya: { width: (maks || 40) + 'px', height: (maks || 40) + 'px', fontSize: Math.round((maks || 40) * 0.62) + 'px' } });
  if (b.startsWith('senjata:') && atlas['senjata_' + b.slice(8)]) return ikon('senjata_' + b.slice(8), maks);
  if (b.startsWith('senjata:')) return el('span', { kelas: 'ikon ikon-senjata', teks: IKON_SENJATA[b.slice(8)] || '✊', gaya: { width: (maks || 40) + 'px', height: (maks || 40) + 'px', fontSize: Math.round((maks || 40) * 0.62) + 'px' } });
  if (atlas['ikon_panen_' + b]) return ikon('ikon_panen_' + b, maks);
  return ikon(b, maks);
}

function namaBarang(b) {
  const t = G.toko || {};
  if (b.startsWith('senjata:')) return ((t.senjata || {})[b.slice(8)] || { nama: b.slice(8) }).nama;
  if (b === 'hp') return 'Handphone';
  if (b.startsWith('makan:')) return ((t.makanan || {})[b.slice(6)] || { nama: b.slice(6) }).nama;
  if (b.startsWith('benih:')) return 'Benih ' + ((t.tanaman || {})[b.slice(6)] || { nama: b.slice(6) }).nama.toLowerCase();
  if (b.startsWith('panen:')) return ((t.tanaman || {})[b.slice(6)] || { nama: b.slice(6) }).nama;
  if (b.startsWith('lantai:')) return 'Lantai ' + b.slice(7).replace(/^lantai_/, '').replace(/_/g, ' ');
  if (b === 'tembok') return 'Tembok';
  if (b === 'pakan') return 'Pakan';
  if ((t.produk || {})[b]) return t.produk[b].nama;
  const s = b.replace(/^em_/, '').replace(/_/g, ' ');          // "em_" = awalan set dekorasi Agent Pak, bukan bagian nama
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function hargaBeli(b) {
  const t = G.toko, k = G.katalog;
  if (b.startsWith('makan:')) return (t.makanan[b.slice(6)] || {}).harga ?? null;
  if (b.startsWith('benih:')) return (t.tanaman[b.slice(6)] || {}).benih ?? null;
  if (b === 'pakan') return t.harga.pakan;
  if (b === 'tembok' || b.startsWith('lantai:')) return null;      // gratis di Edit Rumah, tidak dijual
  if (b.startsWith('senjata:')) return ((t.senjata || {})[b.slice(8)] || {}).harga || null;
  if (b === 'hp') return (t.hp || {}).harga || null;
  const br = k.barang[b];
  if (!br || t.tak_dijual.some(a => br.k.startsWith(a))) return null;
  return br.harga;
}
function hargaJual(b) {
  const t = G.toko;
  if (b.startsWith('senjata:') || b === 'hp') return null;
  if (b.startsWith('panen:')) return (t.tanaman[b.slice(6)] || {}).jual ?? null;
  if (t.produk[b]) return t.produk[b].jual;
  const h = hargaBeli(b);
  return h ? Math.max(1, Math.floor(h * t.harga.jual_kembali)) : null;
}

// Level yang dibutuhkan untuk MEMBELI sebuah barang (aturan server: permainan.level_barang).
function levelBarang(b) {
  const t = G.toko;
  if (t.level_khusus[b] != null) return t.level_khusus[b];
  if (b.startsWith('lantai:')) return (t.level_lantai || {})[b.slice(7)] || 1;      // motif lantai gratis tetapi terbuka menurut level
  if (b.startsWith('makan:')) return 1;
  if (b.startsWith('senjata:')) return ((t.senjata || {})[b.slice(8)] || {}).level || 1;
  if (b === 'hp') return (t.hp || {}).level || 1;
  const h = hargaBeli(b) || 0, tingkat = t.tingkat_harga.find(([batas]) => h <= batas);
  return tingkat ? tingkat[1] : t.level_puncak;
}

function lamaTeks(detik) {
  detik = Math.max(0, Math.round(detik));
  if (detik < 60) return detik + ' dtk';
  if (detik < 3600) return Math.ceil(detik / 60) + ' mnt';
  return (detik / 3600).toFixed(1).replace('.', ',') + ' jam';
}
