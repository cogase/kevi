// Uji ujung-ke-ujung Kevi di peramban headless: masuk, buat karakter, jalan WASD, terminal, toko, rumah, kebun.
// Pakai: node tests/uji_peramban.mjs <port> <username> <password> [folder foto]
// Instans yang diuji harus memakai DB uji (lihat tests/uji.sh), bukan DB sungguhan.
import { createRequire } from 'node:module';
import os from 'node:os';
import crypto from 'node:crypto';
// playwright-core dicari di folder KEVI_PLAYWRIGHT (folder apa pun yang punya node_modules/playwright-core).
const butuh = createRequire((process.env.KEVI_PLAYWRIGHT || os.homedir() + '/tangkap-bantuan') + '/');
const { chromium } = butuh('playwright-core');

const [, , port = '8811', username = 'penguji', password = 'rahasia-uji-123', foto = ''] = process.argv;
const b = await chromium.launch({
  executablePath: process.env.KEVI_CHROME || os.homedir() + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const galat = [];
pg.on('pageerror', e => galat.push('pageerror: ' + e.message));
pg.on('console', m => { if (m.type() === 'error' && !/status of 40[0134]/.test(m.text())) galat.push('console: ' + m.text()); });
pg.on('response', r => { if (r.status() === 404) galat.push('404: ' + r.url()); });
let gagal = 0;
const cek = (nama, ok, info = '') => { if (!ok) gagal++; console.log((ok ? 'LULUS ' : 'GAGAL ') + nama + (info ? ' — ' + info : '')); };
const tunggu = (ms) => pg.waitForTimeout(ms);
const potret = async (n) => { if (foto) await pg.screenshot({ path: `${foto}/${n}.png` }); };
// Kode sekali pakai (RFC 6238, SHA-1, 6 angka, 30 detik) dari kunci base32.
const totp = (rahasia, geser = 0) => {
  const bit = [...rahasia].map(c => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0')).join('');
  const kunci = Buffer.from(bit.match(/.{8}/g).map(x => parseInt(x, 2)));
  const hitung = Buffer.alloc(8); hitung.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + geser));
  const h = crypto.createHmac('sha1', kunci).update(hitung).digest(), o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
};
const tekan = async (k, ms) => { await pg.keyboard.down(k); await tunggu(ms); await pg.keyboard.up(k); await tunggu(60); };

await pg.goto(`http://127.0.0.1:${port}/`);
cek('tanpa sesi dialihkan ke /masuk', pg.url().endsWith('/masuk'));
await pg.fill('#u', username); await pg.fill('#p', 'salah-sandi-xx'); await pg.click('button.utama');
await pg.waitForSelector('#galat:not([hidden])');
cek('password salah ditolak', (await pg.textContent('#galat')).includes('salah'));
await pg.fill('#p', password); await pg.click('button.utama');
await pg.waitForURL(`http://127.0.0.1:${port}/`);

// --- pembuat karakter
await pg.waitForSelector('.buat');
cek('pembuat karakter tampil untuk akun baru', true);
await pg.fill('.buat-kiri input[type=text]', 'Penguji Satu');
await pg.selectOption('.buat-kanan select >> nth=0', 'rambut_bob');
await tunggu(400);
await potret('1-buat-karakter');
await pg.click('.buat-kiri button.utama');
await pg.waitForFunction(() => document.body.classList.contains('siap') && G.aku && Jaring.tersambung, null, { timeout: 20000 });
if (await pg.$('#tirai')) await pg.keyboard.press('Escape');
await tunggu(500);
let s = await pg.evaluate(() => ({ koin: G.koin, adegan: G.adegan, inv: G.inventori, npc: [...G.entitas.values()].filter(e => e.jenis === 'npc').length, x: G.aku.x, y: G.aku.y }));
cek('modal awal diterima', s.koin >= 300 && s.inv.kebun_petak === 6, JSON.stringify({ koin: s.koin, petak: s.inv.kebun_petak }));
cek('mulai di kantor dengan NPC', s.adegan === 'kantor' && s.npc === 7, `npc ${s.npc}`);
const npcAwal = await pg.evaluate(() => [...G.entitas.values()].filter(e => e.jenis === 'npc').map(e => [e.x, e.y, e.pose].join()));
await potret('2-kantor');

// --- jalan WASD + tabrakan
const jp0 = await pg.evaluate(() => [G.aku.x, G.aku.y]);
await tekan('w', 500);
const jp1 = await pg.evaluate(() => [G.aku.x, G.aku.y]);
cek('W menggerakkan tokoh ke atas', jp1[1] < jp0[1] - 10, `${jp0[1].toFixed(0)} -> ${jp1[1].toFixed(0)}`);
await pg.evaluate(() => { G.aku.x = 20; G.aku.y = 30 * 16 - 19 + 8; });
await tekan('a', 700);
cek('tembok menahan tokoh', (await pg.evaluate(() => G.aku.x)) >= 11.9, String(await pg.evaluate(() => G.aku.x)));
cek('tokoh tak pernah berhenti di dalam penghalang', await pg.evaluate(() => kakiBebas(G.aku.x, G.aku.y)));

// --- duduk + terminal
await pg.evaluate(() => { const st = Rumah.titik.find(b => b.jenis === 'kursi'); st.aksi(); });
await pg.waitForSelector('#terminal:not([hidden])');
cek('duduk membuka terminal', await pg.evaluate(() => !!G.duduk && /^(main|duduk|kiri_duduk|kanan_duduk)/.test(G.aku.pose || 'main')));
await tunggu(300);
await potret('3-terminal');
const ketik = async (baris, tungguMs = 400) => { await pg.fill('#term-isi', baris); await pg.keyboard.press('Enter'); await tunggu(tungguMs); };
await ketik('help');
cek('help menampilkan daftar perintah', (await pg.textContent('#term-layar')).includes('ping <host>'));
await ketik('ping 127.0.0.1', 4500);
await pg.waitForFunction(() => !Terminal.sibuk, null, { timeout: 15000 });
let layar = await pg.textContent('#term-layar');
cek('ping berjalan dan mengalir ke layar', /bytes from 127\.0\.0\.1|packets transmitted/.test(layar));
await ketik('ping -c 9999 x; rm -rf /', 600);
layar = await pg.textContent('#term-layar');
cek('sasaran berbahaya ditolak', layar.includes('Sasaran'));
await ketik('rm -rf /', 400);
cek('perintah di luar daftar ditolak', (await pg.textContent('#term-layar')).includes('tidak dikenal'));
await ketik('dns localhost', 1200);
cek('dns menjawab', (await pg.textContent('#term-layar')).includes('localhost ->'));
await ketik('catat Uji ping', 600);
cek('catat menyimpan ke Note', (await pg.textContent('#term-layar')).includes('Tersimpan di Note'));
await pg.keyboard.press('Escape');
cek('Esc menutup terminal dan berdiri', await pg.evaluate(() => $('#terminal').hidden && !G.duduk));

// --- Note
await pg.keyboard.press('n');
await pg.waitForSelector('.note');
cek('Note berisi catatan dari terminal', (await pg.textContent('.note-daftar')).includes('Uji ping'));
await pg.keyboard.press('Escape');

// --- NPC + toko
await pg.evaluate(() => Npc.bicara(G.entitas.get('npc:sari')));
await pg.waitForSelector('.toko');
await pg.click('.toko .kartu >> nth=0', { modifiers: ['Shift'] });   // 5 benih sawi
await tunggu(500);
s = await pg.evaluate(() => ({ koin: G.koin, sawi: G.inventori['benih:sawi'] }));
cek('beli benih memotong koin', s.sawi === 11 && s.koin < 350, JSON.stringify(s));
await pg.click('.tab button >> nth=2'); await tunggu(300);
cek('katalog perabot terisi', (await pg.$$('.toko .kartu')).length > 50);
const terbukaAwal = (await pg.$$('.toko .kartu:not(.gembok)')).length;
await pg.fill('.toko input[type=search]', 'sofa'); await tunggu(300);
cek('perabot mahal terkunci level, yang dasar terbuka', terbukaAwal > 20 && (await pg.$$('.toko .kartu.gembok')).length >= 5 && (await pg.textContent('.toko .kisi')).includes('Lv '));
await pg.evaluate(() => { Toko.cari = ''; });
cek('server menolak beli barang terkunci', await pg.evaluate(async () => (await fetch('/api/toko/beli', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ barang: 'sofa_krem', jumlah: 1 }) })).status === 400));
await potret('4-toko');
await pg.keyboard.press('Escape');

// --- obrolan
await pg.keyboard.press('Enter');
await pg.keyboard.type('halo semua');
await pg.keyboard.press('Enter');
await tunggu(400);
cek('obrolan tampil di log dan gelembung', (await pg.textContent('#obrolan-log')).includes('halo semua') && await pg.evaluate(() => !!G.aku.gelembung));

// --- lari & stamina
await pg.evaluate(() => { G.aku.x = 40; G.aku.y = 44 * 16; G.health.nilai = G.level.stamina; G.health.lelah = false; });
const xJalan0 = await pg.evaluate(() => G.aku.x);
await tekan('d', 600);
const jalan = (await pg.evaluate(() => G.aku.x)) - xJalan0;
await pg.evaluate(() => { G.aku.x = 40; });
await pg.keyboard.down('Shift'); await tekan('d', 600); await pg.keyboard.up('Shift');
const lari = (await pg.evaluate(() => G.aku.x)) - 40;
cek('Shift membuat lari lebih cepat dari jalan', lari > jalan * 1.4, `jalan ${jalan.toFixed(0)} px, lari ${lari.toFixed(0)} px`);
cek('lari menguras stamina', await pg.evaluate(() => G.health.nilai < G.level.stamina - 8), String(await pg.evaluate(() => G.health.nilai.toFixed(1))));
await pg.evaluate(() => { G.health.nilai = 0.5; G.aku.x = 40; });
await pg.keyboard.down('Shift'); await tekan('d', 500); await pg.keyboard.up('Shift');
cek('stamina habis = tak bisa lari', await pg.evaluate(() => G.health.lelah && $('#hud-health').classList.contains('lelah')));
await tunggu(1500);
cek('stamina pulih saat diam', await pg.evaluate(() => G.health.nilai > 20));

// --- level: terkunci di level 1, lalu admin menaikkan XP
cek('HUD menampilkan level', (await pg.textContent('#hud-level')).startsWith('Lv '));
await pg.evaluate(() => Arcade.buka()); await tunggu(300);
cek('arcade terkunci sebelum level 3', !(await pg.$('.arcade-papan')) && await pg.evaluate(() => G.level.level < 3));
const idSaya = await pg.evaluate(() => G.saya.id);
await pg.evaluate((id) => fetch('/api/admin/pemakai/ubah', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, xp: 3000 }) }), idSaya);
await pg.waitForFunction(() => G.level.level === 5, null, { timeout: 5000 });
cek('admin menyetel XP: level langsung naik di layar', (await pg.textContent('#hud-level')) === 'Lv 5');

// --- kuis jaringan
await pg.evaluate(() => Kuis.buka());
await pg.waitForSelector('.pilihan-kuis');
cek('kuis menampilkan soal dengan 4 pilihan', (await pg.$$('.pilihan-kuis')).length === 4);
await pg.click('.pilihan-kuis >> nth=0'); await tunggu(600);
cek('kuis menandai jawaban benar', (await pg.$$('.pilihan-kuis.benar')).length >= 1);
await pg.keyboard.press('Escape');

// --- arcade: selesaikan dengan mencocokkan semua pasangan
await pg.evaluate(() => Arcade.buka());
await pg.waitForSelector('.arcade-papan');
cek('arcade membuka 16 kartu', (await pg.$$('.arcade-kartu')).length === 16);
await pg.click('.arcade-kartu >> nth=0'); await pg.click('.arcade-kartu >> nth=1'); await tunggu(800);
cek('arcade: dua kartu dibalik lalu tertutup atau cocok', await pg.evaluate(() => document.querySelectorAll('.arcade-kartu.buka:not(.cocok)').length === 0));
await pg.keyboard.press('Escape');

// --- Komputer: tab Browser
await pg.evaluate(() => { const st = Rumah.titik.find(b => b.jenis === 'kursi'); st.aksi(); });
await pg.waitForSelector('#terminal:not([hidden])');
await pg.click('.term-tab[data-tab=browser]');
await pg.waitForSelector('#term-browser iframe');
cek('browser dalam game punya bookmark dan bingkai ber-sandbox', await pg.evaluate(() => !document.querySelector('#term-browser iframe').sandbox.contains('allow-top-navigation')));
await pg.click('.term-tab[data-tab=terminal]');
await ketik('trace 127.0.0.1', 2500);
await pg.waitForFunction(() => !Terminal.sibuk, null, { timeout: 15000 });
cek('trace terbuka sesudah level 2', /127\.0\.0\.1/.test(await pg.textContent('#term-layar')) && !(await pg.textContent('#term-layar')).includes('terbuka di level'));
await pg.keyboard.press('Escape');

// --- pulang lewat tepi bawah peta
await pg.evaluate(() => { G.aku.x = 264; G.aku.y = 44 * 16; });
await tekan('s', 900);
await pg.waitForFunction(() => G.adegan.startsWith('rumah:'), null, { timeout: 8000 }).catch(async () => {
  console.log('DIAGNOSA pulang:', JSON.stringify(await pg.evaluate(() => ({ adegan: G.adegan, y: G.aku.y, h: Mesin.dunia.h, sibuk: Mesin.sibuk(), aktif: document.activeElement.tagName + '#' + document.activeElement.id,
    kelas: document.body.className, duduk: !!G.duduk, berjalan: Mesin.pindahBerjalan, tombol: [...Mesin.tombol] }))));
  throw new Error('tidak sampai rumah');
});
cek('jalan ke bawah = pulang, muncul di jalan atas rumah', await pg.evaluate(() => G.aku.y < 130), String(await pg.evaluate(() => G.aku.y)));
await pg.evaluate(() => { G.aku.y = 250; });
await tunggu(300);

// --- bangun: taruh 2 petak + kotak kiriman
// Edit Rumah memakai dok dan alat yang sama dengan Edit Map: draf, lalu Simpan menghitung belanja dari inventory.
await pg.keyboard.press('b');
await pg.waitForSelector('#bangun .slot.alat');
cek('Edit Rumah: dok yang sama dengan Edit Map, tanpa Penghalang dan koleksi peta', await pg.evaluate(() => Sunting.aktif && Sunting.rumah && $('#bangun').textContent.includes('Edit Rumah')
  && !!$('#bangun [data-alat=ruang]') && !$('#bangun [data-alat=halang]') && !$('#sunting-peta') && !!$('#sunting-belanja')));
