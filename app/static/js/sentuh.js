/* Kevi — kontrol sentuh untuk ponsel dan tablet: joystick di kiri bawah, tombol aksi di kanan bawah.
 * Joystick hanya mengisi Mesin.tombol dengan w/a/s/d (delapan arah), jadi semua aturan gerak, lari, tabrakan,
 * dan geser kamera Edit Map tetap satu jalur dengan papan ketik. Muncul di layar sentuh (pointer: coarse) atau
 * begitu ada sentuhan pertama.
 */
'use strict';

const Sentuh = {
  jari: null, pusat: null, ARAH: ['w', 'a', 's', 'd'],

  pasang() {
    const kenop = el('i', {}), tongkat = el('div', { id: 'sentuh-tongkat', 'aria-label': 'Joystick gerak', role: 'application' }, kenop);
    const tombol = (id, teks, judul, tekan, lepas) => {
      const b = el('button', { id, kelas: 'sentuh-tombol', teks, title: judul, 'aria-label': judul });
      b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); b.classList.add('ditekan'); tekan(); });
      const naik = () => { b.classList.remove('ditekan'); if (lepas) lepas(); };
      b.addEventListener('pointerup', naik); b.addEventListener('pointercancel', naik); b.addEventListener('pointerleave', naik);
      b.addEventListener('contextmenu', (ev) => ev.preventDefault());
      return b;
    };
    document.body.append(el('section', { id: 'sentuh', 'aria-label': 'Kontrol sentuh' }, tongkat,
      el('div', { id: 'sentuh-aksi' },
        tombol('sentuh-lari', 'Lari (tahan)', 'Tahan untuk lari', () => Mesin.tombol.add('shift'), () => Mesin.tombol.delete('shift')),
        tombol('sentuh-pukul', 'Pukul', 'Pukul zombie di dekatmu', () => { if (!Mesin.sibuk()) Battle.pukul(); }),
        tombol('sentuh-makan', 'F', 'Pakai atau makan barang yang dipegang', () => { if (!Mesin.sibuk()) Hotbar.pakai(); }),
        tombol('sentuh-e', 'E', 'Interaksi dengan yang terdekat, atau berdiri dari kursi', () => {
          if (Mesin.sibuk()) return;
          if (G.duduk) Mesin.berdiri(); else if (G.terdekat) G.terdekat.aksi({});
        }))));

    const lepas = () => {
      this.jari = null;
      kenop.style.transform = '';
      for (const k of this.ARAH) Mesin.tombol.delete(k);
    };
    const arahkan = (ev) => {
      const r = tongkat.getBoundingClientRect(), jari2 = r.width / 2;
      let dx = ev.clientX - (r.left + jari2), dy = ev.clientY - (r.top + jari2);
      const jarak = Math.hypot(dx, dy), maks = jari2 - 14;
      if (jarak > maks) { dx *= maks / jarak; dy *= maks / jarak; }
      kenop.style.transform = `translate(${dx}px, ${dy}px)`;
      for (const k of this.ARAH) Mesin.tombol.delete(k);
      if (jarak < jari2 * 0.22) return;                       // zona mati di tengah
      const sudut = Math.atan2(dy, dx), iris = Math.round(sudut / (Math.PI / 4));      // delapan arah
      const peta = { 0: ['d'], 1: ['d', 's'], 2: ['s'], 3: ['a', 's'], 4: ['a'], '-4': ['a'], '-3': ['a', 'w'], '-2': ['w'], '-1': ['d', 'w'] };
      for (const k of peta[iris] || []) Mesin.tombol.add(k);
    };
    tongkat.addEventListener('pointerdown', (ev) => { ev.preventDefault(); this.jari = ev.pointerId; try { tongkat.setPointerCapture(ev.pointerId); } catch (e) { /* penunjuk sintetis */ } arahkan(ev); });
    tongkat.addEventListener('pointermove', (ev) => { if (ev.pointerId === this.jari) arahkan(ev); });
    tongkat.addEventListener('pointerup', lepas);
    tongkat.addEventListener('pointercancel', lepas);
    addEventListener('touchstart', () => document.body.classList.add('sentuh'), { once: true, passive: true });
  },
};

Sentuh.pasang();
