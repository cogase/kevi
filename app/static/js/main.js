/* Kevi — titik masuk: muat aset, kenali pemain, pasang masukan, jalankan putaran gambar. */
'use strict';

const EMOTE = ['seru', 'tanya', 'hati', 'tawa', 'nada', 'zzz', 'ide', 'kilau'];

function pasangTombol() {
  addEventListener('keydown', (ev) => {
    const k = ev.key.toLowerCase();
    if (ev.target.closest && ev.target.closest('#term-remote')) return;      // terminal remote memakai semua tombol, termasuk Esc
    if (k === 'escape') {
      if (Panel.terbuka()) { if (!Panel.terkunci) Panel.tutup(); }
      else if (Terminal.terbuka()) Terminal.tutup();
      else if (G.bangun) Rumah.keluarBangun();
      else if (G.duduk) Mesin.berdiri();
      return;
    }
    if (Mesin.sibuk() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
      Mesin.tombol.add(k);
      if (k.startsWith('arrow')) ev.preventDefault();
      return;
    }
    if (ev.repeat) return;
    if (k === 'e') { if (G.terdekat) G.terdekat.aksi(ev); }
    else if (k === 'enter') { ev.preventDefault(); $('#obrolan-isi').focus(); }
    else if (k === 'i') Inventori.buka();
    else if (k === 'n') Catatan.buka();
    else if (k === 'm') Panel.misi();
    else if (k === 'b') { if (G.bangun) Rumah.keluarBangun(); else if (Rumah.bolehBangun()) Rumah.masukBangun(); else kabar(G.adegan === 'kantor' ? 'Mode Bangun hanya di rumah. Jalan keluar kantor lalu terus ke bawah.' : 'Ini bukan rumahmu.'); }
    else if (k === '=' || k === '+') Mesin.zoom(1);
    else if (k === '-') Mesin.zoom(-1);
    else if (k === '\\') Mesin.zoom(0);
    else if (k === 'r') Rumah.putar();
    else if (k === 'l') Panel.level();
    else if (k === 'f') Hotbar.pakai();
    else if (/^Digit\d$/.test(ev.code)) {            // angka = hotbar; Shift + angka = emote
      const n = Number(ev.code.slice(5));
      if (ev.shiftKey) { if (n >= 1 && n <= 8) Jaring.kirim({ t: 'emot', n: EMOTE[n - 1] }); }
      else Hotbar.pegang((n + 9) % 10);
    }
  });
  addEventListener('keyup', (ev) => Mesin.tombol.delete(ev.key.toLowerCase()));
  addEventListener('blur', () => Mesin.tombol.clear());
  addEventListener('resize', () => Mesin.ukur());
  kanvas.addEventListener('wheel', (ev) => { ev.preventDefault(); Mesin.zoom(ev.deltaY < 0 ? 1 : -1); }, { passive: false });
  $('#zoom-besar').addEventListener('click', () => Mesin.zoom(1));
  $('#zoom-kecil').addEventListener('click', () => Mesin.zoom(-1));
  $('#zoom-nilai').addEventListener('click', () => Mesin.zoom(0));
}

function putaran() {
  let lalu = performance.now();
  const langkah = (kini) => {
    const dt = Math.min(0.05, (kini - lalu) / 1000);
    lalu = kini; G.kini = kini / 1000;
    Mesin.majukan(dt);
    Mesin.gambar();
    requestAnimationFrame(langkah);
  };
  requestAnimationFrame(langkah);
}

(async function mulai() {
  const muat = $('#muat');
  try {
    await muatAset();
    const s = await api('/api/saya');
    G.saya = s.pemakai; G.toko = s.toko; G.terminalAktif = s.terminal;
    G.peta = s.peta; G.remote = !!s.remote; G.totp = !!s.totp;
    try { G.zoom = Number(localStorage.getItem('kevi.zoom')) || 0; } catch (e) { G.zoom = 0; }
    G.buka = s.buka || {}; G.namaBuka = s.nama_buka || {}; G.hadiahNaik = s.hadiah_naik || 40; G.atur = s.atur || G.atur;
    Mesin.ukur();
    Mesin.siapkanKantor();
    if (!s.karakter) { muat.remove(); Buat.buka(true); return; }
    G.karakter = s.karakter; G.koin = s.koin; G.inventori = s.inventori; G.misi = s.misi;
    G.level = s.level; G.stamina.nilai = s.level.stamina; G.tas = s.tas; G.tata = s.tata;
    G.aku = buatEntitas(G.saya.id, 'saya', { nama: s.karakter.nama, tampilan: s.karakter.tampilan });
    const k = s.karakter, punyaPosisi = typeof k.x === 'number' && typeof k.y === 'number';
    if (k.adegan === 'rumah:' + G.saya.id && await Mesin.masukRumah(G.saya.id, punyaPosisi ? k.x : undefined, punyaPosisi ? k.y : undefined)) { /* lanjut di rumah */ }
    else Mesin.masukKantor(k.adegan === 'kantor' && punyaPosisi ? k.x : undefined, k.adegan === 'kantor' && punyaPosisi ? k.y : undefined);
    Hud.pasang(); Obrolan.pasang(); Terminal.pasang(); Rumah.pasangKursor(); pasangTombol();
    Hotbar.lukis();
    document.addEventListener('kevi:segar', () => Hotbar.lukis());
    Jaring.sambung();
    muat.remove();
    document.body.classList.add('siap');
    putaran();
    if (s.bonus_masuk) kabar('Bonus hadir hari ini: +' + s.bonus_masuk + ' koin.', 'hadiah');
    if (G.atur.pengumuman) { kabar('Pengumuman: ' + G.atur.pengumuman, 'hadiah'); Obrolan.catat('Admin', G.atur.pengumuman, 'npc'); }
    if (!(s.karakter.statistik || {}).terminal && !localStorage.getItem('kevi.panduan')) { localStorage.setItem('kevi.panduan', '1'); Panel.panduan(); }
  } catch (e) {
    muat.textContent = 'Kevi gagal dimuat: ' + e.message;
    muat.classList.add('galat');
  }
})();
