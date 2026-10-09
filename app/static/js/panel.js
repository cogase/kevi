/* Kevi — antarmuka di atas kanvas: panel, HUD, obrolan, Koperasi, inventory, Note, misi, terminal, menu. */
'use strict';

/* ---------- panel (satu jendela modal) ---------- */

// Jendela bisa digeser lewat kepalanya. Geseran terakhir diingat per kunci selama halaman terbuka; kalau jendela
// jadi di luar layar (ukuran layar berubah), geserannya dikembalikan ke nol.
const GESER_JENDELA = {};
function bisaDigeser(kotak, pegangan, kunci) {
  const p = GESER_JENDELA[kunci] || (GESER_JENDELA[kunci] = { x: 0, y: 0 });
  const pasang = () => { kotak.style.transform = p.x || p.y ? `translate(${p.x}px, ${p.y}px)` : ''; };
  pasang();
  const r0 = kotak.getBoundingClientRect();
  if (r0.right < 80 || r0.left > innerWidth - 80 || r0.top < 0 || r0.top > innerHeight - 40) { p.x = 0; p.y = 0; pasang(); }
  pegangan.classList.add('pegangan');
  pegangan.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || ev.target.closest('button, input, select, a')) return;
    ev.preventDefault();
    const r = kotak.getBoundingClientRect(), ax = ev.clientX, ay = ev.clientY, x0 = p.x, y0 = p.y;
    const gerak = (e) => {              // kepala jendela selalu tetap terjangkau
      p.x = x0 + Math.max(80 - r.right, Math.min(innerWidth - 80 - r.left, e.clientX - ax));
      p.y = y0 + Math.max(-r.top, Math.min(innerHeight - 40 - r.top, e.clientY - ay));
      pasang();
    };
    const lepas = () => { removeEventListener('pointermove', gerak); removeEventListener('pointerup', lepas); };
    addEventListener('pointermove', gerak);
    addEventListener('pointerup', lepas);
  });
}

