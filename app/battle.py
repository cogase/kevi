"""Battle: serangan zombie di peta bersama (kantor). Konsep dan keputusan yosi ada di docs/KONSEP-battle.md.

Semua yang menentukan hasil dihitung di sini, bukan di peramban: posisi dan HP zombie, kena atau tidaknya pukulan,
Health pemain, hadiah, dan denda saat pingsan. Peramban hanya mengirim "pukul" dan menggambar apa yang disiarkan.

Zombie hanya ada selagi ada pemain di kantor; rumah selalu aman. Keadaan battle hidup di ingatan saja: restart server
mengakhiri gelombang tanpa hadiah dan memulihkan Health semua pemain.
"""
from __future__ import annotations

import asyncio
import json
import math
import random
import time

from . import atur, basis, konfig, permainan

T = 16
DETAK = 0.25                 # detik per langkah simulasi dan siaran
GELOMBANG_MAKS = 300.0       # detik; sesudah itu zombie yang tersisa pergi
ZOMBIE_MAKS = 12
JEDA_GIGIT = 1.2
JARAK_GIGIT = 14.0
JARAK_KOIN = 14.0
UMUR_KOIN = 40.0
PULIH_PER_DETIK = 1.0        # Health pulih bila 5 detik tidak digigit; tiga kali lebih cepat di rumah
JEDA_PULIH = 5.0
KEBAL_PINGSAN = 10.0
XP_ZOMBIE_PER_HARI = 60      # jumlah zombie per hari yang masih memberi EXP (koin jatuh tidak dibatasi)

# jenis: (HP, laju px/dtk, Health yang hilang per gigitan, EXP, koin jatuh min, maks)
JENIS = {
    "biasa": (6, 28.0, 8, 5, 3, 6),
    "gesit": (4, 46.0, 6, 6, 4, 8),
    "besar": (20, 18.0, 15, 20, 15, 25),
}
SENJATA = permainan.SENJATA


