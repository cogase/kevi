/* Kevi — musik dan efek suara, disintesis di peramban (WebAudio, tanpa berkas audio).
 *
 * Mesin penjadwal dan dua lagu tenang ("Pagi di Desa", "Kafe Senja") disalin dari Agent Pak (musik.js; komposisi asli
 * Agent Pak). Lagu tegang dan efek suara (geraman zombie, pukulan, koin) dibuat untuk Kevi dengan cara yang sama.
 * Suasana: 'tenang' saat tidak ada zombie, 'tegang' selama serangan. Pengaturan per perangkat (localStorage):
 * hidup/mati dan volume. Peramban melarang suara sebelum ada interaksi: musik mulai pada klik atau tombol pertama.
 */
'use strict';

const Suara = (() => {
  // Nada MIDI; 0 = diam. Akor per 8 langkah = [akar, ...nada arpeggio].
  const LAGU = {
    desa: { nama: 'Pagi di Desa', tempo: 84, lead: 'triangle', keras: 0.16, arpeggio: 'sine', burung: true,
      melodi: [77, 0, 0, 81, 79, 0, 77, 0, 74, 0, 72, 0, 74, 0, 0, 0, 70, 0, 74, 0, 77, 0, 79, 81, 79, 0, 77, 0, 0, 0, 0, 0,
               77, 0, 81, 0, 84, 0, 82, 81, 79, 0, 77, 0, 74, 0, 77, 0, 79, 0, 0, 77, 76, 0, 72, 0, 77, 0, 0, 0, 0, 0, 0, 0],
      akor: [[41, 65, 69, 72], [38, 62, 65, 69], [46, 65, 70, 74], [48, 64, 67, 72], [41, 65, 69, 72], [38, 62, 65, 69], [46, 65, 70, 74], [48, 64, 67, 70]] },
    kafe: { nama: 'Kafe Senja', tempo: 76, lead: 'sine', keras: 0.14, arpeggio: 'triangle', ayun: true,
      melodi: [0, 74, 0, 72, 69, 0, 0, 0, 0, 67, 69, 72, 0, 0, 74, 0, 0, 76, 0, 74, 72, 0, 69, 0, 67, 0, 0, 0, 0, 0, 0, 0,
               0, 74, 0, 72, 69, 0, 72, 0, 74, 0, 76, 0, 79, 0, 76, 0, 74, 0, 72, 0, 69, 0, 67, 0, 69, 0, 0, 0, 0, 0, 0, 0],
      akor: [[45, 60, 64, 67], [50, 60, 65, 69], [43, 59, 62, 65], [48, 59, 64, 67], [45, 60, 64, 67], [50, 60, 65, 69], [43, 59, 62, 65], [40, 59, 62, 67]] },
    // Serangan zombie: cepat, minor, bass berdenyut di tiap langkah, melodi patah-patah dengan jeda yang menegangkan.
    tegang: { nama: 'Zombie Datang', tempo: 148, lead: 'square', keras: 0.06, arpeggio: 'sawtooth', hihat: true, denyut: true,
      melodi: [69, 0, 69, 72, 0, 69, 68, 0, 69, 0, 69, 72, 0, 76, 75, 0, 65, 0, 65, 69, 0, 65, 64, 0, 64, 0, 68, 71, 0, 76, 0, 0,
               69, 0, 72, 76, 0, 81, 80, 0, 77, 0, 76, 72, 0, 69, 68, 0, 65, 0, 69, 72, 0, 77, 76, 0, 76, 75, 76, 0, 71, 0, 68, 0],
      akor: [[45, 57, 60, 64], [45, 57, 60, 64], [41, 57, 60, 65], [40, 56, 59, 64], [45, 57, 60, 64], [41, 57, 60, 65], [41, 57, 60, 65], [40, 56, 59, 64]] },
  };
  const TENANG = ['desa', 'kafe'], PUTARAN_PER_LAGU = 6;
  let ctx = null, utama = null, derau = null;
  let langkah = 0, waktu = 0, pewaktu = null, burungBerikut = 0, putaranLagu = 0, lagu = 'desa', suasanaKini = 'tenang', geramBerikut = 0;
  const simpanan = (() => { try { return JSON.parse(localStorage.getItem('kevi.suara') || '{}'); } catch (e) { return {}; } })();
  const atur = { hidup: simpanan.hidup !== false, volume: typeof simpanan.volume === 'number' ? simpanan.volume : 0.3 };

  const frek = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function simpan() { try { localStorage.setItem('kevi.suara', JSON.stringify(atur)); } catch (e) { /* penyimpanan dimatikan */ } }

  function nada(jenis, m, t, lama, keras, getar = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = jenis; o.frequency.value = frek(m);
    if (getar) {   // vibrato halus untuk lead yang panjang
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 5; lg.gain.value = getar; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + lama + 0.05);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(keras, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + lama);
    o.connect(g).connect(utama);
    o.start(t); o.stop(t + lama + 0.05);
  }
  function desis(t, lama, keras, jenis, hz) {
    const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = derau; f.type = jenis; f.frequency.value = hz;
    g.gain.setValueAtTime(keras, t); g.gain.exponentialRampToValueAtTime(0.0008, t + lama);
    s.connect(f).connect(g).connect(utama); s.start(t, Math.random()); s.stop(t + lama + 0.02);
  }
  // Kicau burung: dua-tiga siulan naik-turun cepat, sesekali.
  function burung(t) {
    const n = 2 + Math.floor(Math.random() * 3), dasar = 2200 + Math.random() * 1400;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), mulai = t + i * 0.13;
      o.type = 'sine';
      o.frequency.setValueAtTime(dasar, mulai);
      o.frequency.exponentialRampToValueAtTime(dasar * (1.3 + Math.random() * 0.4), mulai + 0.06);
      o.frequency.exponentialRampToValueAtTime(dasar * 0.9, mulai + 0.1);
      g.gain.setValueAtTime(0, mulai); g.gain.linearRampToValueAtTime(0.03, mulai + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, mulai + 0.11);
      o.connect(g).connect(utama); o.start(mulai); o.stop(mulai + 0.12);
    }
  }
  // Geraman zombie: gergaji rendah yang melorot dan bergetar, lewat tapis rendah, ditambah napas dari derau.
  function geram(t = ctx.currentTime, keras = 0.16) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), l = ctx.createOscillator(), lg = ctx.createGain();
    const dasar = 70 + Math.random() * 35, lama = 0.7 + Math.random() * 0.5;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(dasar * 1.25, t); o.frequency.exponentialRampToValueAtTime(dasar * 0.7, t + lama);
    l.frequency.value = 17 + Math.random() * 9; lg.gain.value = 9; l.connect(lg).connect(o.frequency);
    f.type = 'lowpass'; f.frequency.setValueAtTime(520, t); f.frequency.exponentialRampToValueAtTime(240, t + lama);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(keras, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0008, t + lama);
    o.connect(f).connect(g).connect(utama);
    o.start(t); l.start(t); o.stop(t + lama + 0.05); l.stop(t + lama + 0.05);
    desis(t, lama * 0.8, keras * 0.25, 'bandpass', 420);
  }

  function jadwalkan() {
    const L = LAGU[lagu], dur = 60 / L.tempo / 2;
    while (waktu < ctx.currentTime + 0.3) {
      const i = langkah % L.melodi.length;
      const ayun = L.ayun && i % 2 ? dur * 0.18 : 0;
      const m = L.melodi[i];
      if (m) nada(L.lead, m, waktu + ayun, dur * (L.lead === 'square' ? 0.9 : 1.8), L.keras, L.lead === 'square' ? 0 : 3);
      const ak = L.akor[Math.floor(i / 8) % L.akor.length];
      if (L.denyut) nada('triangle', ak[0] - (i % 2 ? 0 : 12), waktu, dur * 0.9, 0.2);      // bass berdenyut tiap langkah
      else if (i % 4 === 0) nada('triangle', ak[0], waktu, dur * 3.5, 0.2);
      if (L.arpeggio && ak.length > 1) nada(L.arpeggio, ak[1 + (i % (ak.length - 1))], waktu + ayun, dur * (L.denyut ? 0.7 : 1.6), L.denyut ? 0.022 : 0.045);
      else if (i % 4 === 2) nada('triangle', ak[0] + 7, waktu, dur * 0.9, 0.14);
      if (L.hihat) desis(waktu, 0.05, i % 2 ? 0.025 : 0.05, 'highpass', 7000);
      if (L.denyut && i % 8 === 0) desis(waktu, 0.18, 0.09, 'lowpass', 180);                // dentum rendah di awal birama
      if (L.burung && ctx.currentTime > burungBerikut) { burung(waktu); burungBerikut = ctx.currentTime + 6 + Math.random() * 10; }
      if (suasanaKini === 'tegang' && ctx.currentTime > geramBerikut) { geram(waktu, 0.1); geramBerikut = ctx.currentTime + 3 + Math.random() * 5; }
      waktu += dur; langkah++;
      // Lagu tenang bergiliran: tiap lagu PUTARAN_PER_LAGU kali, lalu yang berikutnya.
      if (suasanaKini === 'tenang' && langkah % L.melodi.length === 0 && ++putaranLagu >= PUTARAN_PER_LAGU) {
        pasangLagu(TENANG[(TENANG.indexOf(lagu) + 1) % TENANG.length]);
        return;
      }
    }
  }
  function pasangLagu(id) {
    lagu = id; langkah = 0; putaranLagu = 0;
    if (ctx) waktu = Math.max(waktu, ctx.currentTime + 0.05);
  }

  function siap() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        utama = ctx.createGain(); utama.connect(ctx.destination);
        derau = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = derau.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      utama.gain.value = atur.volume * 0.6;
      return true;
    } catch (e) { return false; }      // audio tak tersedia: diam saja
  }
  function mulai() {
    if (!atur.hidup || !siap()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!pewaktu) { waktu = ctx.currentTime + 0.05; pewaktu = setInterval(jadwalkan, 60); }
  }
  function henti() {
    if (pewaktu) { clearInterval(pewaktu); pewaktu = null; }
    if (ctx && ctx.state === 'running') ctx.suspend();
  }
  // Ganti suasana: 'tegang' selama serangan zombie, 'tenang' selain itu.
  function suasana(s) {
    if (s === suasanaKini) return;
    suasanaKini = s;
    pasangLagu(s === 'tegang' ? 'tegang' : TENANG[Math.floor(Math.random() * TENANG.length)]);
    geramBerikut = 0;
  }
  // Efek sekali bunyi; diam bila suara dimatikan atau belum ada interaksi.
  function efek(nama) {
    if (!atur.hidup || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (nama === 'geram') geram(t);
    else if (nama === 'ayun') desis(t, 0.12, 0.07, 'bandpass', 1800);
    else if (nama === 'kena') { desis(t, 0.09, 0.2, 'lowpass', 900); nada('square', 45, t, 0.09, 0.12); }
    else if (nama === 'mati') { geram(t, 0.2); nada('triangle', 38, t + 0.15, 0.4, 0.2); }
    else if (nama === 'gigit') { nada('sawtooth', 52, t, 0.16, 0.16); desis(t, 0.14, 0.14, 'highpass', 2500); }
    else if (nama === 'koin') { nada('square', 88, t, 0.07, 0.07); nada('square', 93, t + 0.07, 0.16, 0.07); }
    else if (nama === 'pingsan') { for (let i = 0; i < 5; i++) nada('triangle', 60 - i * 4, t + i * 0.16, 0.3, 0.16); }
    else if (nama === 'guntur') { desis(t + 0.25, 1.6, 0.22, 'lowpass', 140); nada('triangle', 30, t + 0.25, 1.2, 0.18); }
    else if (nama === 'sirene') { for (let i = 0; i < 4; i++) nada('sawtooth', i % 2 ? 70 : 76, t + i * 0.22, 0.2, 0.09); }
  }

  function hidupkan(ya) { atur.hidup = !!ya; simpan(); if (ya) mulai(); else henti(); }
  function setVolume(v) { atur.volume = Math.max(0, Math.min(1, v)); simpan(); if (utama) utama.gain.value = atur.volume * 0.6; }

  const pemicu = () => { mulai(); };
  addEventListener('pointerdown', pemicu, { once: true });
  addEventListener('keydown', pemicu, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) henti(); else if (atur.hidup && ctx) mulai(); });

  return { atur, LAGU, hidupkan, setVolume, suasana, efek, get suasanaKini() { return suasanaKini; }, get lagu() { return lagu; }, get berbunyi() { return !!pewaktu; } };
})();