const Panel = {
  buka(judul, isi, opsi = {}) {
    this.tutup();
    const kotak = el('div', { kelas: 'panel bingkai' + (opsi.sempit ? ' sempit' : '') + (opsi.kelas ? ' ' + opsi.kelas : ''), role: 'dialog', 'aria-label': judul },
      el('header', {}, el('h3', { teks: judul }), opsi.tanpaTutup ? null : el('button', { kelas: 'tutup', 'aria-label': 'Tutup', teks: '✕', on: { click: () => this.tutup() } })),
      el('div', { kelas: 'panel-isi' }, isi));
    const tirai = el('div', { id: 'tirai', on: { pointerdown: (ev) => { if (ev.target.id === 'tirai' && !opsi.tanpaTutup) this.tutup(); } } }, kotak);
    document.body.append(tirai);
    document.body.classList.add('ada-panel');
    this.terkunci = !!opsi.tanpaTutup;
    this.saatTutup = opsi.saatTutup || null;
    bisaDigeser(kotak, kotak.querySelector('header'), 'panel:' + judul);
    Mesin.tombol.clear();
    const fokus = kotak.querySelector('[autofocus], input, textarea, button.utama');
    if (fokus) setTimeout(() => fokus.focus(), 0);
    return kotak;
  },
  tutup() {
    const t = $('#tirai');
    if (!t) return;
    t.remove();
    document.body.classList.remove('ada-panel');
    const fn = this.saatTutup; this.saatTutup = null; this.terkunci = false;
    if (fn) fn();
  },
  terbuka() { return !!$('#tirai'); },

  misi() {
    const m = G.misi || { misi: [] };
    Panel.buka('Misi harian', el('div', {},
      el('p', { kelas: 'redup', teks: 'Tiga misi baru tiap hari (WIB). Hadiah langsung masuk begitu misi tuntas.' }),
      el('div', { kelas: 'daftar' }, m.misi.map(x => el('div', { kelas: 'baris misi' + (x.lunas ? ' lunas' : '') },
        el('span', { kelas: 'centang', teks: x.lunas ? '✔' : '' }), el('span', { kelas: 'tumbuh', teks: x.judul }),
        el('span', { kelas: 'cip', teks: Math.min(x.maju, x.sasaran) + '/' + x.sasaran }), el('span', { kelas: 'harga', teks: '+' + x.hadiah })))),
      el('p', { kelas: m.bonus_lunas ? 'cip hijau' : 'redup', teks: m.bonus_lunas ? 'Bonus tuntas sudah cair.' : `Tuntaskan ketiganya: bonus +${m.bonus} koin.` })), { sempit: true });
  },

  async kas() {
    const d = await api('/api/kas');
    Panel.buka('Riwayat koin', el('div', { kelas: 'daftar' }, d.kas.length ? d.kas.map(k => el('div', { kelas: 'baris' },
      el('span', { kelas: 'redup', teks: new Date(k.waktu * 1000).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }),
      el('span', { kelas: 'tumbuh', teks: k.alasan }), el('b', { kelas: k.jumlah < 0 ? 'minus' : 'plus', teks: (k.jumlah > 0 ? '+' : '') + k.jumlah }))) : el('p', { kelas: 'redup', teks: 'Belum ada transaksi.' })), { sempit: true });
  },

  panduan() {
    const baris = [['W A S D / panah', 'Jalan'], ['Shift', 'Lari (membuat lelah: Health turun, pulih saat diam; kopi Mbak Tia mempercepatnya)'], ['E', 'Interaksi dengan yang terdekat (NPC, rekan, meja, mesin)'],
      ['Enter', 'Obrolan (Tab di kotak obrolan: Sekitar / Semua)'], ['1 – 0', 'Pegang barang di slot hotbar (tekan lagi untuk melepas)'], ['F', 'Pakai barang yang dipegang (makan)'], ['Shift + 1 – 8', 'Emote'], ['I', 'Inventory'], ['N', 'Note'], ['M', 'Misi harian'], ['L', 'Level & yang terbuka'],
      ['B', 'Mode Bangun (di rumah)'], ['Roda tetikus / + −', 'Zoom (0 = otomatis)'], ['/w nama pesan', 'Bisik ke rekan; /r membalas'], ['R', 'Putar perabot (mode Bangun)'], ['Esc', 'Tutup panel / berdiri dari kursi']];
    Panel.buka('Panduan', el('div', {},
      el('div', { kelas: 'daftar' }, baris.map(([k, v]) => el('div', { kelas: 'baris' }, el('kbd', { teks: k }), el('span', { teks: v })))),
      el('h4', { teks: 'Alur singkat' }),
      el('ol', { kelas: 'redup' }, ['Di kantor: duduk di meja mana saja (E) untuk membuka Komputer — Terminal (ping, dns, lalu trace, mtr, port seiring level) dan Browser.',
        'Hampir semua kegiatan memberi XP. Naik level membuka interaksi baru: tos, kuis, arcade, kirim koin, suit, browser.',
        'Bu Sari (kiri bawah, dekat mesin penjual) = Koperasi: benih, pakan, perabot, lantai, tembok.',
        'Jalan keluar lewat pintu depan lalu terus ke bawah = pulang; kamu muncul di jalan atas rumahmu. Jalan terus ke atas = kembali ke kantor.',
        'Di rumah tekan B untuk menaruh petak kebun, lalu E: tanam, siram, panen. Jual lewat Kotak Kiriman.',
        'Koin juga datang dari misi harian (Rina, resepsionis) dan bonus hadir.'].map(t => el('li', { teks: t })))));
  },

  async menu() {
    const d = await api('/api/daring').catch(() => ({ daring: [] }));
    const lain = d.daring.filter(p => p.id !== G.saya.id);
    Panel.buka('Menu', el('div', {},
      el('div', { kelas: 'baris-tombol tegak' },
        el('button', { kelas: 'tombol', teks: 'Panduan', on: { click: () => Panel.panduan() } }),
        el('button', { kelas: 'tombol', teks: 'Level & yang terbuka', on: { click: () => Panel.level() } }),
        el('button', { kelas: 'tombol', id: 'menu-profil', teks: 'Profil saya (statistik, ubah karakter)', on: { click: () => Profil.buka() } }),
        el('button', { kelas: 'tombol', teks: 'Riwayat koin', on: { click: () => Panel.kas() } }),
        el('button', { kelas: 'tombol', id: 'menu-umpan', teks: 'Kirim saran / lapor bug', on: { click: () => Umpan.buka() } }),
        el('button', { kelas: 'tombol', teks: 'Ganti password', on: { click: () => Panel.sandi() } }),
        el('button', { kelas: 'tombol', teks: 'Kode sekali pakai (TOTP): ' + (G.totp ? 'terpasang' : 'belum'), on: { click: () => Panel.totp() } }),
        G.adegan === 'kantor' ? el('button', { kelas: 'tombol', teks: 'Pulang ke rumah', on: { click: () => { Panel.tutup(); Mesin.pindah('rumah:' + G.saya.id); } } })
          : el('button', { kelas: 'tombol', teks: 'Berangkat ke kantor', on: { click: () => { Panel.tutup(); Mesin.pindah('kantor'); } } }),
        G.saya.peran === 'admin' ? el('a', { kelas: 'tombol', href: '/admin', target: '_blank', teks: 'Admin: dashboard game' }) : null,
        G.saya.peran === 'admin' ? el('a', { kelas: 'tombol', href: '/laporan', target: '_blank', teks: 'Admin: laporan token proyek' }) : null,
        el('button', { kelas: 'tombol bahaya', teks: 'Keluar', on: { click: async () => { await api('/api/keluar', {}); location.href = '/masuk'; } } })),
      el('h4', { teks: 'Sedang daring (' + d.daring.length + ')' }),
      el('div', { kelas: 'daftar' }, lain.length ? lain.map(p => el('div', { kelas: 'baris' }, el('span', { kelas: 'tumbuh', teks: p.nama + ' · Lv ' + p.level }),
        el('span', { kelas: 'cip', teks: p.adegan === 'kantor' ? 'di kantor' : 'di rumah' }),
        el('button', { kelas: 'tombol kecil', teks: 'Bertamu', on: { click: () => { Panel.tutup(); Mesin.pindah('rumah:' + p.id); } } })))
        : el('p', { kelas: 'redup', teks: 'Belum ada rekan lain yang daring.' })),
      el('p', { kelas: 'redup kecil', teks: 'Kevi ' + (document.documentElement.dataset.versi || '') + ' · ' + G.saya.username })), { sempit: true });
  },

  sandi() {
    const lama = el('input', { type: 'password', placeholder: 'Password lama', autocomplete: 'current-password' });
    const baru = el('input', { type: 'password', placeholder: 'Password baru (min. 8 karakter)', autocomplete: 'new-password' });
    Panel.buka('Ganti password', el('form', { kelas: 'formulir', on: { submit: async (ev) => {
      ev.preventDefault();
      try { await api('/api/sandi', { lama: lama.value, baru: baru.value }); Panel.tutup(); kabar('Password diganti.'); }
      catch (e) { kabar(e.message, 'galat'); }
    } } }, lama, baru, el('button', { kelas: 'tombol utama', teks: 'Simpan' })), { sempit: true });
  },

  // Kode sekali pakai: pasang (password -> rahasia -> bukti kode) atau lepas (password + kode).
  totp() {
    const sandi = el('input', { type: 'password', placeholder: 'Password akun', autocomplete: 'current-password' });
    const kode = () => el('input', { type: 'text', inputmode: 'numeric', maxlength: 7, placeholder: '6 angka dari aplikasi', autocomplete: 'one-time-code' });
    const form = (isi, kirim) => el('form', { kelas: 'formulir', on: { submit: async (ev) => { ev.preventDefault(); try { await kirim(); } catch (e) { kabar(e.message, 'galat'); } } } }, isi);
    if (G.totp) {
      const k = kode();
      Panel.buka('Kode sekali pakai', form([
        el('p', { kelas: 'redup', teks: 'Terpasang. Kode diminta tiap masuk, dan lagi saat membuka remote bila bukti terakhir sudah lewat 10 menit.' }),
        el('p', { kelas: 'redup kecil', teks: 'Melepasnya mematikan remote untuk akun ini sampai dipasang lagi.' }),
        sandi, k, el('button', { kelas: 'tombol bahaya', teks: 'Lepas kode sekali pakai' })],
      async () => { await api('/api/totp/lepas', { password: sandi.value, kode: k.value }); G.totp = false; Panel.tutup(); kabar('Kode sekali pakai dilepas.'); }), { sempit: true });
      return;
    }
    Panel.buka('Kode sekali pakai', form([
      el('p', { kelas: 'redup', teks: 'Pengaman tambahan: selain password, masuk butuh 6 angka dari aplikasi autentikator (Google Authenticator, Aegis, 2FAS, dan sejenisnya). Wajib untuk memakai remote.' }),
      sandi, el('button', { kelas: 'tombol utama', teks: 'Mulai pasang' })],
    async () => {
      const d = await api('/api/totp/mulai', { password: sandi.value });
      const k = kode();
      Panel.buka('Kode sekali pakai', form([
        el('p', { kelas: 'redup', teks: 'Di aplikasi autentikator pilih "masukkan kunci" lalu ketik kunci ini (jenis: berbasis waktu):' }),
        el('p', { kelas: 'kunci-totp', id: 'totp-rahasia', teks: d.rahasia.replace(/(.{4})/g, '$1 ').trim() }),
        el('p', { kelas: 'redup kecil', teks: 'Atau salin tautan ini ke aplikasi yang menerimanya:' }),
        el('input', { type: 'text', readonly: '', value: d.uri, on: { focus: (ev) => ev.target.select() } }),
        el('p', { kelas: 'redup kecil', teks: 'Kunci hanya tampil sekali ini. Lalu ketik kode yang muncul di aplikasi:' }),
        k, el('button', { kelas: 'tombol utama', teks: 'Pasang' })],
      async () => { await api('/api/totp/pasang', { kode: k.value }); G.totp = true; Panel.tutup(); kabar('Kode sekali pakai terpasang. Mulai sekarang masuk butuh kode.'); }), { sempit: true });
      k.focus();
    }), { sempit: true });
  },

  // Minta kode untuk menyegarkan bukti sesi ini; `lanjut` dipanggil bila kodenya benar.
  kodeSegar(lanjut) {
    const k = el('input', { type: 'text', inputmode: 'numeric', maxlength: 7, placeholder: '6 angka dari aplikasi', autocomplete: 'one-time-code' });
    Panel.buka('Kode sekali pakai', el('form', { kelas: 'formulir', on: { submit: async (ev) => {
      ev.preventDefault();
      try { await api('/api/totp/segar', { kode: k.value }); Panel.tutup(); lanjut(); }
      catch (e) { kabar(e.message, 'galat'); }
    } } }, el('p', { kelas: 'redup', teks: 'Membuka remote butuh kode sekali pakai yang baru.' }), k, el('button', { kelas: 'tombol utama', teks: 'Lanjut' })), { sempit: true });
    k.focus();
  },
};

/* ---------- HUD ---------- */

