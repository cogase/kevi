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
cek('mulai di kantor dengan NPC', s.adegan === 'kantor' && s.npc === 5, `npc ${s.npc}`);
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
await pg.keyboard.press('b');
await pg.waitForSelector('#bangun .slot');
const taruh = async (barang, x, y) => {
  await pg.evaluate((b) => { G.bangun.barang = b; Rumah.lukisBilah(); }, barang);
  const p = await pg.evaluate(([x, y]) => Mesin.keLayar(x, y), [x, y]);
  await pg.mouse.move(p.x, p.y); await pg.mouse.down(); await pg.mouse.up(); await tunggu(350);
};
await taruh('kebun_petak', 200, 300); await taruh('kebun_petak', 216, 300); await taruh('kebun_kotak_kiriman', 260, 300);
s = await pg.evaluate(() => ({ benda: G.rumah.benda.map(o => o.n), petak: G.inventori.kebun_petak }));
cek('perabot terpasang dari inventory', s.benda.filter(n => n === 'kebun_petak').length === 2 && s.petak === 4 && s.benda.includes('kebun_kotak_kiriman'), JSON.stringify(s));
await potret('5-bangun');
await pg.keyboard.press('b');

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
await pg.evaluate(() => Rumah.jualHasil()); await tunggu(500);
cek('jual hasil menambah koin', (await pg.evaluate(() => G.koin)) >= koinSebelum + 30);

// --- profil: statistik sendiri dari Menu
await pg.evaluate(() => Profil.buka());
await pg.waitForSelector('.profil .profil-potret');
cek('profil sendiri menampilkan statistik dan tombol ubah karakter', await pg.evaluate(() => {
  const t = $('.profil').textContent;
  return t.includes('Lama bermain') && t.includes('Panen') && t.includes('Ubah karakter') && !!$('#profil-bilah');
}));
await pg.keyboard.press('Escape');

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
cek('Edit Map terbuka dengan tujuh alat', await pg.evaluate(() => Sunting.aktif && document.querySelectorAll('#bangun .slot.alat').length === 7 && $('#sunting-simpan').disabled));
await pg.click('#bangun [data-alat=perabot]');
await pg.waitForSelector('#sunting-katalog .kartu');
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
await tunggu(400);
cek('perubahan peta utama tersiar ke pemain lain setelah Simpan', await pg2.evaluate(() => G.peta.benda.length === 1 && G.peta.benda[0].n === 'sofa_krem'));
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
await adm.waitForFunction(() => document.querySelectorAll('#peta-daftar .butir-peta').length === 5);
await adm.click('#titik-baru'); await adm.click('#peta', { position: { x: 200, y: 300 } });
await adm.click('#npc-baru'); await adm.fill('#peta-sunting input >> nth=0', 'Pak Uji');
await adm.click('#peta-simpan'); await tunggu(900);
const dunia = await pg.evaluate(() => ({ titik: G.titik.length, npc: [...G.entitas.values()].filter(e => e.jenis === 'npc').map(e => e.nama), tanda: Rumah.titik.filter(b => b.tanda).length }));
cek('atur peta: titik dan NPC baru langsung muncul di game', dunia.titik === 1 && dunia.npc.includes('Pak Uji') && dunia.tanda === 1, JSON.stringify(dunia));
await adm.click('#tab button[data-bagian=atur]');
await adm.fill('#at-laju_jalan', '120'); await adm.click('#f-atur button.utama'); await tunggu(700);
cek('pengaturan kecepatan jalan langsung berlaku', await pg.evaluate(() => G.atur.laju_jalan === 120));
await adm.click('#tab button[data-bagian=ringkasan]');
await adm.fill('#umum', 'Rapat jam sembilan'); await adm.click('#f-umum button.utama'); await tunggu(600);
cek('pengumuman admin tersiar ke pemain', (await pg2.textContent('#obrolan-log')).includes('Rapat jam sembilan'));
await adm.click('#tab button[data-bagian=log]');
cek('dashboard: log terminal dan obrolan terisi', (await adm.$$('#t-terminal tbody tr')).length >= 2 && (await adm.textContent('#t-obrolan')).includes('halo semua'));
await adm.screenshot({ path: foto ? `${foto}/8-admin-log.png` : undefined }).catch(() => {});
await adm.click('#tab button[data-bagian=peta]'); await tunggu(300);
if (foto) await adm.screenshot({ path: `${foto}/9-admin-peta.png` });
await adm.close();
await pg2.goto(`http://127.0.0.1:${port}/admin`);
cek('pemain biasa ditolak dari dashboard', (await pg2.textContent('body')).includes('Khusus admin'));
await pg2.goto(`http://127.0.0.1:${port}/`);
await pg2.waitForFunction(() => document.body.classList.contains('siap') && G.aku && Jaring.tersambung, null, { timeout: 20000 });
if (await pg2.$('#tirai')) await pg2.keyboard.press('Escape');

const id1 = await pg.evaluate(() => G.saya.id);
await pg2.evaluate((id) => Mesin.pindah('rumah:' + id), id1); await tunggu(800);
const tamu = await pg2.evaluate(() => ({ milik: G.rumahSaya, benda: G.rumah.benda.length, titik: Rumah.interaksi().length }));
cek('bertamu: rumah terlihat tetapi tak bisa diubah', !tamu.milik && tamu.benda === 3 && tamu.titik === 1, JSON.stringify(tamu));
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
