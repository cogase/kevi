// Kevi — memanggang peta Default Agent Pak menjadi aset statis.
//
// Peta Default (Office 5) Agent Pak disusun oleh ribuan baris skrip yang saling terkait. Daripada menyalin
// mesinnya, kita jalankan Agent Pak apa adanya di instans uji (DB kosong), lalu memotret hasil susunannya:
//   - kantor_latar.png   lapisan bawah (lantai, tembok, perabot)
//   - kantor_depan.png   lapisan depan (dinding bawah ruang, benda tinggi)
//   - kantor.json        grid tabrakan, benda lapis depan (urutan kedalaman), kursi, titik, ruang, animasi
//
// Pakai: node panggang_peta.mjs <port instans uji> <nilai cookie agentpak_sesi> <folder keluaran>
// Lihat tools/panggang.sh untuk menyalakan instans ujinya.
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
// playwright-core dicari di folder KEVI_PLAYWRIGHT (folder apa pun yang punya node_modules/playwright-core).
const butuh = createRequire((process.env.KEVI_PLAYWRIGHT || os.homedir() + '/tangkap-bantuan') + '/');
const { chromium } = butuh('playwright-core');

const [, , port = '8015', cookie, keluar = '.'] = process.argv;
const b = await chromium.launch({
  executablePath: process.env.KEVI_CHROME || os.homedir() + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});
const kon = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await kon.addCookies([{ name: 'agentpak_sesi', value: cookie, domain: '127.0.0.1', path: '/' }]);
const pg = await kon.newPage();
pg.on('pageerror', (e) => console.error('pageerror:', e.message));
await pg.goto(`http://127.0.0.1:${port}/`);
await pg.waitForFunction(() => typeof denah !== 'undefined' && denah.grid && atlas && latar.width > 300, null, { timeout: 30000 });
await pg.waitForTimeout(2500);

const hasil = await pg.evaluate(() => {
  const d = denah, g = d.grid;
  const baris = [];
  for (let y = 0; y < d.tinggi; y++) {
    let s = '';
    for (let x = 0; x < d.lebar; x++) s += g.bisaLewat(x, y) ? '.' : '#';
    baris.push(s);
  }
  const kotak = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
  const kursi = [];
  for (const [kunci, s] of Object.entries(d.kursi || {})) {
    if (s.portal) continue;
    kursi.push({ kunci, x: Math.round(s.x), y: Math.round(s.y), hadap: s.hadap || 'atas', mon: s.mon ? { x: s.mon.x, y: s.mon.y } : null });
  }
  // Kursi tanpa pemilik (DB kosong = semua kursi kosong): ambil dari meja2.
  const kursiMeja = [];
  for (const mj of d.meja2 || []) for (const ks of mj.kursi || []) {
    const s = ks.kursiObj || ks.s || null;
    const duduk = ks.acuan && ks.acuan.duduk;
    kursiMeja.push({ jenis: mj.jenis, mx: mj.x, my: mj.y, r: mj.r || 0, hadap: ks.hadap,
      x: s ? Math.round(s.x) : (duduk ? mj.x + duduk[0] - 8 : mj.x), y: s ? Math.round(s.y) : (duduk ? mj.y + duduk[1] - 14 : mj.y) });
  }
  return {
    tata: tataLetakAktif().id, lebar: d.lebar, tinggi: d.tinggi, ubin: T, yDinding: d.yDinding, pintuX: d.pintuX,
    pintuMasuk: d.pintuMasuk, luar: d.luar,
    grid: baris,
    berdiri: (d.berdiri || []).map(o => ({ n: o.n, x: o.x, y: o.y, r: o.r || 0, w: o.w, h: o.h, alas: Number.isFinite(o.alas) ? o.alas : null })),
    perabotDepan: (d.perabotDepan || []).map(kotak),
    dindingDepan: (d.dindingDepan || []).map(o => ({ ...kotak(o), alas: o.alas ?? null })),
    ruang: (d.pintasan || []).map(p => ({ id: p.id, label: p.label, warna: p.warna, kotak: p.kotak })),
    kursi, kursiMeja,
    spot: ((d.rekreasi || {}).spot || []).map(s => ({ id: s.id, x: Math.round(s.x), y: Math.round(s.y), pose: s.pose || '' })),
    animasi: (d.animasi || []).map(a => ({ n: a.n, x: a.x, y: a.y, r: a.r || 0, laju: a.laju || 3 })),
    resepsionis: d.mejaResepsionis || null,
    rak: (d.rakDc || []).map(o => ({ n: o.n, x: o.x, y: o.y, w: o.w, h: o.h })),
    alat: (d.alat || []).map(o => ({ n: o.n, x: o.x, y: o.y, w: o.w, h: o.h })),
    printer: d.printer || [], layar: d.layar || [],
    ops: (d.ops || []).filter(o => o.n && o.x !== undefined).map(o => ({ n: o.n, x: o.x, y: o.y, r: o.r || 0, t: o.t })),
    latar: latar.toDataURL('image/png'), depan: latarDepan.toDataURL('image/png'),
  };
});

// Katalog perabot: nama, ukuran, kategori, sifat (tembus = tak menghalangi, datar = jejak penuh), varian putar,
// bingkai animasi, dan harga — semuanya dari aturan Agent Pak sendiri supaya Kevi tak menyalin tabelnya.
const katalog = await pg.evaluate(async () => {
  const h = await (await fetch('api/harga')).json();
  const barang = {};
  for (const n of Object.keys(atlas)) {
    if (BUKAN_PERABOT.test(n) || GELEMBUNG.has(n) || !(n in h.harga)) continue;
    const a = atlas[n], pad = a.pad || 0;
    const putar = [1, 2, 3].filter(r => atlas[n + '__r' + r]);
    const f = bingkaiAnimasi(n);
    barang[n] = { w: a.w - 2 * pad, h: a.h - 2 * pad, k: jalurKatalog(n), harga: h.harga[n] };
    if (TEMBUS.has(n)) barang[n].tembus = 1;
    if (DATAR.test(n)) barang[n].datar = 1;
    if (putar.length) barang[n].putar = putar;
    if (f) barang[n].f = f.length;
  }
  const lantai = Object.keys(atlas).filter(n => n.startsWith('lantai_') && !n.includes('__'));
  return { barang, lantai, kategori: KATALOG.filter(k => !k.semua).map(k => ({ nama: k.nama, ikon: k.ikon, sub: k.sub })), per_ubin: h.per_ubin };
});
fs.writeFileSync(`${keluar}/katalog.json`, JSON.stringify(katalog));
console.log('katalog', Object.keys(katalog.barang).length, 'barang,', katalog.lantai.length, 'lantai');

const tulisPng =(nama, url) => fs.writeFileSync(`${keluar}/${nama}`, Buffer.from(url.split(',')[1], 'base64'));
tulisPng('kantor_latar.png', hasil.latar);
tulisPng('kantor_depan.png', hasil.depan);
delete hasil.latar; delete hasil.depan;
fs.writeFileSync(`${keluar}/kantor.json`, JSON.stringify(hasil));
console.log('tata', hasil.tata, hasil.lebar + 'x' + hasil.tinggi, 'berdiri', hasil.berdiri.length, 'kursi', hasil.kursi.length,
  'kursiMeja', hasil.kursiMeja.length, 'spot', hasil.spot.length, 'ruang', hasil.ruang.length, 'animasi', hasil.animasi.length);
await b.close();