const Hud = {
  adegan() {
    const di = $('#hud-tempat');
    if (di) di.textContent = G.adegan === 'kantor' ? 'Kantor' : (G.rumahSaya ? 'Rumah' : 'Rumah ' + G.pemilikRumah.nama);
    const tb = $('#tb-bangun'), kantor = G.adegan === 'kantor';
    tb.hidden = kantor ? G.saya.peran !== 'admin' : !G.rumahSaya;
    tb.replaceChildren(kantor ? 'Edit Map ' : 'Bangun ', el('kbd', { teks: 'B' }));
  },
  sambungan(ok) { $('#hud-sambung').hidden = ok; },
  terputus(pesan) { Panel.buka('Terputus', el('div', {}, el('p', { teks: pesan }), el('button', { kelas: 'tombol utama', teks: 'Muat ulang', on: { click: () => location.reload() } })), { sempit: true, tanpaTutup: true }); },
  // Kontrol zoom sembunyi sendiri: tampil sebentar saat dipanggil (kursor mendekat, atau zoom baru saja berubah).
  tampakZoom() {
    const z = $('#zoom');
    z.classList.add('tampak');
    clearTimeout(this.jedaZoom);
    this.jedaZoom = setTimeout(() => z.classList.remove('tampak'), 2200);
  },
  lapar() {
    const s = G.stamina, b = $('#hud-stamina');
    b.firstElementChild.style.transform = 'scaleX(' + Math.max(0, Math.min(1, s.nilai / s.maks)).toFixed(3) + ')';      // transform, bukan width: tanpa tata letak ulang
    b.classList.toggle('lapar', s.nilai < s.maks * 0.25);
    b.title = `Stamina ${Math.round(s.nilai)} / ${s.maks} — turun karena kerja dan lama daring; makan untuk mengisinya`;
    $('#hud-stamina-angka').textContent = Math.round(s.nilai) + '/' + s.maks;
  },
  health() {
    const st = G.health, maks = G.level.stamina, nilai = Math.max(0, Math.round(st.nilai)), tanda = nilai + '/' + maks;
    if (tanda === this.staminaTerakhir && st.lelah === this.lelahTerakhir) return;
    this.staminaTerakhir = tanda; this.lelahTerakhir = st.lelah;
    const b = $('#hud-health');
    b.firstElementChild.style.width = Math.min(100, nilai / maks * 100).toFixed(1) + '%';
    $('#hud-health-angka').textContent = tanda;
    b.classList.toggle('lelah', st.lelah);
    b.classList.toggle('kopi', st.kopi > G.kini);
  },
  // Wajah karakter di pojok kiri menu atas: kepala dipotong dari bingkai "hadap bawah, diam" lalu diperbesar tanpa haluskan.
  potret() {
    const kv = $('#hud-wajah');
    if (!kv || !G.karakter || !atlas) return;
    $('#hud-nama').textContent = G.karakter.nama;
    const b = bingkaiTokoh(penampilan({ session_id: 'hud', nama: G.karakter.nama, tampilan: G.karakter.tampilan || {} }), 'bawah_diam');
    const k = kv.getContext('2d');
    k.clearRect(0, 0, kv.width, kv.height);
    if (!b) return;
    const s = b.kanvas, px = s.getContext('2d').getImageData(0, 0, s.width, s.height).data;
    let kiri = s.width, kanan = -1, atas = s.height;
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if (px[(y * s.width + x) * 4 + 3] > 40) { if (x < kiri) kiri = x; if (x > kanan) kanan = x; if (y < atas) atas = y; }
    if (kanan < 0) return;
    const sisi = Math.min(kanan - kiri + 1, s.height - atas);
    k.imageSmoothingEnabled = false;
    k.drawImage(s, kiri, atas, sisi, sisi, 0, 0, kv.width, kv.height);
  },
  pasang() {
    this.potret();
    $('#hud-potret').addEventListener('click', (ev) => { ev.currentTarget.blur(); Profil.buka(); });
    aturKoin(G.koin);
    aturLevel(G.level, false);
    $('#hud-level').addEventListener('click', () => Panel.level());
    const peta = { 'tb-inventori': () => Inventori.buka(), 'tb-note': () => Catatan.buka(), 'tb-misi': () => Panel.misi(), 'tb-menu': () => Panel.menu(),
      'tb-bangun': () => (G.bangun ? Rumah.keluarBangun() : Rumah.masukBangun()) };
    for (const [id, fn] of Object.entries(peta)) $('#' + id).addEventListener('click', (ev) => { ev.currentTarget.blur(); fn(); });
    $('#hud-koin-kotak').addEventListener('click', () => Panel.kas());
    addEventListener('pointermove', (ev) => { if (innerWidth - ev.clientX < 240 && innerHeight - ev.clientY < 150) this.tampakZoom(); }, { passive: true });
    // Menu atas bisa diciutkan supaya tidak menutupi tepi atas peta; pilihan diingat di peramban.
    const ciut = (v) => {
      document.body.classList.toggle('hud-ciut', v);
      const tb = $('#tb-ciut');
      tb.textContent = v ? '▾ Menu' : '▴';
      tb.title = v ? 'Buka menu atas' : 'Minimize menu atas';
      tb.setAttribute('aria-label', tb.title);
      tb.setAttribute('aria-expanded', String(!v));
      try { localStorage.setItem('kevi.hudCiut', v ? '1' : ''); } catch (e) { /* penyimpanan dimatikan */ }
    };
    let awal = false;
    try { awal = localStorage.getItem('kevi.hudCiut') === '1'; } catch (e) { /* abaikan */ }
    ciut(awal);
    $('#tb-ciut').addEventListener('click', (ev) => { ev.currentTarget.blur(); ciut(!document.body.classList.contains('hud-ciut')); });
  },
};

/* ---------- obrolan ---------- */

const Obrolan = {
  saluran: 'sekitar',
  catat(nama, teks, kelas, saluran) {
    const log = $('#obrolan-log');
    log.append(el('div', { kelas: 'obrol ' + (kelas || '') }, saluran === 'semua' || saluran === 'bisik' ? el('i', { kelas: 'saluran ' + saluran, teks: saluran }) : null, nama ? el('b', { teks: nama + ': ' }) : null, teks));
    while (log.children.length > 40) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  },
  EMOJI: ['😀', '😁', '😂', '🤣', '😊', '😍', '😎', '🤔', '😅', '😴', '😭', '😡', '👍', '👎', '👏', '🙏', '💪', '🙌', '👋', '🤝', '❤️', '🔥', '⭐', '🎉',
    '☕', '🍜', '🌱', '🥕', '🐔', '🐄', '💰', '🏠', '💻', '📡', '🔌', '🛠️', '✅', '❌', '⚠️', '⏳'],
  balasKe: null,
  // "/w nama pesan" = bisik ke pemain daring; "/r pesan" = balas bisikan terakhir. Selain itu: obrolan biasa.
  kirim(teks, saluran) {
    teks = teks.trim();
    if (!teks) return;
    const m = teks.match(/^\/(w|bisik|r)\s+(.*)$/i);
    if (!m) { Jaring.kirim({ t: 'obrol', teks, saluran: saluran || this.saluran }); return; }
    if (m[1].toLowerCase() === 'r') {
      if (!this.balasKe) { kabar('Belum ada bisikan untuk dibalas.', 'galat'); return; }
      Jaring.kirim({ t: 'obrol', teks: m[2], saluran: 'bisik', ke: this.balasKe }); return;
    }
    api('/api/daring').then(d => {
      const calon = d.daring.filter(p => p.id !== G.saya.id && m[2].toLowerCase().startsWith(p.nama.toLowerCase() + ' ')).sort((a, b) => b.nama.length - a.nama.length)[0];
      if (!calon) { kabar('Pakai: /w <nama karakter yang sedang daring> <pesan>', 'galat'); return; }
      Jaring.kirim({ t: 'obrol', teks: m[2].slice(calon.nama.length + 1), saluran: 'bisik', ke: calon.id });
    }).catch(() => {});
  },
  bisikMasuk(m) {
    const dariSaya = m.id === G.saya.id;
    if (!dariSaya) this.balasKe = m.id;
    this.catat(dariSaya ? 'ke ' + m.ke_nama : m.nama, m.teks, 'bisik', 'bisik');
  },
  bisikKe(e) { const isi = $('#obrolan-isi'); isi.value = '/w ' + e.nama + ' '; isi.focus(); },
  gantiSaluran() {
    this.saluran = this.saluran === 'sekitar' ? 'semua' : 'sekitar';
    const tb = $('#obrolan-saluran');
    tb.textContent = this.saluran === 'semua' ? 'Semua' : 'Sekitar';
    tb.classList.toggle('semua', this.saluran === 'semua');
    $('#obrolan-isi').placeholder = this.saluran === 'semua' ? 'Ke semua yang daring…' : 'Ke yang ada di sini…';
  },
  sapa(e) {
    const sapaan = ['Halo, ' + e.nama + '!', 'Hai ' + e.nama + ', semangat!', e.nama + ', ngopi dulu?'];
    this.kirim(sapaan[Math.floor(Math.random() * sapaan.length)], 'sekitar');
  },
  pasang() {
    const isi = $('#obrolan-isi');
    isi.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { this.kirim(isi.value); isi.value = ''; isi.blur(); }
      else if (ev.key === 'Tab') { ev.preventDefault(); this.gantiSaluran(); }
      else if (ev.key === 'Escape') { isi.value = ''; isi.blur(); }
    });
    $('#obrolan-saluran').addEventListener('click', () => { this.gantiSaluran(); isi.focus(); });
    const kotak = $('#emoji-kotak');
    kotak.append(...this.EMOJI.map(e => el('button', { type: 'button', kelas: 'emoji', teks: e, on: { click: () => {
      const a = isi.selectionStart ?? isi.value.length;
      isi.value = (isi.value.slice(0, a) + e + isi.value.slice(isi.selectionEnd ?? a)).slice(0, 160);
      isi.focus(); isi.setSelectionRange(a + e.length, a + e.length);
    } } })));
    $('#obrolan-emoji').addEventListener('click', () => { kotak.hidden = !kotak.hidden; isi.focus(); });
    isi.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== isi && !kotak.contains(document.activeElement)) kotak.hidden = true; }, 150));
  },
};