class Battle:
    def __init__(self, dunia):
        self.dunia = dunia
        self.kon = dunia.kon
        self.zombie: dict[int, dict] = {}
        self.koin: dict[int, dict] = {}
        self.hp: dict[int, float] = {}            # Health pemain; yang tak tercatat = penuh
        self.luka: dict[int, float] = {}          # waktu terakhir digigit
        self.kebal: dict[int, float] = {}         # tak bisa digigit sampai waktu ini (baru pingsan)
        self.pukul_berikut: dict[int, float] = {}
        self.terkirim: dict[int, int] = {}        # Health terakhir yang dikabarkan ke pemain
        self.urut = 0
        self.berikut: float | None = None         # kapan gelombang berikutnya
        self.mulai = 0.0
        self.gelombang = 0                        # nomor gelombang sejak server mulai
        self.paksa = False
        self._grid: tuple | None = None
        self._medan_cache: dict = {}
        self.acak = random.Random()

    # ------------------------------------------------------------ bantu
    def _atur(self) -> dict:
        with basis.KUNCI:
            return atur.baca(self.kon)

    def hp_maks(self, p: dict) -> int:
        return permainan.STAMINA_DASAR + (int(p.get("level") or 1) - 1) * permainan.STAMINA_PER_LEVEL

    def hp_kini(self, p: dict) -> float:
        return min(self.hp.get(p["id"], float(self.hp_maks(p))), float(self.hp_maks(p)))

    def _di_kantor(self) -> list[dict]:
        return [p for p in self.dunia.pemain.values() if p.get("adegan") == "kantor"]

    def grid(self) -> tuple[int, int, set]:
        """(lebar, tinggi, ubin terhalang) peta aktif: dinding peta Default, tembok, dan penghalang. Perabot tidak
        dihitung (zombie boleh menerobosnya), supaya server tak perlu meniru hitungan jejak perabot di peramban."""
        with basis.KUNCI:
            peta = permainan.baca_peta(self.kon)
        kunci = (peta.get("rev"), peta.get("dasar"), peta.get("lebar"), peta.get("tinggi"))
        if self._grid and self._grid[0] == kunci:
            return self._grid[1]
        padat: set = set()
        if peta.get("dasar") == "default":
            try:
                baris = json.loads((konfig.STATIS / "peta" / "kantor.json").read_text())["grid"]
                padat |= {(x, y) for y, b in enumerate(baris) for x, c in enumerate(b) if c == "#"}
            except (OSError, ValueError, KeyError):
                pass
        _, tembok = permainan._ubin_efektif(peta)
        for k in list(tembok) + list(peta.get("halang") or {}):
            try:
                gx, gy = (int(v) for v in k.split(","))
                padat.add((gx, gy))
            except ValueError:
                continue
        hasil = (int(peta.get("lebar") or 45), int(peta.get("tinggi") or 46), padat)
        self._grid = (kunci, hasil)
        return hasil

    @staticmethod
    def _ubin(x: float, y: float) -> tuple[int, int]:
        return int((x + 8) // T), int((y + 16) // T)

    def _bebas(self, x: float, y: float) -> bool:
        w, h, padat = self.grid()
        gx, gy = self._ubin(x, y)
        return 0 <= gx < w and 0 <= gy < h and (gx, gy) not in padat

    def _medan(self, tuju: tuple[int, int]) -> dict:
        """Jarak langkah (4 arah) dari tiap ubin bebas ke ubin `tuju`. Dihitung sekali per langkah per ubin sasaran dan
        dipakai semua zombie yang mengincar pemain itu, supaya zombie memutari tembok alih-alih tersangkut."""
        if tuju in self._medan_cache:
            return self._medan_cache[tuju]
        w, h, padat = self.grid()
        jarak, antre = {tuju: 0}, [tuju]
        for gx, gy in antre:
            for nx, ny in ((gx + 1, gy), (gx - 1, gy), (gx, gy + 1), (gx, gy - 1)):
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in padat and (nx, ny) not in jarak:
                    jarak[(nx, ny)] = jarak[(gx, gy)] + 1
                    antre.append((nx, ny))
        self._medan_cache[tuju] = jarak
        return jarak

    def potret(self) -> dict:
        return {"t": "zombie", "z": [[z["id"], z["jenis"], round(z["x"]), round(z["y"]), z["hp"], z["maks"]] for z in self.zombie.values()],
                "k": [[k["id"], round(k["x"]), round(k["y"]), k["n"]] for k in self.koin.values()]}

    # ------------------------------------------------------------ gelombang
    def _jeda(self, a: dict) -> float:
        menit = float(a["zombie_menit"])
        return 60.0 * (menit * self.acak.uniform(0.5, 2.0) if a["zombie_acak"] else menit)

    def panggil(self) -> None:
        """Admin: gelombang berikutnya datang sekarang juga (walau sakelar utama mati)."""
        self.paksa = True

    def _tempat_muncul(self, pemain: list[dict]) -> tuple[float, float] | None:
        w, h, _ = self.grid()
        jauh = lambda x, y, batas: all(math.hypot(x - (p["x"] or 0), y - (p["y"] or 0)) >= batas for p in pemain)  # noqa: E731
        for batas, tepi in ((110, True), (110, False), (60, False)):
            for _ in range(60):
                if tepi:
                    sisi = self.acak.randrange(4)
                    gx = self.acak.randrange(w) if sisi < 2 else (self.acak.randrange(2) if sisi == 2 else w - 1 - self.acak.randrange(2))
                    gy = (self.acak.randrange(2) if sisi == 0 else h - 1 - self.acak.randrange(2)) if sisi < 2 else self.acak.randrange(h)
                else:
                    gx, gy = self.acak.randrange(w), self.acak.randrange(h)
                x, y = gx * T, gy * T - 4
                if self._bebas(x, y) and jauh(x, y, batas):
                    return float(x), float(y)
        return None

    def munculkan(self, pemain: list[dict], a: dict, kini: float) -> int:
        self.gelombang += 1
        n = int(a["zombie_jumlah"]) or min(ZOMBIE_MAKS, 2 + len(pemain))
        kali = float(a["zombie_hp"]) / 100.0
        for i in range(max(1, min(ZOMBIE_MAKS, n))):
            jenis = "besar" if i == 0 and n >= 5 else ("gesit" if self.gelombang >= 3 and i % 3 == 2 else "biasa")
            pos = self._tempat_muncul(pemain)
            if not pos:
                continue
            self.urut += 1
            hp = max(1, round(JENIS[jenis][0] * kali))
            self.zombie[self.urut] = {"id": self.urut, "jenis": jenis, "x": pos[0], "y": pos[1], "hp": hp, "maks": hp, "gigit": kini + 1.0, "pemukul": set()}
        self.mulai = kini
        return len(self.zombie)

    # ------------------------------------------------------------ satu langkah
    async def langkah(self, kini: float | None = None, dt: float = DETAK) -> None:
        kini = time.time() if kini is None else kini
        a = self._atur()
        pemain = self._di_kantor()
        self._medan_cache.clear()
        await self._pulih(kini, dt)
        if not pemain or not (a["zombie_aktif"] or self.paksa or self.zombie or self.koin):      # koin yang jatuh tetap menunggu dipungut
            if self.zombie or self.koin:
                await self.bersihkan()
            self.berikut = None
            return
        if self.berikut is None:
            self.berikut = kini + self._jeda(a)
        if not self.zombie and (self.paksa or (a["zombie_aktif"] and kini >= self.berikut)):
            self.paksa = False
            if self.munculkan(pemain, a, kini):
                await self.dunia.siar("kantor", {"t": "gelombang", "mulai": True, "jumlah": len(self.zombie)})
            self.berikut = kini + self._jeda(a)
        if self.zombie and kini - self.mulai > GELOMBANG_MAKS:
            self.zombie.clear()
            await self.dunia.siar("kantor", {"t": "gelombang", "selesai": True, "kabur": True})
        for z in list(self.zombie.values()):
            await self._gerak(z, pemain, kini, dt)
        await self._pungut(pemain, kini)
        if self.zombie or self.koin:
            await self.dunia.siar("kantor", self.potret())

    def _sasaran(self, z: dict, pemain: list[dict], kini: float) -> dict | None:
        # Yang sedang duduk bekerja (Komputer / Remote) atau baru pingsan tidak diincar.
        boleh = [p for p in pemain if self.kebal.get(p["id"], 0) <= kini and not (str(p.get("pose") or "").startswith("main_") or "duduk" in str(p.get("pose") or ""))]
        return min(boleh, key=lambda p: math.hypot((p["x"] or 0) - z["x"], (p["y"] or 0) - z["y"]), default=None)

    async def _gerak(self, z: dict, pemain: list[dict], kini: float, dt: float) -> None:
        p = self._sasaran(z, pemain, kini)
        if not p:
            return
        dx, dy = (p["x"] or 0) - z["x"], (p["y"] or 0) - z["y"]
        jarak = math.hypot(dx, dy)
        if jarak <= JARAK_GIGIT:
            if kini >= z["gigit"]:
                z["gigit"] = kini + JEDA_GIGIT
                await self._gigit(p, JENIS[z["jenis"]][2], kini)
            return
        langkah = min(jarak, JENIS[z["jenis"]][1] * dt)
        # Jauh dari sasaran: ikuti medan jarak, ubin demi ubin. Sudah dekat (atau tak ada jalan): langsung mendekat.
        gz, gp = self._ubin(z["x"], z["y"]), self._ubin(p["x"] or 0, p["y"] or 0)
        if gz != gp and jarak > 24:
            medan = self._medan(gp)
            tetangga = [n for n in ((gz[0] + 1, gz[1]), (gz[0] - 1, gz[1]), (gz[0], gz[1] + 1), (gz[0], gz[1] - 1)) if n in medan]
            if tetangga and (gz not in medan or min(medan[n] for n in tetangga) < medan[gz]):
                tuju = min(tetangga, key=lambda n: medan[n])
                tx, ty = tuju[0] * T, tuju[1] * T - 8
                jx, jy = tx - z["x"], ty - z["y"]
                j = math.hypot(jx, jy) or 1.0
                z["x"], z["y"] = z["x"] + jx / j * min(j, langkah), z["y"] + jy / j * min(j, langkah)
                return
        vx, vy = dx / jarak * langkah, dy / jarak * langkah
        for nx, ny in ((z["x"] + vx, z["y"] + vy), (z["x"] + math.copysign(langkah, dx), z["y"]), (z["x"], z["y"] + math.copysign(langkah, dy))):
            if self._bebas(nx, ny):
                z["x"], z["y"] = nx, ny
                return

    async def _gigit(self, p: dict, serang: int, kini: float) -> None:
        uid = p["id"]
        sisa = self.hp_kini(p) - serang
        self.hp[uid] = sisa
        self.luka[uid] = kini
        if sisa > 0:
            await self._kabar_hp(p, gigit=True)
        else:
            await self.pingsan(p, kini)

    async def pingsan(self, p: dict, kini: float) -> None:
        """Health habis (kata yosi): bangun lagi di rumah dan EXP berkurang; level bisa turun."""
        uid = p["id"]
        denda = int(self._atur()["zombie_denda_xp"])
        with basis.KUNCI:
            lama = permainan.xp_kini(self.kon, uid)
            hilang = min(lama, denda)
            self.kon.execute("UPDATE karakter SET xp = ? WHERE pemakai_id = ?", (lama - hilang, uid))
            lv = permainan.potret_level(self.kon, uid)
        turun = lv["level"] < int(p.get("level") or 1)
        p["level"] = lv["level"]
        self.hp[uid] = self.hp_maks(p) / 2
        self.kebal[uid] = kini + KEBAL_PINGSAN
        self.terkirim[uid] = round(self.hp[uid])
        await self.dunia._kirim(p, {"t": "pingsan", "xp_hilang": hilang, "level": lv, "turun": turun, "hp": round(self.hp[uid]), "maks": self.hp_maks(p)})

    async def _kabar_hp(self, p: dict, gigit: bool = False) -> None:
        nilai = max(0, round(self.hp_kini(p)))
        self.terkirim[p["id"]] = nilai
        await self.dunia._kirim(p, {"t": "hp", "hp": nilai, "maks": self.hp_maks(p), "gigit": gigit})

    async def _pulih(self, kini: float, dt: float) -> None:
        for p in list(self.dunia.pemain.values()):
            uid, maks = p["id"], float(self.hp_maks(p))
            if uid not in self.hp:
                continue
            if kini - self.luka.get(uid, 0) >= JEDA_PULIH:
                self.hp[uid] = min(maks, self.hp[uid] + PULIH_PER_DETIK * dt * (3 if str(p.get("adegan") or "").startswith("rumah:") else 1))
            if self.hp[uid] >= maks:
                del self.hp[uid]
            if round(self.hp_kini(p)) != self.terkirim.get(uid, round(maks)):
                await self._kabar_hp(p)

    async def _pungut(self, pemain: list[dict], kini: float) -> None:
        for k in list(self.koin.values()):
            if kini > k["habis"]:
                del self.koin[k["id"]]
                continue
            p = next((p for p in pemain if math.hypot((p["x"] or 0) - k["x"], (p["y"] or 0) + 8 - k["y"]) <= JARAK_KOIN), None)
            if not p:
                continue
            del self.koin[k["id"]]
            with basis.KUNCI:
                permainan.ubah_koin(self.kon, p["id"], k["n"], "koin zombie")
            await self.dunia.siar("kantor", {"t": "koin_ambil", "id": k["id"], "oleh": p["id"], "n": k["n"], "x": round(k["x"]), "y": round(k["y"])})
            await self.dunia.kabar_level(p)

    async def bersihkan(self) -> None:
        self.zombie.clear()
        self.koin.clear()
        await self.dunia.siar(None, {"t": "zombie", "z": [], "k": []})

    # ------------------------------------------------------------ pukulan pemain
    def senjata_dipegang(self, p: dict, kode) -> str:
        """Senjata yang sah dipakai: kode yang dikirim peramban hanya diterima bila barangnya memang dimiliki."""
        kode = str(kode or "")
        if kode not in SENJATA or not kode:
            return ""
        with basis.KUNCI:
            punya = permainan.inventori(self.kon, p["id"]).get("senjata:" + kode, 0) > 0
        return kode if punya else ""

    async def pukul(self, p: dict, m: dict, kini: float | None = None) -> None:
        kini = time.time() if kini is None else kini
        uid = p["id"]
        if p.get("adegan") != "kantor" or self.kebal.get(uid, 0) > kini or kini < self.pukul_berikut.get(uid, 0):
            return
        kode = self.senjata_dipegang(p, m.get("senjata"))
        _, damage, jeda, jangkau, _, _ = SENJATA[kode]
        self.pukul_berikut[uid] = kini + jeda
        z = min(self.zombie.values(), key=lambda z: math.hypot(z["x"] - (p["x"] or 0), z["y"] - (p["y"] or 0)), default=None)
        kena = z is not None and math.hypot(z["x"] - (p["x"] or 0), z["y"] - (p["y"] or 0)) <= jangkau + 10
        await self.dunia.siar("kantor", {"t": "ayun", "id": uid, "senjata": kode, "kena": z["id"] if kena else None})
        if not kena:
            return
        z["hp"] -= damage
        z["pemukul"].add(uid)
        if z["hp"] > 0:
            await self.dunia.siar("kantor", {"t": "zombie_kena", "id": z["id"], "dmg": damage, "hp": z["hp"]})
            return
        del self.zombie[z["id"]]
        await self._hadiah(z, kini, damage)
        if not self.zombie:
            await self.dunia.siar("kantor", {"t": "gelombang", "selesai": True})

    async def _hadiah(self, z: dict, kini: float, damage: int) -> None:
        _, _, _, exp, kmin, kmaks = JENIS[z["jenis"]]
        kali = float(self._atur()["zombie_hadiah"]) / 100.0
        exp, koin = round(exp * kali), round(self.acak.randint(kmin, kmaks) * kali)
        jatuh = None
        if koin > 0:
            self.urut += 1
            jatuh = self.koin[self.urut] = {"id": self.urut, "x": z["x"] + 8, "y": z["y"] + 14, "n": koin, "habis": kini + UMUR_KOIN}
        await self.dunia.siar("kantor", {"t": "zombie_mati", "id": z["id"], "dmg": damage, "x": round(z["x"]), "y": round(z["y"]), "jenis": z["jenis"],
                                         "koin": [jatuh["id"], round(jatuh["x"]), round(jatuh["y"]), koin] if jatuh else None})
        for uid in z["pemukul"]:
            p = self.dunia.pemain.get(uid)
            if not p:
                continue
            sebelum = p.get("level")
            with basis.KUNCI:
                permainan.tambah_statistik(self.kon, uid, "zombie")
                dapat = exp if exp > 0 and permainan.jatah_harian(self.kon, uid, "xp_zombie", XP_ZOMBIE_PER_HARI) else 0
                if dapat:
                    permainan.tambah_xp(self.kon, uid, dapat)
            await self.dunia.kabar_level(p, sebelum)

    # ------------------------------------------------------------ putaran latar
    async def putar(self) -> None:
        lalu = time.time()
        while True:
            await asyncio.sleep(DETAK)
            kini = time.time()
            try:
                await self.langkah(kini, min(1.0, kini - lalu))
            except Exception:  # noqa: BLE001 — satu galat tak boleh mematikan battle selamanya
                import traceback
                traceback.print_exc()
            lalu = kini
