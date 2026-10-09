/* Kevi — battle di peramban: menggambar zombie, efek pukulan, koin jatuh, Health, dan pingsan.
 * Peramban tidak memutuskan apa pun: posisi dan HP zombie, kena atau tidaknya pukulan, Health, dan hadiah semuanya
 * disiarkan server (app/battle.py). Di sini hanya mengirim "pukul" dan menghaluskan gerak yang dikabarkan 4 kali sedetik.
 * Sprite zombie sementara: tokoh biasa berkulit hijau (perakit tokoh Agent Pak), sampai sprite khususnya ada.
 */
'use strict';

const TAMPANG_ZOMBIE = {
  biasa: { kulit: '#7fae6a', rambut_warna: '#2f3a2a', baju: '#5b6470', celana: '#3a3f4a', sepatu: '#23262d', gaya_rambut: 'rambut_cepak', kepala: '', mata: '' },
  gesit: { kulit: '#a3c98e', rambut_warna: '#3a2a2a', baju: '#7a3b3b', celana: '#2f2a3a', sepatu: '#23262d', gaya_rambut: 'rambut_keriting', kepala: '', mata: '' },
  besar: { kulit: '#5f8f52', rambut_warna: '#1f2620', baju: '#3f3a52', celana: '#26283a', sepatu: '#15161c', gaya_rambut: 'rambut_cepak', kepala: '', mata: '' },
};
const LEBAR_ZOMBIE = 0.78;      // tokoh dipersempit supaya zombie tampak kurus (kata yosi)
const NAMA_SENJATA = { sapu: 'Sapu', kunci_inggris: 'Kunci inggris', tongkat_bisbol: 'Tongkat bisbol', kabel_lan: 'Kabel LAN', pemadam_api: 'Pemadam api' };
const WARNA_SENJATA = { '': '#f8fafc', sapu: '#fcd34d', kunci_inggris: '#cbd5e1', tongkat_bisbol: '#d6a26a', kabel_lan: '#60a5fa', pemadam_api: '#f87171' };