/* ---------- Koperasi (toko) ---------- */

const Toko = {
  tab: 'benih', kategori: '', cari: '',
  buka() {
    const isi = el('div', { kelas: 'toko' });
    Panel.buka('Koperasi', isi, { kelas: 'ringkas' });
    const lukisUlang = () => { if (isi.isConnected) this.lukis(isi); };
    document.addEventListener('kevi:segar', lukisUlang);
    Panel.saatTutup = () => document.removeEventListener('kevi:segar', lukisUlang);
    this.lukis(isi);
  },
  async beli(b, n) { const d = await aksi('/api/toko/beli', { barang: b, jumlah: n }); if (d) kabar('Dibeli: ' + n + ' ' + namaBarang(b) + '.'); },
  kartuBeli(b, catatan) {
    const h = hargaBeli(b), perlu = levelBarang(b), kunci = perlu > G.level.level;
    return el('button', { kelas: 'kartu' + (kunci ? ' gembok' : ''), title: namaBarang(b) + (kunci ? ' — terbuka di level ' + perlu : ' — klik beli 1, Shift+klik beli 5'), disabled: !kunci && h > G.koin,
      on: { click: (ev) => (kunci ? kabar(namaBarang(b) + ' baru bisa dibeli di level ' + perlu + '.', 'galat') : this.beli(b, ev.shiftKey ? 5 : 1)) } },
      ikonBarang(b, 40), el('b', { teks: namaBarang(b) }), el('small', { kelas: 'harga', teks: h }), kunci ? el('span', { kelas: 'cip level-kunci', teks: 'Lv ' + perlu }) : null, catatan ? el('small', { teks: catatan }) : null,
      G.inventori[b] ? el('span', { kelas: 'punya', teks: 'x' + G.inventori[b] }) : null);
  },
  lukis(isi) {
    const t = G.toko, tabs = [['benih', 'Benih & pakan'], ['makan', 'Makanan & tas'], ['perabot', 'Perabot'], ['lantai', 'Lantai & tembok'], ['jual', 'Jual']];
    const kepala = el('div', { kelas: 'tab' }, tabs.map(([id, nama]) => el('button', { kelas: this.tab === id ? 'aktif' : '', teks: nama, on: { click: () => { this.tab = id; this.lukis(isi); } } })),
      el('span', { kelas: 'tumbuh' }), el('span', { kelas: 'harga besar', teks: G.koin.toLocaleString('id-ID') }));
    let badan;
    if (this.tab === 'benih') {
      badan = el('div', {}, el('p', { kelas: 'redup', teks: 'Klik = beli 1, Shift+klik = beli 5. Tanaman hanya tumbuh selama petaknya basah.' }),
        el('div', { kelas: 'kisi' }, Object.entries(t.tanaman).map(([k, v]) => this.kartuBeli('benih:' + k, `${lamaTeks(v.jam * t.jam_kebun)} · jual ${v.jual}${v.ulang ? ' · berulang' : ''}`)),
          this.kartuBeli('pakan', 'per porsi'), this.kartuBeli('kebun_petak', 'petak tanam'), this.kartuBeli('kebun_penyiram', 'siram 8 petak sekitar'),
          this.kartuBeli('kebun_kotak_kiriman', 'titik jual'), this.kartuBeli('kandang_ayam', 'ayam & bebek'), this.kartuBeli('kandang_ternak', 'kambing & sapi')));
    } else if (this.tab === 'makan') {
      const dijual = Object.entries(t.makanan).filter(([, m]) => m.harga != null);
      badan = el('div', {}, el('p', { kelas: 'redup', teks: 'Makanan memulihkan stamina: pegang di hotbar lalu tekan F. Masakan sendiri (kompor di pantry atau di rumah) lebih kuat daripada jajanan.' }),
        el('div', { kelas: 'kisi' }, dijual.map(([k, m]) => this.kartuBeli('makan:' + k, '+' + m.stamina + ' stamina')), this.kartuBeli('kompor', 'untuk memasak di rumah')),
        el('h4', { teks: 'Peti' }),
        el('p', { kelas: 'redup kecil', teks: `Taruh di rumah (mode Bangun), lalu tekan E di dekatnya. Tiap peti memuat ${t.peti_jenis || 20} jenis barang.` }),
        el('div', { kelas: 'kisi' }, (t.peti || []).map(n => this.kartuBeli(n, 'peti'))),
        el('h4', { teks: 'Tas' }),
        el('div', { kelas: 'baris' }, el('span', { kelas: 'tumbuh', teks: `Inventory ${G.tas.kapasitas} slot (tas ${G.tas.jumlah}). Tiap tas menambah 10 slot.` }),
          G.tas.harga ? el('button', { kelas: 'tombol kecil utama', teks: 'Beli tas · ' + G.tas.harga + ' koin', disabled: G.tas.harga > G.koin,
            on: { click: async () => { if (await aksi('/api/toko/tas', {})) kabar('Tas baru: inventory jadi ' + G.tas.kapasitas + ' slot.', 'hadiah'); } } }) : el('span', { kelas: 'cip hijau', teks: 'tas terbesar' })));
    } else if (this.tab === 'perabot') {
      const kategori = G.katalog.kategori.filter(k => !t.tak_dijual.some(a => (k.nama + '/').startsWith(a)));
      const pilih = el('select', { on: { change: (ev) => { this.kategori = ev.target.value; this.lukis(isi); } } },
        el('option', { value: '', teks: 'Semua kategori' }), kategori.map(k => el('option', { value: k.nama, teks: k.nama, selected: this.kategori === k.nama })));
      const cari = el('input', { type: 'search', placeholder: 'Cari perabot…', value: this.cari, on: { input: (ev) => { this.cari = ev.target.value; lukisKisi(); } } });
      const kisi = el('div', { kelas: 'kisi' });
      const lukisKisi = () => {
        const q = this.cari.toLowerCase().split(/\s+/).filter(Boolean);
        const cocok = Object.keys(G.katalog.barang).filter(n => {
          const b = G.katalog.barang[n];
          if (hargaBeli(n) == null || (this.kategori && !b.k.startsWith(this.kategori + '/'))) return false;
          const teks = (n.replace(/_/g, ' ') + ' ' + b.k).toLowerCase();
          return q.every(k => teks.includes(k));
        }).sort((a, b) => levelBarang(a) - levelBarang(b) || G.katalog.barang[a].k.localeCompare(G.katalog.barang[b].k) || a.localeCompare(b));
        kisi.replaceChildren(...cocok.slice(0, 150).map(n => this.kartuBeli(n)), cocok.length > 150 ? el('p', { kelas: 'redup', teks: `+${cocok.length - 150} lagi — persempit dengan kategori atau cari.` }) : '');
      };
      lukisKisi();
      badan = el('div', {}, el('div', { kelas: 'saring' }, pilih, cari), kisi);
    } else if (this.tab === 'lantai') {
      badan = el('div', {}, el('p', { kelas: 'redup', teks: 'Dijual per ubin. Shift+klik = beli 5. Dipasang lewat mode Bangun (B) di rumah; seret untuk mengecat banyak ubin.' }),
        el('div', { kelas: 'kisi' }, this.kartuBeli('tembok', 'per ubin, warna dipilih saat memasang'), G.katalog.lantai.map(n => this.kartuBeli('lantai:' + n))));
    } else {
      const punya = Object.keys(G.inventori).filter(b => G.inventori[b] > 0 && hargaJual(b) != null).sort((a, b) => (hargaJual(b) * G.inventori[b]) - (hargaJual(a) * G.inventori[a]));
      const hasil = punya.filter(b => b.startsWith('panen:') || t.produk[b]);
      badan = el('div', {}, el('div', { kelas: 'baris-tombol' },
        el('button', { kelas: 'tombol utama', teks: 'Jual semua hasil kebun & kandang', disabled: !hasil.length, on: { click: async () => { const d = await aksi('/api/toko/jual-hasil', {}); if (d) kabar('Terjual: +' + d.dapat + ' koin.', 'hadiah'); } } })),
        el('p', { kelas: 'redup', teks: 'Perabot, benih, dan bahan dijual kembali separuh harga. Klik = jual 1, Shift+klik = jual semua.' }),
        punya.length ? el('div', { kelas: 'kisi' }, punya.map(b => el('button', { kelas: 'kartu', title: namaBarang(b),
          on: { click: async (ev) => { const n = ev.shiftKey ? G.inventori[b] : 1; const d = await aksi('/api/toko/jual', { barang: b, jumlah: n }); if (d) kabar('Terjual ' + n + ' ' + namaBarang(b) + ': +' + d.dapat + ' koin.'); } } },
          ikonBarang(b, 40), el('b', { teks: namaBarang(b) }), el('small', { kelas: 'harga', teks: hargaJual(b) }), el('span', { kelas: 'punya', teks: 'x' + G.inventori[b] }))))
          : el('p', { kelas: 'redup', teks: 'Tidak ada yang bisa dijual.' }));
    }
    isi.replaceChildren(kepala, badan);
    const c = isi.querySelector('input[type=search]');
    if (c && this.cari) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
  },
};