await pg.evaluate(() => { Sunting.kam.y += 40; });
const taruh = async (barang, x, y) => {
  await pg.evaluate((b) => Sunting.pakaiSprite(b), barang);
  const p = await pg.evaluate(([x, y]) => Mesin.keLayar(x, y), [x, y]);
  await pg.mouse.move(p.x, p.y); await pg.mouse.down(); await pg.mouse.up(); await tunggu(200);
};
await taruh('kebun_petak', 200, 300); await taruh('kebun_petak', 216, 300); await taruh('kebun_kotak_kiriman', 260, 300);
cek('draf rumah belum memakai inventory sebelum Simpan', await pg.evaluate(() => G.rumah.benda.length === 3 && G.inventori.kebun_petak === 6 && Sunting.kotor));
await pg.waitForFunction(() => $('#sunting-belanja').textContent.includes('Tanpa belanja'), null, { timeout: 5000 });
cek('hitungan belanja: barang yang sudah dimiliki tidak dibeli lagi', true);
await pg.click('#sunting-simpan');
await pg.waitForFunction(() => !Sunting.kotor && !Sunting.sibuk);
s = await pg.evaluate(() => ({ benda: G.rumah.benda.map(o => o.n), petak: G.inventori.kebun_petak }));
cek('perabot terpasang dari inventory', s.benda.filter(n => n === 'kebun_petak').length === 2 && s.petak === 4 && s.benda.includes('kebun_kotak_kiriman'), JSON.stringify(s));
// R2 (yosi): lantai dan tembok gratis di Edit Rumah, motif lantai terbuka menurut level, tidak lewat inventory.
await pg.click('#bangun [data-alat=lantai]');
await pg.waitForSelector('#sunting-katalog .kartu');
const lantaiUji = await pg.evaluate(() => {
  const kartu = (n) => $('#sunting-katalog .kartu[data-n="' + n + '"]'), marmer = kartu('lantai_marmer'), parket = kartu('lantai_parket');
  marmer.click();
  return { level: G.level.level, marmer: marmer.className + ' | ' + marmer.title, parket: parket.className + ' | ' + parket.title, dipilih: Sunting.lantai, kabar: Sunting.pesan };
});
cek('Edit Rumah: motif lantai gratis; yang di atas level pemain bergembok dan tidak bisa dipilih', lantaiUji.marmer.includes('gembok') && lantaiUji.marmer.includes('terbuka di level 6') && !lantaiUji.parket.includes('gembok')
  && lantaiUji.parket.includes('gratis') && lantaiUji.dipilih !== 'lantai_marmer' && lantaiUji.kabar.includes('level 6'), JSON.stringify(lantaiUji));
const koinUbin = await pg.evaluate(() => G.koin);
await pg.evaluate(() => { Sunting.tutupKatalog(); Sunting.pakaiAlat('pilih'); Sunting.ubah((d) => { for (let gx = 4; gx <= 7; gx++) { d.lantai[gx + ',6'] = 'lantai_parket'; d.tembok[gx + ',5'] = '#8b9bb4'; } }); });
await pg.waitForFunction(() => Sunting.kotor && $('#sunting-belanja').textContent.includes('Tanpa belanja'), null, { timeout: 5000 });
await pg.click('#sunting-simpan');
await pg.waitForFunction(() => !Sunting.kotor && !Sunting.sibuk);
cek('lantai dan tembok terpasang tanpa biaya dan tanpa memakai inventory', await pg.evaluate((k) => G.koin === k && Object.keys(G.rumah.lantai).length === 4 && Object.keys(G.rumah.tembok).length === 4
  && !Object.keys(G.inventori).some(b => b === 'tembok' || b.startsWith('lantai:')), koinUbin), JSON.stringify(await pg.evaluate(() => ({ koin: G.koin, inv: Object.keys(G.inventori) }))));
await pg.evaluate(() => Sunting.ubah((d) => { d.lantai = {}; d.tembok = {}; }));
await pg.click('#sunting-simpan');
await pg.waitForFunction(() => !Sunting.kotor && !Sunting.sibuk);
cek('mencabut lantai dan tembok tidak mengisi inventory', await pg.evaluate((k) => G.koin === k && !Object.keys(G.inventori).some(b => b === 'tembok' || b.startsWith('lantai:')), koinUbin));
await potret('5-bangun');
await pg.keyboard.press('b');
await pg.waitForFunction(() => !G.bangun);
await pg.evaluate(() => Toko.buka());
cek('Koperasi tidak lagi menjual lantai dan tembok', await pg.evaluate(() => { const teks = $('#tirai').textContent; return teks.includes('Perabot') && !teks.includes('Lantai & tembok') && hargaBeli('tembok') === null && hargaBeli('lantai:lantai_parket') === null; }));
await pg.evaluate(() => Panel.tutup());

// --- hotbar: benih harus dipegang untuk menanam; perabot dipegang = siap ditaruh
await pg.evaluate(() => { G.aku.x = 212; G.aku.y = 286; }); await tunggu(250);
await pg.keyboard.press('e'); await tunggu(400);
cek('tanam ditolak bila benih belum dipegang', await pg.evaluate(() => !Object.values(G.rumah.petak).some(p => p.t)));
await pg.evaluate(() => Hotbar.isi(0, 'benih:sawi')); await pg.keyboard.press('1'); await tunggu(200);
cek('tombol 1 memegang isi slot hotbar pertama', await pg.evaluate(() => Hotbar.dipegang() === 'benih:sawi' && document.querySelector('.hb-sel.aktif') !== null));
await pg.keyboard.press('e'); await tunggu(500);
cek('E menanam benih yang dipegang', await pg.evaluate(() => Object.values(G.rumah.petak).filter(p => p.t === 'sawi').length === 1));
await pg.evaluate(() => Hotbar.isi(1, 'kebun_petak')); await pg.keyboard.press('2'); await tunggu(200);
cek('memegang perabot di rumah = mode taruh', await pg.evaluate(() => !!G.bangun && G.bangun.barang === 'kebun_petak'));
await pg.keyboard.press('2'); await tunggu(200);
cek('melepas pegangan = keluar mode taruh', await pg.evaluate(() => !G.bangun));
await pg.keyboard.press('i'); await pg.waitForSelector('.inv-kisi');
cek('inventory berslot: 20 slot awal + baris hotbar', await pg.evaluate(() => document.querySelectorAll('.inv-kisi:not(.hotbar) .inv-sel').length === 20 && document.querySelectorAll('.inv-kisi.hotbar .inv-sel').length === 10));
await pg.keyboard.press('Escape');
await pg.evaluate(() => aksi('/api/toko/beli', { barang: 'makan:roti', jumlah: 1 })); await tunggu(400);
// Stamina = lapar, dihitung server: admin menyetelnya, HUD mengikuti, makan mengisinya, kelaparan melarang lari.
const setelStamina = async (n) => { await pg.evaluate(([id, n]) => fetch('/api/admin/pemakai/ubah', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, stamina: n }) }), [idSaya, n]); await tunggu(400); };
await setelStamina(10);
cek('stamina (lapar) dari server tampil di HUD', await pg.evaluate(() => G.stamina.nilai === 10 && $('#hud-stamina').classList.contains('lapar') && !!$('#hud-health')), JSON.stringify(await pg.evaluate(() => G.stamina)));
await pg.evaluate(() => { Hotbar.isi(2, 'makan:roti'); }); await pg.keyboard.press('3'); await pg.keyboard.press('f'); await tunggu(500);
cek('F memakan makanan yang dipegang: stamina naik, barang berkurang', await pg.evaluate(() => G.stamina.nilai === 35 && !G.inventori['makan:roti']), JSON.stringify(await pg.evaluate(() => G.stamina)));
await setelStamina(0);
await pg.evaluate(() => { G.health.nilai = G.level.stamina; G.health.lelah = false; });
await pg.keyboard.down('Shift'); await tekan('d', 500); await pg.keyboard.up('Shift');
cek('kelaparan (stamina 0): tidak bisa lari', await pg.evaluate(() => G.stamina.nilai === 0 && G.health.nilai >= G.level.stamina - 1));
await setelStamina(999);
cek('stamina tidak melewati batas level', await pg.evaluate(() => G.stamina.nilai === G.stamina.maks && G.stamina.maks === G.level.stamina));
cek('tata letak hotbar tersimpan di server', await pg.evaluate(async () => { await new Promise(r => setTimeout(r, 900)); return (await (await fetch('/api/saya')).json()).tata.hotbar[0] === 'benih:sawi'; }));

// --- kebun: tanam, siram, tunggu matang (KEVI_LAJU uji besar), panen, jual
const idPetak = await pg.evaluate(() => { const o = G.rumah.benda.filter(o => o.n === 'kebun_petak'); return (o.find(x => (G.rumah.petak[x.id] || {}).t) || o[0]).id; });
await pg.evaluate((id) => (G.rumah.petak[id] && G.rumah.petak[id].t) ? null : api('/api/kebun/tanam', { id, t: 'sawi' }).then(serap), idPetak); await tunggu(300);
await pg.evaluate((id) => api('/api/kebun/siram', { id }).then(serap), idPetak); await tunggu(300);
s = await pg.evaluate((id) => G.rumah.petak[id], idPetak);
cek('petak tertanam dan basah', s && s.t === 'sawi' && s.basah, JSON.stringify(s));
await pg.waitForFunction((id) => G.rumah.petak[id] && G.rumah.petak[id].matang, idPetak, { timeout: 30000 });
cek('tanaman matang seiring waktu', true);
await potret('6-kebun');
await pg.evaluate((id) => { const o = G.rumah.benda.find(x => x.id === id); G.aku.x = o.x - 4; G.aku.y = o.y + Rumah.oy - 4; }, idPetak); await tunggu(250);
cek('petunjuk E menawarkan panen', (await pg.textContent('#petunjuk')).includes('Panen'), JSON.stringify(await pg.evaluate((id) => ({ teks: $('#petunjuk').textContent, sembunyi: $('#petunjuk').hidden, bangun: !!G.bangun, aku: [G.aku.x, G.aku.y], petak: G.rumah.petak[id], o: G.rumah.benda.find(x => x.id === id) }), idPetak)));
await pg.keyboard.press('e'); await tunggu(500);
cek('panen masuk inventory', await pg.evaluate(() => G.inventori['panen:sawi'] === 1));
const koinSebelum = await pg.evaluate(() => G.koin);
await pg.evaluate(() => Rumah.jualHasil());
await pg.waitForSelector('#kotak-semua');
await pg.click('#kotak-semua'); await pg.click('#kotak-jual'); await tunggu(500);
await pg.evaluate(() => Panel.tutup());
cek('jual hasil lewat kotak kiriman menambah koin', (await pg.evaluate(() => G.koin)) >= koinSebelum + 30);

// --- profil: statistik sendiri dari Menu
await pg.evaluate(() => Profil.buka());
await pg.waitForSelector('.profil .profil-potret');
cek('profil sendiri menampilkan statistik dan tombol ubah karakter', await pg.evaluate(() => {
  const t = $('.profil').textContent;
  return t.includes('Lama bermain') && t.includes('Panen') && t.includes('Ubah karakter') && !!$('#profil-bilah');
}));
await pg.keyboard.press('Escape');

// --- toko pakaian & lemari: beli di toko, pakai dari lemari, yang belum dibeli ditolak server
await pg.evaluate(() => Pakaian.buka(true));
await pg.waitForSelector('.pakaian-kartu[data-kode=kupluk].belum');
const koinPakaian = await pg.evaluate(() => G.koin);
await pg.click('.pakaian-kartu[data-kode=kupluk]');
await pg.waitForSelector('.pakaian-kartu[data-kode=kupluk]:not(.belum)');
cek('toko pakaian: beli kupluk memotong koin dan masuk lemari', await pg.evaluate((k) => G.koin === k - 45 && !G.karakter.tampilan.kepala, koinPakaian));
await pg.click('.pakaian-kartu[data-kode=kupluk]');
await pg.waitForSelector('.pakaian-kartu[data-kode=kupluk].aktif');
cek('klik pakaian yang dimiliki langsung memakainya', await pg.evaluate(() => G.karakter.tampilan.kepala === 'kupluk'));
await pg.keyboard.press('Escape');
await pg.evaluate(() => Pakaian.buka(false));
await pg.waitForSelector('.pakaian-kartu[data-kode=kupluk]');
cek('lemari hanya menampilkan yang dimiliki', await pg.evaluate(() => !document.querySelector('.pakaian-kartu[data-kode=helm_proyek]') && !document.querySelector('.pakaian-kartu.belum')));
await pg.click('.pakaian-kartu[data-jenis=kepala][data-kode=""]');
await pg.waitForFunction(() => G.karakter.tampilan.kepala === '');
cek('melepas penutup kepala dari lemari', true);
await pg.keyboard.press('Escape');
cek('server menolak memakai yang belum dibeli', await pg.evaluate(async () => (await fetch('/api/karakter', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nama: G.karakter.nama, tampilan: Object.assign({}, G.karakter.tampilan, { kepala: 'helm_proyek' }) }) })).status === 400));

// --- hewan kandang berjalan-jalan di depan kandangnya (seperti hewan di Agent Pak)
await pg.evaluate((id) => fetch('/api/admin/pemakai/ubah', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, koin: 3000 }) }), idSaya);
const kandangUji = await pg.evaluate(async () => {
  const n = Object.keys(G.toko.kandang)[0];
  await aksi('/api/toko/beli', { barang: n, jumlah: 1 });
  await aksi('/api/rumah/pasang', { barang: n, x: 320, y: 96, r: 0 });
  const o = G.rumah.benda.find(b => b.n === n);
  if (o) await aksi('/api/kandang/beli', { id: o.id, j: G.toko.kandang[n].hewan[0] });
  return o && { id: o.id, hewan: (G.rumah.kandang[o.id] || { hewan: [] }).hewan.length };
});
cek('kandang terpasang dan berisi seekor hewan', kandangUji && kandangUji.hewan === 1, JSON.stringify(kandangUji));
await pg.waitForFunction(() => [...Rumah.hewan.values()].some(s => s.jalan), null, { timeout: 12000 });
const hewan0 = await pg.evaluate(() => { const s = [...Rumah.hewan.values()].find(x => x.jalan); return { x: s.x, y: s.y }; });
await tunggu(700);
cek('hewan kandang berjalan-jalan sendiri', await pg.evaluate((a) => [...Rumah.hewan.values()].some(s => Math.hypot(s.x - a.x, s.y - a.y) > 2), hewan0));

// --- perabot duduk: kursi yang ditaruh bisa diduduki, berdiri dengan tombol gerak
const kursiUji = await pg.evaluate(async () => {
  const n = Object.keys(G.katalog.barang).find(x => /^kursi/.test(x) && hargaBeli(x) != null && levelBarang(x) <= G.level.level);
  const d = G.rumah, badan = { lantai: d.lantai, tembok: d.tembok, ruang: d.ruang || [], benda: [...d.benda, { n, x: 96, y: 200, r: 0 }] };
  serap(await api('/api/rumah/simpan', badan));
  return { n, titik: Rumah.interaksi().filter(t => t.duduk).length };
});
cek('kursi yang ditaruh menjadi titik "Duduk"', kursiUji.titik === 1, JSON.stringify(kursiUji));
await pg.evaluate(() => { G.health.nilai = 5; Rumah.interaksi().find(t => t.duduk).aksi(); });
await tunggu(600);
cek('duduk santai: berpose duduk, tanpa Komputer, lelah pulih', await pg.evaluate(() => G.duduk && G.duduk.santai && G.aku.pose === 'santai' && !Terminal.terbuka() && G.health.nilai > 12),
  JSON.stringify(await pg.evaluate(() => ({ pose: G.aku.pose, health: G.health.nilai }))));
