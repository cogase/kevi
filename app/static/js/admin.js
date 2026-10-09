/* Kevi — dashboard admin: ringkasan, pemakai, penyunting peta (NPC + titik interaksi), pengaturan, log.
 * Memakai tokoh.js (perakit tokoh Agent Pak) untuk menggambar NPC di peta, jadi `atlas` dan `lembar` global.
 */
'use strict';

let lembar = null, atlas = null;
const V = '?v=' + (document.documentElement.dataset.aset || '');
const $ = (s) => document.querySelector(s);
const el = (tag, atribut, ...anak) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atribut || {})) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'kelas') e.className = v;
    else if (k === 'teks') e.textContent = v;
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const a of anak.flat()) if (a != null && a !== false) e.append(a);
  return e;
};
const rb = (n) => (n ?? 0).toLocaleString('id-ID');
const jam = (t) => new Date(t * 1000).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const pesan = (t, galat) => { const p = $('#pesan'); p.textContent = t; p.className = galat ? 'galat-teks' : 'cip hijau'; p.hidden = false; clearTimeout(pesan.t); pesan.t = setTimeout(() => { p.hidden = true; }, 6000); };

async function ambil(jalur, badan) {
  const r = await fetch(jalur, badan === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(badan) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { location.href = '/masuk'; throw new Error('Sesi habis.'); }
  if (!r.ok) throw new Error(d.galat || 'Gagal (' + r.status + ').');
  return d;
}
async function coba(fn, sukses) { try { const h = await fn(); if (sukses) pesan(sukses); return h; } catch (e) { pesan(e.message, true); return null; } }

function tabel(id, kepala, baris) {
  const t = $(id);
  t.replaceChildren();
  t.createTHead().insertRow().append(...kepala.map(k => el('th', { teks: k.replace(/^#/, ''), kelas: k.startsWith('#') ? 'angka' : '' })));
  const b = t.createTBody();
  for (const r of baris) b.insertRow().append(...r.map((x, i) => { const td = el('td', { kelas: kepala[i].startsWith('#') ? 'angka' : '' }); td.append(x instanceof Node ? x : String(x ?? '-')); return td; }));
  if (!baris.length) b.insertRow().append(el('td', { teks: 'Belum ada data.', colSpan: kepala.length, kelas: 'redup' }));
}

/* ---------- ringkasan, pemakai, log ---------- */

let D = null;
async function muatDasbor() {
  D = await coba(() => ambil('/api/admin/dasbor'));
  if (!D) return;
  const r = D.ringkas;
  $('#versi').textContent = 'Kevi ' + D.versi + '.';
  $('#ubin').replaceChildren(...[
    ['Daring sekarang', r.daring], ['Pemakai aktif', r.aktif + ' / ' + r.pemakai], ['Karakter', r.karakter], ['Koin beredar', rb(r.koin_beredar)],
    ['Koin masuk hari ini', '+' + rb(r.koin_masuk_hari_ini)], ['Koin keluar hari ini', '-' + rb(r.koin_keluar_hari_ini)],
    ['Perintah terminal hari ini', r.terminal_hari_ini], ['Obrolan hari ini', r.obrolan_hari_ini], ['Note tersimpan', r.catatan],
  ].map(([n, v]) => el('div', {}, el('b', { teks: String(v) }), el('span', { teks: n }))));
  tabel('#t-daring', ['Karakter', '#Level', 'Tempat', 'Aksi'], D.daring.map(p => [p.nama, p.level, p.adegan === 'kantor' ? 'Kantor' : 'Rumah',
    el('button', { kelas: 'tombol kecil bahaya', teks: 'Putuskan', on: { click: async () => { await coba(() => ambil('/api/admin/tendang', { id: p.id }), p.nama + ' diputus.'); setTimeout(muatDasbor, 400); } } })]));
  const punya = D.pemakai.filter(p => p.nama);
  tabel('#t-peringkat', ['Karakter', '#Level', '#XP', '#Koin', '#Benda rumah'], punya.sort((a, b) => b.xp - a.xp || b.koin - a.koin).slice(0, 10).map(p => [p.nama, p.level, rb(p.xp), rb(p.koin), p.benda]));
  const daring = new Set(D.daring.map(p => p.id));
  tabel('#t-pemakai', ['Username', 'Peran', 'Karakter', '#Level', '#XP', '#Koin', '#Terminal', '#Panen', 'Status', 'Aksi'], D.pemakai.slice().sort((a, b) => a.id - b.id).map(p => {
    const tb = (teks, kelas, fn) => el('button', { kelas: 'tombol kecil ' + (kelas || ''), teks, on: { click: fn } });
    const ubah = async (badan, ok) => { if (await coba(() => ambil('/api/admin/pemakai/ubah', Object.assign({ id: p.id }, badan)), ok)) muatDasbor(); };
    const tanya = (teks, bawaan) => { const v = prompt(teks, bawaan); return v === null || v.trim() === '' ? null : v.trim(); };
    return [p.username, p.peran, p.nama || '(belum dibuat)', p.level ?? '-', p.nama ? rb(p.xp) : '-', p.nama ? rb(p.koin) : '-', (p.statistik || {}).terminal || 0, (p.statistik || {}).panen || 0,
      (p.aktif ? 'aktif' : 'nonaktif') + (daring.has(p.id) ? ' · daring' : '') + (p.totp ? ' · TOTP' : ''),
      el('div', { kelas: 'aksi-sel' },
        tb('Password', '', () => { const v = tanya('Password baru untuk ' + p.username + ' (min. 8 karakter):'); if (v) ubah({ password: v }, 'Password ' + p.username + ' diganti; semua sesinya dicabut.'); }),
        p.nama ? tb('Koin ±', '', () => { const v = tanya('Tambah (atau kurangi dengan angka minus) koin ' + p.nama + ':', '100'); if (v && Number.isInteger(Number(v))) ubah({ koin: Number(v) }, 'Koin ' + p.nama + ' disesuaikan.'); }) : null,
        p.nama ? tb('XP', '', () => { const v = tanya('Setel total XP ' + p.nama + ' (level 2 = 100, 3 = 300, 4 = 600, 5 = 1000):', String(p.xp)); if (v && Number.isInteger(Number(v))) ubah({ xp: Number(v) }, 'XP ' + p.nama + ' disetel.'); }) : null,
        p.peran === 'admin' ? null : tb(p.remote ? 'Cabut remote' : 'Izinkan remote', p.remote ? 'bahaya' : '', () => ubah({ remote: !p.remote }, 'Izin remote ' + p.username + (p.remote ? ' dicabut.' : ' diberikan.'))),
        p.totp ? tb('Hapus TOTP', 'bahaya', () => { if (confirm('Hapus kode sekali pakai ' + p.username + '? Ia bisa masuk dengan password saja sampai memasangnya lagi.')) ubah({ totp_hapus: true }, 'TOTP ' + p.username + ' dihapus.'); }) : null,
        tb(p.peran === 'admin' ? 'Jadikan pemain' : 'Jadikan admin', '', () => ubah({ peran: p.peran === 'admin' ? 'pemain' : 'admin' }, 'Peran ' + p.username + ' diubah.')),
        tb(p.aktif ? 'Nonaktifkan' : 'Aktifkan', p.aktif ? 'bahaya' : 'hijau', () => ubah({ aktif: !p.aktif }, p.username + (p.aktif ? ' dinonaktifkan.' : ' diaktifkan.'))))];
  }));
  tabel('#t-terminal', ['Waktu', 'Siapa', 'Perintah', 'Sasaran'], D.terminal.map(l => [jam(l.waktu), l.nama, l.perintah, l.sasaran]));
  tabel('#t-remote', ['Mulai', 'Selesai', 'Siapa', 'Protokol', 'Sasaran', 'User perangkat'], D.remote.map(l => [jam(l.waktu), l.selesai ? jam(l.selesai) : 'berjalan', l.username, l.proto, l.sasaran + ':' + l.port, l.pengguna || '-']));
  tabel('#t-kas', ['Waktu', 'Siapa', '#Koin', 'Alasan'], D.kas.map(k => [jam(k.waktu), k.nama, (k.jumlah > 0 ? '+' : '') + rb(k.jumlah), k.alasan]));
  tabel('#t-obrolan', ['Waktu', 'Siapa', 'Saluran', 'Teks'], D.obrolan.map(o => { const td = el('span', { teks: o.teks }); return [jam(o.waktu), o.nama, o.saluran === 'semua' ? 'semua' : (o.saluran === 'kantor' ? 'kantor' : 'rumah'), td]; }));
}

$('#f-tambah').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (await coba(() => ambil('/api/admin/pemakai', { username: $('#u').value, password: $('#p').value, admin: $('#a').checked }), 'Pemakai ditambahkan.')) { ev.target.reset(); muatDasbor(); }
});
$('#f-umum').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  await coba(() => ambil('/api/admin/pengaturan', { pengumuman: $('#umum').value }), $('#umum').value ? 'Pengumuman disiarkan.' : 'Pengumuman dihapus.');
});

/* ---------- pengaturan ---------- */

let A = null;
const KETERANGAN = {
  laju: ['Laju kebun', '1 jam kebun = 3600 / laju detik. 60 = cepat (sawi 3 menit), 6–12 untuk harian.'],
  laju_jalan: ['Kecepatan jalan', 'Piksel per detik. Lari = 1,75 kalinya.'],
  koin_awal: ['Modal karakter baru', 'Koin yang diterima saat karakter dibuat.'],
  arcade_per_hari: ['Arcade berhadiah per hari', 'Main selebihnya tetap boleh, tanpa hadiah.'],
  kuis_per_hari: ['Kuis berhadiah per hari', 'Jawaban benar yang dibayar per pemain.'],
  kirim_koin_maks: ['Batas kirim koin per hari', 'Total koin yang boleh dikirim seorang pemain.'],
  pesan_jeda: ['Jeda pesan sistem (menit)', 'Selang antar pesan sistem berulang.'],
};
const KET_ZOMBIE = {
  zombie_menit: ['Jarak antargelombang (menit)', 'Bila "Jarak acak" dicentang: acak antara separuh dan dua kali angka ini.'],
  zombie_jumlah: ['Zombie per gelombang', '0 = otomatis: 2 + jumlah pemain di kantor (paling banyak 12).'],
  zombie_hp: ['HP zombie (%)', '100 = bawaan: biasa 6, gesit 4, besar 20.'],
  zombie_hadiah: ['Hadiah (%)', 'Pengali EXP dan koin jatuh. 0 = tanpa hadiah.'],
  zombie_denda_xp: ['EXP hilang saat pingsan', 'Dipotong dari total EXP; level bisa turun. 0 = tanpa denda.'],
};
async function muatAtur() {
  A = await coba(() => ambil('/api/admin/pengaturan'));
  if (!A) return;
  const a = A.atur;
  $('#umum').value = a.pengumuman || '';
  $('#atur-angka').replaceChildren(...Object.keys(KETERANGAN).map(k => el('label', {}, KETERANGAN[k][0],
    el('input', { type: 'number', id: 'at-' + k, value: a[k], min: A.batas[k][0], max: A.batas[k][1], step: k === 'laju' ? 'any' : 1 }), el('small', { teks: KETERANGAN[k][1] }))),
    el('label', { kelas: 'centang-baris' }, el('input', { type: 'checkbox', id: 'at-terminal', checked: !!a.terminal }), 'Terminal dalam game menyala'));
  $('#atur-zombie').replaceChildren(
    el('label', { kelas: 'centang-baris' }, el('input', { type: 'checkbox', id: 'at-zombie_aktif', checked: !!a.zombie_aktif }), 'Serangan zombie menyala'),
    el('label', { kelas: 'centang-baris' }, el('input', { type: 'checkbox', id: 'at-zombie_acak', checked: !!a.zombie_acak }), 'Jarak acak'),
    ...Object.keys(KET_ZOMBIE).map(k => el('label', {}, KET_ZOMBIE[k][0], el('input', { type: 'number', id: 'at-' + k, value: a[k], min: A.batas[k][0], max: A.batas[k][1], step: 1 }), el('small', { teks: KET_ZOMBIE[k][1] }))));
  $('#bookmark').value = a.bookmark.map(b => b.nama + ' | ' + b.url).join('\n');
  $('#pesan-sistem').value = a.pesan_sistem.join('\n');
  $('#remote-aktif').checked = !!a.remote_aktif;
  $('#remote-port').value = a.remote_port.join(', ');
  $('#remote-jaringan').value = a.remote_jaringan.join('\n');
  Peta.muat(a);
}
$('#f-atur').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const badan = { terminal: $('#at-terminal').checked, bookmark: $('#bookmark').value.split('\n').map(b => b.trim()).filter(Boolean).map(b => { const i = b.lastIndexOf('|'); return i < 0 ? { nama: '', url: b } : { nama: b.slice(0, i).trim(), url: b.slice(i + 1).trim() }; }) };
  for (const k of [...Object.keys(KETERANGAN), ...Object.keys(KET_ZOMBIE)]) badan[k] = Number($('#at-' + k).value);
  badan.zombie_aktif = $('#at-zombie_aktif').checked; badan.zombie_acak = $('#at-zombie_acak').checked;
  badan.pesan_sistem = $('#pesan-sistem').value.split('\n').map(b => b.trim()).filter(Boolean);
  badan.remote_aktif = $('#remote-aktif').checked;
  badan.remote_port = $('#remote-port').value.split(/[,\s]+/).filter(Boolean).map(Number);
  badan.remote_jaringan = $('#remote-jaringan').value.split('\n').map(b => b.trim()).filter(Boolean);
  if (await coba(() => ambil('/api/admin/pengaturan', badan), 'Pengaturan disimpan dan langsung berlaku.')) muatAtur();
});

