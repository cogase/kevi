/* Kevi — perakit tokoh. DISALIN UTUH dari Agent Pak (app/static/js/tokoh.js, 0.94.0); jangan disunting di sini.
 *
 * Tiap agent dirakit dari bingkai tubuh dasar yang digambar dengan WARNA KUNCI
 * (lihat docs/spec/2026-09-18-rekreasi-tokoh-kontrak.md), lalu:
 *   1. aksesoris ditumpuk di koordinat yang sama (kanvas seni 16x20 identik),
 *   2. setiap piksel berwarna kunci diganti warna pilihan tokoh itu.
 * Pilihan diturunkan dari session_id lewat PRNG berbenih, jadi agent yang sama
 * selalu tampil sama di peramban mana pun, tanpa disimpan di server.
 */
'use strict';

// Warna kunci (RGB) -> slot. Harus sama persis dengan kontrak/generator.
const KUNCI_TOKOH = new Map([
  ['200,10,12', 'kulit_gelap'], ['200,10,10', 'kulit'], ['200,10,11', 'kulit_terang'],
  ['10,200,11', 'rambut_gelap'], ['10,200,10', 'rambut'],
  ['10,10,202', 'baju_gelap'], ['10,10,200', 'baju'], ['10,10,201', 'baju_terang'],
  ['200,200,10', 'celana'], ['200,200,11', 'celana_terang'],
  ['10,200,200', 'sepatu'],
  // Lengan bawah (0.52): bawaan = warna baju, seragam lengan pendek = kulit.
  ['10,10,212', 'lengan_gelap'], ['10,10,210', 'lengan'], ['10,10,211', 'lengan_terang'],
  ['200,100,10', 'aksen_gelap'], ['200,100,11', 'aksen'], ['200,100,12', 'aksen_terang'],
]);

const PILIHAN_TOKOH = {
  kulit: ['#f2c8a4', '#e8b48c', '#d49a6a', '#b77a4e', '#8d5a3b'],
  rambut: ['#2e2320', '#4a3428', '#7a4a2a', '#d9b25b', '#b24a2e', '#9aa3ad', '#1f2a44'],
  baju: ['#3a8d8a', '#d69638', '#be5248', '#7a60a6', '#56925c', '#4074b0',
         '#e0e4ea', '#39404f', '#e072a8', '#e6c34a', '#ef7d3c', '#2fa6a0'],
  celana: ['#3e4458', '#26324a', '#5a4636', '#6b7280', '#1f2937', '#7c5b3a', '#3f5f8a'],
  sepatu: ['#282a36', '#5a3a28', '#e5e7eb', '#b91c1c', '#1e3a8a', '#6b4f2a'],
  // 0.8.0 — kemeja rapi (pegawai kantor pusat non-jaringan) & warna aksen.
  kemeja: ['#e8eef6', '#cfe0f2', '#f4f1e8', '#d8e8dc', '#b9cbe4', '#eadcf0', '#dfe3e8'],
  kemeja_jaringan: ['#a9c4b4', '#9fb8c9', '#c4c9b0', '#b8b8c4'],
  kerudung: ['#262a33', '#2c3a5e', '#6b2737', '#7a5236', '#b77f8a', '#5e6b52', '#8a8f9c', '#3f6f7a'],
  topi: ['#7a5a3a', '#b08a5a', '#2e2e34', '#5b5f66', '#8a6b4a'],
};