// Laporan yosi: kursi berlayer Otomatis menutupi karakter yang mendudukinya.
const urutDuduk = await pg.evaluate((n) => { const b = Rumah.urut.find(b => b.o.n === n); return { layer: b.o.l || '', kursi: b.alas, kaki: G.aku.y + 19, tokoh: Rumah.alasEntitas(G.aku), berdiri: Rumah.alasEntitas({ x: G.aku.x, y: G.aku.y, pose: '' }) }; }, kursiUji.n);
cek('duduk santai: karakter digambar di depan kursi berlayer Otomatis, bukan tertutup olehnya', urutDuduk.layer === '' && urutDuduk.kaki < urutDuduk.kursi && urutDuduk.tokoh > urutDuduk.kursi && urutDuduk.berdiri === urutDuduk.kaki, JSON.stringify(urutDuduk));
// Laporan yosi: hadap depan kakinya hilang (pose meja), hadap belakang salah arah, menyamping perlu digeser.
const arahDuduk = await pg.evaluate(async (n) => {
  const b = Rumah.urut.find(b => b.o.n === n), hasil = { depan: { pose: G.aku.pose, dx: G.aku.x - b.o.x, dy: G.aku.y - b.y }, bisaPutar: (Rumah.infoBarang(n).putar || []).length };
  for (const [r, nama] of [[2, 'belakang'], [1, 'kiri'], [3, 'kanan']]) {
    b.o.r = r; Mesin.berdiri(); Mesin.dudukSantai(b);
    const pose = { belakang: 'atas_diam', kiri: 'kiri_duduk', kanan: 'kanan_duduk' }[nama];      // urutan gambar dihitung serentak: data rumah bisa diganti kiriman server selagi menunggu
    hasil[nama] = { dy: G.aku.y - b.y, depanKursi: Rumah.alasEntitas({ x: G.aku.x, y: G.aku.y, pose }) > b.alas };
    await new Promise(res => setTimeout(res, 120));
    hasil[nama].pose = G.aku.pose;
  }
  b.o.r = 0; Mesin.berdiri(); Mesin.dudukSantai(b);
  return hasil;
}, kursiUji.n);
cek('duduk: hadap depan berpose santai, hadap belakang tampak punggung di balik sandaran, menyamping di depan kursi, semua 4 px di atas pojok kursi', arahDuduk.depan.pose === 'santai' && arahDuduk.depan.dx === 0
  && arahDuduk.belakang.pose === 'atas_diam' && !arahDuduk.belakang.depanKursi && arahDuduk.kiri.pose === 'kiri_duduk' && arahDuduk.kiri.depanKursi && arahDuduk.kanan.pose === 'kanan_duduk'
  && [arahDuduk.depan.dy, arahDuduk.belakang.dy, arahDuduk.kiri.dy, arahDuduk.kanan.dy].every(v => v >= -4 && v <= 2), JSON.stringify(arahDuduk));
await tunggu(200);
await tekan('s', 250);
cek('tombol gerak membuat berdiri lagi', await pg.evaluate(() => !G.duduk));
await pg.evaluate(async (n) => { const d = G.rumah; serap(await api('/api/rumah/simpan', { lantai: d.lantai, tembok: d.tembok, ruang: d.ruang || [], benda: d.benda.filter(o => o.n !== n) })); await aksi('/api/toko/jual', { barang: n, jumlah: 1 }); }, kursiUji.n);

// --- kotak kiriman: pilih sendiri hasil yang dijual (kata yosi)
const kotakUji = await pg.evaluate(async () => {
  await aksi('/api/toko/beli', { barang: 'benih:sawi', jumlah: 1 });
  const koin0 = G.koin;
  serap({ inventori: Object.assign({}, G.inventori, { 'panen:sawi': 4, 'panen:wortel': 2 }) });      // tampilan saja; server tetap memeriksa
  KotakJual.buka();
  const sel = (sisi, b) => $('#tirai [data-sisi=' + sisi + '] [data-barang="' + b + '"]');
  const awal = { inv: document.querySelectorAll('#tirai [data-sisi=inv] .inv-sel').length, kotak: document.querySelectorAll('#tirai [data-sisi=kotak] .inv-sel').length, jual: $('#kotak-jual').disabled, benih: !!sel('inv', 'benih:sawi') };
  sel('inv', 'panen:sawi').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  sel('inv', 'panen:sawi').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  const dua = { kotak: sel('kotak', 'panen:sawi').textContent, sisa: sel('inv', 'panen:sawi').textContent, tombol: $('#kotak-jual').textContent, wortelTetap: !!sel('inv', 'panen:wortel') && !sel('kotak', 'panen:wortel') };
  $('#kotak-semua').click();
  const semua = { tombol: $('#kotak-jual').textContent, invKosong: document.querySelectorAll('#tirai [data-sisi=inv] .inv-sel').length };
  Panel.tutup();
  return { awal, dua, semua, hargaSawi: hargaJual('panen:sawi'), hargaWortel: hargaJual('panen:wortel'), koin0 };
});
cek('kotak kiriman: hasil dipindah satu per satu atau semua, total mengikuti isi kotak, benih tidak ikut tampil', kotakUji.awal.inv >= 2 && kotakUji.awal.kotak === 0 && kotakUji.awal.jual && !kotakUji.awal.benih && kotakUji.dua.kotak === '2' && kotakUji.dua.sisa === '2'
  && kotakUji.dua.tombol === 'Jual: +' + 2 * kotakUji.hargaSawi + ' koin' && kotakUji.dua.wortelTetap && kotakUji.semua.invKosong === 0 && kotakUji.semua.tombol.includes(String(4 * kotakUji.hargaSawi + 2 * kotakUji.hargaWortel)), JSON.stringify(kotakUji));
await pg.evaluate(async () => { const d = await api('/api/saya'); serap({ inventori: d.inventori }); });