$('#zombie-panggil').addEventListener('click', () => coba(() => ambil('/api/admin/zombie/panggil', {}), 'Gelombang zombie dipanggil ke kantor.'));

/* ---------- peta: NPC + titik interaksi ---------- */

const Peta = {
  npc: [], titik: [], pilih: null, latar: null, depan: null,
  NAMA_PERAN: { obrol: 'Mengobrol saja', toko: 'Membuka Koperasi', misi: 'Membuka misi harian', kuis: 'Kuis jaringan', kopi: 'Menjual kopi (stamina)', pulang: 'Mengantar pulang', pakaian: 'Toko pakaian', battle: 'Menjual item battle (senjata)' },
  NAMA_TITIK: { arcade: 'Arcade (Cocokkan Kartu)', kuis: 'Kuis jaringan', toko: 'Koperasi', terminal: 'Terminal', misi: 'Misi harian' },

  muat(a) { this.npc = JSON.parse(JSON.stringify(a.npc)); this.titik = JSON.parse(JSON.stringify(a.titik)); this.pilih = null; this.lukisDaftar(); this.sunting(); this.gambar(); },
  butir() { return [...this.npc.map(n => ({ jenis: 'npc', d: n })), ...this.titik.map(t => ({ jenis: 'titik', d: t }))]; },
  terpilih() { return this.butir().find(b => b.jenis + ':' + b.d.id === this.pilih) || null; },

  // Lantai dan tembok yang benar-benar tampil: ubin lepas ditambah lantai, dinding keliling, dan celah pintu tiap ruang
  // (hitungan yang sama dengan Rumah.ubinEfektif di dalam game; halaman ini tidak memuat rumah.js).
  ubinEfektif(d) {
    const lantai = {}, tembok = {};
    for (const r of d.ruang || []) {
      const pintu = new Set();
      for (const q of r.pintu || []) {
        const datar = q.sisi === 'atas' || q.sisi === 'bawah', panjang = datar ? r.w : r.h;
        for (let i = 0; i < (panjang >= 5 ? 2 : 1); i++) {
          const pos = Math.max(1, Math.min(panjang - 2, q.pos + i));
          pintu.add(datar ? (r.gx + pos) + ',' + (q.sisi === 'atas' ? r.gy : r.gy + r.h - 1) : (q.sisi === 'kiri' ? r.gx : r.gx + r.w - 1) + ',' + (r.gy + pos));
        }
      }
      for (let gy = r.gy; gy < r.gy + r.h; gy++) for (let gx = r.gx; gx < r.gx + r.w; gx++) {
        const kunci = gx + ',' + gy, tepi = gx === r.gx || gy === r.gy || gx === r.gx + r.w - 1 || gy === r.gy + r.h - 1;
        if (r.lantai) lantai[kunci] = r.lantai;
        if (tepi && !pintu.has(kunci)) tembok[kunci] = r.warna; else delete tembok[kunci];
      }
    }
    return { lantai: Object.assign(lantai, d.lantai), tembok: Object.assign(tembok, d.tembok) };
  },

  gambar() {
    const kv = $('#peta'), k = kv.getContext('2d');
    if (!this.latar || !atlas || !this.peta) return;
    const pt = this.peta, lukisS = (n, x, y) => { const p = atlas[n]; if (p) k.drawImage(lembar, p.x, p.y, p.w, p.h, x - (p.pad || 0), y - (p.pad || 0), p.w, p.h); };
    if (kv.width !== pt.lebar * 16 || kv.height !== pt.tinggi * 16) { kv.width = pt.lebar * 16; kv.height = pt.tinggi * 16; }
    k.imageSmoothingEnabled = false;
    if (pt.dasar === 'default') k.drawImage(this.latar, 0, 0);
    else for (let y = 0; y < pt.tinggi; y++) for (let x = 0; x < pt.lebar; x++) lukisS(pt.lantai_dasar, x * 16, y * 16);
    const ef = this.ubinEfektif(pt);
    for (const [kunci, n] of Object.entries(ef.lantai)) { const [x, y] = kunci.split(',').map(Number); lukisS(n, x * 16, y * 16); }
    for (const [kunci, w] of Object.entries(ef.tembok)) { const [x, y] = kunci.split(',').map(Number); k.fillStyle = w; k.fillRect(x * 16, y * 16, 16, 16); }
    for (const o of pt.benda.slice().sort((a, b) => a.y - b.y)) lukisS(o.r && atlas[o.n + '__r' + o.r] ? o.n + '__r' + o.r : o.n, o.x, o.y);
    for (const n of this.npc) {
      const b = bingkaiTokoh(penampilan({ session_id: 'kevi-npc-' + n.id, nama: n.nama, tampilan: n.tampilan || {} }), (n.arah || 'bawah') + '_diam');
      if (b) k.drawImage(b.kanvas, n.x - b.pad, n.y - b.pad);
    }
    if (pt.dasar === 'default') k.drawImage(this.depan, 0, 0);
    const p = atlas.seru;
    for (const t of this.titik) if (p) k.drawImage(lembar, p.x, p.y, p.w, p.h, t.x - 1, t.y - 15, p.w, p.h);
    k.font = '600 8px Inter, sans-serif'; k.textAlign = 'center';
    for (const b of this.butir()) {
      const aktif = b.jenis + ':' + b.d.id === this.pilih, teks = b.jenis === 'npc' ? b.d.nama : (b.d.label || this.NAMA_TITIK[b.d.jenis]);
      const w = k.measureText(teks).width + 6;
      k.fillStyle = aktif ? '#de4b8b' : 'rgba(11,18,32,.82)'; k.fillRect(b.d.x + 8 - w / 2, b.d.y - (b.jenis === 'npc' ? 11 : 25), w, 10);
      k.fillStyle = '#fff'; k.fillText(teks, b.d.x + 8, b.d.y - (b.jenis === 'npc' ? 3 : 17));
      if (aktif) { k.strokeStyle = '#fcd34d'; k.lineWidth = 1; k.strokeRect(b.d.x - 1.5, b.d.y - 1.5, 19, 23); }
    }
  },

  lukisDaftar() {
    $('#peta-daftar').replaceChildren(...this.butir().map(b => el('button', { kelas: 'butir-peta' + (this.pilih === b.jenis + ':' + b.d.id ? ' aktif' : ''),
      on: { click: () => { this.pilih = b.jenis + ':' + b.d.id; this.lukisDaftar(); this.sunting(); this.gambar(); } } },
      el('span', { kelas: 'cip' + (b.jenis === 'npc' ? ' emas' : ''), teks: b.jenis === 'npc' ? 'NPC' : 'titik' }),
      el('span', { kelas: 'tumbuh', teks: b.jenis === 'npc' ? b.d.nama + ' — ' + (b.d.jabatan || this.NAMA_PERAN[b.d.peran]) : (b.d.label || this.NAMA_TITIK[b.d.jenis]) }))));
  },

  sunting() {
    const b = this.terpilih(), wadah = $('#peta-sunting');
    if (!b) { wadah.replaceChildren(el('p', { kelas: 'redup kecil', teks: 'Belum ada yang dipilih.' })); return; }
    const d = b.d, segar = () => { this.lukisDaftar(); this.gambar(); };
    const isi = (label, kunci, opsi = {}) => el('label', {}, label, el(opsi.banyak ? 'textarea' : 'input', Object.assign({ value: opsi.nilai ?? d[kunci] ?? '', rows: 4,
      on: { input: (ev) => { opsi.setel ? opsi.setel(ev.target.value) : (d[kunci] = ev.target.value); segar(); } } }, opsi.banyak ? {} : { type: opsi.jenis || 'text', maxLength: opsi.maks || 40 })));
    const pilih = (label, nilai, daftar, setel) => el('label', {}, label, el('select', { on: { change: (ev) => { setel(ev.target.value); segar(); } } },
      daftar.map(([v, n]) => el('option', { value: v, teks: n, selected: nilai === v }))));
    const hapus = el('button', { kelas: 'tombol kecil bahaya', teks: 'Hapus', on: { click: () => {
      if (b.jenis === 'npc') this.npc = this.npc.filter(n => n !== d); else this.titik = this.titik.filter(t => t !== d);
      this.pilih = null; this.lukisDaftar(); this.sunting(); this.gambar();
    } } });
    if (b.jenis === 'titik') {
      wadah.replaceChildren(el('div', { kelas: 'sunting-peta' }, el('b', { teks: 'Titik interaksi' }),
        pilih('Jenis', d.jenis, Object.entries(this.NAMA_TITIK), (v) => { d.jenis = v; }), isi('Label petunjuk (boleh kosong)', 'label'),
        el('small', { kelas: 'redup', teks: `Posisi ${d.x}, ${d.y} — klik peta untuk memindah.` }), hapus));
      return;
    }
    const t = d.tampilan || (d.tampilan = {}), P = A.pilihan;
    const warna = (label, kunci, bawaan) => el('label', {}, label, el('input', { type: 'color', value: t[kunci] || bawaan, on: { input: (ev) => { t[kunci] = ev.target.value; this.gambar(); } } }));
    wadah.replaceChildren(el('div', { kelas: 'sunting-peta' }, el('b', { teks: 'NPC' }),
      isi('Nama', 'nama', { maks: 24 }), isi('Jabatan', 'jabatan', { maks: 32 }),
      pilih('Peran saat diajak bicara', d.peran, Object.entries(this.NAMA_PERAN), (v) => { d.peran = v; }),
      pilih('Menghadap', d.arah, [['bawah', 'Ke penonton'], ['atas', 'Membelakangi'], ['kiri', 'Kiri'], ['kanan', 'Kanan']], (v) => { d.arah = v; }),
      isi('Ucapan (satu baris satu kalimat, bergiliran)', 'ucap', { banyak: true, nilai: (d.ucap || []).join('\n'), setel: (v) => { d.ucap = v.split('\n').map(x => x.trim()).filter(Boolean); } }),
      el('div', { kelas: 'atur-kisi', style: 'grid-template-columns: repeat(4, 1fr); gap: 6px' }, warna('Kulit', 'kulit', '#e8b48c'), warna('Rambut', 'rambut_warna', '#2e2320'), warna('Baju', 'baju', '#4074b0'), warna('Celana', 'celana', '#26324a')),
      pilih('Gaya rambut', t.gaya_rambut || '', P.gaya_rambut.map(v => [v, v ? v.replace('rambut_', '') : 'pendek biasa']), (v) => { t.gaya_rambut = v; }),
      pilih('Penutup kepala', t.kepala || '', P.kepala.map(v => [v, v ? v.replace(/_/g, ' ') : 'tanpa']), (v) => { t.kepala = v; }),
      pilih('Kacamata', t.mata || '', P.mata.map(v => [v, v ? v.replace(/_/g, ' ') : 'tanpa']), (v) => { t.mata = v; }),
      el('small', { kelas: 'redup', teks: `Posisi ${d.x}, ${d.y} — klik peta untuk memindah.` }), hapus));
  },

  idBaru(awalan, daftar) { let i = daftar.length + 1; while (daftar.some(x => x.id === awalan + i)) i++; return awalan + i; },
  tambahNpc() {
    const n = { id: this.idBaru('npc', this.npc), nama: 'NPC baru', jabatan: '', x: 264, y: 660, arah: 'bawah', peran: 'obrol', tampilan: {}, ucap: ['Halo!'] };
    this.npc.push(n); this.pilih = 'npc:' + n.id; this.lukisDaftar(); this.sunting(); this.gambar();
  },
  tambahTitik() {
    const t = { id: this.idBaru('titik', this.titik), jenis: 'arcade', x: 280, y: 690, label: '' };
    this.titik.push(t); this.pilih = 'titik:' + t.id; this.lukisDaftar(); this.sunting(); this.gambar();
  },
  async simpan() {
    const h = await coba(() => ambil('/api/admin/pengaturan', { npc: this.npc, titik: this.titik }), 'Peta disimpan; layar semua pemain sudah ikut berubah.');
    if (h) this.muat(h.atur);
  },
  klik(ev) {
    const b = this.terpilih();
    if (!b) { pesan('Pilih NPC atau titik di daftar dulu.', true); return; }
    const kv = $('#peta'), r = kv.getBoundingClientRect(), s = kv.width / r.width;
    b.d.x = Math.round(((ev.clientX - r.left) * s - 8) / 2) * 2;
    b.d.y = Math.round(((ev.clientY - r.top) * s - (b.jenis === 'npc' ? 19 : 8)) / 2) * 2;
    this.sunting(); this.gambar();
  },
};
$('#peta').addEventListener('click', (ev) => Peta.klik(ev));
$('#npc-baru').addEventListener('click', () => Peta.tambahNpc());
$('#titik-baru').addEventListener('click', () => Peta.tambahTitik());
$('#peta-simpan').addEventListener('click', () => Peta.simpan());
Peta.muatPeta = async function () {
  const d = await coba(() => ambil('/api/saya'));
  if (!d) return;
  this.peta = d.peta;
  $('#peta-dasar').value = d.peta.dasar; $('#peta-lebar').value = d.peta.lebar; $('#peta-tinggi').value = d.peta.tinggi;
  const pilih = $('#peta-lantai');
  if (!pilih.children.length) {
    const kat = await fetch('/static/peta/katalog.json' + V).then(r => r.json());
    pilih.append(...kat.lantai.map(n => el('option', { value: n, teks: n.replace(/^lantai_/, '').replace(/_/g, ' ') })));
  }
  pilih.value = d.peta.lantai_dasar;
  this.gambar();
};
$('#peta-terapkan').addEventListener('click', async () => {
  const kosongkan = $('#peta-kosongkan').checked;
  if (kosongkan && !confirm('Semua perabot, lantai, dan tembok yang ditaruh admin di peta utama akan dibuang. Lanjut?')) return;
  const h = await coba(() => ambil('/api/admin/peta/dasar', { dasar: $('#peta-dasar').value, lebar: Number($('#peta-lebar').value), tinggi: Number($('#peta-tinggi').value),
    lantai_dasar: $('#peta-lantai').value, kosongkan }), 'Dasar peta diterapkan; layar pemain di kantor ikut berubah.');
  if (h) { $('#peta-kosongkan').checked = false; Peta.peta = h.peta; Peta.gambar(); }
});