/* ---------- Note ---------- */

const Catatan = {
  async buka(pilihId) {
    let d;
    try { d = await api('/api/catatan'); } catch (e) { kabar(e.message, 'galat'); return; }
    const daftar = d.catatan;
    let aktif = daftar.find(c => c.id === pilihId) || daftar[0] || null;
    const judul = el('input', { type: 'text', placeholder: 'Judul', maxLength: 80 });
    const badan = el('textarea', { placeholder: 'Tulis catatan…', maxLength: 8000, rows: 12 });
    const kiri = el('div', { kelas: 'note-daftar' });
    const isiForm = () => { judul.value = aktif ? aktif.judul : ''; badan.value = aktif ? aktif.isi : ''; };
    const lukisKiri = () => kiri.replaceChildren(
      el('button', { kelas: 'tombol kecil', teks: '+ Note baru', on: { click: () => { aktif = null; isiForm(); lukisKiri(); judul.focus(); } } }),
      ...daftar.map(c => el('button', { kelas: 'note-butir' + (aktif && aktif.id === c.id ? ' aktif' : ''), on: { click: () => { aktif = c; isiForm(); lukisKiri(); } } },
        el('b', { teks: c.judul }), el('small', { teks: new Date(c.diubah * 1000).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }))));
    const simpan = async () => {
      if (!judul.value.trim() && !badan.value.trim()) return;
      const j = await aksi('/api/catatan', { id: aktif ? aktif.id : undefined, judul: judul.value, isi: badan.value });
      if (j) { kabar('Note tersimpan.'); this.buka(j.id); }
    };
    const hapus = async () => { if (aktif && await aksi('/api/catatan/hapus', { id: aktif.id })) this.buka(); };
    isiForm(); lukisKiri();
    Panel.buka('Note', el('div', { kelas: 'note' }, kiri, el('div', { kelas: 'note-sunting formulir' }, judul, badan,
      el('div', { kelas: 'baris-tombol' }, el('button', { kelas: 'tombol utama', teks: 'Simpan', on: { click: simpan } }),
        el('button', { kelas: 'tombol bahaya', teks: 'Hapus', on: { click: hapus } })))), { kelas: 'lebar' });
  },
};

/* ---------- terminal ---------- */

const Terminal = {
  sibuk: false, riwayat: [], indeks: 0,
  buka(dari) {
    if (!G.terminalAktif) { kabar('Terminal dimatikan admin.', 'galat'); if (dari === 'meja') Mesin.berdiri(); return; }
    const t = $('#terminal');
    t.hidden = false;
    document.body.classList.add('ada-terminal');
    Mesin.tombol.clear();
    $('#tab-remote').hidden = !G.remote;
    this.tab(this.tabTerakhir === 'remote' && G.remote && Remote.ws ? 'remote' : 'terminal');
    if (!$('#term-layar').children.length) {
      this.tulis('Kevi Terminal — ' + (dari === 'rak' ? 'konsol rak server' : 'meja kerja') + '. Ketik help.', 'info');
    }
    setTimeout(() => $('#term-isi').focus(), 0);
  },
  tutup() {
    $('#terminal').hidden = true;
    document.body.classList.remove('ada-terminal');
    if (this.sibuk) Jaring.kirim({ t: 'term_batal' });
    $('#term-isi').blur();
    Mesin.berdiri();
  },
  terbuka() { return !$('#terminal').hidden; },
  tab(nama) {
    if (nama === 'browser' && !terbuka('browser')) { kabar(pesanKunci('browser'), 'galat'); return; }
    $('#terminal').dataset.tab = nama; this.tabTerakhir = nama;
    for (const b of document.querySelectorAll('#terminal .term-tab')) b.classList.toggle('aktif', b.dataset.tab === nama);
    if (nama === 'browser') Browser.pasang(); else if (nama === 'remote') Remote.pasang(); else setTimeout(() => $('#term-isi').focus(), 0);
  },
  tulis(baris, kelas) {
    const layar = $('#term-layar');
    layar.append(el('div', { kelas: 'tb ' + (kelas || ''), teks: baris || ' ' }));
    while (layar.children.length > 400) layar.firstChild.remove();
    layar.scrollTop = layar.scrollHeight;
  },
  bersih() { $('#term-layar').replaceChildren(); },
  selesai() { this.sibuk = false; $('#terminal').classList.remove('sibuk'); },
  jalankan(baris) {
    baris = baris.trim();
    if (!baris) return;
    this.riwayat.push(baris); this.indeks = this.riwayat.length;
    this.tulis('$ ' + baris, 'perintah');
    if (baris === 'exit' || baris === 'keluar') { this.tutup(); return; }
    if (!Jaring.tersambung) { this.tulis('Tidak tersambung ke server.', 'galat'); return; }
    this.sibuk = true; $('#terminal').classList.add('sibuk');
    Jaring.kirim({ t: 'term', baris });
  },
  pasang() {
    const isi = $('#term-isi');
    isi.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { const b = isi.value; isi.value = ''; this.jalankan(b); }
      else if (ev.key === 'Escape') this.tutup();
      else if (ev.key === 'c' && ev.ctrlKey && !isi.value) Jaring.kirim({ t: 'term_batal' });
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (this.indeks > 0) isi.value = this.riwayat[--this.indeks]; }
      else if (ev.key === 'ArrowDown') { ev.preventDefault(); isi.value = this.indeks < this.riwayat.length - 1 ? this.riwayat[++this.indeks] : (this.indeks = this.riwayat.length, ''); }
    });
    $('#term-tutup').addEventListener('click', () => this.tutup());
    for (const b of document.querySelectorAll('#terminal .term-tab')) b.addEventListener('click', () => this.tab(b.dataset.tab));
    $('#term-layar').addEventListener('pointerup', () => { if (!String(getSelection())) isi.focus(); });
  },
};

/* ---------- pembuat karakter ---------- */