// --- peti: taruh di rumah, titip barang, ambil satu, peti berisi tak bisa diangkat
await pg.evaluate(async () => {
  await aksi('/api/toko/beli', { barang: 'gudang_peti_kayu', jumlah: 1 });
  await aksi('/api/rumah/pasang', { barang: 'gudang_peti_kayu', x: 200, y: 120, r: 0 });
  await aksi('/api/toko/beli', { barang: 'pakan', jumlah: 3 });
});
const pakan0 = await pg.evaluate(() => G.inventori.pakan);
const idPeti = await pg.evaluate(() => G.rumah.benda.find(o => o.n === 'gudang_peti_kayu').id);
cek('peti yang ditaruh menjadi titik "Buka peti"', await pg.evaluate(() => Rumah.interaksi().some(t => t.label === 'Buka peti')));
await pg.evaluate((id) => Peti.buka(G.rumah.benda.find(o => o.id === id)), idPeti);
await pg.waitForSelector('.peti-kisi[data-sisi=inv] [data-barang=pakan]');
await pg.click('.peti-kisi[data-sisi=inv] [data-barang=pakan]');
await pg.waitForSelector('.peti-kisi[data-sisi=peti] [data-barang=pakan]');
cek('klik menitipkan seluruh tumpukan ke peti', await pg.evaluate(([id, n]) => G.rumah.peti[id].pakan === n && !G.inventori.pakan, [idPeti, pakan0]));
await pg.click('.peti-kisi[data-sisi=peti] [data-barang=pakan]', { modifiers: ['Shift'] });
await pg.waitForSelector('.peti-kisi[data-sisi=inv] [data-barang=pakan]');
cek('Shift+klik mengambil satu dari peti', await pg.evaluate(([id, n]) => G.rumah.peti[id].pakan === n - 1 && G.inventori.pakan === 1, [idPeti, pakan0]));
cek('peti berisi tidak bisa diangkat', await pg.evaluate(async (id) => (await fetch('/api/rumah/angkat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })).status === 400, idPeti));
await pg.click('.peti-kisi[data-sisi=peti] [data-barang=pakan]');
await pg.waitForFunction((id) => !G.rumah.peti[id] || !G.rumah.peti[id].pakan, idPeti);
await pg.keyboard.press('Escape');
await pg.evaluate(async (id) => { await aksi('/api/rumah/angkat', { id }); await aksi('/api/toko/jual', { barang: 'gudang_peti_kayu', jumlah: 1 }); }, idPeti);
cek('peti kosong bisa diangkat lagi', await pg.evaluate(() => !G.rumah.benda.some(o => o.n === 'gudang_peti_kayu') && !G.inventori.gudang_peti_kayu));

// --- kembali ke kantor: jalan terus ke ATAS dari rumah, tiba di tepi bawah kantor
await pg.evaluate(() => { G.aku.x = 232; G.aku.y = 6; }); await tunggu(200);
await tekan('w', 700);
await pg.waitForFunction(() => G.adegan === 'kantor', null, { timeout: 8000 });
cek('jalan ke atas dari rumah = tiba di bawah kantor', await pg.evaluate(() => G.aku.y > Mesin.dunia.h - 80), String(await pg.evaluate(() => G.aku.y)));

// --- zoom
const skala0 = await pg.evaluate(() => G.kamera.skala);
await pg.keyboard.press('-'); await tunggu(150);
cek('tombol − memperkecil pandangan', (await pg.evaluate(() => G.kamera.skala)) < skala0, `${skala0} -> ${await pg.evaluate(() => G.kamera.skala)}`);
await pg.mouse.move(683, 400); await pg.mouse.wheel(0, -200); await tunggu(150);
await pg.click('#zoom-nilai'); await tunggu(150);
cek('klik angka zoom mengembalikan zoom otomatis', (await pg.evaluate(() => G.kamera.skala)) === skala0);
await pg.keyboard.press('m'); await pg.waitForSelector('.misi');
cek('panel misi harian berisi 3 misi', (await pg.$$('.baris.misi')).length === 3);
await potret('7-misi');
await pg.keyboard.press('Escape');

// --- pemain kedua: saling melihat, obrolan sampai, bertamu
const pg2 = await (await b.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
pg2.on('pageerror', e => galat.push('pageerror(2): ' + e.message));
await pg2.goto(`http://127.0.0.1:${port}/masuk`);
await pg2.fill('#u', username + '2'); await pg2.fill('#p', password); await pg2.click('button.utama');
await pg2.waitForSelector('.buat');
await pg2.fill('.buat-kiri input[type=text]', 'Penguji Dua');
await pg2.click('.buat-kiri button.utama');
await pg2.waitForFunction(() => document.body.classList.contains('siap') && G.aku && Jaring.tersambung, null, { timeout: 20000 });
if (await pg2.$('#tirai')) await pg2.keyboard.press('Escape');
await tunggu(700);
const lihat = async (hal) => hal.evaluate(() => [...G.entitas.values()].filter(e => e.jenis === 'pemain').map(e => e.nama));
cek('pemain pertama melihat pemain kedua', (await lihat(pg)).includes('Penguji Dua'), JSON.stringify(await lihat(pg)));
cek('pemain kedua melihat pemain pertama', (await lihat(pg2)).includes('Penguji Satu'), JSON.stringify(await lihat(pg2)));
const x2 = await pg.evaluate(() => [...G.entitas.values()].find(e => e.nama === 'Penguji Dua').tx);
await pg2.keyboard.down('d'); await pg2.waitForTimeout(600); await pg2.keyboard.up('d'); await tunggu(400);
cek('gerak pemain kedua tersiar', (await pg.evaluate(() => [...G.entitas.values()].find(e => e.nama === 'Penguji Dua').tx)) > x2 + 10);
await pg2.keyboard.press('Enter'); await pg2.keyboard.type('pagi juga'); await pg2.keyboard.press('Enter'); await tunggu(500);
cek('obrolan pemain kedua sampai', (await pg.textContent('#obrolan-log')).includes('pagi juga'));
// --- interaksi antarpemain: emote, tos, kirim koin, suit, obrolan saluran Semua
await pg2.evaluate(() => { const a = [...G.entitas.values()].find(e => e.jenis === 'pemain'); G.aku.x = a.x + 20; G.aku.y = a.y; });
await tunggu(400);
await pg2.keyboard.press('Shift+Digit3'); await tunggu(400);
cek('emote pemain kedua terlihat pemain pertama', await pg.evaluate(() => { const e = [...G.entitas.values()].find(x => x.nama === 'Penguji Dua'); return !!(e.emot && e.emot.n === 'hati'); }));
cek('pemain level 1 belum bisa tos', await pg2.evaluate(() => !terbuka('tos')));
const id2 = await pg2.evaluate(() => G.saya.id);
await pg.evaluate((id) => fetch('/api/admin/pemakai/ubah', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, xp: 3000 }) }), id2);
await pg2.waitForFunction(() => G.level.level === 5, null, { timeout: 5000 });
const xpTos = await pg2.evaluate(() => G.level.xp);
await pg.evaluate((id) => Jaring.kirim({ t: 'tos', ke: id }), id2); await tunggu(600);
cek('tos memberi XP kepada kedua pemain', (await pg2.evaluate(() => G.level.xp)) > xpTos);
const koin2 = await pg2.evaluate(() => G.koin);
await pg.evaluate((id) => aksi('/api/interaksi/kirim', { ke: id, jumlah: 25 }), id2); await tunggu(500);
cek('kirim koin sampai ke penerima seketika', (await pg2.evaluate(() => G.koin)) === koin2 + 25);
await pg.evaluate((id) => Jaring.kirim({ t: 'suit_ajak', ke: id, taruhan: 10 }), id2);
await pg2.waitForSelector('.panel .tombol.utama');
cek('ajakan suit muncul di layar lawan', (await pg2.textContent('.panel-isi')).includes('menantangmu suit'));
await pg2.click('.panel .tombol.utama');
await pg.waitForSelector('.suit-pilih'); await pg2.waitForSelector('.suit-pilih');
const sebelumSuit = [await pg.evaluate(() => G.koin), await pg2.evaluate(() => G.koin)];
await pg.click('.suit-pilih .kartu >> nth=0'); await pg2.click('.suit-pilih .kartu >> nth=1');     // batu lawan gunting
await pg.waitForSelector('.suit-hasil'); await tunggu(500);
cek('suit: batu mengalahkan gunting dan taruhan berpindah', (await pg.textContent('.panel h3')).includes('menang')
  && (await pg.evaluate(() => G.koin)) === sebelumSuit[0] + 10 && (await pg2.evaluate(() => G.koin)) === sebelumSuit[1] - 10);
await pg.keyboard.press('Escape'); await pg2.keyboard.press('Escape');
await pg2.evaluate(() => Obrolan.kirim('tes saluran semua', 'semua')); await tunggu(400);
cek('obrolan saluran Semua bertanda', await pg.evaluate(() => [...document.querySelectorAll('#obrolan-log .obrol')].some(o => o.textContent.includes('tes saluran semua') && o.querySelector('.saluran'))));

// --- bisik: hanya pengirim dan penerima yang melihat
await tunggu(800);
await pg2.evaluate(() => Obrolan.kirim('/w Penguji Satu rahasia kita')); await tunggu(900);
cek('bisikan sampai ke penerima bertanda bisik', await pg.evaluate(() => [...document.querySelectorAll('#obrolan-log .obrol.bisik')].some(o => o.textContent.includes('rahasia kita'))));
await pg.evaluate(() => Obrolan.kirim('/r siap')); await tunggu(700);
cek('/r membalas bisikan terakhir', await pg2.evaluate(() => [...document.querySelectorAll('#obrolan-log .obrol.bisik')].some(o => o.textContent.includes('siap'))));
cek('pemilih emoticon terisi', await pg.evaluate(() => document.querySelectorAll('#emoji-kotak .emoji').length >= 30));

// --- admin menyunting peta utama dari dalam game
// --- tampilan: menu atas ciut, hotbar agak transparan, jendela ringkas yang bisa digeser
await pg.mouse.move(400, 300);
await pg.click('#tb-ciut');
cek('menu atas bisa diciutkan dan diingat', await pg.evaluate(() => document.body.classList.contains('hud-ciut') && $('#hud').getBoundingClientRect().width < 160
  && getComputedStyle($('#tb-inventori')).display === 'none' && localStorage.getItem('kevi.hudCiut') === '1'));
await pg.click('#tb-ciut');
cek('menu atas dibuka lagi', await pg.evaluate(() => !document.body.classList.contains('hud-ciut') && getComputedStyle($('#tb-inventori')).display !== 'none'));
await pg.mouse.move(400, 300);
cek('hotbar agak transparan saat tidak disentuh', await pg.evaluate(() => Number(getComputedStyle($('#hotbar')).opacity) < 0.8));
await pg.waitForTimeout(2500);
cek('kontrol zoom sembunyi sendiri saat kursor jauh', await pg.evaluate(() => getComputedStyle($('#zoom')).opacity === '0'));
await pg.mouse.move(1300, 740); await pg.waitForTimeout(450);
cek('kontrol zoom muncul saat kursor mendekati pojok kanan bawah', await pg.evaluate(() => $('#zoom').classList.contains('tampak') && Number(getComputedStyle($('#zoom')).opacity) > 0.9));
await pg.mouse.move(400, 300);
const kotakPanel = () => pg.evaluate(() => { const r = $('#tirai .panel').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }; });
await pg.keyboard.press('i');
await pg.waitForSelector('#tirai .panel.ringkas');
const kp0 = await kotakPanel();
await pg.mouse.move(kp0.x + 70, kp0.y + 16); await pg.mouse.down(); await pg.mouse.move(kp0.x - 30, kp0.y + 50); await pg.mouse.move(kp0.x - 130, kp0.y + 76); await pg.mouse.up();
const kp1 = await kotakPanel();
cek('jendela Inventory ringkas dan bisa digeser lewat kepalanya', kp0.w <= 500 && kp1.x === kp0.x - 200 && kp1.y === kp0.y + 60, JSON.stringify([kp0, kp1]));
await pg.keyboard.press('Escape'); await pg.keyboard.press('i');
await pg.waitForSelector('#tirai .panel.ringkas');
const kp2 = await kotakPanel();
cek('letak jendela diingat saat dibuka lagi', kp2.x === kp1.x && kp2.y === kp1.y, JSON.stringify([kp1, kp2]));
await pg.keyboard.press('Escape');

// Edit Map bekerja pada draf: alat, katalog, geser, urungkan, grup; baru tersiar saat Simpan.
const titikLayar = (x, y) => pg.evaluate(([x, y]) => Mesin.keLayar(x, y), [x, y]);
const seretPeta = async (x0, y0, x1, y1) => {
  const a = await titikLayar(x0, y0), z = await titikLayar(x1, y1);
  await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move((a.x + z.x) / 2, (a.y + z.y) / 2); await pg.mouse.move(z.x, z.y); await pg.mouse.up(); await tunggu(120);
};
const klikPeta = async (x, y, opsi) => { const t = await titikLayar(x, y); await pg.mouse.click(t.x, t.y, opsi); await tunggu(120); };
const sofa = () => pg.evaluate(() => { const o = G.peta.benda[0]; return o && { x: o.x, y: o.y, n: o.n, r: o.r }; });
await pg.keyboard.press('b');
await pg.waitForSelector('#bangun .slot.alat');
await pg.evaluate(() => { Sunting.kam.y -= 55; });      // geser pandangan supaya area uji tidak tertutup menu atas
cek('Edit Map terbuka dengan delapan alat', await pg.evaluate(() => Sunting.aktif && document.querySelectorAll('#bangun .slot.alat').length === 8 && $('#sunting-simpan').disabled));
await pg.click('#bangun [data-alat=perabot]');
await pg.waitForSelector('#sunting-katalog .kartu');
// Laporan yosi: sesudah memilih beberapa perabot, dok menampilkan "[object HTMLButtonElement],…" alih-alih tombol perabot terakhir.
const dokTerakhir = await pg.evaluate(() => {
  const kartu = [...document.querySelectorAll('#sunting-katalog .kartu')].slice(0, 3).map(k => k.title), asal = { sprite: Sunting.sprite, terakhir: Sunting.terakhir.slice() };
  const nama = Object.keys(G.katalog.barang).filter(n => atlas[n]).slice(0, 3);
  for (const n of nama) Sunting.pakaiSprite(n);
  const h = { teks: $('#bangun').textContent, mini: document.querySelectorAll('#bangun .slot.mini').length, dipilih: nama.length, kartu };
  Sunting.terakhir = asal.terakhir; Sunting.sprite = asal.sprite; Sunting.lukisDok();
  return h;
});
cek('Edit Map: perabot yang terakhir dipakai tampil sebagai tombol, bukan teks "[object …]"', !dokTerakhir.teks.includes('[object') && dokTerakhir.dipilih === 3 && dokTerakhir.mini >= 2, JSON.stringify({ mini: dokTerakhir.mini, dipilih: dokTerakhir.dipilih }));
cek('katalog perabot: kategori di bilah sisi, ikon kecil tanpa tulisan (nama di hover)', await pg.evaluate(() => {
  const k = $('#sunting-katalog'), kartu = k.querySelector('.kartu');
  return k.querySelectorAll('.kat-sisi button').length > 5 && !k.querySelector('.kartu b') && !!kartu.title && kartu.getBoundingClientRect().width < 56;
}));
await pg.click('#sunting-katalog .kat-sisi button:nth-child(2)');
cek('klik kategori di bilah sisi menyaring isi katalog', await pg.evaluate(() => { const s = $('#sunting-katalog .kat-sisi button.aktif'); return s && s.dataset.kategori === Sunting.kat.kategori && Sunting.kat.kategori !== ''; }));
await pg.click('#sunting-katalog .kat-sisi button:nth-child(1)');
await pg.fill('#sunting-katalog input[type=search]', 'sofa krem');
await pg.click('#sunting-katalog .kartu[data-n=sofa_krem]');
const aku = await pg.evaluate(() => ({ x: G.aku.x, y: G.aku.y, gx: Math.floor(G.aku.x / 16), gy: Math.floor(G.aku.y / 16) }));
await klikPeta(aku.x + 48, aku.y - 30);
cek('admin menaruh perabot ke draf (gratis), katalog tetap terbuka', (await sofa())?.n === 'sofa_krem' && await pg.evaluate(() => G.peta.benda.length === 1 && Sunting.kotor && !!$('#sunting-katalog')));
cek('draf belum terlihat pemain lain', await pg2.evaluate(() => G.peta.benda.length === 0));
await pg.click('#bangun [data-alat=pilih]');
const s0 = await sofa();
await klikPeta(s0.x + 6, s0.y + 6);
cek('alat Pilih memilih benda dan menutup katalog', await pg.evaluate(() => Sunting.pilih === G.peta.benda[0].id && !$('#sunting-katalog')));
await pg.keyboard.press('Shift+ArrowRight'); await pg.keyboard.press('ArrowDown');
let s1 = await sofa();
cek('panah menggeser benda terpilih (Shift = 1 ubin)', s1.x === s0.x + 16 && s1.y === s0.y + 1, JSON.stringify([s0, s1]));
await pg.keyboard.press('Control+z'); await pg.keyboard.press('Control+z');
s1 = await sofa();
cek('Ctrl+Z mengurungkan geseran', s1.x === s0.x && s1.y === s0.y);
await seretPeta(s0.x + 6, s0.y + 6, s0.x + 6 + 32, s0.y + 6 - 16);
s1 = await sofa();
cek('seret memindah benda (jepret 8 piksel)', s1.x === s0.x + 32 && s1.y === s0.y - 16, JSON.stringify([s0, s1]));
await pg.click('#bangun [data-alat=tembok]');
await seretPeta((aku.gx + 4) * 16 + 8, (aku.gy - 5) * 16 + 8, (aku.gx + 8) * 16 + 8, (aku.gy - 4) * 16 + 8);
cek('tembok ditarik sebagai garis lurus', await pg.evaluate(([gx, gy]) => { const k = Object.keys(G.peta.tembok); return k.length === 5 && k.every(x => x.endsWith(',' + gy)) && (gx + ',' + gy) in G.peta.tembok; }, [aku.gx + 4, aku.gy - 5]));
await pg.click('#bangun [data-alat=halang]');
await seretPeta((aku.gx + 4) * 16 + 8, (aku.gy - 3) * 16 + 8, (aku.gx + 5) * 16 + 8, (aku.gy - 2) * 16 + 8);
cek('alat Penghalang menandai ubin yang tak bisa dilewati', await pg.evaluate(([gx, gy]) => Object.keys(G.peta.halang).length === 4 && G.grid.sel[gy * G.grid.w + gx] === 1, [aku.gx + 4, aku.gy - 3]));
await pg.keyboard.press('Control+z');
cek('penghalang bisa diurungkan', await pg.evaluate(() => Object.keys(G.peta.halang).length === 0));
await pg.evaluate(() => { Sunting.lantai = G.katalog.lantai[0]; Sunting.pakaiAlat('lantai'); });
await seretPeta((aku.gx + 4) * 16 + 8, (aku.gy - 3) * 16 + 8, (aku.gx + 6) * 16 + 8, (aku.gy - 2) * 16 + 8);
cek('lantai digambar sebagai kotak', await pg.evaluate(() => Object.keys(G.peta.lantai).length === 6));
await pg.click('#sunting-urung'); await pg.click('#sunting-urung');
cek('Urungkan membatalkan lantai lalu tembok', await pg.evaluate(() => !Object.keys(G.peta.lantai).length && !Object.keys(G.peta.tembok).length && G.peta.benda.length === 1));
// Selagi Edit Map karakter beku: tombol gerak menggeser kamera, bukan karakter.
const beku0 = await pg.evaluate(() => ({ x: G.aku.x, y: G.aku.y, kx: Sunting.kam.x }));
await tekan('d', 350);
const beku1 = await pg.evaluate(() => ({ x: G.aku.x, y: G.aku.y, kx: Sunting.kam.x }));
cek('Edit Map: karakter tidak bergerak, kamera yang bergeser', beku1.x === beku0.x && beku1.y === beku0.y && beku1.kx > beku0.kx + 20, JSON.stringify([beku0, beku1]));
await tekan('a', 350);
// Ruang: tarik kotak -> dinding keliling, lantai, satu pintu; bisa digeser, diubah, dan diurungkan.
await pg.evaluate(() => { Sunting.lantai = G.katalog.lantai[0]; });
await pg.click('#bangun [data-alat=ruang]');
await seretPeta((aku.gx + 4) * 16 + 8, (aku.gy - 7) * 16 + 8, (aku.gx + 9) * 16 + 8, (aku.gy - 3) * 16 + 8);
const ruang0 = await pg.evaluate(() => { const r = G.peta.ruang[0], e = Rumah.ubinEfektif(G.peta); return r && { gx: r.gx, w: r.w, h: r.h, pintu: r.pintu.length, tembok: Object.keys(e.tembok).length, lantai: Object.keys(e.lantai).length, pilih: Sunting.pilihRuang === r.id, alat: Sunting.alat }; });
cek('alat Ruang membuat ruang berdinding, berlantai, berpintu', ruang0 && ruang0.w === 6 && ruang0.h === 5 && ruang0.pintu === 1 && ruang0.tembok === 16 && ruang0.lantai === 30 && ruang0.pilih && ruang0.alat === 'pilih', JSON.stringify(ruang0));
await pg.keyboard.press('ArrowRight');
cek('panah menggeser ruang terpilih satu ubin', await pg.evaluate((gx) => G.peta.ruang[0].gx === gx + 1, ruang0.gx));
await pg.fill('#sunting-nama-ruang', 'Ruang Rapat'); await pg.keyboard.press('Tab');
await pg.click('#sunting-tambah-pintu');
cek('properti ruang: nama dan pintu tambahan', await pg.evaluate(() => G.peta.ruang[0].nama === 'Ruang Rapat' && G.peta.ruang[0].pintu.length === 2));
await pg.keyboard.press('Delete');
cek('Delete menghapus ruang terpilih', await pg.evaluate(() => G.peta.ruang.length === 0 && !Object.keys(Rumah.ubinEfektif(G.peta).tembok).length));
// Layer: benda bisa dipaksa ke lapis atas (di atas semua tokoh).
s1 = await sofa();      // sofa ikut bergeser bersama ruang tadi (pindah bersama isinya)
await pg.click('#bangun [data-alat=pilih]');
await klikPeta(s1.x + 6, s1.y + 6);
await pg.click('#bangun [data-lapis=atas]');
cek('layer benda bisa diubah ke Atas', await pg.evaluate(() => G.peta.benda[0].l === 'atas' && Rumah.urut.some(b => b.alas > 1e8)));
await pg.click('#bangun [data-alat=area]');
await seretPeta(s1.x - 10, s1.y - 10, s1.x + 60, s1.y + 50);
cek('Pilih area menangkap benda di dalam kotak', await pg.evaluate(() => Sunting.grup && Sunting.grup.ids.size === 1));
await pg.keyboard.press('Delete');
cek('Delete menghapus grup', await pg.evaluate(() => G.peta.benda.length === 0));
await pg.keyboard.press('Control+z');
cek('hapus grup bisa diurungkan', await pg.evaluate(() => G.peta.benda.length === 1));
await pg.click('#sunting-simpan');
await pg.waitForFunction(() => !Sunting.kotor && !Sunting.sibuk);
cek('Simpan menulis draf ke server', await pg.evaluate(() => G.peta.benda.length === 1 && G.peta.benda[0].l === 'atas' && G.peta.rev >= 1 && $('#sunting-kabar').textContent.includes('Tersimpan')));

// --- benda hidup (hidup.js): dok ringkas, kendaraan Bergerak, meja kerja berkursi, hewan air
const dokUji = await pg.evaluate(() => { const a = $('#bangun .slot.alat').getBoundingClientRect(); return { w: a.width, h: a.height, pilihan: getComputedStyle($('.sunting-pilihan')).flexWrap, dok: $('#bangun').getBoundingClientRect().height }; });
cek('Edit Map: tombol alat kecil, baris detail boleh dua baris, dok tetap pendek', dokUji.w <= 48 && dokUji.h <= 34 && dokUji.pilihan === 'wrap' && dokUji.dok <= 190, JSON.stringify(dokUji));
await pg.evaluate(() => Sunting.ubah((d) => {
  for (let gx = 1; gx <= 14; gx++) d.lantai[gx + ',44'] = 'lantai_kota_aspal';
  for (let gx = 20; gx <= 22; gx++) for (let gy = 43; gy <= 44; gy++) d.lantai[gx + ',' + gy] = 'lantai_luar_air';
  d.urut += 1; d.benda.push({ id: d.urut, n: 'kendaraan_sedan_diam', x: 32, y: 44 * 16 + 16 - 24, r: 0 });
  d.urut += 1; d.benda.push({ id: d.urut, n: 'meja_lurus', x: 26 * 16, y: 43 * 16, r: 0 });
  d.urut += 1; d.benda.push({ id: d.urut, n: 'hewan_koi_diam', x: 21 * 16, y: 43 * 16, r: 0 });
  d.urut += 1; d.benda.push({ id: d.urut, n: 'hewan_kura_diam', x: 30 * 16, y: 44 * 16, r: 0 });
}));
await pg.click('#bangun [data-alat=pilih]');
await pg.evaluate(() => { Sunting.pilih = Sunting.d.benda.find(o => o.n === 'kendaraan_sedan_diam').id; Sunting.lukisDok(); });
cek('Edit Map: kendaraan punya centang Bergerak, perabot lain tidak', await pg.evaluate(() => { const ada = !!$('#sunting-gerak') && !$('#sunting-gerak').checked;
  Sunting.pilih = Sunting.d.benda.find(o => o.n === 'meja_lurus').id; Sunting.lukisDok(); const tanpa = !$('#sunting-gerak');
  Sunting.pilih = Sunting.d.benda.find(o => o.n === 'kendaraan_sedan_diam').id; Sunting.lukisDok(); return ada && tanpa; }));
await pg.check('#sunting-gerak');
await pg.click('#sunting-simpan');
await pg.waitForFunction(() => !Sunting.kotor && !Sunting.sibuk);
await pg.keyboard.press('b');
await pg.waitForFunction(() => !G.bangun);
cek('kendaraan Bergerak tersimpan di server dan tidak menghalangi jalan', await pg.evaluate(() => { const o = G.peta.benda.find(o => o.n === 'kendaraan_sedan_diam'); return o.g === 1 && !G.peta.benda.find(o => o.n === 'meja_lurus').g && Rumah.jalanDi(2, 44) && Rumah.jalanDi(14, 44) && !Rumah.jalanDi(15, 44); }));
const mobilUji = await pg.evaluate(() => {
  const b = Rumah.urut.find(b => b.o.n === 'kendaraan_sedan_diam'), xs = [], nama = new Set();
  let diJalan = true, t = 1000;
  Rumah.mobil.clear();
  for (let i = 0; i < 1500; i++) { t += 0.08; const s = Rumah.kendara(b.o, b, t), q = Rumah.mobil.get(b.o.id); xs.push(s.x); nama.add(s.n.replace(/__f\d$/, ''));
    if (!q.diRumah && !Rumah.jalanDi(Math.floor(q.x / 16), Math.floor((q.y - 1) / 16))) diJalan = false; }
  Rumah.mobil.clear();
  return { min: Math.min(...xs), maks: Math.max(...xs), diJalan, nama: [...nama].sort() };
});
cek('kendaraan Bergerak menyusuri ubin jalan bolak-balik dengan sprite arahnya dan tidak keluar jalan', mobilUji.diJalan && mobilUji.maks - mobilUji.min > 120 && mobilUji.maks <= 15 * 16 && mobilUji.min >= 0
  && mobilUji.nama.includes('kendaraan_sedan_kanan') && mobilUji.nama.includes('kendaraan_sedan_kiri'), JSON.stringify(mobilUji));
const hewanUji = await pg.evaluate(() => {
  const jalan = (n, langkah) => { const b = Rumah.urut.find(b => b.o.n === n), kunci = 'uji-' + n, m = /^hewan_([a-z]+)_diam$/.exec(n)[1]; let t = 5000, air = true, gerak = 0, lama = null;
    for (let i = 0; i < langkah; i++) { t += 0.1; const s = Rumah.jelajah(kunci, m, { x: b.o.x - 64, y: b.y - 64, w: b.w + 128, h: b.h + 128 }, t, { rumah: { x: b.o.x, y: b.y } });
      const q = Rumah.hewan.get(kunci);
      if (!Rumah.ubinAir(Math.floor((q.x + 8) / 16), Math.floor((q.y + 10) / 16))) air = false; if (lama && (lama.x !== s.x || lama.y !== s.y)) gerak++; lama = s; }
    Rumah.hewan.delete(kunci); return { air, gerak }; };
  return { koi: jalan('hewan_koi_diam', 1500), kura: jalan('hewan_kura_diam', 600) };
});
cek('hewan air: koi berenang hanya di ubin air; kura-kura yang ditaruh di darat diam di tempatnya', hewanUji.koi.air && hewanUji.koi.gerak > 10 && hewanUji.kura.gerak === 0, JSON.stringify(hewanUji));
const mejaUji = await pg.evaluate(() => {
  const b = Rumah.urut.find(b => b.o.n === 'meja_lurus'), t = Rumah.interaksi().find(t => t.meja), buat = (n, w, h, r) => Rumah.kursiMeja({ o: { n, x: 0, y: 0, r }, y: 0, w, h, alas: h }).map(s => [s.x + 8, s.y + 14, s.hadap].join());
  const tabel = { hadap4: buat('meja_hadap4', 64, 40, 0).length, jejer3: buat('meja_jejer3', 96, 24, 0).join(' '), bos: buat('meja_bos', 48, 32, 0).join(), putar: buat('meja_lurus', 32, 24, 2).join(), berdiri: buat('meja_kerja_berdiri', 32, 32, 0).length };
  const asal = { x: G.aku.x, y: G.aku.y };
  t.aksi();
  return { label: t.label, tabel, asal, x: G.aku.x, y: G.aku.y, bx: b.o.x, by: b.y, hadap: G.duduk && G.duduk.kursi.hadap, terminal: Terminal.terbuka(), mejaAlas: b.alas };
});
await tunggu(300);
const dudukMeja = await pg.evaluate(() => ({ pose: G.aku.pose, alas: Rumah.alasEntitas(G.aku) }));
cek('meja kerja yang ditaruh: E mendudukkan karakter di kursinya (animasi mengetik) dan membuka Komputer', mejaUji.label === 'Duduk & buka Komputer' && mejaUji.x === mejaUji.bx + 8 && mejaUji.y === mejaUji.by + 10
  && mejaUji.hadap === 'atas' && mejaUji.terminal && /^main_[ab]$/.test(dudukMeja.pose) && dudukMeja.alas > mejaUji.mejaAlas, JSON.stringify([mejaUji, dudukMeja]));
cek('tabel kursi meja: hadap4 empat kursi, jejer3 tiga, bos menghadap layar, meja diputar pindah sisi, meja berdiri tanpa kursi', mejaUji.tabel.hadap4 === 4 && mejaUji.tabel.jejer3 === '8,10,atas 40,10,atas 72,10,atas'
  && mejaUji.tabel.bos === '16,7,bawah' && mejaUji.tabel.putar === '8,-2,bawah' && mejaUji.tabel.berdiri === 0, JSON.stringify(mejaUji.tabel));
await pg.keyboard.press('Escape'); await tunggu(200);
if (await pg.evaluate(() => !!G.duduk)) { await pg.evaluate(() => { Terminal.tutup && Terminal.tutup(); Mesin.berdiri(); }); await tunggu(150); }
cek('berdiri dari meja kerja mengembalikan karakter ke tempat semula', await pg.evaluate((a) => !G.duduk && Math.abs(G.aku.x - a.x) < 20 && Math.abs(G.aku.y - a.y) < 20, mejaUji.asal));
// rapikan: buang benda uji supaya uji berikutnya menemukan peta seperti semula, lalu kembali menyunting
await pg.keyboard.press('b');
await pg.waitForFunction(() => Sunting.aktif);
await pg.evaluate(() => Sunting.ubah((d) => { d.benda = d.benda.filter(o => !/^(kendaraan_sedan_diam|meja_lurus|hewan_koi_diam|hewan_kura_diam)$/.test(o.n)); for (const k of Object.keys(d.lantai)) if (/^(lantai_kota_aspal|lantai_luar_air)$/.test(d.lantai[k])) delete d.lantai[k]; }));
await pg.click('#sunting-simpan');
await pg.waitForFunction(() => !Sunting.kotor && !Sunting.sibuk);
await tunggu(400);
cek('perubahan peta utama tersiar ke pemain lain setelah Simpan', await pg2.evaluate(() => G.peta.benda.length === 1 && G.peta.benda[0].n === 'sofa_krem'));
// Koleksi peta: peta baru yang kosong punya denah dan NPC sendiri; berganti peta tersiar ke semua pemain.
const npcDiLayar = (hal) => hal.evaluate(() => [...G.entitas.values()].filter(e => e.jenis === 'npc').length);
await pg.click('#sunting-peta');
await pg.waitForSelector('.koleksi [data-peta]');
cek('koleksi peta: peta yang sedang dipakai terdaftar dan aktif', await pg.evaluate(() => document.querySelectorAll('.koleksi [data-peta]').length === 1 && $('.koleksi [data-peta]').textContent.includes('aktif')));
await pg.fill('#koleksi-nama', 'Uji Taman');
await pg.click('.koleksi form button.utama');
await pg.waitForFunction(() => document.querySelectorAll('.koleksi [data-peta]').length === 2);
await pg.click('.koleksi [data-peta]:nth-child(2) [data-aksi=aktifkan]');
await pg.waitForFunction(() => G.peta.dasar === 'kosong' && Sunting.aktif && !document.querySelector('#tirai'));
await tunggu(500);
cek('peta baru aktif: denah kosong, tanpa perabot dan tanpa NPC', await pg.evaluate(() => G.peta.benda.length === 0 && G.peta.lebar === 45) && (await npcDiLayar(pg)) === 0);
cek('pergantian peta tersiar ke pemain lain (denah dan NPC)', await pg2.evaluate(() => G.peta.dasar === 'kosong' && G.peta.benda.length === 0) && (await npcDiLayar(pg2)) === 0);
await pg.click('#sunting-peta');
await pg.waitForSelector('.koleksi [data-peta]:nth-child(1) [data-aksi=aktifkan]');
await pg.click('.koleksi [data-peta]:nth-child(1) [data-aksi=aktifkan]');
await pg.waitForFunction(() => G.peta.dasar === 'default' && Sunting.aktif && !document.querySelector('#tirai'));
await tunggu(500);
cek('kembali ke peta kantor: perabot dan NPC-nya utuh', await pg.evaluate(() => G.peta.benda.length === 1 && G.peta.benda[0].n === 'sofa_krem') && (await npcDiLayar(pg)) === 7 && (await npcDiLayar(pg2)) === 7);
await pg.click('#sunting-peta');
await pg.waitForSelector('.koleksi [data-peta]:nth-child(2) [data-aksi=hapus]');
await pg.click('.koleksi [data-peta]:nth-child(2) [data-aksi=hapus]');
await pg.click('.koleksi [data-peta]:nth-child(2) [data-aksi=hapus]');
await pg.waitForFunction(() => document.querySelectorAll('.koleksi [data-peta]').length === 1);
cek('peta yang tidak aktif bisa dihapus (diminta dua kali)', true);
await pg.keyboard.press('Escape');
// Generate peta (pembangkit Agent Pak): seed yang sama = peta yang sama; hasilnya draf yang bisa diurungkan.
const ringkasPeta = () => pg.evaluate(() => ({ dasar: G.peta.dasar, alas: G.peta.lantai_dasar, benda: G.peta.benda.length, halang: Object.keys(G.peta.halang).length, ruang: G.peta.ruang.length,
  lantai: Object.keys(G.peta.lantai).length, pertama: G.peta.benda.slice(0, 3).map(o => [o.n, o.x, o.y].join()).join(';'), kotor: Sunting.kotor }));
await pg.click('#sunting-generate');
await pg.waitForSelector('#gen-buat');
await pg.fill('#gen-benih', '12345'); await pg.keyboard.press('Tab');
await pg.click('.generator [data-jenis=pantai]');
await pg.click('#gen-buat');
const gen1 = await ringkasPeta();
cek('Generate peta: pantai dari seed menghasilkan lantai, air terhalang, perabot, dan satu ruang kantor', gen1.dasar === 'kosong' && gen1.benda > 20 && gen1.halang > 20 && gen1.lantai > 100 && gen1.ruang === 1 && gen1.kotor, JSON.stringify(gen1));
await pg.click('#gen-buat');
const gen2 = await ringkasPeta();
cek('seed yang sama menghasilkan peta yang sama', gen2.benda === gen1.benda && gen2.halang === gen1.halang && gen2.pertama === gen1.pertama && gen2.alas === gen1.alas, JSON.stringify(gen2));
await pg.keyboard.press('Escape');
await pg.keyboard.press('Control+z'); await pg.keyboard.press('Control+z');
const gen0 = await ringkasPeta();
cek('hasil generate bisa diurungkan sampai peta semula', gen0.dasar === 'default' && gen0.benda === 1 && gen0.halang === 0 && gen0.ruang === 0 && !gen0.kotor, JSON.stringify(gen0));
await pg.click('#bangun [data-alat=hapus]');
await klikPeta(s1.x + 6, s1.y + 6);
cek('alat Hapus membuang benda dari draf', await pg.evaluate(() => G.peta.benda.length === 0 && Sunting.kotor));
await pg.keyboard.press('b');
cek('keluar dengan draf kotor diminta dua kali', await pg.evaluate(() => Sunting.aktif && $('#sunting-kabar').textContent.includes('sekali lagi')));
await pg.keyboard.press('b');
cek('keluar kedua membuang draf: peta kembali ke yang tersimpan', await pg.evaluate(() => !Sunting.aktif && !G.bangun && G.peta.benda.length === 1 && !document.body.classList.contains('menyunting')));
cek('pemain biasa tak bisa menyunting peta utama', await pg2.evaluate(async () => !Rumah.bolehBangun() && (await fetch('/api/admin/peta/pasang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ barang: 'sofa_krem', x: 10, y: 10 }) })).status === 403));

// --- remote: hanya yang berizin, dan hanya ke jaringan yang didaftarkan
cek('tab Remote hanya untuk yang berizin', await pg.evaluate(() => G.remote) && await pg2.evaluate(() => !G.remote));
const cobaRemote = (hal, host) => hal.evaluate((host) => new Promise((res) => {
  const ws = new WebSocket('ws://' + location.host + '/ws/remote'); ws.binaryType = 'arraybuffer'; let teks = '';
  ws.onopen = () => ws.send(JSON.stringify({ proto: 'ssh', host, port: 22, user: 'admin', kolom: 80, baris: 24 }));
  ws.onmessage = (ev) => { teks += new TextDecoder().decode(ev.data); };
  ws.onclose = () => res(teks); setTimeout(() => { ws.close(); res(teks); }, 6000);
}), host);
cek('remote tanpa kode sekali pakai ditolak (admin sekalipun)', (await cobaRemote(pg, '127.0.0.1')).includes('Set dulu TOTP'));
// Pasang TOTP lewat Menu: password -> kunci tampil -> bukti kode.
await pg.evaluate(() => Panel.totp());
await pg.fill('#tirai input[type=password]', password); await pg.click('#tirai button.utama');
await pg.waitForSelector('#totp-rahasia');
const rahasiaTotp = (await pg.textContent('#totp-rahasia')).replace(/\s/g, '');
await pg.fill('#tirai input[inputmode=numeric]', '000000'); await pg.click('#tirai button.utama'); await tunggu(300);
cek('kode salah tidak memasang TOTP', await pg.evaluate(() => !G.totp && !!document.querySelector('#totp-rahasia')));
await pg.fill('#tirai input[inputmode=numeric]', totp(rahasiaTotp)); await pg.click('#tirai button.utama');
await pg.waitForFunction(() => G.totp && !document.querySelector('#tirai'));
cek('TOTP terpasang lewat Menu', await pg.evaluate(async () => { const t = await (await fetch('/api/totp')).json(); return t.terpasang && t.segar; }));
cek('remote ke loopback ditolak', (await cobaRemote(pg, '127.0.0.1')).includes('tidak boleh dituju'));
cek('remote ke luar jaringan ditolak', (await cobaRemote(pg, '8.8.8.8')).includes('di luar jaringan'));
cek('pemain tanpa izin ditolak remote', (await cobaRemote(pg2, '10.9.8.1')).includes('tidak punya izin'));

cek('NPC beraktivitas: ada yang berpindah atau berganti pose', JSON.stringify(await pg.evaluate(() => [...G.entitas.values()].filter(e => e.jenis === 'npc' && e.rumahX !== undefined).map(e => [e.x, e.y, e.pose].join()))) !== JSON.stringify(npcAwal));

// --- feedback: pemain mengirim dari Menu, admin membacanya di dashboard
await pg2.evaluate(() => Umpan.buka());
await pg2.selectOption('#umpan-jenis', 'bug');
await pg2.fill('#umpan-teks', 'Uji: kursi pantry tidak bisa diduduki.');
await pg2.click('#tirai button.utama');
await pg2.waitForFunction(() => !document.querySelector('#tirai'));
cek('feedback terkirim dari dalam game', true);

// --- ikon sprite selalu di tengah kotaknya dan muat (laporan yosi: ikon perabot melenceng ke pojok/bawah)
const ikonUji = await pg.evaluate(() => {
  const B = G.katalog.barang, nama = Object.keys(B).filter(n => atlas[n]), besar = nama.slice().sort((a, b) => Math.max(atlas[b].w, atlas[b].h) - Math.max(atlas[a].w, atlas[a].h)).slice(0, 12);
  const kecil = nama.filter(n => Math.max(atlas[n].w, atlas[n].h) <= 16).slice(0, 4), wadah = document.createElement('div');
  wadah.style.cssText = 'position:fixed;left:300px;top:300px;display:flex;gap:40px;';
  document.body.append(wadah);
  let terburuk = 0, luber = 0;
  for (const n of [...besar, ...kecil]) for (const maks of [26, 28, 40]) {
    const k = ikon(n, maks); wadah.replaceChildren(k);
    const a = k.getBoundingClientRect(), b = k.firstElementChild.getBoundingClientRect();
    terburuk = Math.max(terburuk, Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2), Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2));
    luber = Math.max(luber, b.width - a.width, b.height - a.height);
  }
  wadah.remove();
  return { terburuk, luber, terbesar: Math.max(atlas[besar[0]].w, atlas[besar[0]].h), n: besar.length + kecil.length };
});
cek('ikon sprite: selalu di tengah kotak dan tidak meluber, juga untuk sprite yang jauh lebih besar dari kotaknya', ikonUji.terburuk <= 0.6 && ikonUji.luber <= 0.6 && ikonUji.terbesar > 60 && ikonUji.n >= 12, JSON.stringify(ikonUji));

// --- suasana: siang dan malam mengikuti jam asli, lampu melubangi gelap, jam hidup (kata yosi, mengikuti Agent Pak)
const suasanaUji = await pg.evaluate(() => {
  const jam = (j, m = 0) => Suasana.fase(new Date(2026, 0, 5, j, m), 'ikut'), bulat = (v) => Math.round(v * 1000) / 1000;
  const kv = document.createElement('canvas'); kv.width = 300; kv.height = 300;
  const k = kv.getContext('2d'), terang = (x, y) => { const p = k.getImageData(x, y, 1, 1).data; return p[0] + p[1] + p[2]; };
  const lukis = (f, lampu, ruang) => { k.globalCompositeOperation = 'source-over'; k.setTransform(1, 0, 0, 1, 0, 0); k.fillStyle = '#ffffff'; k.fillRect(0, 0, 300, 300); Suasana.gambarMalam(k, kv, [], f, lampu, ruang); };
  const kam = G.kamera, sk = kam.skala, dunia = (px, py) => ({ x: px / sk + kam.x, y: py / sk + kam.y });
  const pusat = dunia(150, 150), malam = Suasana.fase(new Date(), 'malam');
  lukis(Suasana.fase(new Date(), 'siang'), [], []); const siang = terang(20, 20);
  lukis(malam, [], []); const gelap = terang(20, 20);
  lukis(malam, [{ x: pusat.x, y: pusat.y, r: 60 / sk, k: 1, hangat: true }], []); const diLampu = terang(150, 150), jauh = terang(10, 10);
  const pojok = dunia(200, 200);
  lukis(malam, [], [[pojok.x, pojok.y, 80 / sk, 80 / sk]]); const diRuang = terang(240, 240), luarRuang = terang(60, 60);
  const semu = [{ n: 'lampu_lantai', x: 100, y: 100, w: 16, h: 32 }, { n: 'lampu_meja_hijau', x: 0, y: 0, w: 16, h: 16 }, { n: 'luar_lampu_jalan', x: 0, y: 0, w: 16, h: 48 }, { n: 'lampu_disko', x: 0, y: 0, w: 16, h: 16 }, { n: 'tv_konsol', x: 0, y: 0, w: 32, h: 24 }, { n: 'sofa_krem', x: 0, y: 0, w: 32, h: 16 }];
  const c = Suasana.cahaya([{ x: 50, y: 50, pose: 'main_a' }, { x: 80, y: 50, pose: '' }], semu);
  return { siangTengah: jam(12).gelap, pagi: jam(6).gelap, malam19: jam(19).gelap, malam2: jam(2).gelap, fajar: bulat(jam(5, 15).gelap), senja: bulat(jam(18, 7, 30).gelap), semburatSenja: !!jam(18).semburat, semburatSiang: jam(12).semburat,
    siang, gelap, diLampu, jauh, diRuang, luarRuang, lampu: c.filter(x => x.hangat).map(x => x.r).join(), layar: c.filter(x => !x.hangat && !x.monitor && x.r === 42).length, monitor: c.filter(x => x.monitor).length,
    jamHud: $('#hud-jam').textContent, jamAsli: String(new Date().getHours()).padStart(2, '0') + '.' + String(new Date().getMinutes()).padStart(2, '0') };
});
cek('suasana: jadwal gelap mengikuti jam (siang terang, 19.00–04.30 gelap 74%, fajar dan senja berangsur dengan semburat)', suasanaUji.siangTengah === 0 && suasanaUji.pagi === 0 && suasanaUji.malam19 === 0.74 && suasanaUji.malam2 === 0.74
  && suasanaUji.fajar === 0.37 && suasanaUji.senja > 0.3 && suasanaUji.senja < 0.42 && suasanaUji.semburatSenja && suasanaUji.semburatSiang === null, JSON.stringify(suasanaUji));
cek('suasana: malam menggelapkan layar; lampu dan ruang berpenghuni tetap terang', suasanaUji.siang === 765 && suasanaUji.gelap < 300 && suasanaUji.diLampu > 700 && suasanaUji.jauh < 300 && suasanaUji.diRuang > suasanaUji.luarRuang + 300, JSON.stringify(suasanaUji));
cek('suasana: perabot lampu jadi sumber cahaya menurut jenisnya, layar ikut menyala, monitor hanya saat dipakai, lampu disko tidak', suasanaUji.lampu === '55,42,70' && suasanaUji.layar === 1 && suasanaUji.monitor === 1, JSON.stringify(suasanaUji));
cek('jam di menu atas menunjukkan jam asli', /^\d\d\.\d\d$/.test(suasanaUji.jamHud) && Math.abs(Number(suasanaUji.jamHud.replace('.', '')) - Number(suasanaUji.jamAsli.replace('.', ''))) <= 1, JSON.stringify([suasanaUji.jamHud, suasanaUji.jamAsli]));
const jamUji = await pg.evaluate(() => {
  const kv = document.createElement('canvas'); kv.width = 64; kv.height = 32;
  const k = kv.getContext('2d'), merah = (x0, y0, w, h) => { const d = k.getImageData(x0, y0, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 160) n++; return n; };
  Suasana.gambarJam(k, new Date(2026, 0, 5, 18, 11, 3), [{ n: 'jam_digital', x: 0, y: 0, w: 32, h: 16 }, { n: 'jam_dinding', x: 40, y: 8, w: 16, h: 16 }]);
  const putih = k.getImageData(45, 14, 1, 1).data;
  return { digit1: merah(7, 6, 3, 5), digit8: merah(12, 6, 3, 5), muka: putih[0] > 200 && putih[3] === 255 };
});
cek('jam digital dan jam dinding yang ditaruh menunjukkan jam asli', jamUji.digit1 === 8 && jamUji.digit8 === 13 && jamUji.muka, JSON.stringify(jamUji));
await pg.evaluate(() => { Panel.menu(); });
await pg.waitForSelector('#menu-waktu');
await pg.selectOption('#menu-waktu', 'malam');
cek('Menu: siang dan malam bisa dipaksa per peramban, bawaannya ikut jam asli', await pg.evaluate(() => { const m = Suasana.fase().gelap === 0.74 && $('#hud-jam').dataset.fase === 'malam' && localStorage.getItem('kevi.waktu') === 'malam'; Suasana.pilih('ikut'); return m && Suasana.pilihan() === 'ikut'; }));
await pg.evaluate(() => Panel.tutup());

// --- lantai menyambung sampai tembok tegak; tembok menutupi perabot di belakangnya (laporan yosi)
const lantaiTembok = await pg.evaluate(() => {
  const d = Rumah.d, simpan = { lantai: d.lantai, tembok: d.tembok, benda: d.benda, ruang: d.ruang };
  // tembok tegak di kolom 6 (baris 5–8), lantai parket di kolom 7–9; tembok mendatar di baris 9 (kolom 6–9)
  d.ruang = []; d.lantai = {}; d.tembok = {}; d.benda = simpan.benda.concat([{ id: 99991, n: 'lampu_lantai', x: 8 * 16, y: 9 * 16 - 20, r: 0 }, { id: 99992, n: 'lampu_lantai', x: 9 * 16, y: 9 * 16 + 4, r: 0 }]);
  for (let gy = 5; gy <= 8; gy++) { d.tembok['6,' + gy] = '#8b9bb4'; for (let gx = 7; gx <= 9; gx++) d.lantai[gx + ',' + gy] = 'lantai_parket'; }
  for (let gx = 6; gx <= 9; gx++) d.tembok[gx + ',9'] = '#8b9bb4';
  Rumah.segarkan();
  const k = Rumah.latar.getContext('2d'), oy = Rumah.oy, rgb = (x, y) => [...k.getImageData(x, y + oy, 1, 1).data].slice(0, 3).join();
  const parket = rgb(7 * 16 + 8, 6 * 16 + 8), kananTembok = rgb(6 * 16 + 13, 6 * 16 + 8), kiriTembok = rgb(6 * 16 + 2, 6 * 16 + 8), tanahLuar = rgb(5 * 16 + 8, 6 * 16 + 8);
  const J = oy / 16, ubin = Rumah.tembokUbin.map(u => u.join()), urut = (id) => Rumah.urut.find(b => b.o.id === id).alas, dasarTembok = (9 + J + 1) * 16;
  const hasil = { parket, kananTembok, kiriTembok, tanahLuar, ubin: ubin.length, adaUbin: ubin.includes('8,' + (9 + J)), belakang: urut(99991), depan: urut(99992), dasarTembok, kv: !!Rumah.tembokKv };
  Object.assign(d, simpan); Rumah.segarkan();
  return hasil;
});
cek('Edit Rumah: lantai menyambung sampai ke tembok tegak (tanpa celah tanah), sisi luar tembok tetap tanah', lantaiTembok.kananTembok === lantaiTembok.parket && lantaiTembok.kiriTembok !== lantaiTembok.parket && lantaiTembok.tanahLuar !== lantaiTembok.parket, JSON.stringify(lantaiTembok));
cek('tembok ikut urutan kedalaman: perabot di belakang tembok bawah tertutup, yang di depannya tidak', lantaiTembok.kv && lantaiTembok.ubin === 8 && lantaiTembok.adaUbin && lantaiTembok.belakang <= lantaiTembok.dasarTembok && lantaiTembok.depan > lantaiTembok.dasarTembok, JSON.stringify(lantaiTembok));

// --- sudut tembok menyatu (laporan yosi): balok mendatar tidak menjorok keluar dari sisi luar tembok tegak
const sudutUji = await pg.evaluate(() => {
  const kv = document.createElement('canvas'); kv.width = 64; kv.height = 64;
  const k = kv.getContext('2d'), isi = (x, y) => k.getImageData(x, y, 1, 1).data[3] > 0;
  const gambar = (ubin) => { k.clearRect(0, 0, 64, 64); const peta = new Map(ubin.map(u => [u, '#8b9bb4'])); for (const u of ubin) { const [x, y] = u.split(',').map(Number); Rumah.lukisTembok(k, peta, x, y, '#8b9bb4'); } };
  gambar(['1,1', '2,1', '1,2']);            // sudut kiri atas: tembok ke kanan dan ke bawah
  const kiriAtas = { luar: isi(16 + 2, 16 + 4), dalam: isi(16 + 7, 16 + 4), sambungKanan: isi(16 + 15, 16 + 4), tegakBawah: isi(16 + 7, 32 + 8), luarBawah: isi(16 + 2, 32 + 8) };
  gambar(['1,2', '2,2', '2,1']);            // sudut kanan bawah: tembok ke kiri dan ke atas
  const kananBawah = { luar: isi(32 + 13, 32 + 4), dalam: isi(32 + 7, 32 + 4), sambungKiri: isi(32 + 0, 32 + 4), tegakAtas: isi(32 + 7, 16 + 8) };
  gambar(['1,1', '2,1', '3,1']);            // tembok lurus: tetap selebar ubin penuh
  const lurus = { kiri: isi(16 + 1, 16 + 4), kanan: isi(48 + 14, 16 + 4) };
  // Tembok bertumpuk dua baris: baris atas polos (tanpa muka depan), muka depan hanya di baris bawah.
  const warna = (x, y) => [...k.getImageData(x, y, 1, 1).data].slice(0, 3).join();
  gambar(['1,1', '2,1', '3,1', '1,2', '2,2', '3,2']);
  const tumpuk = { atasPolos: warna(32 + 8, 16 + 12) === warna(32 + 8, 16 + 3) && warna(32 + 5, 16 + 12) === warna(32 + 8, 16 + 3), bawahBermuka: warna(32 + 8, 32 + 12) !== warna(32 + 8, 32 + 3),
    sambung: warna(32 + 8, 16 + 15) === warna(32 + 8, 32 + 0) };
  return { kiriAtas, kananBawah, lurus, tumpuk };
});
cek('tembok: sudut menyatu, balok mendatar berhenti di sisi luar tembok tegak; tembok lurus tetap penuh', !sudutUji.kiriAtas.luar && sudutUji.kiriAtas.dalam && sudutUji.kiriAtas.sambungKanan && sudutUji.kiriAtas.tegakBawah && !sudutUji.kiriAtas.luarBawah
  && !sudutUji.kananBawah.luar && sudutUji.kananBawah.dalam && sudutUji.kananBawah.sambungKiri && sudutUji.kananBawah.tegakAtas && sudutUji.lurus.kiri && sudutUji.lurus.kanan, JSON.stringify(sudutUji));
cek('tembok bertumpuk atas-bawah menyatu jadi satu bidang, muka depan hanya di baris terbawah', sudutUji.tumpuk.atasPolos && sudutUji.tumpuk.bawahBermuka && sudutUji.tumpuk.sambung, JSON.stringify(sudutUji.tumpuk));

// --- menu atas: wajah + nama, bilah berlabel dan berangka; pita versi baru
const hudUji = await pg.evaluate(() => {
  const kv = $('#hud-wajah'), px = kv.getContext('2d').getImageData(0, 0, kv.width, kv.height).data;
  let isi = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 40) isi++;
  const kotak = (s) => $(s).getBoundingClientRect();
  return { isi: isi / (kv.width * kv.height), nama: $('#hud-nama').textContent, namaDiBawah: kotak('#hud-nama').top >= kotak('#hud-wajah').bottom - 1, kiri: kotak('#hud-potret').left < kotak('#hud-level').left,
    label: [...document.querySelectorAll('.hud-ukur em')].map(e => e.textContent).join(), xp: $('#hud-xp-angka').textContent, health: $('#hud-health-angka').textContent, stamina: $('#hud-stamina-angka').textContent,
    lv: G.level, st: G.stamina, versi: Jaring.versiServer, pita: !!$('#versi-baru') };
});
cek('menu atas: wajah karakter tergambar di pojok kiri dengan nama di bawahnya', hudUji.isi > 0.3 && hudUji.nama === 'Penguji Satu' && hudUji.namaDiBawah && hudUji.kiri, JSON.stringify(hudUji));
cek('menu atas: bilah berlabel XP, Health, Stamina dengan angkanya', hudUji.label === 'XP,Health,Stamina' && hudUji.xp === (hudUji.lv.lanjut ? `${hudUji.lv.xp - hudUji.lv.dasar}/${hudUji.lv.lanjut - hudUji.lv.dasar}` : 'Maks')
  && /^\d+\/\d+$/.test(hudUji.health) && hudUji.health.endsWith('/' + hudUji.lv.stamina) && hudUji.stamina === Math.round(hudUji.st.nilai) + '/' + hudUji.st.maks, JSON.stringify(hudUji));
await pg.click('#hud-potret');
await pg.waitForSelector('#tirai .profil');
cek('menu atas: klik wajah membuka profil sendiri', (await pg.textContent('#tirai .panel')).includes('Profil'));
await pg.evaluate(() => Panel.tutup());
cek('versi: server mengabarkan versinya saat menyambung, halaman yang sama versinya tanpa pita', hudUji.versi === await pg.evaluate(() => document.documentElement.dataset.versi) && hudUji.versi.length > 0 && !hudUji.pita, JSON.stringify(hudUji.versi));
const hudAtas0 = await pg.evaluate(() => $('#hud').getBoundingClientRect().top);
const pitaUji = await pg.evaluate(() => { Versi.periksa('99.0.0', VERSI_ASET); Versi.periksa('99.0.1', VERSI_ASET); const p = document.querySelectorAll('#versi-baru');
  return { n: p.length, teks: p[0].textContent, tombol: !!p[0].querySelector('button'), bawah: p[0].getBoundingClientRect().bottom, hud: $('#hud').getBoundingClientRect().top, z: Number(getComputedStyle(p[0]).zIndex) }; });
cek('versi: server berversi lain memunculkan satu pita menonjol dengan cara muat ulang, menu atas turun di bawahnya', pitaUji.n === 1 && pitaUji.teks.includes('Versi baru Kevi 99.0.0 tersedia') && pitaUji.teks.includes('Ctrl + Shift + R')
  && pitaUji.tombol && pitaUji.hud >= pitaUji.bawah && pitaUji.hud > hudAtas0 && pitaUji.z > 40, JSON.stringify(pitaUji));
await pg.evaluate(() => { $('#versi-baru').remove(); document.body.classList.remove('ada-versi-baru'); });

// --- dashboard admin
const adm = await (await pg.context()).newPage();
adm.on('pageerror', e => galat.push('pageerror(admin): ' + e.message));
await adm.goto(`http://127.0.0.1:${port}/admin`);
await adm.waitForFunction(() => document.querySelectorAll('#ubin div').length >= 8 && document.querySelectorAll('#t-pemakai tbody tr').length >= 2, null, { timeout: 10000 });
cek('dashboard: ringkasan dan daftar pemakai terisi', (await adm.textContent('#ubin')).includes('Koin beredar'));
cek('dashboard: dua pemain tercatat daring', (await adm.$$('#t-daring tbody tr')).length === 2);
await adm.click('#tab-umpan');
await adm.waitForFunction(() => document.querySelector('#t-umpan tbody')?.textContent.includes('kursi pantry'));
cek('dashboard: feedback pemain tampil dengan jenis, tempat, dan hitungan baru', await adm.evaluate(() => { const t = document.querySelector('#t-umpan tbody tr').textContent; return t.includes('bug') && t.includes('baru') && document.querySelector('#tab-umpan').textContent.includes('(1)'); }));
await adm.click('#t-umpan tbody tr button.hijau');
await adm.waitForFunction(() => document.querySelector('#t-umpan tbody tr').textContent.includes('selesai'));
cek('dashboard: feedback bisa ditandai selesai', await adm.evaluate(() => document.querySelector('#tab-umpan').textContent === 'Feedback'));
await adm.click('#tab [data-bagian=ringkasan]');
await adm.click('#tab button[data-bagian=peta]');
await adm.waitForFunction(() => document.querySelectorAll('#peta-daftar .butir-peta').length === 7);
await adm.click('#titik-baru'); await adm.click('#peta', { position: { x: 200, y: 300 } });
await adm.click('#npc-baru'); await adm.fill('#peta-sunting input >> nth=0', 'Pak Uji');
await adm.click('#peta-simpan'); await tunggu(900);
const dunia = await pg.evaluate(() => ({ titik: G.titik.length, npc: [...G.entitas.values()].filter(e => e.jenis === 'npc').map(e => e.nama), tanda: Rumah.titik.filter(b => b.tanda).length }));
cek('atur peta: titik dan NPC baru langsung muncul di game', dunia.titik === 1 && dunia.npc.includes('Pak Uji') && dunia.tanda === 1, JSON.stringify(dunia));
await adm.click('#tab button[data-bagian=atur]');
await adm.fill('#at-laju_jalan', '120'); await adm.click('#f-atur button.utama'); await tunggu(700);
cek('pengaturan kecepatan jalan langsung berlaku', await pg.evaluate(() => G.atur.laju_jalan === 120));
// --- battle: admin memanggil gelombang, zombie datang, dipukul dengan Spasi sampai tumbang, koin jatuh dipungut
cek('dashboard: pengaturan battle tampil dengan sakelar mati sebagai bawaan', await adm.evaluate(() => !$('#at-zombie_aktif').checked && $('#at-zombie_menit').value === '15' && !!$('#zombie-panggil')));
await adm.evaluate(() => ambil('/api/admin/pengaturan', { zombie_jumlah: 1, zombie_hp: 50 }));
await pg.evaluate(async () => { if (Panel.terbuka()) Panel.tutup(); if (G.adegan !== 'kantor') await Mesin.pindah('kantor'); });
await tunggu(500);
const battle0 = await pg.evaluate(() => ({ xp: G.level.xp, koin: G.koin, suasana: Suara.suasanaKini, zombie: Battle.z.size, jago: [...G.entitas.values()].some(e => e.jenis === 'npc' && e.nama === 'Bang Jago') }));
await adm.click('#zombie-panggil');
await pg.waitForFunction(() => Battle.z.size === 1, null, { timeout: 8000 });
const zombie0 = await pg.evaluate(() => { const z = [...Battle.z.values()][0]; return { jenis: z.jenis, hp: z.hp, maks: z.maks, suasana: Suara.suasanaKini, kelas: document.body.classList.contains('ada-zombie'), lagu: Suara.lagu, rupa: !!bingkaiTokoh(z.look, 'bawah_diam') }; });
cek('battle: gelombang yang dipanggil admin memunculkan zombie dan musik berganti tegang', battle0.zombie === 0 && battle0.suasana === 'tenang' && battle0.jago && zombie0.maks === 3 && zombie0.suasana === 'tegang' && zombie0.lagu === 'tegang' && zombie0.kelas && zombie0.rupa, JSON.stringify([battle0, zombie0]));
const rupaZombie = await pg.evaluate(() => {
  const kv = document.createElement('canvas'); kv.width = 96; kv.height = 48;
  const k = kv.getContext('2d'), buat = (id, jenis, arah, x) => ({ id, jenis, x, y: 18, tx: x, ty: 18, hp: 6, maks: 6, arah, jalan: false, langkah: 0, kena: 0, look: Battle.look(jenis), pose: '' });
  // kolom paling kanan yang berisi piksel pada rentang baris tertentu, relatif pojok kiri tokoh
  const tepiKanan = (x0, y0, y1) => { const d = k.getImageData(x0 - 4, y0, 30, y1 - y0).data; let kanan = -99; for (let y = 0; y < y1 - y0; y++) for (let x = 0; x < 30; x++) if (d[(y * 30 + x) * 4 + 3] > 120) kanan = Math.max(kanan, x - 4); return kanan; };
  const isi = (x0) => { const d = k.getImageData(x0 - 4, 10, 30, 34).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 120) n++; return n; };
  k.imageSmoothingEnabled = false;
  const z = buat(0, 'biasa', 'kanan', 8);
  Battle.lukisZombie(k, z, performance.now());
  const lengan = tepiKanan(8, 18 + 5, 18 + 13), kaki = tepiKanan(8, 18 + 15, 18 + 21), v = Battle.varian(z), besar = Battle.varian(buat(1, 'besar', 'bawah', 0)), gesit = Battle.varian(buat(1, 'gesit', 'bawah', 0));
  Battle.lukisZombie(k, buat(5, 'besar', 'bawah', 60), performance.now());
  const varianBiasa = new Set([0, 1, 2, 3, 4, 5].map(id => (Battle.varian(buat(id, 'biasa', 'bawah', 0)) || {}).nama));
  return { lengan, kaki, nama: v && v.nama, bingkai: v && v.bingkai, jatuh: v && v.jatuh, besar: besar && besar.nama, gesit: gesit && gesit.nama, isiBesar: isi(60), varianBiasa: [...varianBiasa].sort().join(),
    senjata: ['sapu', 'kunci_inggris', 'tongkat_bisbol', 'kabel_lan', 'pemadam_api'].every(s => atlas['senjata_' + s] && atlas['senjata_' + s + '_pegang']), petunjuk: ($('#battle-petunjuk') || {}).textContent || '' };
});
cek('zombie memakai sprite khususnya: tiga rupa zombie biasa bergiliran, gesit dan besar punya sprite sendiri, empat bingkai jalan per arah, tiga bingkai jatuh', rupaZombie.varianBiasa === 'biasa_a,biasa_b,biasa_c' && rupaZombie.besar === 'besar'
  && rupaZombie.gesit === 'gesit' && ['bawah', 'atas', 'kiri', 'kanan'].every(a => rupaZombie.bingkai[a] === 4) && rupaZombie.jatuh === 3 && rupaZombie.isiBesar > 150 && rupaZombie.senjata, JSON.stringify(rupaZombie));
cek('zombie bertangan lurus ke depan (lengan menjulur melewati kaki saat menghadap samping); petunjuk cara memukul tampil selama serangan', rupaZombie.lengan >= rupaZombie.kaki + 2
  && rupaZombie.petunjuk.includes('Spasi atau klik') && rupaZombie.petunjuk.includes('Tangan kosong bisa'), JSON.stringify(rupaZombie));
// jalur sprite Kevi: begitu sprite zombie terpasang di atlas, zombie memakainya (bergiliran antarvarian); tanpa itu tokoh hijau
const spriteUji = await pg.evaluate(() => {
  const buatGambar = (warna, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = warna; x.fillRect(0, 0, w, h); return c; };
  const pasang = [];
  const asli = {};
  for (const [v, warna] of [['biasa_a', '#ff00ff'], ['biasa_b', '#00ffff']]) {
    for (const arah of ['bawah', 'atas', 'kiri', 'kanan']) for (let n = 0; n < 4; n++) { const nama = `zombie_${v}_${arah}_${n}`; asli[nama] = atlas[nama]; if (n >= 2) { delete atlas[nama]; continue; } atlas[nama] = { x: 0, y: 0, w: 16, h: 20, g: buatGambar(warna, 16, 20) }; pasang.push(nama); }
    for (let n = 0; n < 3; n++) { const nama = `zombie_${v}_jatuh_${n}`; asli[nama] = atlas[nama]; delete atlas[nama]; }
    atlas[`zombie_${v}_jatuh_0`] = { x: 0, y: 0, w: 20, h: 12, g: buatGambar('#ffff00', 20, 12) };
  }
  const kv = document.createElement('canvas'); kv.width = 64; kv.height = 48;
  const k = kv.getContext('2d'), titik = (x, y) => [...k.getImageData(x, y, 1, 1).data].slice(0, 3).join();
  const z = (id, jenis) => ({ id, jenis, x: 8, y: 16, tx: 8, ty: 16, hp: 6, maks: 6, arah: 'bawah', jalan: false, langkah: 0, kena: 0, look: Battle.look(jenis), pose: '' });
  for (const arah of ['bawah', 'atas', 'kiri', 'kanan']) for (let n = 0; n < 4; n++) { const nama = `zombie_biasa_c_${arah}_${n}`; asli[nama] = atlas[nama]; delete atlas[nama]; asli[`zombie_besar_${arah}_${n}`] = atlas[`zombie_besar_${arah}_${n}`]; delete atlas[`zombie_besar_${arah}_${n}`]; }
  const a = z(2, 'biasa'), b = z(3, 'biasa'), besar = z(4, 'besar');
  Battle.lukisZombie(k, a, performance.now()); const warnaA = titik(16, 26);
  k.clearRect(0, 0, 64, 48); Battle.lukisZombie(k, b, performance.now()); const warnaB = titik(16, 26);
  k.clearRect(0, 0, 64, 48); Battle.lukisBangkai(k, { x: 8, y: 16, jenis: 'biasa', lahir: performance.now(), varian: Battle.varian(a) }, performance.now()); const jatuh = titik(16, 30);
  const hasil = { a: Battle.varian(a).nama, b: Battle.varian(b).nama, bingkai: Battle.varian(a).bingkai.kiri, besar: Battle.varian(besar), warnaA, warnaB, jatuh };
  for (const [n, v] of Object.entries(asli)) { if (v) atlas[n] = v; else delete atlas[n]; }
  return hasil;
});
cek('sprite zombie: yang terpasang di atlas dipakai bergiliran antarvarian, lengkap dengan bingkai jatuh; jenis tanpa sprite tetap memakai tokoh sementara', spriteUji.a === 'biasa_a' && spriteUji.b === 'biasa_b'
  && spriteUji.bingkai === 2 && spriteUji.besar === null && spriteUji.warnaA === '255,0,255' && spriteUji.warnaB === '0,255,255' && spriteUji.jatuh === '255,255,0', JSON.stringify(spriteUji));
// Laporan yosi: klik mouse tidak memukul. Satu klik di peta, lalu di atas zombie, masing-masing harus mengirim satu pukulan.
await pg.evaluate(() => { window.__pukul = 0; const asli = Jaring.kirim; Jaring.kirim = function (m) { if (m && m.t === 'pukul') window.__pukul++; return asli.call(this, m); }; });
await tunggu(400);
await pg.mouse.click(683, 330);
await tunggu(450);
const zLayar = await pg.evaluate(() => { const z = [...Battle.z.values()][0], p = Mesin.keLayar(z.x + 8, z.y + 10), r = kanvas.getBoundingClientRect(), k = kanvas.width / r.width; return { x: r.left + p.x / k, y: r.top + p.y / k, di: document.elementFromPoint(683, 330).id, skala: k }; });
await pg.mouse.click(Math.max(5, Math.min(1360, zLayar.x)), Math.max(120, Math.min(600, zLayar.y)));
await tunggu(200);
const klikUji = await pg.evaluate(() => ({ terkirim: window.__pukul, sibuk: Mesin.sibuk(), duduk: !!G.duduk, adegan: G.adegan, fokus: document.activeElement.tagName }));
cek('battle: klik mouse di peta maupun di atas zombie mengirim pukulan', klikUji.terkirim === 2 && zLayar.di === 'dunia', JSON.stringify([klikUji, zLayar]));
let pukulan = 0, kenaTerlihat = false;
for (let i = 0; i < 60 && await pg.evaluate(() => Battle.z.size > 0); i++) {          // datangi zombienya, lalu Spasi
  await pg.evaluate(() => { const z = [...Battle.z.values()][0]; if (!z) return; G.aku.x = z.tx + 12; G.aku.y = z.ty; Jaring.kirim({ t: 'pos', x: G.aku.x, y: G.aku.y, arah: 'kiri', jalan: false, pose: '' }); });
  await tunggu(120);
  if (i % 2) await pg.keyboard.press('Space'); else await pg.mouse.click(683, 330);      // bergantian: Spasi dan klik di peta
  pukulan++;
  await tunggu(430);
  kenaTerlihat = kenaTerlihat || await pg.evaluate(() => [...Battle.z.values()].some(z => z.hp < z.maks) || Battle.bangkai.length > 0);
}
const battle1 = await pg.evaluate(() => ({ zombie: Battle.z.size, bangkai: Battle.bangkai.length, koin: Battle.koin.size, xp: G.level.xp, suasana: Suara.suasanaKini }));
cek('battle: Spasi maupun klik memukul zombie terdekat dengan tangan kosong sampai tumbang; EXP bertambah dan koin jatuh', battle1.zombie === 0 && kenaTerlihat && pukulan >= 3 && battle1.xp > battle0.xp && battle1.suasana === 'tenang', JSON.stringify([battle1, pukulan]));
await pg.evaluate(() => { const c = [...Battle.koin.values()][0]; if (c) { G.aku.x = c.x - 8; G.aku.y = c.y - 14; Jaring.kirim({ t: 'pos', x: G.aku.x, y: G.aku.y, arah: 'bawah', jalan: false, pose: '' }); } });
await pg.waitForFunction((k) => Battle.koin.size === 0 && G.koin > k, battle0.koin, { timeout: 6000 }).catch(() => {});
cek('battle: koin jatuh dipungut dengan menginjaknya', await pg.evaluate((k) => Battle.koin.size === 0 && G.koin > k, battle0.koin), JSON.stringify(await pg.evaluate(() => ({ koin: G.koin, sisa: Battle.koin.size }))));
// senjata: dibeli di Bang Jago (terkunci level), dipegang dari hotbar
const senjataUji = await pg.evaluate(async () => {
  Battle.toko();
  const kartu = (k) => $('#tirai [data-senjata="' + k + '"]'), sebelum = G.koin, pemadam = kartu('pemadam_api').className, level = G.level.level;
  kartu('sapu').click();
  await new Promise(r => setTimeout(r, 500));
  const punya = G.inventori['senjata:sapu'] || 0, bayar = sebelum - G.koin, kartuSesudah = kartu('sapu').disabled;
  Panel.tutup();
  G.tata.hotbar[9] = 'senjata:sapu'; Hotbar.pilih = 9;
  const dipegang = Battle.senjata(), petunjuk = Hotbar.petunjuk('senjata:sapu');
  Hotbar.pilih = -1;
  return { pemadam, level, punya, bayar, kartuSesudah, dipegang, petunjuk, jual: hargaJual('senjata:sapu') };
});
cek('battle: senjata dibeli di Bang Jago (satu saja), yang berlevel tinggi bergembok, dipegang dari hotbar', senjataUji.punya === 1 && senjataUji.bayar === 150 && senjataUji.kartuSesudah && senjataUji.pemadam.includes('gembok')
  && senjataUji.dipegang === 'sapu' && senjataUji.petunjuk.includes('Spasi') && senjataUji.jual === null, JSON.stringify(senjataUji));
// barang hotbar terlihat dipegang (juga oleh rekan), senjata terlihat dibawa dan terayun saat memukul
const pegangUji = await pg.evaluate(async () => {
  G.tata.hotbar[9] = 'senjata:sapu'; G.tata.hotbar[8] = 'pakan'; Hotbar.pegang(9);
  await new Promise(r => setTimeout(r, 500));
  const kv = document.createElement('canvas'); kv.width = 80; kv.height = 40;
  const k = kv.getContext('2d'), warna = (x0, w, uji) => { const d = k.getImageData(x0, 0, w, 40).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && uji(d[i], d[i + 1], d[i + 2])) n++; return n; };
  const kuning = () => true, semu = (arah, x, pegang, ayun) => ({ x, y: 14, arah, jalan: false, langkah: 0, pose: '', look: G.aku.look, pegang, ayun });
  k.imageSmoothingEnabled = false;
  lukisEntitas(k, semu('kanan', 4, '', 0)); const tanpa = warna(0, 30, kuning);
  k.clearRect(0, 0, 80, 40);
  lukisEntitas(k, semu('kanan', 4, 'senjata:sapu', 0)); const bawa = warna(0, 30, kuning), gambarBawa = kv.toDataURL();
  k.clearRect(0, 0, 80, 40);
  lukisEntitas(k, semu('kanan', 4, 'senjata:sapu', performance.now() - 60)); const ayun = warna(0, 30, kuning), gambarAyun = kv.toDataURL();
  k.clearRect(0, 0, 80, 40);
  lukisEntitas(k, semu('bawah', 4, '', 0)); const polos = kv.toDataURL();
  k.clearRect(0, 0, 80, 40);
  lukisEntitas(k, semu('bawah', 4, 'pakan', 0)); const pakan = kv.toDataURL();
  k.clearRect(0, 0, 80, 40);
  lukisEntitas(k, Object.assign(semu('bawah', 4, 'pakan', 0), { pose: 'santai' })); const duduk = kv.toDataURL();
  k.clearRect(0, 0, 80, 40);
  lukisEntitas(k, Object.assign(semu('bawah', 4, '', 0), { pose: 'santai' })); const dudukPolos = kv.toDataURL();
  return { aku: G.aku.pegang, tanpa, bawa, ayun, ayunBeda: gambarAyun !== gambarBawa, pakanTampak: pakan !== polos, dudukSama: duduk === dudukPolos, sprite: Pegang.sprite('benih:sawi') };
});
const rekanLihat = await pg2.evaluate(() => { const e = [...G.entitas.values()].find(e => e.nama === 'Penguji Satu'); return e ? e.pegang : 'tidak-seadegan'; });
cek('barang hotbar terlihat dipegang karakter (dikecilkan), senjata terlihat dibawa dan posisinya berubah saat diayun, tidak digambar saat duduk', pegangUji.aku === 'senjata:sapu' && pegangUji.bawa >= pegangUji.tanpa + 6
  && pegangUji.ayun >= pegangUji.tanpa + 4 && pegangUji.ayunBeda && pegangUji.pakanTampak && pegangUji.dudukSama && pegangUji.sprite === 'tani_sawi_1', JSON.stringify(pegangUji));