// Kostum Superman (nama sesi mengandung "superman"): baju & celana biru,
// logo S, jubah merah, rambut hitam; kulit tetap dari session_id.
const SUPERMAN = { baju: '#2f4f9e', celana: '#27407f', sepatu: '#9b2226', rambut: '#15151c' };
// Seragam kantor (0.52): kemeja biru dongker Datautama + celana krem + lencana
// logo di dada. Dipakai NPC (tampilan.seragam) atau semua pegawai lewat
// pengaturan kantor `seragam` ('' | du_pendek | du_panjang | du_campur).
const SERAGAM = {
  du_pendek: { baju: '#1e3563', celana: '#d9c8a1', sepatu: '#2a2522', lengan: 'pendek', logo: 'du' },
  du_panjang: { baju: '#1e3563', celana: '#d9c8a1', sepatu: '#2a2522', lengan: 'panjang', logo: 'du' },
};
// Tamu & tokoh berkostum tak ikut seragam kantor.
const TANPA_SERAGAM_KANTOR = new Set(['npc-tamu']);
function seragamKantor(p, acak) {
  const k = typeof keadaan !== 'undefined' && keadaan && keadaan.pengaturan && keadaan.pengaturan.seragam;
  if (!k || TANPA_SERAGAM_KANTOR.has(p.jenis) || p.divisi === 'tamu') return '';
  if (k === 'du_campur') return acak < 0.5 ? 'du_pendek' : 'du_panjang';
  return SERAGAM[k] ? k : '';
}
const DIVISI_JARINGAN = new Set(['dc', 'transit', 'cek', 'pantau']);

// Aksesoris berbobot (angka = peluang relatif). Rambut dan penutup kepala
// slot terpisah; kerudung menutup rambut sehingga gaya rambut diabaikan.
const AKS_RAMBUT = [['', 38], ['rambut_panjang', 18], ['rambut_keriting', 11], ['rambut_cepak', 12],
                    ['rambut_bob', 11], ['rambut_kuncir', 10]];
const AKS_KEPALA = [['', 56], ['topi_bisbol', 8], ['kupluk', 7], ['headset', 9], ['kerudung', 11],
                    ['topi_fedora', 5], ['helm_proyek', 4]];
const AKS_MATA = [['', 52], ['kacamata', 22], ['kacamata_bulat', 14], ['kacamata_hitam', 12]];