const Buat = {
  buka(pertama) {
    const t = Object.assign({ kulit: PILIHAN_TOKOH.kulit[1], rambut_warna: PILIHAN_TOKOH.rambut[0], baju: PILIHAN_TOKOH.baju[5], celana: PILIHAN_TOKOH.celana[1],
      sepatu: PILIHAN_TOKOH.sepatu[0], aksen: PILIHAN_TOKOH.kerudung[1], gaya_rambut: 'rambut_cepak', kepala: '', mata: '', dasi: false, tali: false, telinga: false, jubah: false },
      (G.karakter && G.karakter.tampilan) || {});
    const nama = el('input', { type: 'text', maxLength: 20, placeholder: 'Nama karakter', value: (G.karakter && G.karakter.nama) || '', autofocus: true });
    const kv = el('canvas', { width: 4 * 26 * 4, height: 30 * 4, kelas: 'pratinjau' });
    const k = kv.getContext('2d');
    let hidup = true;
    const gambar = () => {
      if (!hidup || !kv.isConnected) return;
      const look = penampilan({ session_id: 'pratinjau', nama: nama.value, tampilan: t });
      k.imageSmoothingEnabled = false;
      k.clearRect(0, 0, kv.width, kv.height);
      const f = Math.floor(performance.now() / 180) % 4;
      ['bawah', 'kiri', 'atas', 'kanan'].forEach((arah, i) => {
        const b = bingkaiTokoh(look, `${arah}_${f === 1 ? 'kiri' : f === 3 ? 'kanan' : 'diam'}`);
        if (b) k.drawImage(b.kanvas, 0, 0, b.kanvas.width, b.kanvas.height, (i * 26 + 4) * 4, 4 * 4, b.kanvas.width * 4, b.kanvas.height * 4);
      });
      requestAnimationFrame(gambar);
    };
    const warna = (label, kunci, daftar) => el('div', { kelas: 'pilihan' }, el('span', { teks: label }), el('div', { kelas: 'deret' },
      daftar.map(w => el('button', { type: 'button', kelas: 'warna' + (t[kunci] === w ? ' aktif' : ''), gaya: { background: w }, 'aria-label': label + ' ' + w,
        on: { click: (ev) => { t[kunci] = w; for (const s of ev.currentTarget.parentNode.children) s.classList.toggle('aktif', s === ev.currentTarget); } } }))));
    const gaya = (label, kunci, daftar) => el('label', { kelas: 'pilihan' }, el('span', { teks: label }),
      el('select', { on: { change: (ev) => { t[kunci] = ev.target.value; } } }, daftar.map(([v, n]) => el('option', { value: v, teks: n, selected: t[kunci] === v }))));
    const centang = (label, kunci) => el('label', { kelas: 'centang-baris' }, el('input', { type: 'checkbox', checked: !!t[kunci], on: { change: (ev) => { t[kunci] = ev.target.checked; } } }), label);
    const acak = () => {
      const p = (d) => d[Math.floor(Math.random() * d.length)];
      // Karakter baru: acak setel dasar (tanpa aksesori, itu dibeli). Karakter lama: hanya yang gratis diubah.
      Object.assign(t, { kulit: p(PILIHAN_TOKOH.kulit), rambut_warna: p(PILIHAN_TOKOH.rambut) },
        pertama ? { baju: p(PILIHAN_TOKOH.baju), celana: p(PILIHAN_TOKOH.celana), sepatu: p(PILIHAN_TOKOH.sepatu), gaya_rambut: p(AKS_RAMBUT)[0] } : {});
      hidup = false; G.karakter = Object.assign(G.karakter || {}, { nama: nama.value, tampilan: t }); Buat.buka(pertama);
    };
    const simpan = async (ev) => {
      ev.preventDefault();
      try {
        const d = await api('/api/karakter', { nama: nama.value, tampilan: t });
        hidup = false;
        if (pertama) { location.reload(); return; }
        G.karakter = d.karakter; gantiTampilan(G.aku, d.karakter.nama, d.karakter.tampilan);
        Hud.potret();
        Panel.tutup(); kabar('Karakter diperbarui.');
      } catch (e) { kabar(e.message, 'galat'); }
    };
    const namaGaya = { '': 'Pendek biasa', rambut_panjang: 'Panjang', rambut_keriting: 'Keriting', rambut_cepak: 'Cepak', rambut_bob: 'Bob', rambut_kuncir: 'Kuncir' };
    const namaKepala = { '': 'Tanpa', topi_bisbol: 'Topi bisbol', kupluk: 'Kupluk', headset: 'Headset', kerudung: 'Kerudung', topi_fedora: 'Topi fedora', helm_proyek: 'Helm proyek' };
    const namaMata = { '': 'Tanpa', kacamata: 'Kacamata', kacamata_bulat: 'Kacamata bulat', kacamata_hitam: 'Kacamata hitam' };
    Panel.buka(pertama ? 'Buat karakter' : 'Ubah karakter', el('form', { kelas: 'buat', on: { submit: simpan } },
      el('div', { kelas: 'buat-kiri' }, kv, nama,
        el('div', { kelas: 'baris-tombol' }, el('button', { type: 'button', kelas: 'tombol', teks: 'Acak', on: { click: acak } }),
          el('button', { kelas: 'tombol utama', teks: pertama ? 'Mulai bekerja' : 'Simpan' })),
        pertama ? el('p', { kelas: 'redup kecil', teks: 'Modal awal: koin, 6 petak kebun, benih, dan satu Kotak Kiriman. Setel dasar ini gratis; pakaian lain, topi, kacamata, dan aksesori dibeli di Kak Mira (toko pakaian di kantor).' }) : null),
      // Karakter baru memilih setel dasar. Sesudahnya hanya yang gratis (kulit, warna rambut, warna topi) diubah di sini;
      // pakaian dan aksesori diganti lewat lemari.
      pertama ? el('div', { kelas: 'buat-kanan' },
        warna('Kulit', 'kulit', PILIHAN_TOKOH.kulit), warna('Warna rambut', 'rambut_warna', PILIHAN_TOKOH.rambut),
        gaya('Gaya rambut', 'gaya_rambut', AKS_RAMBUT.map(([v]) => [v, namaGaya[v]])),
        warna('Baju', 'baju', PILIHAN_TOKOH.baju), warna('Celana', 'celana', PILIHAN_TOKOH.celana), warna('Sepatu', 'sepatu', PILIHAN_TOKOH.sepatu))
      : el('div', { kelas: 'buat-kanan' },
        warna('Kulit', 'kulit', PILIHAN_TOKOH.kulit), warna('Warna rambut', 'rambut_warna', PILIHAN_TOKOH.rambut),
        warna('Warna topi / kerudung', 'aksen', [...PILIHAN_TOKOH.kerudung, ...PILIHAN_TOKOH.topi]),
        el('p', { kelas: 'redup kecil', teks: 'Baju, celana, sepatu, gaya rambut, topi, kacamata, dan aksesori diganti lewat lemari; yang baru dibeli di Kak Mira (toko pakaian di kantor).' }),
        el('button', { type: 'button', kelas: 'tombol', id: 'buat-lemari', teks: 'Ganti pakaian (lemari)', on: { click: () => { hidup = false; Pakaian.buka(false); } } }))),
      { kelas: 'lebar', tanpaTutup: pertama, saatTutup: () => { hidup = false; } });
    requestAnimationFrame(gambar);
  },
};

/* ---------- level ---------- */

Panel.level = function () {
  const lv = G.level, urut = Object.keys(G.buka).sort((a, b) => G.buka[a] - G.buka[b]);
  Panel.buka('Level ' + lv.level, el('div', {},
    el('div', { kelas: 'xp-besar' }, el('i', { gaya: { width: (lv.lanjut ? Math.round((lv.xp - lv.dasar) / (lv.lanjut - lv.dasar) * 100) : 100) + '%' } })),
    el('p', { kelas: 'redup', teks: lv.lanjut ? `${lv.xp - lv.dasar} dari ${lv.lanjut - lv.dasar} XP menuju level ${lv.level + 1}. Stamina ${lv.stamina}.` : 'Level tertinggi tercapai.' }),
    el('p', { kelas: 'redup kecil', teks: `XP datang dari terminal, kebun, kandang, misi, obrolan, tos, kuis, dan arcade. Tiap naik level: koin ${G.hadiahNaik} x level, stamina bertambah.` }),
    el('h4', { teks: 'Yang terbuka seiring level' }),
    el('div', { kelas: 'daftar' }, urut.map(k => el('div', { kelas: 'baris' + (terbuka(k) ? '' : ' terkunci') },
      el('span', { kelas: 'cip' + (terbuka(k) ? ' hijau' : ''), teks: 'Lv ' + G.buka[k] }), el('span', { kelas: 'tumbuh', teks: G.namaBuka[k] || k }),
      el('span', { kelas: 'redup kecil', teks: terbuka(k) ? 'terbuka' : 'terkunci' }))))), { sempit: true });
};

Panel.naikLevel = function (level) {
  const baru = Object.keys(G.buka).filter(k => G.buka[k] === level);
  kabar('Naik ke level ' + level + '! +' + (G.hadiahNaik * level) + ' koin', 'hadiah');
  if (baru.length) kabar('Terbuka: ' + baru.map(k => G.namaBuka[k] || k).join(', '), 'hadiah');
  Obrolan.catat('', 'Kamu naik ke level ' + level + '.', 'sistem');
};

/* ---------- interaksi dengan rekan ---------- */