cek('rekan seadegan ikut melihat barang yang dipegang', rekanLihat === 'senjata:sapu' || rekanLihat === 'tidak-seadegan', String(rekanLihat));
await pg.evaluate(() => { Hotbar.pegang(9); });
cek('suara: sakelar dan volume di Menu tersimpan di peramban', await pg.evaluate(() => { Suara.setVolume(0.5); Suara.hidupkan(false); const s = JSON.parse(localStorage.getItem('kevi.suara')); Suara.hidupkan(true); Suara.setVolume(0.3);
  return s.hidup === false && s.volume === 0.5 && Suara.atur.hidup === true && Object.keys(Suara.LAGU).join() === 'desa,kafe,tegang'; }));
await adm.evaluate(() => ambil('/api/admin/pengaturan', { zombie_jumlah: 0, zombie_hp: 100 }));
await adm.click('#tab button[data-bagian=ringkasan]');
await adm.fill('#umum', 'Rapat jam sembilan'); await adm.click('#f-umum button.utama'); await tunggu(600);
cek('pengumuman admin tersiar ke pemain', (await pg2.textContent('#obrolan-log')).includes('Rapat jam sembilan'));
await adm.click('#tab button[data-bagian=log]');
cek('dashboard: log terminal dan obrolan terisi', (await adm.$$('#t-terminal tbody tr')).length >= 2 && (await adm.textContent('#t-obrolan')).includes('halo semua'));
await adm.screenshot({ path: foto ? `${foto}/8-admin-log.png` : undefined }).catch(() => {});
await adm.click('#tab button[data-bagian=peta]'); await tunggu(300);
if (foto) await adm.screenshot({ path: `${foto}/9-admin-peta.png` });
cek('dashboard: peta menampilkan lantai dan dinding ruang, dengan celah pintunya (laporan yosi: perabot tampak melayang)', await adm.evaluate(() => {
  const e = Peta.ubinEfektif({ lantai: { '9,9': 'lantai_parket' }, tembok: { '8,8': '#445566' }, ruang: [{ gx: 1, gy: 1, w: 4, h: 4, warna: '#112233', lantai: 'lantai_parket', pintu: [{ sisi: 'bawah', pos: 1 }] }] });
  return Object.keys(e.lantai).length === 17 && Object.keys(e.tembok).length === 12 && !('2,4' in e.tembok) && e.tembok['1,1'] === '#112233' && e.tembok['8,8'] === '#445566';
}));
// koleksi peta di dashboard: peta yang tersimpan tampil, bisa ditambah dan dihapus, peta aktif tidak bisa dihapus
const barisKoleksi = () => adm.evaluate(() => [...document.querySelectorAll('#t-koleksi tbody tr')].map(r => ({ teks: r.textContent, tombol: [...r.querySelectorAll('button')].map(t => t.textContent) })));
await adm.waitForFunction(() => document.querySelector('#t-koleksi tbody tr .cip'));
const kol0 = await barisKoleksi();
cek('dashboard: koleksi peta tampil dengan peta aktif tanpa tombol Hapus', kol0.length >= 1 && kol0.filter(r => r.teks.includes('Aktif')).length === 1 && !kol0.find(r => r.teks.includes('Aktif')).tombol.includes('Hapus')
  && (await adm.textContent('#peta-aktif-nama')) !== '-', JSON.stringify(kol0));