/* ---------- koleksi peta: banyak peta tersimpan, satu aktif ---------- */

const Koleksi = {
  lukis(d) {
    if (!d || !d.peta) return;
    const aktif = d.peta.find(p => p.aktif);
    $('#peta-aktif-nama').textContent = $('#peta-aktif-nama2').textContent = aktif ? aktif.nama : '-';
    const tb = (teks, kelas, fn) => el('button', { kelas: 'tombol kecil ' + (kelas || ''), teks, type: 'button', on: { click: fn } });
    tabel('#t-koleksi', ['Nama', 'Status', 'Dasar', '#Ukuran', '#Perabot', '#Ruang', '#NPC', 'Diubah', 'Aksi'], d.peta.map(p => [p.nama,
      el('span', { kelas: 'cip ' + (p.aktif ? 'hijau' : ''), teks: p.aktif ? 'Aktif' : 'Tersimpan' }), p.dasar === 'kosong' ? 'Kosong' : 'Default', p.lebar + ' × ' + p.tinggi, p.benda, p.ruang, p.npc, jam(p.diubah),
      el('div', { kelas: 'aksi-sel' },
        p.aktif ? null : tb('Aktifkan', 'utama', () => this.aktifkan(p)),
        tb('Ganti nama', '', () => { const v = prompt('Nama baru untuk peta "' + p.nama + '":', p.nama); if (v !== null) this.kirim('nama', { id: p.id, nama: v }, 'Nama peta diganti.'); }),
        p.aktif ? null : tb('Hapus', 'bahaya', () => { if (confirm('Hapus peta "' + p.nama + '" beserta NPC dan titiknya? Tidak bisa dikembalikan.')) this.kirim('hapus', { id: p.id }, 'Peta "' + p.nama + '" dihapus.'); }))]));
    $('#koleksi-baru').disabled = d.peta.length >= d.maks;
  },
  async muat() { this.lukis(await coba(() => ambil('/api/admin/peta/daftar'))); },
  async kirim(aksi, badan, sukses) { const h = await coba(() => ambil('/api/admin/peta/' + aksi, badan), sukses); if (h) this.lukis(h); return h; },
  async aktifkan(p) {
    if (!confirm('Aktifkan peta "' + p.nama + '"? Semua pemain di kantor langsung pindah ke peta itu, dan NPC + titik yang belum disimpan di halaman ini dibuang.')) return;
    if (!await this.kirim('aktifkan', { id: p.id }, 'Peta "' + p.nama + '" kini aktif; layar semua pemain sudah ikut berganti.')) return;
    await muatAtur();                                    // NPC dan titik ikut berganti bersama petanya
    await Peta.muatPeta();
  },
};
$('#koleksi-dari').addEventListener('change', () => { const kunci = $('#koleksi-dari').value !== 'kosong'; $('#koleksi-lebar').disabled = $('#koleksi-tinggi').disabled = kunci; });
$('#koleksi-baru').addEventListener('click', async () => {
  const dari = $('#koleksi-dari').value, badan = { nama: $('#koleksi-nama').value, dari };
  if (dari === 'kosong') Object.assign(badan, { lebar: Number($('#koleksi-lebar').value), tinggi: Number($('#koleksi-tinggi').value) });
  if (await Koleksi.kirim('baru', badan, 'Peta baru tersimpan. Belum aktif: tekan Aktifkan untuk memakainya.')) $('#koleksi-nama').value = '';
});