const Sosial = {
  menu(e) {
    const tb = (teks, kunci, fn) => el('button', { kelas: 'tombol' + (kunci && !terbuka(kunci) ? ' terkunci' : ''), teks: teks + (kunci && !terbuka(kunci) ? '  (Lv ' + G.buka[kunci] + ')' : ''),
      on: { click: () => { if (kunci && !terbuka(kunci)) { kabar(pesanKunci(kunci), 'galat'); return; } Panel.tutup(); fn(); } } });
    Panel.buka(e.nama + (e.level ? ' · Lv ' + e.level : ''), el('div', { kelas: 'baris-tombol tegak' },
      tb('Lihat profil', null, () => Profil.buka(e.id)),
      tb('Sapa', null, () => Obrolan.sapa(e)),
      tb('Bisik (pesan pribadi)', null, () => Obrolan.bisikKe(e)),
      tb('Tos', 'tos', () => Jaring.kirim({ t: 'tos', ke: e.id })),
      tb('Tantang suit', 'suit', () => this.ajakSuit(e)),
      tb('Kirim koin', 'kirim_koin', () => this.kirimKoin(e)),
      tb('Bertamu ke rumahnya', null, () => Mesin.pindah('rumah:' + e.id))), { sempit: true });
  },

  kirimKoin(e) {
    const jumlah = el('input', { type: 'number', min: 1, max: 100, value: 10, autofocus: true });
    Panel.buka('Kirim koin ke ' + e.nama, el('form', { kelas: 'formulir', on: { submit: async (ev) => {
      ev.preventDefault();
      const d = await aksi('/api/interaksi/kirim', { ke: e.id, jumlah: Number(jumlah.value) });
      if (d) { Panel.tutup(); kabar(d.terkirim + ' koin terkirim ke ' + d.nama + '.'); }
    } } }, el('label', {}, 'Jumlah (1–100 koin)', jumlah), el('button', { kelas: 'tombol utama', teks: 'Kirim' })), { sempit: true });
  },

  async kopi(e) {
    if (G.health.kopi > G.kini && G.health.nilai >= G.level.stamina - 1) { kabar('Masih segar. Kopinya nanti saja.'); return; }
    const d = await aksi('/api/interaksi/kopi', {});
    if (!d) return;
    G.health.nilai = G.level.stamina; G.health.lelah = false; G.health.kopi = G.kini + d.kopi;
    G.aku.emot = { n: 'nada', sampai: performance.now() + 2400 };
    kabar('Kopi diminum: Health penuh, lelah pulih dua kali lebih cepat selama ' + d.kopi + ' detik.');
  },

  ajakSuit(e) {
    Panel.buka('Tantang ' + e.nama + ' suit', el('div', {}, el('p', { kelas: 'redup', teks: 'Batu, gunting, kertas. Pilih taruhan; yang kalah membayar yang menang.' }),
      el('div', { kelas: 'baris-tombol' }, [0, 10, 25].map(t => el('button', { kelas: 'tombol' + (t ? '' : ' utama'), teks: t ? t + ' koin' : 'Tanpa taruhan',
        on: { click: () => { Panel.tutup(); Jaring.kirim({ t: 'suit_ajak', ke: e.id, taruhan: t }); } } })))), { sempit: true });
  },

  // Pesan suit dari server: ajakan, menunggu, mulai (pilih), hasil, batal.
  suit(m) {
    const ikon3 = { batu: '✊', gunting: '✌', kertas: '✋' };
    if (m.t === 'suit_ajak') {
      Panel.buka('Tantangan suit', el('div', {}, el('p', { teks: m.nama + ' menantangmu suit' + (m.taruhan ? ' dengan taruhan ' + m.taruhan + ' koin.' : ' tanpa taruhan.') }),
        el('div', { kelas: 'baris-tombol' }, el('button', { kelas: 'tombol utama', teks: 'Terima', on: { click: () => { this.dijawab = true; Jaring.kirim({ t: 'suit_jawab', id: m.id, terima: true }); } } }),
          el('button', { kelas: 'tombol', teks: 'Tolak', on: { click: () => Panel.tutup() } }))),
        { sempit: true, saatTutup: () => { if (!this.dijawab) Jaring.kirim({ t: 'suit_jawab', id: m.id, terima: false }); this.dijawab = false; } });
    } else if (m.t === 'suit_tunggu') kabar('Menunggu jawaban ' + m.nama + '…');
    else if (m.t === 'suit_mulai') {
      this.dijawab = true;
      const info = el('p', { kelas: 'redup', teks: 'Pilih satu.' });
      Panel.buka('Suit melawan ' + m.lawan, el('div', {}, el('p', { teks: m.taruhan ? 'Taruhan ' + m.taruhan + ' koin.' : 'Tanpa taruhan.' }),
        el('div', { kelas: 'suit-pilih' }, Object.keys(ikon3).map(k => el('button', { kelas: 'kartu', on: { click: (ev) => {
          Jaring.kirim({ t: 'suit_pilih', id: m.id, pilih: k });
          for (const b of ev.currentTarget.parentNode.children) b.disabled = true;
          ev.currentTarget.classList.add('terpilih'); info.textContent = 'Menunggu pilihan lawan…';
        } } }, el('span', { kelas: 'suit-ikon', teks: ikon3[k] }), el('b', { teks: k })))), info), { sempit: true });
      this.dijawab = false;
    } else if (m.t === 'suit_hasil') {
      const judul = { menang: 'Kamu menang!', kalah: 'Kamu kalah.', seri: 'Seri.' }[m.hasil];
      Panel.buka(judul, el('div', {}, el('div', { kelas: 'suit-hasil' }, el('span', { kelas: 'suit-ikon', teks: ikon3[m.saya] }), el('span', { teks: 'lawan' }), el('span', { kelas: 'suit-ikon', teks: ikon3[m.lawan] })),
        el('p', { kelas: 'redup', teks: m.taruhan && m.hasil !== 'seri' ? (m.hasil === 'menang' ? '+' : '-') + m.taruhan + ' koin.' : 'Tidak ada koin berpindah.' })), { sempit: true });
    } else if (m.t === 'suit_batal') { if (Panel.terbuka()) { this.dijawab = true; Panel.tutup(); this.dijawab = false; } kabar('Suit batal: ' + m.alasan); }
  },
};

/* ---------- kuis jaringan ---------- */

const Kuis = {
  tawarkan(e) {
    if (!terbuka('kuis')) return;                 // sebelum terbuka Mas Dika cukup mengobrol
    if (e.giliran % 3 === 0) this.buka();          // tiap ucapan ketiga ia menyodorkan soal
  },
  async buka() {
    if (!terbuka('kuis')) { kabar(pesanKunci('kuis'), 'galat'); return; }
    const d = await aksi('/api/interaksi/kuis', {});
    if (!d) return;
    const hasil = el('p', { kelas: 'redup', teks: d.sisa ? 'Sisa jawaban berhadiah hari ini: ' + d.sisa + '.' : 'Jatah hadiah hari ini habis; menjawab tetap boleh untuk latihan.' });
    Panel.buka('Kuis jaringan', el('div', {}, el('p', { kelas: 'soal', teks: d.soal }),
      el('div', { kelas: 'daftar' }, d.pilihan.map((p, i) => el('button', { kelas: 'tombol pilihan-kuis', teks: p, on: { click: async (ev) => {
        const tb = ev.currentTarget, semua = [...tb.parentNode.children];
        semua.forEach(b => { b.disabled = true; });
        const j = await aksi('/api/interaksi/kuis-jawab', { pilih: i });
        if (!j) return;
        tb.classList.add(j.benar ? 'benar' : 'salah');
        semua.forEach(b => { if (b.textContent === j.jawaban) b.classList.add('benar'); });
        hasil.textContent = j.benar ? ('Benar!' + (j.koin_dapat ? ' +' + j.koin_dapat + ' koin, +' + j.xp_dapat + ' XP.' : ' (jatah hadiah hari ini habis)')) : 'Kurang tepat. Jawabannya: ' + j.jawaban + '.';
        hasil.after(el('div', { kelas: 'baris-tombol' }, el('button', { kelas: 'tombol utama', teks: 'Soal berikutnya', on: { click: () => Kuis.buka() } })));
      } } }))), hasil), { sempit: true });
  },
};

/* ---------- arcade: Cocokkan Kartu ---------- */