const Battle = {
  z: new Map(), koin: new Map(), bangkai: [], ayunan: [], percik: [], rupa: {},
  hp: null, maks: null, menyerang: false, pukulBerikut: 0, lalu: 0,

  look(jenis) { return this.rupa[jenis] || (this.rupa[jenis] = penampilan({ session_id: 'zombie-' + jenis, nama: 'Zombie', tampilan: TAMPANG_ZOMBIE[jenis] || TAMPANG_ZOMBIE.biasa })); },
  // Senjata yang sedang dipegang di hotbar ('' = tangan kosong). Server memeriksa lagi bahwa barangnya memang dimiliki.
  senjata() { const b = typeof Hotbar !== 'undefined' ? Hotbar.dipegang() : null; return b && b.startsWith('senjata:') ? b.slice(8) : ''; },

  // Memukul: Spasi, klik atau ketuk di peta selagi ada zombie, atau tombol Pukul di layar sentuh. Tanpa senjata pun
  // bisa (tangan kosong); senjata yang dipegang di hotbar hanya menambah damage dan jangkauan.
  pasang() {
    kanvas.addEventListener('pointerdown', (ev) => { if (ev.button === 0 && !G.bangun && this.z.size && !Mesin.sibuk()) this.pukul(); });
  },
  pukul() {
    if (G.adegan !== 'kantor' || G.bangun || G.duduk || !Jaring.tersambung) return;
    const kini = performance.now();
    if (kini < this.pukulBerikut) return;
    this.pukulBerikut = kini + 300;                    // jeda sebenarnya (per senjata) dijaga server
    Jaring.kirim({ t: 'pukul', senjata: this.senjata() });
  },

  // Toko Bang Jago: senjata tidak habis dipakai, cukup satu; taruh di hotbar lalu pegang untuk memakainya.
  toko() {
    const S = G.toko.senjata || {}, isi = el('div', {});
    const lukis = () => isi.replaceChildren(
      el('p', { kelas: 'redup', teks: 'Senjata tidak habis dipakai. Sesudah membeli, taruh di hotbar (Inventory, tombol I) dan pegang; Spasi untuk memukul. Tangan kosong: damage ' + (S[''] || { damage: 1 }).damage + '.' }),
      el('div', { kelas: 'kisi' }, Object.keys(S).filter(k => k).map(k => {
        const b = 'senjata:' + k, s = S[k], punya = (G.inventori[b] || 0) > 0, kunci = s.level > G.level.level;
        return el('button', { kelas: 'kartu' + (kunci ? ' gembok' : ''), 'data-senjata': k, disabled: punya || (!kunci && s.harga > G.koin),
          title: s.nama + ' — damage ' + s.damage + ', jangkauan ' + s.jangkau + ' px, jeda ' + s.jeda + ' dtk' + (kunci ? ' — terbuka di level ' + s.level : ''),
          on: { click: async () => { if (kunci) { kabar(s.nama + ' baru bisa dibeli di level ' + s.level + '.', 'galat'); return; } const d = await aksi('/api/toko/beli', { barang: b, jumlah: 1 }); if (d) { kabar('Dibeli: ' + s.nama + '. Taruh di hotbar lalu pegang.', 'hadiah'); lukis(); } } } },
          ikonBarang(b, 40), el('b', { teks: s.nama }), el('small', { teks: 'damage ' + s.damage }), el('small', { kelas: 'harga', teks: s.harga }),
          kunci ? el('span', { kelas: 'cip level-kunci', teks: 'Lv ' + s.level }) : null, punya ? el('span', { kelas: 'punya', teks: 'punya' }) : null);
      })));
    lukis();
    Panel.buka('Bang Jago: item battle', isi);
  },

  // Pesan dari server. Mengembalikan true bila pesannya milik battle.
  terima(m) {
    const kini = performance.now();
    switch (m.t) {
      case 'zombie': {
        const hidup = new Set();
        for (const [id, jenis, x, y, hp, maks] of m.z) {
          hidup.add(id);
          const z = this.z.get(id);
          if (z) Object.assign(z, { tx: x, ty: y, hp, maks });
          else this.z.set(id, { id, jenis, x, y, tx: x, ty: y, hp, maks, arah: 'bawah', jalan: false, langkah: 0, kena: 0, look: this.look(jenis), pose: '' });
        }
        for (const id of [...this.z.keys()]) if (!hidup.has(id)) this.z.delete(id);
        const ada = new Set();
        for (const [id, x, y, n] of m.k) { ada.add(id); if (!this.koin.has(id)) this.koin.set(id, { id, x, y, n, lahir: kini }); }
        for (const id of [...this.koin.keys()]) if (!ada.has(id)) this.koin.delete(id);
        this.suasana(this.z.size > 0);
        return true;
      }
      case 'zombie_kena': { const z = this.z.get(m.id); if (z) { z.kena = kini; z.hp = m.hp; apung('-' + m.dmg, '#fecaca', z.x + 8, z.y - 4); this.percik.push({ x: z.x + 8, y: z.y + 8, lahir: kini }); } Suara.efek('kena'); return true; }
      case 'zombie_mati': {
        const lama = this.z.get(m.id);
        this.z.delete(m.id);
        this.bangkai.push({ x: m.x, y: m.y, jenis: m.jenis, lahir: kini, varian: lama ? this.varian(lama) : null, arah: lama ? lama.arah : 'kanan' });
        apung('-' + m.dmg, '#fecaca', m.x + 8, m.y - 4);
        if (m.koin) this.koin.set(m.koin[0], { id: m.koin[0], x: m.koin[1], y: m.koin[2], n: m.koin[3], lahir: kini });
        Suara.efek('mati');
        return true;
      }
      case 'ayun': {
        const e = m.id === G.saya.id ? G.aku : G.entitas.get('p:' + m.id);
        if (e) { this.ayunan.push({ e, senjata: m.senjata || '', lahir: kini }); e.ayun = kini; }      // e.ayun: senjata di tangannya ikut terayun
        if (m.id === G.saya.id) { Suara.efek('ayun'); if (m.kena == null && this.z.size) apung('meleset: terlalu jauh', '#cbd5e1'); }
        return true;
      }
      case 'gelombang':
        if (m.mulai) { kabar('Zombie menyerang kantor! Dekati lalu tekan Spasi untuk memukul.', 'galat'); Suara.efek('sirene'); this.suasana(true); }
        else { kabar(m.kabur ? 'Zombie yang tersisa pergi.' : 'Semua zombie tumbang. Kantor aman lagi.', 'hadiah'); this.suasana(false); }
        return true;
      case 'hp':
        this.hp = m.hp; this.maks = m.maks;
        if (m.gigit) { apung('-' + Math.max(1, Math.round(G.health.nilai - m.hp)), '#f87171'); this.kedip(); Suara.efek('gigit'); }
        return true;
      case 'pingsan':
        this.hp = m.hp; this.maks = m.maks;
        aturLevel(m.level, false);
        Suara.efek('pingsan');
        this.tirai();
        kabar('Pingsan digigit zombie. Kehilangan ' + m.xp_hilang + ' EXP' + (m.turun ? ', level turun ke ' + m.level.level : '') + '. Kamu terbangun di rumah.', 'galat');
        if (typeof Terminal !== 'undefined' && Terminal.terbuka()) Terminal.tutup();
        if (G.duduk) Mesin.berdiri();
        Mesin.pindah('rumah:' + G.saya.id);
        return true;
      case 'pegang': { const e = G.entitas.get('p:' + m.id); if (e) e.pegang = m.barang || ''; return true; }
      case 'koin_ambil':
        this.koin.delete(m.id);
        if (m.oleh === G.saya.id) { apung('+' + m.n + ' koin', '#fcd34d', m.x, m.y - 6); Suara.efek('koin'); }
        return true;
    }
    return false;
  },

  suasana(tegang) {
    if (tegang === this.menyerang) return;
    this.menyerang = tegang;
    document.body.classList.toggle('ada-zombie', tegang);
    // Petunjuk tetap selama serangan: cara memukul, di papan ketik maupun layar sentuh.
    const lama = $('#battle-petunjuk');
    if (lama) lama.remove();
    if (tegang) {
      const sentuh = document.body.classList.contains('sentuh') || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches), s = this.senjata();
      document.body.append(el('div', { id: 'battle-petunjuk', kelas: 'bingkai tipis', role: 'status' }, el('b', { teks: 'Zombie menyerang! ' }),
        (sentuh ? 'Dekati lalu tekan tombol Pukul atau ketuk layar.' : 'Dekati lalu tekan Spasi atau klik.') + (s ? ' Senjata: ' + (NAMA_SENJATA[s] || s) + '.' : ' Tangan kosong bisa; senjata dari Bang Jago lebih kuat.')));
    }
    Suara.suasana(tegang ? 'tegang' : 'tenang');
  },
  // Keluar dari kantor (pulang, bertamu): zombie tidak ikut, musik kembali tenang.
  tinggalkan() { this.z.clear(); this.koin.clear(); this.bangkai.length = 0; this.ayunan.length = 0; this.suasana(false); },
  kedip() { const b = document.body; b.classList.remove('digigit'); void b.offsetWidth; b.classList.add('digigit'); setTimeout(() => b.classList.remove('digigit'), 320); },
  tirai() { const t = el('div', { id: 'pingsan' }); document.body.append(t); setTimeout(() => t.remove(), 1900); },

  // Dipanggil dari Rumah.gambar: maju satu bingkai lalu titipkan semuanya ke daftar gambar yang diurutkan kedalamannya.
  gambar(k, daftar) {
    if (G.adegan !== 'kantor') { if (this.z.size || this.koin.size) this.tinggalkan(); return; }
    const kini = performance.now(), dt = Math.min(0.1, Math.max(0, (kini - (this.lalu || kini)) / 1000));
    this.lalu = kini;
    for (const z of this.z.values()) {
      const dx = z.tx - z.x, dy = z.ty - z.y, jarak = Math.hypot(dx, dy);
      z.jalan = jarak > 0.6;
      if (z.jalan) {
        const f = Math.min(1, dt * 7);
        z.x += dx * f; z.y += dy * f; z.langkah += dt * 6;
        z.arah = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'kiri' : 'kanan') : (dy < 0 ? 'atas' : 'bawah');
      }
      daftar.push({ alas: z.y + 19, lukis: () => this.lukisZombie(k, z, kini) });
    }
    this.bangkai = this.bangkai.filter(b => kini - b.lahir < 1500);
    for (const b of this.bangkai) daftar.push({ alas: b.y + 18, lukis: () => this.lukisBangkai(k, b, kini) });
    for (const c of this.koin.values()) daftar.push({ alas: c.y, lukis: () => this.lukisKoin(k, c, kini) });
    this.percik = this.percik.filter(p => kini - p.lahir < 240);      // efek kena: tiga bingkai di atas zombie yang terpukul
    for (const p of this.percik) { const sp = atlas['kena_' + Math.min(2, Math.floor((kini - p.lahir) / 80))]; if (sp) daftar.push({ alas: p.y + 60, lukis: () => k.drawImage(sp.g || lembar, sp.x, sp.y, sp.w, sp.h, Math.round(p.x - sp.w / 2), Math.round(p.y - sp.h / 2), sp.w, sp.h) }); }
    this.ayunan = this.ayunan.filter(a => kini - a.lahir < 200);
    for (const a of this.ayunan) daftar.push({ alas: a.e.y + 40, lukis: () => this.lukisAyun(k, a, kini) });
  },
  // Zombie: tokoh yang dikuruskan (dipersempit), dengan kedua lengan lurus ke depan searah hadapnya. Zombie besar
  // lebih tinggi, bukan lebih lebar.
  lukisZombie(k, z, kini) {
    const besar = z.jenis === 'besar', sx = besar ? 0.92 : LEBAR_ZOMBIE, sy = besar ? 1.3 : 1, kena = kini - z.kena < 140;
    const v = this.varian(z);
    if (v) {                                             // sprite khusus zombie (Agent Design), kaki ditambatkan di dasar bingkai tokoh
      const n = z.jalan ? Math.floor(z.langkah) % v.bingkai[z.arah] : 0, sp = atlas[`zombie_${v.nama}_${z.arah}_${n}`];
      k.save();
      if (kena) { k.filter = 'brightness(2.6) saturate(.3)'; k.translate(Math.sin(kini / 18) * 1.5, 0); }
      k.fillStyle = 'rgba(0,0,0,.18)'; k.beginPath(); k.ellipse(z.x + 8, z.y + 19, sp.w * 0.38, 2.5, 0, 0, Math.PI * 2); k.fill();
      k.drawImage(sp.g || lembar, sp.x, sp.y, sp.w, sp.h, Math.round(z.x + 8 - sp.w / 2), Math.round(z.y + 20 - sp.h) + (sp.pad || 0), sp.w, sp.h);
      k.restore();
      this.bilahHp(k, z, sp.h - 20 - 2 * (sp.pad || 0));
      return;
    }
    k.save();
    k.translate(z.x + 8, z.y + 20); k.scale(sx, sy); k.translate(-(z.x + 8), -(z.y + 20));
    if (kena) { k.filter = 'brightness(2.6) saturate(.3)'; k.translate(Math.sin(kini / 18) * 1.5, 0); }
    const x = Math.round(z.x), y = Math.round(z.y), kulit = (TAMPANG_ZOMBIE[z.jenis] || TAMPANG_ZOMBIE.biasa).kulit, bayang = campurWarna(kulit, '#0b1220', 0.35), tangan = campurWarna(kulit, '#ffffff', 0.25);
    const goyang = z.jalan ? Math.round(Math.sin(z.langkah * 1.6)) : 0;      // lengan naik-turun sedikit selagi berjalan
    const lengan = (lx, ly, w, h, warna) => { k.fillStyle = warna; k.fillRect(lx, ly, w, h); };
    if (z.arah === 'atas') { lengan(x + 3, y + 6 + goyang, 2, 4, bayang); lengan(x + 11, y + 6 - goyang, 2, 4, bayang); }      // membelakangi layar: lengan di balik badan
    lukisEntitas(k, z);
    if (z.arah === 'kanan') { lengan(x + 9, y + 11 - goyang, 6, 1, bayang); lengan(x + 9, y + 9 + goyang, 7, 2, kulit); lengan(x + 15, y + 9 + goyang, 2, 2, tangan); }
    else if (z.arah === 'kiri') { lengan(x + 1, y + 11 - goyang, 6, 1, bayang); lengan(x, y + 9 + goyang, 7, 2, kulit); lengan(x - 1, y + 9 + goyang, 2, 2, tangan); }
    else if (z.arah !== 'atas') { lengan(x + 4, y + 9, 2, 5 + goyang, kulit); lengan(x + 10, y + 9, 2, 5 - goyang, kulit); lengan(x + 4, y + 13 + goyang, 2, 2, tangan); lengan(x + 10, y + 13 - goyang, 2, 2, tangan); }
    k.restore();
    this.bilahHp(k, z, (sy - 1) * 22);
  },
  bilahHp(k, z, naik) {
    if (z.hp >= z.maks) return;                          // bilah HP baru muncul sesudah terluka
    const lebar = 16, bx = Math.round(z.x), by = Math.round(z.y - 5 - naik);
    k.fillStyle = 'rgba(7,11,20,.85)'; k.fillRect(bx - 1, by - 1, lebar + 2, 4);
    k.fillStyle = '#ef4444'; k.fillRect(bx, by, Math.max(1, Math.round(lebar * z.hp / z.maks)), 2);
  },
  // Varian sprite untuk seekor zombie: jenis biasa bergiliran di antara varian biasa_* yang terpasang (menurut id-nya,
  // jadi tetap sama sepanjang hidupnya); null bila sprite jenis itu belum ada (dipakai tokoh hijau sementara).
  varian(z) {
    if (z.varian !== undefined) return z.varian;
    const calon = (z.jenis === 'biasa' ? ['biasa_a', 'biasa_b', 'biasa_c', 'biasa_d', 'biasa_e'] : [z.jenis]).filter(n => atlas[`zombie_${n}_bawah_0`]);
    if (!calon.length) return (z.varian = null);
    const nama = calon[z.id % calon.length], bingkai = {};
    for (const arah of ['bawah', 'atas', 'kiri', 'kanan']) { let n = 0; while (atlas[`zombie_${nama}_${arah}_${n}`]) n++; if (!n) return (z.varian = null); bingkai[arah] = n; }
    let jatuh = 0; while (atlas[`zombie_${nama}_jatuh_${jatuh}`]) jatuh++;
    return (z.varian = { nama, bingkai, jatuh });
  },
  // Zombie kalah: rebah ke samping dalam seperempat detik, lalu memudar perlahan.
  lukisBangkai(k, b, kini) {
    const umur = (kini - b.lahir) / 1000, rebah = Math.min(1, umur / 0.25);
    if (b.varian && b.varian.jatuh) {                    // sprite jatuh: bingkai demi bingkai, lalu memudar
      const sp = atlas[`zombie_${b.varian.nama}_jatuh_${Math.min(b.varian.jatuh - 1, Math.floor(umur / 0.14))}`];
      k.save(); k.globalAlpha = umur < 0.6 ? 1 : Math.max(0, 1 - (umur - 0.6) / 0.9);
      k.translate(Math.round(b.x + 8), Math.round(b.y + 20) + (sp.pad || 0));
      if (b.arah === 'kiri') k.scale(-1, 1);             // sprite jatuh menghadap kanan; dicerminkan bila zombienya menghadap kiri
      k.drawImage(sp.g || lembar, sp.x, sp.y, sp.w, sp.h, -Math.round(sp.w / 2), -sp.h, sp.w, sp.h);
      k.restore();
      return;
    }
    const bk = bingkaiTokoh(this.look(b.jenis), 'bawah_diam');
    if (!bk) return;
    k.save();
    k.globalAlpha = umur < 0.5 ? 1 : Math.max(0, 1 - (umur - 0.5));
    k.translate(b.x + 8, b.y + 19); k.rotate(rebah * Math.PI / 2);
    k.drawImage(bk.kanvas, -8 - bk.pad, -19 - bk.pad);
    k.restore();
  },
  lukisKoin(k, c, kini) {
    const umur = (kini - c.lahir) / 1000, pantul = Math.abs(Math.sin(umur * 9)) * Math.max(0, 7 - umur * 9), y = c.y - 3 - pantul;
    k.fillStyle = 'rgba(0,0,0,.25)'; k.beginPath(); k.ellipse(c.x, c.y, 3.5, 1.5, 0, 0, Math.PI * 2); k.fill();
    const sp = atlas['koin_' + (Math.floor(umur * 5) % 2)];      // sprite koin berputar (muka, sisi tipis)
    if (sp) { k.drawImage(sp.g || lembar, sp.x, sp.y, sp.w, sp.h, Math.round(c.x - sp.w / 2), Math.round(y - sp.h / 2), sp.w, sp.h); return; }
    k.fillStyle = '#b45309'; k.beginPath(); k.arc(c.x, y, 3.6, 0, Math.PI * 2); k.fill();
    k.fillStyle = '#fcd34d'; k.beginPath(); k.arc(c.x, y, 2.6, 0, Math.PI * 2); k.fill();
    k.fillStyle = '#fef9c3'; k.fillRect(Math.round(c.x) - 1, Math.round(y) - 2, 1, 2);
  },
  // Ayunan: busur yang menyapu di sisi hadap pemukul, berwarna menurut senjatanya.
  lukisAyun(k, a, kini) {
    const p = Math.min(1, (kini - a.lahir) / 180), tengah = { kanan: 0, bawah: Math.PI / 2, kiri: Math.PI, atas: -Math.PI / 2 }[a.e.arah] ?? Math.PI / 2;
    const mulai = tengah - 1.1 + p * 1.4;
    k.save();
    k.globalAlpha = 1 - p * 0.7; k.strokeStyle = WARNA_SENJATA[a.senjata] || '#f8fafc'; k.lineWidth = a.senjata ? 3 : 2; k.lineCap = 'round';
    k.beginPath(); k.arc(a.e.x + 8, a.e.y + 11, a.senjata ? 15 : 11, mulai, mulai + 0.9); k.stroke();
    k.restore();
  },
};