/* ---------- tab & mulai ---------- */

$('#tab').addEventListener('click', (ev) => {
  const tb = ev.target.closest('button');
  if (!tb) return;
  for (const b of $('#tab').children) b.classList.toggle('aktif', b === tb);
  for (const s of document.querySelectorAll('.bagian')) s.hidden = s.id !== 'b-' + tb.dataset.bagian;
  if (tb.dataset.bagian === 'peta') { Koleksi.muat(); muatAtur(); Peta.muatPeta(); }
  if (tb.dataset.bagian === 'umpan') muatUmpan();
});
$('#segarkan').addEventListener('click', () => { muatDasbor(); muatAtur(); muatUmpan(); Koleksi.muat(); });

/* ---------- feedback pemain ---------- */

async function muatUmpan() {
  const d = await coba(() => ambil('/api/admin/umpan-balik'));
  if (!d) return;
  $('#tab-umpan').textContent = 'Feedback' + (d.baru ? ' (' + d.baru + ')' : '');
  tabel('#t-umpan', ['Waktu', 'Siapa', 'Jenis', 'Isi', 'Tempat', 'Versi', 'Status', 'Catatan admin', 'Aksi'], d.umpan.map(u => {
    const ubah = async (badan, ok) => { if (await coba(() => ambil('/api/admin/umpan-balik/ubah', Object.assign({ id: u.id }, badan)), ok)) muatUmpan(); };
    const tb = (teks, kelas, fn) => el('button', { kelas: 'tombol kecil ' + (kelas || ''), teks, on: { click: fn } });
    return [jam(u.waktu), u.nama || u.username || '-', el('span', { kelas: 'cip ' + (u.jenis === 'bug' ? 'merah' : 'emas'), teks: u.jenis }),
      el('span', { kelas: 'teks-umpan', teks: u.teks }), u.adegan ? u.adegan + (u.x != null ? ' (' + Math.round(u.x) + ', ' + Math.round(u.y) + ')' : '') : '-', u.versi || '-',
      el('span', { kelas: 'cip ' + (u.status === 'baru' ? 'merah' : u.status === 'selesai' ? 'hijau' : ''), teks: u.status }), u.catatan_admin || '-',
      el('div', { kelas: 'aksi-sel' },
        u.status === 'baru' ? tb('Tandai dibaca', '', () => ubah({ status: 'dibaca' }, 'Ditandai dibaca.')) : null,
        u.status !== 'selesai' ? tb('Selesai', 'hijau', () => ubah({ status: 'selesai' }, 'Ditandai selesai.')) : tb('Buka lagi', '', () => ubah({ status: 'dibaca' }, 'Dibuka lagi.')),
        tb('Catatan', '', () => { const v = prompt('Catatan admin untuk feedback ini:', u.catatan_admin || ''); if (v !== null) ubah({ catatan: v }, 'Catatan disimpan.'); }))];
  }));
}
muatUmpan();

const gambar = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src + V; });
(async () => {
  try {
    [lembar, atlas, Peta.latar, Peta.depan] = await Promise.all([gambar('/static/gambar/sprite.png'), fetch('/static/gambar/atlas.json' + V).then(r => r.json()),
      gambar('/static/peta/kantor_latar.png'), gambar('/static/peta/kantor_depan.png')]);
  } catch (e) { pesan('Aset peta gagal dimuat.', true); }
  await muatDasbor();
  await Peta.muatPeta();
  await muatAtur();
  await Koleksi.muat();
  setInterval(() => { if (!document.hidden && !$('#b-ringkasan').hidden) muatDasbor(); }, 15000);
})();