const Arcade = {
  KARTU: ['ikon_panen_sawi', 'ikon_panen_wortel', 'ikon_panen_cabai', 'ikon_panen_tomat', 'ikon_panen_jagung', 'ikon_panen_labu', 'ikon_panen_telur', 'ikon_panen_stroberi'],
  async buka() {
    if (!terbuka('arcade')) { kabar(pesanKunci('arcade'), 'galat'); return; }
    const d = await aksi('/api/interaksi/arcade', {});
    if (!d) return;
    const dek = [...this.KARTU, ...this.KARTU].map((n, i) => ({ n, i })).sort(() => Math.random() - 0.5);
    const mulai = performance.now();
    let buka = [], cocok = 0, langkah = 0, kunci = false, selesai = false;
    const info = el('p', { kelas: 'redup', teks: (d.sisa ? `Hadiah tersisa hari ini: ${d.sisa}x. ` : 'Jatah hadiah hari ini habis (tetap boleh main). ') + `Di bawah ${d.tingkat[0].detik} dtk: ${d.tingkat[0].koin} koin.` });
    const jam = el('b', { kelas: 'harga besar', teks: '0,0 dtk' });
    const papan = el('div', { kelas: 'arcade-papan' }, dek.map(k => {
      const tb = el('button', { kelas: 'arcade-kartu', 'aria-label': 'Kartu tertutup' }, ikon(k.n, 36));
      tb.addEventListener('click', async () => {
        if (kunci || selesai || tb.classList.contains('buka')) return;
        tb.classList.add('buka'); buka.push({ tb, n: k.n });
        if (buka.length < 2) return;
        langkah++;
        const [a, b] = buka; buka = [];
        if (a.n === b.n) {
          a.tb.classList.add('cocok'); b.tb.classList.add('cocok');
          if (++cocok === this.KARTU.length) {
            selesai = true;
            const j = await aksi('/api/interaksi/arcade-selesai', { token: d.token });
            info.textContent = j ? `Selesai ${String(j.detik).replace('.', ',')} dtk, ${langkah} langkah.` + (j.koin_dapat ? ` +${j.koin_dapat} koin, +${j.xp_dapat} XP.` : ' Jatah hadiah hari ini habis.') : 'Selesai.';
            info.after(el('div', { kelas: 'baris-tombol' }, el('button', { kelas: 'tombol utama', teks: 'Main lagi', on: { click: () => Arcade.buka() } })));
          }
        } else { kunci = true; setTimeout(() => { a.tb.classList.remove('buka'); b.tb.classList.remove('buka'); kunci = false; }, 650); }
      });
      return tb;
    }));
    const detak = setInterval(() => { if (!papan.isConnected || selesai) clearInterval(detak); else jam.textContent = ((performance.now() - mulai) / 1000).toFixed(1).replace('.', ',') + ' dtk'; }, 100);
    Panel.buka('Arcade: Cocokkan Kartu', el('div', {}, el('div', { kelas: 'baris-tombol' }, jam), papan, info), { sempit: true, saatTutup: () => clearInterval(detak) });
  },
};

/* ---------- browser di Komputer ---------- */

const Browser = {
  pasang() {
    const wadah = $('#term-browser');
    if (wadah.dataset.siap) return;
    wadah.dataset.siap = '1';
    const bingkai = el('iframe', { title: 'Browser Kevi', referrerPolicy: 'no-referrer' });
    // Tanpa allow-top-navigation: halaman di dalam bingkai tak bisa membawa pergi tab Kevi.
    bingkai.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups');
    const alamat = el('input', { type: 'text', placeholder: 'https://…', autocapitalize: 'off', spellcheck: false });
    const buka = (url) => {
      url = String(url || '').trim();
      if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      if (!/^https?:\/\/[^\s"'<>]+$/i.test(url)) { kabar('Alamat harus http:// atau https://', 'galat'); return; }
      alamat.value = url; bingkai.src = url;
    };
    alamat.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') buka(alamat.value); else if (ev.key === 'Escape') Terminal.tutup(); });
    wadah.append(
      el('div', { kelas: 'browser-bilah' }, alamat, el('button', { kelas: 'tombol kecil utama', teks: 'Buka', on: { click: () => buka(alamat.value) } }),
        el('button', { kelas: 'tombol kecil', teks: 'Tab baru', title: 'Buka alamat ini di tab peramban sungguhan', on: { click: () => { if (alamat.value) window.open(alamat.value, '_blank', 'noopener'); } } })),
      el('div', { kelas: 'browser-bookmark' }, (G.atur.bookmark || []).map(b => el('button', { kelas: 'tombol kecil', teks: b.nama, on: { click: () => buka(b.url) } })),
        el('span', { kelas: 'redup kecil', teks: 'Situs yang melarang dibingkai akan tampil kosong; pakai Tab baru.' })),
      bingkai);
  },
};

/* ---------- remote SSH / telnet (tab ketiga Komputer) ---------- */

const Remote = {
  ws: null, term: null, pas: null, dimuat: null,

  muatPustaka() {
    if (!this.dimuat) this.dimuat = Promise.all(['xterm.js', 'addon-fit.js'].map(n => new Promise((res, rej) => {
      const s = el('script', { src: '/static/vendor/xterm/' + n + V }); s.onload = res; s.onerror = () => rej(new Error(n + ' gagal dimuat')); document.head.append(s);
    })));
    return this.dimuat;
  },

  async pasang() {
    if (!G.remote) { kabar('Remote hanya untuk yang diberi izin admin.', 'galat'); Terminal.tab('terminal'); return; }
    try { await this.muatPustaka(); } catch (e) { kabar(e.message, 'galat'); return; }
    if (!this.term) {
      this.term = new window.Terminal({ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13, cursorBlink: true, scrollback: 3000,
        theme: { background: '#06100b', foreground: '#d1fae5', cursor: '#4ade80' } });
      this.pas = new window.FitAddon.FitAddon();
      this.term.loadAddon(this.pas);
      this.term.open($('#remote-layar'));
      this.term.onData((d) => { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ k: 'data', d })); });
      this.term.onResize(({ cols, rows }) => { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ k: 'ukur', c: cols, r: rows })); });
      new ResizeObserver(() => { if ($('#terminal').dataset.tab === 'remote' && !$('#terminal').hidden) this.pas.fit(); }).observe($('#remote-layar'));
      this.term.writeln('\x1b[33mRemote Kevi — isi alamat perangkat lalu Sambung. Password diketik di sini, tidak disimpan.\x1b[0m');
      const port = $('#remote-port'), proto = $('#remote-proto');
      proto.addEventListener('change', () => { port.value = proto.value === 'ssh' ? 22 : 23; $('#remote-user').hidden = proto.value !== 'ssh'; });
      for (const i of document.querySelectorAll('#remote-form input, #remote-form select')) i.addEventListener('keydown', (ev) => ev.stopPropagation());
      $('#remote-form').addEventListener('submit', (ev) => { ev.preventDefault(); this.sambung(); });
      $('#remote-putus').addEventListener('click', () => this.putus());
    }
    setTimeout(() => { this.pas.fit(); (this.ws ? this.term : $('#remote-host')).focus(); }, 30);
  },

  async sambung() {
    if (this.ws) return;
    if (!G.totp) { kabar('Set dulu TOTP untuk SSH/telnet.', 'galat'); Panel.totp(); return; }
    let t;
    try { t = await api('/api/totp'); } catch (e) { kabar(e.message, 'galat'); return; }
    if (!t.segar) { Panel.kodeSegar(() => this.sambung()); return; }
    if (this.ws) return;
    const badan = { proto: $('#remote-proto').value, host: $('#remote-host').value.trim(), port: Number($('#remote-port').value), user: $('#remote-user').value.trim(),
      kolom: this.term.cols, baris: this.term.rows };
    if (!badan.host || (badan.proto === 'ssh' && !badan.user)) { kabar('Isi alamat' + (badan.proto === 'ssh' ? ' dan username perangkat.' : '.'), 'galat'); return; }
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/remote');
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.term.reset();
    ws.onopen = () => { ws.send(JSON.stringify(badan)); $('#remote-sambung').hidden = true; $('#remote-putus').hidden = false; this.term.focus(); };
    ws.onmessage = (ev) => this.term.write(typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data));
    ws.onclose = () => { if (this.ws === ws) this.ws = null; $('#remote-sambung').hidden = false; $('#remote-putus').hidden = true; this.term.writeln('\r\n\x1b[33m[kevi] sambungan ditutup.\x1b[0m'); };
  },
  putus() { if (this.ws) this.ws.close(); },
};
