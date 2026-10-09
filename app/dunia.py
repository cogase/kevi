"""Dunia bersama: siapa sedang di mana, obrolan, emote, tos, suit, dan terminal — satu WebSocket per pemain.

Adegan = ruang siar. "kantor" dipakai bersama; "rumah:<id>" = tanah milik pemain itu (tamu boleh melihat).
Posisi dipercayakan ke peramban (tak ada yang bernilai dari posisi), hanya dibatasi bentuk dan lajunya.
NPC dan titik interaksi dibaca dari pengaturan admin (atur.py) dan disiarkan ulang begitu admin mengubahnya.
"""
from __future__ import annotations

import asyncio
import math
import re
import secrets
import time

from fastapi import WebSocket

from . import atur, basis, permainan, terminal

POLA_ADEGAN = re.compile(r"^(kantor|rumah:\d{1,9})$")
ARAH = {"atas", "bawah", "kiri", "kanan"}
POLA_POSE = re.compile(r"^[a-z0-9_]{0,32}$")
EMOTE = ("seru", "tanya", "hati", "tawa", "nada", "zzz", "ide", "kilau")
SUIT = ("batu", "gunting", "kertas")
TARUHAN = (0, 10, 25)
JARAK_DEKAT = 56                 # px: tos dan suit hanya dengan yang berdiri dekat
PERINTAH_BERLEVEL = {"trace": "trace", "mtr": "mtr", "port": "port"}
RIWAYAT_OBROLAN = 2000           # baris obrolan yang disimpan untuk admin


