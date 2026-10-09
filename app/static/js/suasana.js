/* Kevi — suasana: siang dan malam mengikuti jam asli (jam peramban), pencahayaan lampu, dan jam yang hidup.
 * Aturannya disalin dari Agent Pak (suasana.js): malam 19.00–04.30 gelap 74%, fajar 04.30–06.00 dan senja 17.15–19.00
 * berangsur dengan semburat warna. Gelap digambar sebagai topeng biru tua seukuran layar yang dilubangi cahaya: lampu,
 * layar yang menyala, monitor meja yang sedang dipakai, dan ruang yang ada orangnya. Tanpa sumber cahaya, tetap redup.
 * Nama, gelembung obrolan, dan semua panel digambar sesudah topeng, jadi tetap terang.
 */
'use strict';

const Suasana = (() => {
  const GELAP_MALAM = 0.74;
  // Semua perabot kategori Lampu menyala (lampu disko tidak: itu hiasan).
  const LAMPU = /^(lampu_(?!disko)|luar_lampu_jalan|meja_samping_lampu)/;
  // Jangkauan cahaya: lampu luar/taman paling luas, lampu meja paling kecil.
  const jangkauLampu = (n) => (/jalan|taman|lampu_luar_/.test(n) ? 70 : /lampu_meja|meja_samping_lampu/.test(n) ? 42 : 55);
  const LAYAR = /^(layar_|tv_|mesin_arcade|papan_skor)/;
  const JAM_HIDUP = { jam: { cx: 8, cy: 7, r: 4 }, jam_dinding: { cx: 7.5, cy: 7.5, r: 5 }, jam_dinding_besar: { cx: 15.5, cy: 7.5, r: 5 }, jam_digital: { digital: true } };
  // Angka 3x5 piksel untuk jam digital, tiap baris 3 bit.
  const ANGKA = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
  const NAMA_FASE = { ikut: 'Ikut jam asli', siang: 'Siang', senja: 'Senja', malam: 'Malam' };
  let topeng = null;

  const pilihan = () => { try { const v = localStorage.getItem('kevi.waktu'); return NAMA_FASE[v] ? v : 'ikut'; } catch (e) { return 'ikut'; } };
  function pilih(v) { try { localStorage.setItem('kevi.waktu', NAMA_FASE[v] ? v : 'ikut'); } catch (e) { /* penyimpanan dimatikan */ } segarkanJam(); }

  // { gelap: 0–0.74, semburat: warna tipis seluruh layar | null, nama }
  function fase(kini = new Date(), paksa = pilihan()) {
    if (paksa === 'siang') return { gelap: 0, semburat: null, nama: 'Siang' };
    if (paksa === 'senja') return { gelap: 0.28, semburat: 'rgba(255,140,60,.16)', nama: 'Senja' };
    if (paksa === 'malam') return { gelap: GELAP_MALAM, semburat: null, nama: 'Malam' };
    const j = kini.getHours() + kini.getMinutes() / 60;
    if (j >= 19 || j < 4.5) return { gelap: GELAP_MALAM, semburat: null, nama: 'Malam' };
    if (j < 6) return { gelap: GELAP_MALAM * (6 - j) / 1.5, semburat: `rgba(255,150,170,${(0.14 * (6 - j) / 1.5).toFixed(3)})`, nama: 'Fajar' };
    if (j >= 17.25) { const t = (j - 17.25) / 1.75; return { gelap: GELAP_MALAM * t, semburat: `rgba(255,140,60,${(0.18 * (1 - Math.abs(t - 0.4))).toFixed(3)})`, nama: 'Senja' }; }
    return { gelap: 0, semburat: null, nama: 'Siang' };
  }

  // Benda di adegan ini sebagai { n, x, y, w, h } berkoordinat dunia: yang ditaruh, ditambah perabot peta Default terpanggang.
  function benda() {
    const hasil = [];
    for (const b of [...Rumah.alas, ...Rumah.urut]) hasil.push({ n: b.o.n, x: b.o.x, y: b.y, w: b.w, h: b.h });
    if (Rumah.kantor && Rumah.dasarDefault && G.kantor) for (const o of G.kantor.ops || []) if (typeof o.n === 'string' && atlas[o.n]) { const u = ukuranSprite(o.n, o.r); hasil.push({ n: o.n, x: o.x, y: o.y, w: u.w, h: u.h }); }
    return hasil;
  }
  // Sumber cahaya: { x, y, r, k, hangat?, monitor? }; k = seberapa habis gelap dihapus di pusatnya, memudar sampai r.
  function cahaya(semua, daftar = benda()) {
    const hasil = [];
    for (const o of daftar) {
      if (LAMPU.test(o.n)) hasil.push({ x: o.x + o.w / 2, y: o.y + o.h * 0.3, r: jangkauLampu(o.n), k: 1, hangat: true });
      else if (LAYAR.test(o.n)) hasil.push({ x: o.x + o.w / 2, y: o.y + Math.min(o.h / 2, 10), r: o.n === 'layar_dinding_ops' ? 110 : 42, k: o.n === 'layar_dinding_ops' ? 0.8 : 0.6 });
    }
    for (const e of semua) {
      // Monitor meja menyala selagi ada yang duduk bekerja di depannya.
      if (/^(main_|duduk_[ab])/.test(e.pose || '')) hasil.push({ x: e.x + 8, y: e.y + 4, r: 34, k: 0.9, monitor: true });
    }
    // Tambahan Kevi (tidak ada di Agent Pak): pemain sendiri selalu sedikit terlihat, supaya tetap bisa main di tempat tanpa lampu.
    if (G.aku) hasil.push({ x: G.aku.x + 8, y: G.aku.y + 10, r: 30, k: 0.4 });
    return hasil;
  }
  // Ruang yang ada orangnya menyala seluruhnya (lampu ruang dianggap hidup): [x, y, w, h] dunia.
  function ruangMenyala(semua) {
    const d = Rumah.d, oy = Rumah.oy, kotak = [];
    for (const r of (d && d.ruang) || []) kotak.push([r.gx * T, r.gy * T + oy, r.w * T, r.h * T]);
    if (Rumah.kantor && Rumah.dasarDefault && G.kantor) for (const r of G.kantor.ruang || []) if (r.kotak) kotak.push([r.kotak.x * T, r.kotak.y * T, r.kotak.w * T, r.kotak.h * T]);
    return kotak.filter(([x, y, w, h]) => semua.some(e => e.x + 8 >= x && e.x + 8 < x + w && e.y + 18 >= y && e.y + 18 < y + h));
  }

  // Dipanggil sesudah dunia digambar dan sebelum nama/gelembung, dengan transform identitas (ruang layar).
  function gambarMalam(k, kv, semua, f = fase(), lampu = null, ruang = null) {
    if (G.bangun) return;                              // selagi menyunting peta semuanya terang
    if (f.semburat) { k.fillStyle = f.semburat; k.fillRect(0, 0, kv.width, kv.height); }
    if (f.gelap < 0.02) return;
    lampu = lampu || cahaya(semua); ruang = ruang || ruangMenyala(semua);
    const S = 3, w = Math.ceil(kv.width / S), h = Math.ceil(kv.height / S), kam = G.kamera, sk = kam.skala;
    if (!topeng) topeng = document.createElement('canvas');
    if (topeng.width !== w || topeng.height !== h) { topeng.width = w; topeng.height = h; }
    const t = topeng.getContext('2d');
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, w, h);
    t.fillStyle = `rgba(6,10,32,${f.gelap.toFixed(3)})`; t.fillRect(0, 0, w, h);
    t.globalCompositeOperation = 'destination-out';
    const ke = (x, y) => [(x - kam.x) * sk / S, (y - kam.y) * sk / S];
    for (const [x, y, rw, rh] of ruang) { const [sx, sy] = ke(x, y); t.fillStyle = 'rgba(0,0,0,.78)'; t.fillRect(sx, sy, rw * sk / S, rh * sk / S); }
    const tampak = [];
    for (const c of lampu) {
      const [sx, sy] = ke(c.x, c.y), r = c.r * sk / S;
      if (sx + r < 0 || sy + r < 0 || sx - r > w || sy - r > h) continue;
      tampak.push([c, sx, sy, r]);
      const g = t.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(0,0,0,${c.k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      t.fillStyle = g; t.fillRect(sx - r, sy - r, 2 * r, 2 * r);
    }
    k.save();
    k.imageSmoothingEnabled = true;
    k.drawImage(topeng, 0, 0, kv.width, kv.height);
    k.globalCompositeOperation = 'lighter';            // pendar warna: hangat untuk lampu, biru untuk monitor
    const kuat = f.gelap / GELAP_MALAM;
    for (const [c, sx, sy, r] of tampak) {
      if (!c.hangat && !c.monitor) continue;
      const X = sx * S, Y = sy * S, R = r * S * 0.7, g = k.createRadialGradient(X, Y, 0, X, Y, R);
      g.addColorStop(0, c.hangat ? `rgba(255,190,100,${(0.22 * kuat).toFixed(3)})` : `rgba(90,150,255,${(0.16 * kuat).toFixed(3)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      k.fillStyle = g; k.fillRect(X - R, Y - R, 2 * R, 2 * R);
    }
    k.restore();
    k.imageSmoothingEnabled = false;
  }

  // Jam dinding dan jam digital yang ditaruh di peta menunjukkan jam asli. Digambar di ruang dunia, sesudah perabot.
  function gambarJam(k, kini = new Date(), daftar = benda()) {
    const jam = kini.getHours(), menit = kini.getMinutes(), detik = kini.getSeconds();
    for (const o of daftar) {
      const j = JAM_HIDUP[o.n];
      if (!j) continue;
      if (j.digital) {
        k.fillStyle = '#1c1917'; k.fillRect(o.x + 3, o.y + 3, 26, 11);
        k.fillStyle = '#f87171';
        const teks = String(jam).padStart(2, '0') + String(menit).padStart(2, '0');
        [4, 9, 17, 22].forEach((dx, i) => { const pola = ANGKA[Number(teks[i])]; for (let p = 0; p < 15; p++) if (pola[p] === '1') k.fillRect(o.x + 3 + dx + p % 3, o.y + 6 + Math.floor(p / 3), 1, 1); });
        if (detik % 2 === 0) { k.fillRect(o.x + 17, o.y + 7, 1, 1); k.fillRect(o.x + 17, o.y + 9, 1, 1); }
        continue;
      }
      const cx = o.x + j.cx, cy = o.y + j.cy, jarum = (bagian, panjang, warna, tebal) => {
        const s = bagian * Math.PI * 2 - Math.PI / 2;
        k.strokeStyle = warna; k.lineWidth = tebal; k.beginPath(); k.moveTo(cx, cy); k.lineTo(cx + Math.cos(s) * j.r * panjang, cy + Math.sin(s) * j.r * panjang); k.stroke();
      };
      k.fillStyle = '#f8fafc'; k.beginPath(); k.arc(cx, cy, j.r, 0, Math.PI * 2); k.fill();
      jarum(((jam % 12) + menit / 60) / 12, 0.55, '#1f2937', 1);
      jarum((menit + detik / 60) / 60, 0.85, '#1f2937', 0.8);
      jarum(detik / 60, 0.9, '#dc2626', 0.5);
    }
  }

  // Jam di menu atas: HH.MM menurut jam peramban, dengan nama fasenya di keterangan.
  function segarkanJam() {
    const c = document.getElementById('hud-jam');
    if (!c) return;
    const kini = new Date(), f = fase(kini);
    c.textContent = String(kini.getHours()).padStart(2, '0') + '.' + String(kini.getMinutes()).padStart(2, '0');
    c.title = f.nama + (pilihan() === 'ikut' ? ' (mengikuti jam asli)' : ' (dipaksa dari Menu)');
    c.dataset.fase = f.nama.toLowerCase();
  }
  function pasang() { segarkanJam(); setInterval(segarkanJam, 5000); }

  return { fase, cahaya, ruangMenyala, gambarMalam, gambarJam, pasang, pilih, pilihan, segarkanJam, NAMA_FASE, LAMPU, GELAP_MALAM };
})();