await adm.fill('#koleksi-nama', 'Wisma Uji'); await adm.selectOption('#koleksi-dari', 'kosong'); await adm.fill('#koleksi-lebar', '30'); await adm.fill('#koleksi-tinggi', '24');
await adm.click('#koleksi-baru');
await adm.waitForFunction(() => document.querySelector('#t-koleksi tbody').textContent.includes('Wisma Uji'));
const kol1 = (await barisKoleksi()).find(r => r.teks.includes('Wisma Uji'));
cek('dashboard: peta baru masuk koleksi sebagai Tersimpan, bisa diaktifkan dan dihapus', kol1.teks.includes('Tersimpan') && kol1.teks.includes('30 × 24') && kol1.tombol.join() === 'Aktifkan,Ganti nama,Hapus', JSON.stringify(kol1));
adm.once('dialog', d => d.accept());
await adm.click('#t-koleksi tbody tr:has-text("Wisma Uji") button.bahaya');
await adm.waitForFunction(() => !document.querySelector('#t-koleksi tbody').textContent.includes('Wisma Uji'));
cek('dashboard: peta tersimpan bisa dihapus dari koleksi', (await barisKoleksi()).length === kol0.length);
await adm.close();
await pg2.goto(`http://127.0.0.1:${port}/admin`);
cek('pemain biasa ditolak dari dashboard', (await pg2.textContent('body')).includes('Khusus admin'));
await pg2.goto(`http://127.0.0.1:${port}/`);
await pg2.waitForFunction(() => document.body.classList.contains('siap') && G.aku && Jaring.tersambung, null, { timeout: 20000 });
if (await pg2.$('#tirai')) await pg2.keyboard.press('Escape');