class Dunia:
    def __init__(self, kon):
        self.kon = kon
        self.pemain: dict[int, dict] = {}
        self.suit: dict[str, dict] = {}

    # ------------------------------------------------------------ siaran
    def _publik(self, p: dict) -> dict:
        return {k: p[k] for k in ("id", "nama", "tampilan", "adegan", "x", "y", "arah", "jalan", "pose", "level")}

    async def _kirim(self, p: dict, pesan: dict) -> None:
        try:
            await p["ws"].send_json(pesan)
        except Exception:      # noqa: BLE001 — soket yang sudah mati dibersihkan oleh putus()
            pass

    async def siar(self, adegan: str | None, pesan: dict, kecuali: int | None = None) -> None:
        """Ke semua pemain di satu adegan; adegan None = seluruh server."""
        tuju = [p for p in self.pemain.values() if (adegan is None or p["adegan"] == adegan) and p["id"] != kecuali]
        if tuju:
            await asyncio.gather(*(self._kirim(p, pesan) for p in tuju))

    async def kabari(self, uid: int, pesan: dict) -> None:
        p = self.pemain.get(uid)
        if p:
            await self._kirim(p, pesan)

    def daring(self) -> list[dict]:
        return [{"id": p["id"], "nama": p["nama"], "adegan": p["adegan"], "level": p["level"]} for p in self.pemain.values()]

    def _dunia(self) -> dict:
        with basis.KUNCI:
            d = atur.baca(self.kon)
            peta = permainan.baca_peta(self.kon)
        return {"npc": d["npc"], "titik": d["titik"], "atur": atur.publik(d), "peta": peta}

    async def siar_peta(self) -> None:
        with basis.KUNCI:
            peta = permainan.baca_peta(self.kon)
        await self.siar(None, {"t": "peta", "peta": peta})      # juga ke yang sedang di rumah: mereka memakainya saat kembali ke kantor

    async def putar_pesan(self) -> None:
        """Pesan sistem berulang: satu pesan tiap `pesan_jeda` menit, bergiliran, selama ada yang daring."""
        giliran = 0
        while True:
            with basis.KUNCI:
                d = atur.baca(self.kon)
            await asyncio.sleep(max(60, int(d["pesan_jeda"]) * 60))
            with basis.KUNCI:
                pesan = atur.baca(self.kon)["pesan_sistem"]
            if pesan and self.pemain:
                await self.siar(None, {"t": "sistem", "teks": pesan[giliran % len(pesan)]})
                giliran += 1

    async def kabar_stamina(self, uid: int) -> None:
        with basis.KUNCI:
            potret = permainan.potret_stamina(self.kon, uid)
        await self.kabari(uid, {"t": "stamina", "stamina": potret})

    async def putar_lapar(self, jeda: float = 60.0) -> None:
        """Tiap menit, pemain yang daring bertambah lapar (stamina turun) dan dikabari nilainya."""
        while True:
            await asyncio.sleep(jeda)
            for uid in list(self.pemain):
                with basis.KUNCI:
                    permainan.ubah_stamina(self.kon, uid, -permainan.LAPAR_PER_MENIT * jeda / 60.0)
                    permainan.tambah_statistik(self.kon, uid, "menit")        # lama bermain, tampil di profil
                await self.kabar_stamina(uid)

    async def siar_dunia(self) -> None:
        """Admin mengubah NPC / titik / pengaturan: semua layar ikut berubah tanpa muat ulang."""
        await self.siar(None, dict(self._dunia(), t="dunia"))

    async def tendang(self, uid: int, alasan: str) -> None:
        p = self.pemain.get(uid)
        if p:
            await self._kirim(p, {"t": "ditendang", "alasan": alasan})
            try:
                await p["ws"].close()
            except Exception:  # noqa: BLE001
                pass

    # ------------------------------------------------------------ sambung / putus
    async def sambung(self, ws: WebSocket, pemakai, karakter) -> dict:
        uid = pemakai["id"]
        lama = self.pemain.pop(uid, None)
        if lama:                                   # satu karakter = satu layar; tab lama diputus
            await self._kirim(lama, {"t": "ganti_tab"})
            try:
                await lama["ws"].close()
            except Exception:  # noqa: BLE001
                pass
            await self.siar(lama["adegan"], {"t": "keluar", "id": uid})
        adegan = karakter["adegan"] if POLA_ADEGAN.match(karakter["adegan"] or "") else "kantor"
        if adegan.startswith("rumah:") and adegan != f"rumah:{uid}":
            adegan = "kantor"
        p = {"id": uid, "ws": ws, "nama": karakter["nama"], "tampilan": basis.muat_json(karakter["tampilan"], {}),
             "adegan": adegan, "x": karakter["x"], "y": karakter["y"], "arah": "bawah", "jalan": False, "pose": "",
             "level": permainan.level_dari(int(karakter["xp"] or 0)),
             "obrol": 0.0, "emot": 0.0, "tugas": None, "keluaran": [], "sapa": set(), "tos": set()}
        self.pemain[uid] = p
        with basis.KUNCI:
            riwayat = [dict(r) for r in self.kon.execute(
                "SELECT pemakai_id AS id, nama, teks, waktu FROM obrolan WHERE saluran = 'semua' ORDER BY id DESC LIMIT 15")][::-1]
        await self._kirim(p, dict(self._dunia(), t="halo", saya=self._publik(p), riwayat=riwayat,
                                  pemain=[self._publik(q) for q in self.pemain.values() if q["adegan"] == adegan and q["id"] != uid]))
        await self.siar(adegan, {"t": "masuk", "pemain": self._publik(p)}, kecuali=uid)
        return p

    async def putus(self, p: dict) -> None:
        if self.pemain.get(p["id"]) is not p:
            return
        self.pemain.pop(p["id"], None)
        if p["tugas"]:
            p["tugas"].cancel()
        for sid, s in list(self.suit.items()):
            if p["id"] in (s["a"], s["b"]):
                await self._suit_batal(sid, p["nama"] + " pergi.")
        self._simpan_posisi(p)
        await self.siar(p["adegan"], {"t": "keluar", "id": p["id"]})

    def _simpan_posisi(self, p: dict) -> None:
        with basis.KUNCI:
            self.kon.execute("UPDATE karakter SET adegan = ?, x = ?, y = ? WHERE pemakai_id = ?", (p["adegan"], p["x"], p["y"], p["id"]))

    async def segarkan(self, uid: int, nama: str, tampilan: dict) -> None:
        """Pemain mengubah karakternya: rekan di adegan yang sama langsung melihat tampilan barunya."""
        p = self.pemain.get(uid)
        if p:
            p["nama"], p["tampilan"] = nama, tampilan
            await self.siar(p["adegan"], {"t": "rupa", "id": uid, "nama": nama, "tampilan": tampilan}, kecuali=uid)

    # ------------------------------------------------------------ level
    async def kabar_level(self, p: dict, sebelum: int | None = None) -> None:
        """Kirim XP/level terbaru ke pemain; bila levelnya naik, rekan seadegan ikut diberi tahu."""
        with basis.KUNCI:
            lv = permainan.potret_level(self.kon, p["id"])
            koin = permainan.saldo(self.kon, p["id"])
        naik = sebelum is not None and lv["level"] > sebelum
        p["level"] = lv["level"]
        await self._kirim(p, {"t": "level", "level": lv, "naik": naik, "saldo": koin})
        if naik:
            await self.siar(p["adegan"], {"t": "naik", "id": p["id"], "nama": p["nama"], "level": lv["level"]}, kecuali=p["id"])

    def _dekat(self, p: dict, q: dict | None) -> bool:
        return bool(q and q is not p and q["adegan"] == p["adegan"]
                    and math.hypot((q["x"] or 0) - (p["x"] or 0), (q["y"] or 0) - (p["y"] or 0)) <= JARAK_DEKAT)

    # ------------------------------------------------------------ pesan masuk
    async def terima(self, p: dict, m: dict) -> None:
        t = m.get("t")
        if t == "pos":
            x, y = m.get("x"), m.get("y")
            if not (isinstance(x, (int, float)) and isinstance(y, (int, float)) and math.isfinite(x) and math.isfinite(y)):
                return
            p["x"], p["y"] = max(-64.0, min(4096.0, float(x))), max(-64.0, min(4096.0, float(y)))
            p["arah"] = m.get("arah") if m.get("arah") in ARAH else "bawah"
            p["jalan"] = bool(m.get("jalan"))
            p["pose"] = m.get("pose") if isinstance(m.get("pose"), str) and POLA_POSE.match(m["pose"]) else ""
            await self.siar(p["adegan"], {"t": "pos", "id": p["id"], "x": p["x"], "y": p["y"], "arah": p["arah"],
                                           "jalan": p["jalan"], "pose": p["pose"]}, kecuali=p["id"])
        elif t == "adegan":
            await self._pindah_adegan(p, m)
        elif t == "obrol":
            await self._obrol(p, m)
        elif t == "emot":
            kini = time.time()
            if m.get("n") in EMOTE and kini - p["emot"] >= 0.8:
                p["emot"] = kini
                await self.siar(p["adegan"], {"t": "emot", "id": p["id"], "n": m["n"]})
        elif t == "sapa":
            siapa = str(m.get("siapa") or "")
            with basis.KUNCI:
                kenal = {"npc:" + n["id"] for n in atur.baca(self.kon)["npc"]}
            if p["adegan"] == "kantor" and siapa in kenal:          # hanya NPC yang memang ada; tak bisa dikarang peramban
                await self._sapa(p, siapa)
        elif t == "tos":
            await self._tos(p, m.get("ke"))
        elif t in ("suit_ajak", "suit_jawab", "suit_pilih"):
            await getattr(self, "_" + t)(p, m)
        elif t == "term":
            await self._term(p, str(m.get("baris") or ""))
        elif t == "term_batal":
            if p["tugas"]:
                p["tugas"].cancel()

    async def _pindah_adegan(self, p: dict, m: dict) -> None:
        baru = str(m.get("adegan") or "")
        if not POLA_ADEGAN.match(baru):
            return
        if baru.startswith("rumah:"):
            pemilik = int(baru[6:])
            with basis.KUNCI:
                ada = self.kon.execute("SELECT 1 FROM karakter WHERE pemakai_id = ?", (pemilik,)).fetchone()
            if not ada:
                return
        lama = p["adegan"]
        if lama != baru:
            await self.siar(lama, {"t": "keluar", "id": p["id"]}, kecuali=p["id"])
        p["adegan"] = baru
        x, y = m.get("x"), m.get("y")
        if isinstance(x, (int, float)) and isinstance(y, (int, float)):
            p["x"], p["y"] = float(x), float(y)
        self._simpan_posisi(p)
        await self._kirim(p, {"t": "adegan", "adegan": baru,
                               "pemain": [self._publik(q) for q in self.pemain.values() if q["adegan"] == baru and q["id"] != p["id"]]})
        await self.siar(baru, {"t": "masuk", "pemain": self._publik(p)}, kecuali=p["id"])

    async def _obrol(self, p: dict, m: dict) -> None:
        teks = " ".join(str(m.get("teks") or "").split())[:160]
        kini = time.time()
        if not teks or kini - p["obrol"] < 0.6:
            return
        p["obrol"] = kini
        if m.get("saluran") == "bisik":                       # bisik: hanya pengirim dan penerima; tidak disimpan
            q = self.pemain.get(m.get("ke")) if isinstance(m.get("ke"), int) else None
            if not q or q is p:
                await self._kirim(p, {"t": "info", "teks": "Orang itu sedang tidak daring."})
                return
            pesan = {"t": "obrol", "id": p["id"], "nama": p["nama"], "teks": teks, "saluran": "bisik", "ke": q["id"], "ke_nama": q["nama"]}
            await self._kirim(q, pesan)
            await self._kirim(p, pesan)
            return
        saluran = "semua" if m.get("saluran") == "semua" else "sekitar"
        with basis.KUNCI:
            cur = self.kon.execute("INSERT INTO obrolan (waktu, pemakai_id, nama, saluran, teks) VALUES (?, ?, ?, ?, ?)",
                                   (kini, p["id"], p["nama"], saluran if saluran == "semua" else p["adegan"], teks))
            if cur.lastrowid % 200 == 0:
                self.kon.execute("DELETE FROM obrolan WHERE id <= ?", (cur.lastrowid - RIWAYAT_OBROLAN,))
        pesan = {"t": "obrol", "id": p["id"], "nama": p["nama"], "teks": teks, "saluran": saluran}
        await self.siar(None if saluran == "semua" else p["adegan"], pesan)
        if any(q["adegan"] == p["adegan"] and q["id"] != p["id"] for q in self.pemain.values()):
            await self._sapa(p, "obrolan")

    async def _sapa(self, p: dict, siapa: str) -> None:
        """Misi "ngobrol" + XP: tiap lawan bicara (NPC atau obrolan dengan rekan) dihitung sekali per sambungan."""
        if not siapa or siapa in p["sapa"]:
            return
        p["sapa"].add(siapa)
        with basis.KUNCI:
            sebelum = permainan.level(self.kon, p["id"])
            cair = permainan.catat_aksi(self.kon, p["id"], "sapa", 1)
            permainan.xp_kegiatan(self.kon, p["id"], "sapa")
            koin = permainan.saldo(self.kon, p["id"])
        await self._hadiah(p, cair, koin)
        await self.kabar_level(p, sebelum)

    async def _hadiah(self, p: dict, cair: list[dict], koin: int) -> None:
        for c in cair:
            await self._kirim(p, {"t": "hadiah", "judul": c["judul"], "koin": c["koin"], "saldo": koin})

    # ------------------------------------------------------------ tos & suit
    async def _tos(self, p: dict, ke) -> None:
        q = self.pemain.get(ke) if isinstance(ke, int) else None
        if not self._dekat(p, q):
            await self._kirim(p, {"t": "info", "teks": "Terlalu jauh untuk tos."})
            return
        with basis.KUNCI:
            try:
                permainan.butuh_level(self.kon, p["id"], "tos")
            except permainan.Ditolak as e:
                tolak = str(e)
            else:
                tolak = ""
        if tolak:
            await self._kirim(p, {"t": "info", "teks": tolak})
            return
        await self.siar(p["adegan"], {"t": "tos", "a": p["id"], "b": q["id"]})
        if q["id"] in p["tos"]:                                    # XP tos: sekali per pasangan per sambungan
            return
        p["tos"].add(q["id"])
        q["tos"].add(p["id"])
        for r in (p, q):
            with basis.KUNCI:
                sebelum = permainan.level(self.kon, r["id"])
                permainan.xp_kegiatan(self.kon, r["id"], "tos")
            await self.kabar_level(r, sebelum)

    async def _suit_ajak(self, p: dict, m: dict) -> None:
        q = self.pemain.get(m.get("ke")) if isinstance(m.get("ke"), int) else None
        taruhan = m.get("taruhan") if m.get("taruhan") in TARUHAN else 0
        galat = ""
        with basis.KUNCI:
            try:
                permainan.butuh_level(self.kon, p["id"], "suit")
                if not self._dekat(p, q):
                    raise permainan.Ditolak("Terlalu jauh. Dekati dulu lawannya.")
                if any(p["id"] in (s["a"], s["b"]) or q["id"] in (s["a"], s["b"]) for s in self.suit.values()):
                    raise permainan.Ditolak("Salah satu dari kalian sedang bermain suit.")
                if taruhan and min(permainan.saldo(self.kon, p["id"]), permainan.saldo(self.kon, q["id"])) < taruhan:
                    raise permainan.Ditolak("Koin salah satu pemain tidak cukup untuk taruhan itu.")
            except permainan.Ditolak as e:
                galat = str(e)
        if galat:
            await self._kirim(p, {"t": "info", "teks": galat})
            return
        sid = secrets.token_urlsafe(8)
        self.suit[sid] = {"a": p["id"], "b": q["id"], "taruhan": taruhan, "pilih": {}, "terima": False}
        await self._kirim(q, {"t": "suit_ajak", "id": sid, "dari": p["id"], "nama": p["nama"], "taruhan": taruhan})
        await self._kirim(p, {"t": "suit_tunggu", "id": sid, "nama": q["nama"]})
        asyncio.get_running_loop().call_later(45, lambda: asyncio.ensure_future(self._suit_batal(sid, "Waktu habis.")))

    async def _suit_batal(self, sid: str, alasan: str) -> None:
        s = self.suit.pop(sid, None)
        if s:
            for uid in (s["a"], s["b"]):
                await self.kabari(uid, {"t": "suit_batal", "id": sid, "alasan": alasan})

    async def _suit_jawab(self, p: dict, m: dict) -> None:
        sid = str(m.get("id") or "")
        s = self.suit.get(sid)
        if not s or s["b"] != p["id"] or s["terima"]:
            return
        if not m.get("terima"):
            await self._suit_batal(sid, p["nama"] + " menolak.")
            return
        s["terima"] = True
        for uid, lawan in ((s["a"], s["b"]), (s["b"], s["a"])):
            await self.kabari(uid, {"t": "suit_mulai", "id": sid, "lawan": self.pemain[lawan]["nama"], "taruhan": s["taruhan"]})

    async def _suit_pilih(self, p: dict, m: dict) -> None:
        sid = str(m.get("id") or "")
        s = self.suit.get(sid)
        if not s or not s["terima"] or p["id"] not in (s["a"], s["b"]) or m.get("pilih") not in SUIT or p["id"] in s["pilih"]:
            return
        s["pilih"][p["id"]] = m["pilih"]
        if len(s["pilih"]) < 2:
            return
        self.suit.pop(sid, None)
        a, b = s["a"], s["b"]
        pa, pb = s["pilih"][a], s["pilih"][b]
        menang = None if pa == pb else (a if (SUIT.index(pa) - SUIT.index(pb)) % 3 == 2 else b)   # batu > gunting > kertas > batu
        sebelum = {}
        with basis.KUNCI:
            taruhan = s["taruhan"]
            if menang and taruhan and min(permainan.saldo(self.kon, a), permainan.saldo(self.kon, b)) >= taruhan:
                kalah = b if menang == a else a
                permainan.ubah_koin(self.kon, kalah, -taruhan, "kalah suit")
                permainan.ubah_koin(self.kon, menang, taruhan, "menang suit")
            else:
                taruhan = 0
            for uid in (a, b):
                sebelum[uid] = permainan.level(self.kon, uid)
                permainan.xp_kegiatan(self.kon, uid, "suit")
        for uid, saya, lawan in ((a, pa, pb), (b, pb, pa)):
            r = self.pemain.get(uid)
            if not r:
                continue
            await self._kirim(r, {"t": "suit_hasil", "id": sid, "saya": saya, "lawan": lawan, "taruhan": taruhan,
                                   "hasil": "seri" if menang is None else ("menang" if menang == uid else "kalah")})
            await self.kabar_level(r, sebelum[uid])
        if menang and menang in self.pemain:
            await self.siar(self.pemain[menang]["adegan"], {"t": "emot", "id": menang, "n": "kilau"})

    # ------------------------------------------------------------ terminal
    async def _term(self, p: dict, baris: str) -> None:
        async def tulis(*teks: str, kelas: str = "") -> None:
            for b in teks:
                await self._kirim(p, {"t": "term", "baris": b, "kelas": kelas})

        try:
            perintah, arg = terminal.urai(baris)
        except terminal.TerminalDitolak as e:
            if str(e):
                await tulis(str(e), kelas="galat")
            await self._kirim(p, {"t": "term_selesai"})
            return
        if perintah == "help":
            await tulis(*terminal.BANTUAN)
        elif perintah == "clear":
            await self._kirim(p, {"t": "term_bersih"})
        elif perintah == "whoami":
            await tulis(f"{p['nama']} (level {p['level']})")
        elif perintah == "catat":
            if not p["keluaran"]:
                await tulis("Belum ada keluaran untuk dicatat.", kelas="galat")
            else:
                judul = (" ".join(arg) or "Terminal: " + p["keluaran"][0].removeprefix("$ "))[:80]
                with basis.KUNCI:
                    sebelum = permainan.level(self.kon, p["id"])
                    self.kon.execute("INSERT INTO catatan (pemakai_id, judul, isi, diubah) VALUES (?, ?, ?, ?)",
                                     (p["id"], judul, "\n".join(p["keluaran"])[:8000], time.time()))
                    cair = permainan.catat_aksi(self.kon, p["id"], "catat", 1)
                    permainan.xp_kegiatan(self.kon, p["id"], "catat")
                    koin = permainan.saldo(self.kon, p["id"])
                await tulis(f'Tersimpan di Note: "{judul}"', kelas="info")
                await self._hadiah(p, cair, koin)
                await self.kabar_level(p, sebelum)
        else:
            if perintah in PERINTAH_BERLEVEL:
                with basis.KUNCI:
                    try:
                        permainan.butuh_level(self.kon, p["id"], PERINTAH_BERLEVEL[perintah])
                    except permainan.Ditolak as e:
                        tolak = str(e)
                    else:
                        tolak = ""
                if tolak:
                    await tulis(tolak, kelas="galat")
                    await self._kirim(p, {"t": "term_selesai"})
                    return
            if p["tugas"] and not p["tugas"].done():
                await tulis("Masih ada perintah berjalan. Ctrl+C untuk menghentikan.", kelas="galat")
                return
            p["tugas"] = asyncio.create_task(self._jalankan(p, perintah, arg, baris.strip()))
            return
        await self._kirim(p, {"t": "term_selesai"})

    async def _jalankan(self, p: dict, perintah: str, arg: list[str], asli: str) -> None:
        keluaran = ["$ " + asli[:200]]
        berhasil = False
        try:
            async for b in terminal.jalankan(p["id"], perintah, arg):
                keluaran.append(b)
                berhasil = True
                await self._kirim(p, {"t": "term", "baris": b, "kelas": ""})
        except terminal.TerminalDitolak as e:
            await self._kirim(p, {"t": "term", "baris": str(e), "kelas": "galat"})
        except asyncio.CancelledError:
            await self._kirim(p, {"t": "term", "baris": "^C", "kelas": "galat"})
        except Exception as e:  # noqa: BLE001 — galat proses tak boleh memutus soket pemain
            await self._kirim(p, {"t": "term", "baris": f"galat: {e.__class__.__name__}", "kelas": "galat"})
        finally:
            p["keluaran"] = keluaran[:120]
            if berhasil:
                with basis.KUNCI:
                    sebelum = permainan.level(self.kon, p["id"])
                    self.kon.execute("INSERT INTO log_terminal (pemakai_id, waktu, perintah, sasaran) VALUES (?, ?, ?, ?)",
                                     (p["id"], time.time(), perintah, (arg[0] if arg else "")[:253]))
                    cair = permainan.catat_aksi(self.kon, p["id"], perintah, 1) if perintah in ("ping", "trace") else []
                    permainan.tambah_statistik(self.kon, p["id"], "terminal")
                    permainan.xp_kegiatan(self.kon, p["id"], "terminal")
                    koin = permainan.saldo(self.kon, p["id"])
                await self._hadiah(p, cair, koin)
                await self.kabar_level(p, sebelum)
                await self.kabar_stamina(p["id"])
            await self._kirim(p, {"t": "term_selesai"})
