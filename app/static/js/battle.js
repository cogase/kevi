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
const NAMA_SENJATA = { sapu: 'Sapu', kunci_inggris: 'Kunci inggris', tongkat_bisbol: 'Tongkat bisbol', kabel_lan: 'Kabel LAN', pemadam_api: 'Pemadam api' };
const WARNA_SENJATA = { '': '#f8fafc', sapu: '#fcd34d', kunci_inggris: '#cbd5e1', tongkat_bisbol: '#d6a26a', kabel_lan: '#60a5fa', pemadam_api: '#f87171' };

const Battle = {
  z: new Map(), koin: new Map(), bangkai: [], ayunan: [], rupa: {},
  hp: null, maks: null, menyerang: false, pukulBerikut: 0, lalu: 0,

  look(jenis) { return this.rupa[jenis] || (this.rupa[jenis] = penampilan({ session_id: 'zombie-' + jenis, nama: 'Zombie', tampilan: TAMPANG_ZOMBIE[jenis] || TAMPANG_ZOMBIE.biasa })); },
  // Senjata yang sedang dipegang di hotbar ('' = tangan kosong). Server memeriksa lagi bahwa barangnya memang dimiliki.
  senjata() { const b = typeof Hotbar !== 'undefined' ? Hotbar.dipegang() : null; return b && b.startsWith('senjata:') ? b.slice(8) : ''; },

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
      case 'zombie_kena': { const z = this.z.get(m.id); if (z) { z.kena = kini; z.hp = m.hp; apung('-' + m.dmg, '#fecaca', z.x + 8, z.y - 4); } Suara.efek('kena'); return true; }
      case 'zombie_mati':
        this.z.delete(m.id);
        this.bangkai.push({ x: m.x, y: m.y, jenis: m.jenis, lahir: kini });
        apung('-' + m.dmg, '#fecaca', m.x + 8, m.y - 4);
        if (m.koin) this.koin.set(m.koin[0], { id: m.koin[0], x: m.koin[1], y: m.koin[2], n: m.koin[3], lahir: kini });
        Suara.efek('mati');
        return true;
      case 'ayun': {
        const e = m.id === G.saya.id ? G.aku : G.entitas.get('p:' + m.id);
        if (e) this.ayunan.push({ e, senjata: m.senjata || '', lahir: kini });
        if (m.id === G.saya.id) Suara.efek('ayun');
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
    this.ayunan = this.ayunan.filter(a => kini - a.lahir < 200);
    for (const a of this.ayunan) daftar.push({ alas: a.e.y + 40, lukis: () => this.lukisAyun(k, a, kini) });
  },
  lukisZombie(k, z, kini) {
    const besar = z.jenis === 'besar' ? 1.35 : 1, kena = kini - z.kena < 140;
    k.save();
    if (besar !== 1) { k.translate(z.x + 8, z.y + 20); k.scale(besar, besar); k.translate(-(z.x + 8), -(z.y + 20)); }
    if (kena) { k.filter = 'brightness(2.6) saturate(.3)'; k.translate(Math.sin(kini / 18) * 1.5, 0); }
    lukisEntitas(k, z);
    k.restore();
    if (z.hp < z.maks) {                                 // bilah HP baru muncul sesudah terluka
      const lebar = 16, bx = Math.round(z.x), by = Math.round(z.y - 5 - (besar - 1) * 22);
      k.fillStyle = 'rgba(7,11,20,.85)'; k.fillRect(bx - 1, by - 1, lebar + 2, 4);
      k.fillStyle = '#ef4444'; k.fillRect(bx, by, Math.max(1, Math.round(lebar * z.hp / z.maks)), 2);
    }
  },
  // Zombie kalah: rebah ke samping dalam seperempat detik, lalu memudar perlahan.
  lukisBangkai(k, b, kini) {
    const umur = (kini - b.lahir) / 1000, rebah = Math.min(1, umur / 0.25), bk = bingkaiTokoh(this.look(b.jenis), 'bawah_diam');
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