/* ---------- barang yang dipegang ---------- */

// Senjata sementara digambar kode (titik 0,0 = gagang, benda tegak ke atas), sampai sprite `senjata_<kode>_pegang` ada
// di atlas. Tiap butir: [x, y, lebar, tinggi, warna].
const RUPA_SENJATA = {
  sapu: [[0, -8, 1, 8, '#8b5a2b'], [-1, -11, 3, 3, '#facc15'], [-1, -11, 3, 1, '#a16207']],
  kunci_inggris: [[0, -7, 1, 7, '#94a3b8'], [-1, -10, 3, 3, '#cbd5e1'], [0, -10, 1, 2, '#0b1220']],
  tongkat_bisbol: [[0, -4, 1, 4, '#7c5b3a'], [-1, -11, 2, 7, '#d6a26a'], [0, -11, 1, 7, '#e9c79b']],
  kabel_lan: [[0, -3, 1, 3, '#2563eb'], [1, -6, 1, 3, '#3b82f6'], [0, -9, 1, 3, '#2563eb'], [0, -11, 2, 2, '#e2e8f0']],
  pemadam_api: [[-1, -7, 3, 7, '#dc2626'], [-1, -5, 3, 1, '#fecaca'], [0, -9, 1, 2, '#1f2937'], [1, -9, 2, 1, '#1f2937']],
};