function hashTeks(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function prng(benih) {            // mulberry32
  let a = benih >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pilihBerbobot(acak, daftar) {
  const total = daftar.reduce((a, [, b]) => a + b, 0);
  let r = acak() * total;
  for (const [nilai, bobot] of daftar) { if ((r -= bobot) < 0) return nilai; }
  return daftar[0][0];
}

function hexKeRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function campur(rgb, ke, t) { return rgb.map((v, i) => Math.round(v + (ke[i] - v) * t)); }
const gelapkan = (rgb, t) => campur(rgb, [0, 0, 0], t);
const terangkan = (rgb, t) => campur(rgb, [255, 255, 255], t);

function penampilan(p) {
  const acak = prng(hashTeks(p.session_id || p.nama || 'tanpa-nama'));
  const pilih = (d) => d[Math.floor(acak() * d.length)];
  // Urutan tarikan lima warna pertama sama dengan 0.5.0: tokoh lama tetap
  // berkulit/berambut/berbaju sama walau aksesorisnya kini lebih beragam.
  const kulit = hexKeRgb(pilih(PILIHAN_TOKOH.kulit));
  let rambut = hexKeRgb(pilih(PILIHAN_TOKOH.rambut));
  let baju = hexKeRgb(pilih(PILIHAN_TOKOH.baju));
  let celana = hexKeRgb(pilih(PILIHAN_TOKOH.celana));
  let sepatu = hexKeRgb(pilih(PILIHAN_TOKOH.sepatu));
  let kepala = pilihBerbobot(acak, AKS_KEPALA);
  let mata = pilihBerbobot(acak, AKS_MATA);
  const rDasi = acak();
  let gayaRambut = pilihBerbobot(acak, AKS_RAMBUT);
  const rKemeja = acak(), iKemeja = acak(), rTali = acak(), rTelinga = acak();
  let aksenHex = pilih(kepala === 'kerudung' ? PILIHAN_TOKOH.kerudung : PILIHAN_TOKOH.topi);
  // Tamu bergender tetap (p.gender dari server); agent bebas. Tarikan acak
  // tambahan diletakkan SESUDAH tarikan lama supaya warna tokoh lama tetap.
  const rGender = acak(), rGender2 = acak();
  const RAMBUT_P = ['rambut_panjang', 'rambut_bob', 'rambut_kuncir', 'rambut_keriting'];
  if (p.gender === 'p') {
    if (kepala !== 'kerudung') {
      if (!RAMBUT_P.includes(gayaRambut)) gayaRambut = RAMBUT_P[Math.floor(rGender * RAMBUT_P.length)];
      if (kepala === 'helm_proyek' || kepala === 'topi_fedora' || (kepala === '' && rGender2 < 0.3)) {
        kepala = 'kerudung';
        aksenHex = PILIHAN_TOKOH.kerudung[Math.floor(rGender * PILIHAN_TOKOH.kerudung.length)];
      }
    }
  } else if (p.gender === 'l') {
    if (kepala === 'kerudung') { kepala = ''; }
    if (RAMBUT_P.slice(0, 3).includes(gayaRambut)) gayaRambut = rGender < 0.5 ? 'rambut_cepak' : '';
  }

  const divisi = String(p.divisi || '').toLowerCase();
  const jaringan = DIVISI_JARINGAN.has(divisi);
  const superman = /superman/i.test(String(p.nama_asli || p.nama || ''));
  let dasi, tali = false, telinga = false, jubah = false, logo = false, jubahEmas = false;
  if (superman) {
    baju = hexKeRgb(SUPERMAN.baju); celana = hexKeRgb(SUPERMAN.celana);
    sepatu = hexKeRgb(SUPERMAN.sepatu); rambut = hexKeRgb(SUPERMAN.rambut);
    kepala = ''; mata = ''; gayaRambut = ''; dasi = false; jubah = true; logo = true;
    // 0.61.0 — efek toko "Jubah emas".
    jubahEmas = typeof keadaan !== 'undefined' && !!keadaan && ((keadaan.prestasi || {}).efek || []).includes('jubah_emas');
  } else if (jaringan) {
    // Management Jaringan: tali ID 70%, kemeja lapangan kadang, earpiece lebih sering.
    tali = rTali < 0.7;
    if (rKemeja < 0.45) baju = hexKeRgb(PILIHAN_TOKOH.kemeja_jaringan[Math.floor(iKemeja * PILIHAN_TOKOH.kemeja_jaringan.length)]);
    dasi = !tali && rDasi < 0.1;
    telinga = kepala !== 'headset' && rTelinga < 0.2;
  } else {
    // Pegawai kantor pusat lainnya: kemeja rapi + dasi lebih sering.
    if (rKemeja < 0.55) baju = hexKeRgb(PILIHAN_TOKOH.kemeja[Math.floor(iKemeja * PILIHAN_TOKOH.kemeja.length)]);
    dasi = rDasi < 0.4;
    telinga = kepala !== 'headset' && rTelinga < 0.06;
  }
  if (p.gender === 'p') dasi = false;
  // NPC buatan (0.46.0): tampilan pilihan pemilik menimpa hasil acak, per bagian.
  const t = p.tampilan;
  if (t && typeof t === 'object') {
    const hex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
    const dari = (v, daftar) => daftar.some(([n]) => n === v);
    if (hex(t.kulit)) kulit.splice(0, 3, ...hexKeRgb(t.kulit));
    if (hex(t.rambut_warna)) rambut = hexKeRgb(t.rambut_warna);
    if (hex(t.baju)) baju = hexKeRgb(t.baju);
    if (hex(t.celana)) celana = hexKeRgb(t.celana);
    if (hex(t.sepatu)) sepatu = hexKeRgb(t.sepatu);
    if (hex(t.aksen)) aksenHex = t.aksen;
    if ('gaya_rambut' in t && dari(t.gaya_rambut, AKS_RAMBUT)) gayaRambut = t.gaya_rambut;
    if ('kepala' in t && dari(t.kepala, AKS_KEPALA)) kepala = t.kepala;
    if ('mata' in t && dari(t.mata, AKS_MATA)) mata = t.mata;
    if ('dasi' in t) dasi = !!t.dasi;
    if ('tali' in t) tali = !!t.tali;
    if ('telinga' in t) telinga = !!t.telinga;
    if ('jubah' in t) jubah = !!t.jubah;
  }
  if (kepala === 'kerudung') gayaRambut = '';
  // Seragam: milik NPC sendiri menang; kosong = ikut pengaturan kantor.
  // Superman tetap berkostum. Tarikan acak terakhir: warna tokoh lama tak bergeser.
  const rSeragam = acak();
  let seragam = t && typeof t === 'object' && SERAGAM[t.seragam] ? t.seragam : '';
  if (!seragam && !superman) seragam = seragamKantor(p, rSeragam);
  const sg = SERAGAM[seragam];
  if (sg) {
    baju = hexKeRgb(sg.baju); celana = hexKeRgb(sg.celana); sepatu = hexKeRgb(sg.sepatu);
    dasi = false; jubah = false;
  }
  const pendek = !!(sg && sg.lengan === 'pendek');

  const aksen = hexKeRgb(aksenHex);
  const warna = {
    kulit, kulit_terang: terangkan(kulit, 0.22), kulit_gelap: gelapkan(kulit, 0.2),
    rambut, rambut_gelap: gelapkan(rambut, 0.3),
    baju, baju_terang: terangkan(baju, 0.2), baju_gelap: gelapkan(baju, 0.28),
    celana, celana_terang: terangkan(celana, 0.16), sepatu,
    aksen, aksen_terang: terangkan(aksen, 0.22), aksen_gelap: gelapkan(aksen, 0.3),
  };
  warna.lengan = pendek ? warna.kulit : warna.baju;
  warna.lengan_terang = pendek ? warna.kulit_terang : warna.baju_terang;
  warna.lengan_gelap = pendek ? warna.kulit_gelap : warna.baju_gelap;
  const id = [kulit, rambut, baju, celana, sepatu, aksen].map(c => c.join('.')).join('/') +
    `|${gayaRambut}|${kepala}|${mata}|${dasi ? 'dasi' : ''}|${tali ? 'tali' : ''}` +
    `|${telinga ? 'telinga' : ''}|${jubah ? 'jubah' : ''}|${logo ? 'logo' : ''}|${seragam}|${jubahEmas ? 'emas' : ''}`;
  return { id, warna, rambut: gayaRambut, kepala, mata, dasi, tali, telinga, jubah, logo, jubahEmas,
           seragam, logoDu: !!(sg && sg.logo === 'du') };
}

// Arah aksesoris untuk sebuah pose tubuh.
function arahAksesoris(pose) {
  // 0.76 — pose tempat kerja (tools/lk_tempat_kerja.py ARAH_POSE_KERJA): kepala = acuan arah itu, per piksel.
  // 0.78.1 — pose lesehan (bersila, lk_tempat_kerja_perumahan.py) memakai aturan yang sama: arah dari nama.
  if (pose.startsWith('kerja_') || pose.startsWith('lesehan_')) {
    if (pose.includes('_kiri')) return 'kiri';
    if (pose.includes('_kanan')) return 'kanan';
    if (pose.startsWith('kerja_tunduk') || pose.startsWith('kerja_panjat')) return 'atas';
    return 'bawah';
  }
  if (pose.startsWith('atas') || pose.startsWith('main')) return 'atas';
  if (pose.startsWith('kiri') || pose.startsWith('pingpong_kiri')) return 'kiri';
  if (pose.startsWith('kanan') || pose.startsWith('pingpong_kanan')) return 'kanan';
  return 'bawah';
}

const cacheTokoh = new Map();

function warnai(konteks, w, h, warna) {
  const data = konteks.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] !== 255) continue;          // warna kunci selalu buram penuh
    const slot = KUNCI_TOKOH.get(px[i] + ',' + px[i + 1] + ',' + px[i + 2]);
    if (!slot) continue;
    const c = warna[slot];
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
  }
  konteks.putImageData(data, 0, 0);
}