const id1 = await pg.evaluate(() => G.saya.id);
await pg2.evaluate((id) => Mesin.pindah('rumah:' + id), id1); await tunggu(800);
const tamu = await pg2.evaluate(() => ({ milik: G.rumahSaya, benda: G.rumah.benda.length, titik: Rumah.interaksi().length }));
cek('bertamu: rumah terlihat tetapi tak bisa diubah', !tamu.milik && tamu.benda === 4 && tamu.titik === 1, JSON.stringify(tamu));
cek('tamu ditolak server saat mencoba mengambil benda', await pg2.evaluate(async () => {
  const r = await fetch('/api/rumah/angkat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: G.rumah.benda[0].id }) });
  return r.status === 400;
}));
cek('pemain yang pergi hilang dari kantor', !(await lihat(pg)).includes('Penguji Dua'));

cek('tanpa galat JavaScript', galat.length === 0, galat.slice(0, 5).join(' | '));

// --- masuk ulang dengan kode sekali pakai (paling akhir: masuk dari konteks lain memutus sambungan dunia yang lama)
const pg3 = await (await b.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
await pg3.goto(`http://127.0.0.1:${port}/masuk`);
cek('isian kode tersembunyi sebelum diminta', await pg3.isHidden('#baris-kode'));
await pg3.fill('#u', username); await pg3.fill('#p', password); await pg3.click('button.utama');
await pg3.waitForSelector('#baris-kode:not([hidden])');
cek('akun ber-TOTP: password saja belum cukup, kode diminta', pg3.url().endsWith('/masuk') && (await pg3.textContent('#galat')).includes('kode sekali pakai'));
await pg3.fill('#k', totp(rahasiaTotp, 1)); await pg3.click('button.utama');
await pg3.waitForURL(`http://127.0.0.1:${port}/`);
cek('masuk dengan kode sekali pakai berhasil', true);

// --- ponsel: joystick sentuh menggerakkan karakter (konteks layar sentuh, pemain kedua)
const hp = await (await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })).newPage();
const galatHp = [];
hp.on('pageerror', e => galatHp.push(e.message));
await hp.goto(`http://127.0.0.1:${port}/masuk`);
await hp.fill('#u', 'penguji2'); await hp.fill('#p', password); await hp.click('button.utama');
await hp.waitForFunction(() => document.body.classList.contains('siap') && G.aku && Jaring.tersambung, null, { timeout: 20000 });
if (await hp.$('#tirai')) await hp.evaluate(() => Panel.tutup());
cek('ponsel: joystick dan tombol aksi tampil', await hp.evaluate(() => getComputedStyle($('#sentuh')).display !== 'none' && !!$('#sentuh-e') && !!$('#sentuh-lari')));
cek('ponsel: tombol Pukul dan Lari ada, Pukul sejajar dengan E dan tidak bertumpuk dengan tombol lain', await hp.evaluate(() => {
  const k = (s) => $(s).getBoundingClientRect(), p = k('#sentuh-pukul'), e = k('#sentuh-e'), f = k('#sentuh-makan'), l = k('#sentuh-lari');
  const tumpuk = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  return p.width >= 60 && Math.abs(p.top - e.top) < 3 && p.right <= e.left + 1 && ![[p, e], [p, f], [p, l], [e, f], [e, l], [f, l]].some(([a, b]) => tumpuk(a, b)) && $('#sentuh-lari').textContent.includes('Lari') && e.right <= innerWidth;
}));
const tongkat = await hp.evaluate(() => { const r = $('#sentuh-tongkat').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
const dorong = async (dx, dy) => {
  await hp.dispatchEvent('#sentuh-tongkat', 'pointerdown', { clientX: tongkat.x + dx, clientY: tongkat.y + dy, pointerId: 7, bubbles: true });
  await hp.waitForTimeout(450);
  const d = await hp.evaluate(() => ({ tombol: [...Mesin.tombol].sort().join(''), x: G.aku.x, y: G.aku.y }));
  await hp.dispatchEvent('#sentuh-tongkat', 'pointerup', { pointerId: 7, bubbles: true });
  return d;
};
const hp0 = await hp.evaluate(() => ({ x: G.aku.x, y: G.aku.y }));
const kanan = await dorong(40, 0), kiriAtas = await dorong(-30, -30);
cek('ponsel: joystick mengisi arah gerak (kanan, lalu kiri atas)', kanan.tombol === 'd' && kiriAtas.tombol === 'aw', JSON.stringify([kanan, kiriAtas]));
cek('ponsel: karakter berpindah oleh joystick', kanan.x !== hp0.x || kiriAtas.x !== kanan.x || kiriAtas.y !== kanan.y, JSON.stringify([hp0, kanan, kiriAtas]));
cek('ponsel: lepas joystick menghentikan gerak', await hp.evaluate(() => Mesin.tombol.size === 0));
cek('ponsel: tanpa galat JavaScript', galatHp.length === 0, galatHp.slice(0, 3).join(' | '));

await b.close();
console.log(gagal ? `\n${gagal} uji GAGAL` : '\nSEMUA LULUS');
process.exit(gagal ? 1 : 0);