const Pegang = {
  terkirim: null,
  // Barang hotbar yang sedang dipegang pemain ini; dikabarkan ke server tiap berganti supaya rekan ikut melihatnya.
  kabarkan() {
    if (!G.aku || typeof Hotbar === 'undefined') return;
    const b = Hotbar.dipegang() || '';
    G.aku.pegang = b;
    if (b === this.terkirim || !Jaring.tersambung) return;
    this.terkirim = b;
    Jaring.kirim({ t: 'pegang', barang: b });
  },
  // Nama sprite atlas untuk sebuah barang inventory (aturan yang sama dengan ikonBarang), atau null.
  sprite(b) {
    if (b.startsWith('makan:')) return ((G.toko.makanan || {})[b.slice(6)] || {}).ikon || 'ikon_panen_pakan';
    if (b.startsWith('benih:')) return 'tani_' + b.slice(6) + '_1';
    if (b.startsWith('panen:')) return 'ikon_panen_' + b.slice(6);
    if (b.startsWith('lantai:')) return b.slice(7);
    if (b === 'pakan') return 'ikon_panen_pakan';
    if (atlas['ikon_panen_' + b]) return 'ikon_panen_' + b;
    return atlas[b] ? b : null;
  },
  // Titik tangan menurut arah hadap, dan apakah gambarnya dicerminkan.
  tangan(e) {
    const x = Math.round(e.x), y = Math.round(e.y);
    return e.arah === 'kiri' ? { x: x + 3, y: y + 13, cermin: true } : e.arah === 'atas' ? { x: x + 3, y: y + 12, cermin: true } : e.arah === 'kanan' ? { x: x + 13, y: y + 13, cermin: false } : { x: x + 13, y: y + 13, cermin: false };
  },
  lukis(k, e, b) {
    const t = this.tangan(e), kini = performance.now();
    if (b.startsWith('senjata:')) {
      // Dibawa miring; saat memukul (e.ayun) diayunkan dari belakang bahu ke depan dalam 200 ms.
      const kode = b.slice(8), p = e.ayun ? (kini - e.ayun) / 200 : 2, sudut = p >= 0 && p < 1 ? -1.1 + p * 2.6 : 0.5, sp = atlas['senjata_' + kode + '_pegang'];
      k.save();
      k.translate(t.x + 0.5, t.y);
      if (t.cermin) k.scale(-1, 1);
      k.rotate(sudut);
      if (sp) k.drawImage(sp.g || lembar, sp.x, sp.y, sp.w, sp.h, -(sp.pad || 0), -(sp.h - (sp.pad || 0)), sp.w, sp.h);      // sprite: gagang (titik putar) di pojok kiri bawah, di dalam garis tepinya
      else for (const [rx, ry, w, h, warna] of RUPA_SENJATA[kode] || []) { k.fillStyle = warna; k.fillRect(rx, ry, w, h); }
      k.restore();
      return;
    }
    // Barang lain: ikonnya dikecilkan sampai muat 8 px supaya tidak menutupi tokoh.
    const n = this.sprite(b), sp = n && atlas[n];
    if (!sp) return;
    const s = Math.min(1, 8 / Math.max(sp.w, sp.h)), w = Math.max(1, Math.round(sp.w * s)), h = Math.max(1, Math.round(sp.h * s));
    k.drawImage(sp.g || lembar, sp.x, sp.y, sp.w, sp.h, t.x - Math.round(w / 2), t.y - h + 2, w, h);
  },
};