// Jubah Superman merah (warna tetap di sprite) -> emas (efek toko 0.61.0).
const MERAH_KE_EMAS = new Map([['204,88,74', [214, 168, 42]], ['140,48,44', [150, 108, 20]], ['232,124,104', [250, 214, 110]]]);
function warnaiEmas(konteks, w, h) {
  const data = konteks.getImageData(0, 0, w, h), px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] !== 255) continue;
    const c = MERAH_KE_EMAS.get(px[i] + ',' + px[i + 1] + ',' + px[i + 2]);
    if (c) { px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; }
  }
  konteks.putImageData(data, 0, 0);
}
function sistemTokohAda() { return !!(atlas && atlas.tokoh_bawah_diam); }

// Kanvas siap-gambar untuk tokoh `look` dalam pose `pose`, atau null.
function bingkaiTokoh(look, pose) {
  const kunci = look.id + '#' + pose;
  if (cacheTokoh.has(kunci)) return cacheTokoh.get(kunci);

  const dasar = atlas['tokoh_' + pose];
  if (!dasar) { cacheTokoh.set(kunci, null); return null; }

  const kv = document.createElement('canvas');
  kv.width = dasar.w; kv.height = dasar.h;
  const c = kv.getContext('2d');
  c.imageSmoothingEnabled = false;

  // Tiap lapisan diwarnai SENDIRI dulu, baru ditumpuk dengan alpha biasa.
  // Kalau ditumpuk dulu lalu diwarnai sekali, bayangan semi-transparan topi
  // mencampur piksel rambut/kulit di bawahnya sehingga tak lagi persis warna
  // kunci — piksel itu lolos pewarnaan dan tampil hijau/magenta.
  const lapisan = (nama) => {
    const f = atlas[nama];
    if (!f) return;
    const lv = document.createElement('canvas');
    lv.width = f.w; lv.height = f.h;
    const l = lv.getContext('2d');
    l.drawImage(lembar, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    warnai(l, f.w, f.h, look.warna);
    if (look.jubahEmas && nama.startsWith('aksb_jubah')) warnaiEmas(l, f.w, f.h);
    // Aksesoris & tubuh memakai kanvas seni yang sama; ratakan lewat selisih pad.
    const d = (dasar.pad || 0) - (f.pad || 0);
    c.drawImage(lv, d, d);
  };

  const arah = arahAksesoris(pose);
  // Jubah = lapis belakang: di balik tubuh, kecuali tampak belakang (menutupi punggung).
  if (look.jubah && arah !== 'atas') lapisan(`aksb_jubah_${arah}`);
  lapisan('tokoh_' + pose);
  if (look.jubah && arah === 'atas') lapisan('aksb_jubah_atas');
  if (look.rambut) lapisan(`aks_${look.rambut}_${arah}`);
  if (arah === 'bawah') {
    if (look.logoDu) lapisan('aks_logo_du_bawah');
    if (look.tali) lapisan('aks_tali_id_bawah');
    else if (look.dasi) lapisan('aks_dasi_bawah');
    if (look.logo) lapisan('aks_logo_s_bawah');
  }
  if (look.kepala === 'kerudung') lapisan(`aks_kerudung_${arah}`);
  if (look.mata && arah !== 'atas') lapisan(`aks_${look.mata}_${arah}`);
  if (look.telinga && arah !== 'atas') lapisan(`aks_earpiece_${arah}`);
  if (look.kepala && look.kepala !== 'kerudung') lapisan(`aks_${look.kepala}_${arah}`);

  const hasil = { kanvas: kv, pad: dasar.pad || 0 };
  cacheTokoh.set(kunci, hasil);
  return hasil;
}
