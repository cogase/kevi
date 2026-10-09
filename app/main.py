"""Kevi (Kerja Virtual) — server. FastAPI + SQLite + satu WebSocket per pemain."""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
from urllib.parse import urlparse

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from . import akun, atur, basis, interaksi, koleksi, konfig, laporan_token, permainan, remote, umpan
from .dunia import Dunia

KON = basis.buka(konfig.BASIS_DATA)
atur.baca(KON)
atur.pastikan_penjual_pakaian(KON)
atur.pastikan_penjual_battle(KON)
with basis.KUNCI:
    permainan.kembalikan_ubin(KON)
DUNIA = Dunia(KON)
app = FastAPI(title="Kevi", docs_url=None, redoc_url=None, openapi_url=None)
HALAMAN = konfig.STATIS / "halaman"


def _sidik_aset() -> str:
    h = hashlib.sha256()
    for b in sorted(konfig.STATIS.rglob("*")):
        if b.is_file():
            h.update(b.name.encode() + str(b.stat().st_mtime_ns).encode())
    return h.hexdigest()[:10]


ASET = _sidik_aset()
DUNIA.aset = ASET


@app.on_event("startup")
async def _mulai() -> None:
    asyncio.get_running_loop().create_task(DUNIA.putar_pesan())
    asyncio.get_running_loop().create_task(DUNIA.putar_lapar())
    asyncio.get_running_loop().create_task(DUNIA.battle.putar())


def _alamat(request: Request) -> str:
    """Alamat klien; X-Forwarded-For hanya dipercaya bila permintaan datang dari proxy yang didaftarkan."""
    peer = request.client.host if request.client else "?"
    if peer in konfig.PROXY_TEPERCAYA:
        return (request.headers.get("x-forwarded-for") or peer).split(",")[0].strip() or peer
    return peer


def _https(request) -> bool:
    return konfig.COOKIE_SECURE or (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip() == "https"


def _halaman(nama: str) -> Response:
    """Halaman HTML statis; penanda {{aset}} diganti sidik isi supaya peramban tak menyimpan skrip basi."""
    isi = (HALAMAN / nama).read_text().replace("{{aset}}", ASET).replace("{{versi}}", konfig.VERSI)
    return Response(isi, media_type="text/html; charset=utf-8", headers={"Cache-Control": "no-store"})


def _pemakai(request: Request):
    with basis.KUNCI:
        return akun.dari_token(KON, request.cookies.get(akun.NAMA_COOKIE))


def _asal_sah(asal: str | None, host: str | None) -> bool:
    """Permintaan yang mengubah keadaan harus datang dari halaman Kevi sendiri (pagar CSRF, bersama SameSite)."""
    if not asal:
        return True          # klien bukan peramban (curl, uji) tak mengirim Origin
    return urlparse(asal).netloc == (host or "")


@app.middleware("http")
async def pagar(request: Request, lanjut):
    if request.method not in ("GET", "HEAD", "OPTIONS") and not _asal_sah(request.headers.get("origin"), request.headers.get("host")):
        return JSONResponse({"galat": "Asal permintaan ditolak."}, status_code=403)
    jawab = await lanjut(request)
    jawab.headers.setdefault("X-Content-Type-Options", "nosniff")
    jawab.headers.setdefault("X-Frame-Options", "DENY")
    jawab.headers.setdefault("Referrer-Policy", "same-origin")
    if request.url.path.startswith("/static/"):
        jawab.headers["Cache-Control"] = "public, max-age=31536000, immutable" if request.query_params.get("v") else "no-cache"
    return jawab


def galat(pesan: str, kode: int = 400) -> JSONResponse:
    return JSONResponse({"galat": pesan}, status_code=kode)


async def _badan(request: Request) -> dict:
    try:
        d = await request.json()
    except (ValueError, UnicodeDecodeError):
        return {}
    return d if isinstance(d, dict) else {}


def _aksi(request: Request, fn):
    """Jalankan satu aksi permainan untuk pemain yang sedang masuk; Ditolak -> 400 berpesan."""
    p = _pemakai(request)
    if not p:
        return galat("Belum masuk.", 401)
    with basis.KUNCI:
        if not KON.execute("SELECT 1 FROM karakter WHERE pemakai_id = ?", (p["id"],)).fetchone():
            return galat("Buat karakter dulu.", 409)
        sebelum = permainan.level(KON, p["id"])
        KON.execute("BEGIN IMMEDIATE")
        try:
            hasil = fn(p["id"])
            KON.execute("COMMIT")
        except permainan.Ditolak as e:
            KON.execute("ROLLBACK")
            return galat(str(e))
        except Exception:
            KON.execute("ROLLBACK")
            raise
        hasil = dict(hasil or {})
        hasil.setdefault("koin", permainan.saldo(KON, p["id"]))
        hasil["misi"] = permainan.potret_misi(KON, p["id"])
        hasil["level"] = permainan.potret_level(KON, p["id"])
        hasil["stamina"] = permainan.potret_stamina(KON, p["id"])
        hasil["naik"] = hasil["level"]["level"] > sebelum
    pemain = DUNIA.pemain.get(p["id"])
    if pemain:
        pemain["level"] = hasil["level"]["level"]
    return JSONResponse(hasil)


# ------------------------------------------------------------------ halaman

@app.get("/health")
async def health():
    return {"status": "ok", "versi": konfig.VERSI, "daring": len(DUNIA.pemain)}


@app.get("/")
async def akar(request: Request):
    if not _pemakai(request):
        return RedirectResponse("/masuk", status_code=303)
    return _halaman("main.html")


@app.get("/masuk")
async def hal_masuk(request: Request):
    if _pemakai(request):
        return RedirectResponse("/", status_code=303)
    return _halaman("masuk.html")


@app.get("/laporan")
async def hal_laporan(request: Request):
    p = _pemakai(request)
    if not p:
        return RedirectResponse("/masuk", status_code=303)
    if p["peran"] != "admin":
        return Response("Khusus admin.", status_code=403)
    return _halaman("laporan.html")


@app.get("/admin")
async def hal_admin(request: Request):
    p = _pemakai(request)
    if not p:
        return RedirectResponse("/masuk", status_code=303)
    if p["peran"] != "admin":
        return Response("Khusus admin.", status_code=403)
    return _halaman("admin.html")


# ------------------------------------------------------------------ akun

@app.post("/api/masuk")
async def api_masuk(request: Request):
    d = await _badan(request)
    alamat = _alamat(request)
    try:
        with basis.KUNCI:
            token, _ = akun.masuk(KON, str(d.get("username") or ""), str(d.get("password") or ""), alamat, konfig.UMUR_SESI,
                                  str(d.get("kode") or ""))
    except akun.ButuhKode as e:
        return JSONResponse({"galat": str(e), "butuh_kode": True}, status_code=401)
    except akun.AkunDitolak as e:
        return galat(str(e), 401)
    jawab = JSONResponse({"ok": True})
    jawab.set_cookie(akun.NAMA_COOKIE, token, max_age=konfig.UMUR_SESI, httponly=True, samesite="lax", secure=_https(request), path="/")
    return jawab


@app.post("/api/keluar")
async def api_keluar(request: Request):
    with basis.KUNCI:
        akun.keluar(KON, request.cookies.get(akun.NAMA_COOKIE))
    jawab = JSONResponse({"ok": True})
    jawab.delete_cookie(akun.NAMA_COOKIE, path="/")
    return jawab


@app.post("/api/sandi")
async def api_sandi(request: Request):
    p = _pemakai(request)
    if not p:
        return galat("Belum masuk.", 401)
    d = await _badan(request)
    if not akun.cocok_sandi(str(d.get("lama") or ""), p["sandi"]):
        return galat("Password lama salah.")
    try:
        with basis.KUNCI:
            akun.ganti_sandi(KON, p["id"], str(d.get("baru") or ""), cabut_sesi=False)
    except akun.AkunDitolak as e:
        return galat(str(e))
    return {"ok": True}


def _rute_totp(jalur: str, fn):
    """Rute kode sekali pakai. Galat dijawab 400 (bukan 401) supaya klien tidak mengira sesinya habis."""
    async def penangan(request: Request):
        p = _pemakai(request)
        if not p:
            return galat("Belum masuk.", 401)
        d = await _badan(request)
        try:
            with basis.KUNCI:
                hasil = fn(p["id"], d, request.cookies.get(akun.NAMA_COOKIE))
        except akun.AkunDitolak as e:
            return galat(str(e))
        return hasil or {"ok": True}
    app.post(jalur)(penangan)


_rute_totp("/api/totp/mulai", lambda uid, d, token: akun.totp_mulai(KON, uid, str(d.get("password") or "")))
_rute_totp("/api/totp/pasang", lambda uid, d, token: akun.totp_pasang(KON, uid, str(d.get("kode") or ""), token))
_rute_totp("/api/totp/lepas", lambda uid, d, token: akun.totp_lepas(KON, uid, str(d.get("password") or ""), str(d.get("kode") or "")))
_rute_totp("/api/totp/segar", lambda uid, d, token: akun.totp_segarkan(KON, uid, str(d.get("kode") or ""), token))


@app.get("/api/totp")
async def api_totp(request: Request):
    p = _pemakai(request)
    if not p:
        return galat("Belum masuk.", 401)
    with basis.KUNCI:
        return {"terpasang": bool(p["totp"]), "segar": akun.totp_segar(KON, request.cookies.get(akun.NAMA_COOKIE))}


def _potret_saya(p) -> dict:
    k = KON.execute("SELECT * FROM karakter WHERE pemakai_id = ?", (p["id"],)).fetchone()
    hasil = {"pemakai": {"id": p["id"], "username": p["username"], "peran": p["peran"]}, "versi": konfig.VERSI,
             "karakter": None, "toko": permainan.info_toko(), "terminal": konfig.TERMINAL_AKTIF,
             "atur": atur.publik(atur.baca(KON)), "buka": permainan.BUKA, "nama_buka": permainan.NAMA_BUKA,
             "hadiah_naik": permainan.HADIAH_NAIK, "remote": remote.boleh(KON, p), "totp": bool(p["totp"]), "peta": permainan.baca_peta(KON)}
    if k:
        hasil["karakter"] = {"nama": k["nama"], "tampilan": basis.muat_json(k["tampilan"], {}), "adegan": k["adegan"], "x": k["x"],
                             "y": k["y"], "statistik": basis.muat_json(k["statistik"], {})}
        hasil["koin"] = k["koin"]
        hasil["inventori"] = permainan.inventori(KON, p["id"])
        hasil["misi"] = permainan.potret_misi(KON, p["id"])
        hasil["level"] = permainan.potret_level(KON, p["id"])
        hasil["stamina"] = permainan.potret_stamina(KON, p["id"])
        hasil["tas"] =permainan.potret_tas(KON, p["id"])["tas"]
        hasil["tata"] = permainan.baca_tata(KON, p["id"])
    return hasil


@app.get("/api/saya")
async def api_saya(request: Request):
    p = _pemakai(request)
    if not p:
        return galat("Belum masuk.", 401)
    with basis.KUNCI:
        bonus = 0
        if KON.execute("SELECT 1 FROM karakter WHERE pemakai_id = ?", (p["id"],)).fetchone():
            bonus = permainan.bonus_masuk(KON, p["id"])
        hasil = _potret_saya(p)
    hasil["bonus_masuk"] = bonus
    return hasil


@app.post("/api/karakter")
async def api_karakter(request: Request):
    p = _pemakai(request)
    if not p:
        return galat("Belum masuk.", 401)
    d = await _badan(request)
    try:
        with basis.KUNCI:
            permainan.buat_karakter(KON, p["id"], d.get("nama"), d.get("tampilan"))
            hasil = _potret_saya(p)
    except permainan.Ditolak as e:
        return galat(str(e))
    await DUNIA.segarkan(p["id"], hasil["karakter"]["nama"], hasil["karakter"]["tampilan"])
    return hasil


# ------------------------------------------------------------------ rumah, kebun, kandang, toko

@app.get("/api/rumah")
async def api_rumah(request: Request, milik: int | None = None):
    p = _pemakai(request)
    if not p:
        return galat("Belum masuk.", 401)
    uid = milik or p["id"]
    with basis.KUNCI:
        k = KON.execute("SELECT nama FROM karakter WHERE pemakai_id = ?", (uid,)).fetchone()
        if not k:
            return galat("Rumah tidak ditemukan.", 404)
        rumah = permainan.potret_rumah(KON, uid)
        if uid != p["id"]:
            rumah["peti"] = {}                # isi peti bukan urusan tamu
        return {"rumah": rumah, "pemilik": {"id": uid, "nama": k["nama"]}, "milik_saya": uid == p["id"]}


def _rute_aksi(jalur: str, fn):
    async def penangan(request: Request):
        d = await _badan(request)
        return _aksi(request, lambda uid: fn(uid, d))
    app.post(jalur)(penangan)


_rute_aksi("/api/rumah/pasang", lambda uid, d: permainan.pasang(KON, uid, d))
_rute_aksi("/api/rumah/angkat", lambda uid, d: permainan.angkat(KON, uid, d))
_rute_aksi("/api/rumah/pindah", lambda uid, d: permainan.pindah(KON, uid, d))
_rute_aksi("/api/rumah/peti", lambda uid, d: permainan.peti(KON, uid, d))
_rute_aksi("/api/rumah/simpan", lambda uid, d: permainan.rumah_simpan(KON, uid, d))
_rute_aksi("/api/rumah/biaya", lambda uid, d: permainan.rumah_biaya(KON, uid, d))
_rute_aksi("/api/kebun/tanam", lambda uid, d: permainan.tanam(KON, uid, d.get("id"), str(d.get("t") or "")))
_rute_aksi("/api/kebun/siram", lambda uid, d: permainan.siram(KON, uid, d.get("id")))
_rute_aksi("/api/kebun/panen", lambda uid, d: permainan.panen(KON, uid, d.get("id")))
_rute_aksi("/api/kebun/cabut", lambda uid, d: permainan.cabut(KON, uid, d.get("id")))
_rute_aksi("/api/kandang/beli", lambda uid, d: permainan.beli_hewan(KON, uid, d.get("id"), str(d.get("j") or "")))
_rute_aksi("/api/kandang/pakan", lambda uid, d: permainan.beri_pakan(KON, uid, d.get("id")))
_rute_aksi("/api/kandang/ambil", lambda uid, d: permainan.ambil_produk(KON, uid, d.get("id")))
_rute_aksi("/api/toko/beli", lambda uid, d: permainan.beli(KON, uid, str(d.get("barang") or ""), d.get("jumlah") or 1))
_rute_aksi("/api/toko/jual", lambda uid, d: permainan.jual(KON, uid, str(d.get("barang") or ""), d.get("jumlah") or 1))
_rute_aksi("/api/toko/jual-hasil", lambda uid, d: permainan.jual_semua_hasil(KON, uid))
_rute_aksi("/api/kebun/jual-pilihan", lambda uid, d: permainan.jual_pilihan(KON, uid, d.get("daftar")))
_rute_aksi("/api/toko/tas", lambda uid, d: permainan.beli_tas(KON, uid))
_rute_aksi("/api/inventori/tata", lambda uid, d: permainan.simpan_tata(KON, uid, d))
_rute_aksi("/api/inventori/makan", lambda uid, d: permainan.makan(KON, uid, d.get("barang")))
_rute_aksi("/api/inventori/masak", lambda uid, d: permainan.masak(KON, uid, str(d.get("resep") or "")))
_rute_aksi("/api/interaksi/kuis", lambda uid, d: interaksi.kuis_ambil(KON, uid))
_rute_aksi("/api/interaksi/kuis-jawab", lambda uid, d: interaksi.kuis_jawab(KON, uid, d.get("pilih")))
_rute_aksi("/api/interaksi/arcade", lambda uid, d: interaksi.arcade_mulai(KON, uid))
_rute_aksi("/api/interaksi/arcade-selesai", lambda uid, d: interaksi.arcade_selesai(KON, uid, d.get("token")))
_rute_aksi("/api/interaksi/kopi", lambda uid, d: interaksi.kopi(KON, uid))


@app.post("/api/interaksi/kirim")
async def api_kirim_koin(request: Request):
    d = await _badan(request)
    jawab = _aksi(request, lambda uid: interaksi.kirim_koin(KON, uid, d.get("ke"), d.get("jumlah")))
    if jawab.status_code == 200:
        hasil = json.loads(jawab.body)
        with basis.KUNCI:
            saldo = permainan.saldo(KON, hasil["ke"])
        await DUNIA.kabari(hasil["ke"], {"t": "kiriman", "dari": hasil["dari"], "koin": hasil["terkirim"], "saldo": saldo})
    return jawab


@app.get("/api/lemari")
async def api_lemari(request: Request):
    p = _pemakai(request)
    if not p:
        return galat("Belum masuk.", 401)
    with basis.KUNCI:
        return permainan.potret_lemari(KON, p["id"])


_rute_aksi("/api/lemari/beli", lambda uid, d: permainan.beli_pakaian(KON, uid, str(d.get("jenis") or ""), str(d.get("kode") or "")))


@app.post("/api/umpan-balik")
async def api_umpan_kirim(request: Request):
    p = _pemakai(request)
    if not p:
        return galat("Belum masuk.", 401)
    d = await _badan(request)
    try:
        with basis.KUNCI:
            uid = umpan.kirim(KON, p["id"], d, konfig.VERSI)
    except umpan.UmpanDitolak as e:
        return galat(str(e))
    return {"id": uid}


@app.get("/api/admin/umpan-balik")
async def admin_umpan_daftar(request: Request):
    if not _admin(request):
        return galat("Khusus admin.", 403)
    with basis.KUNCI:
        return {"umpan": umpan.daftar(KON), "baru": umpan.jumlah_baru(KON)}


@app.post("/api/admin/umpan-balik/ubah")
async def admin_umpan_ubah(request: Request):
    if not _admin(request):
        return galat("Khusus admin.", 403)
    d = await _badan(request)
    try:
        with basis.KUNCI:
            umpan.ubah(KON, d)
    except umpan.UmpanDitolak as e:
        return galat(str(e))
    return {"ok": True}


@app.get("/api/profil")
async def api_profil(request: Request, id: int | None = None):
    p = _pemakai(request)
    if not p:
        return galat("Belum masuk.", 401)
    try:
        with basis.KUNCI:
            hasil = permainan.potret_profil(KON, id or p["id"])
    except permainan.Ditolak as e:
        return galat(str(e), 404)
    hasil["daring"] = hasil["id"] in DUNIA.pemain
    return hasil


@app.get("/api/kas")
async def api_kas(request: Request):
    p = _pemakai(request)
    if not p:
        return galat("Belum masuk.", 401)
    with basis.KUNCI:
        baris = KON.execute("SELECT waktu, jumlah, alasan FROM buku_kas WHERE pemakai_id = ? ORDER BY id DESC LIMIT 60", (p["id"],)).fetchall()
    return {"kas": [dict(b) for b in baris]}


@app.get("/api/daring")
async def api_daring(request: Request):
    if not _pemakai(request):
        return galat("Belum masuk.", 401)
    return {"daring": DUNIA.daring()}


# ------------------------------------------------------------------ catatan (Note)

def _catatan_sah(d: dict) -> tuple[str, str]:
    judul = " ".join(str(d.get("judul") or "").split())[:80] or "Tanpa judul"
    return judul, str(d.get("isi") or "")[:8000]


@app.get("/api/catatan")
async def catatan_daftar(request: Request):
    p = _pemakai(request)
    if not p:
        return galat("Belum masuk.", 401)
    with basis.KUNCI:
        baris = KON.execute("SELECT id, judul, isi, diubah FROM catatan WHERE pemakai_id = ? ORDER BY diubah DESC LIMIT 200", (p["id"],)).fetchall()
    return {"catatan": [dict(b) for b in baris]}


@app.post("/api/catatan")
async def catatan_simpan(request: Request):
    d = await _badan(request)
    judul, isi = _catatan_sah(d)

    def kerja(uid: int):
        cid = d.get("id")
        if cid is None:
            if KON.execute("SELECT COUNT(*) FROM catatan WHERE pemakai_id = ?", (uid,)).fetchone()[0] >= 200:
                raise permainan.Ditolak("Note penuh (200). Hapus yang lama dulu.")
            cid = KON.execute("INSERT INTO catatan (pemakai_id, judul, isi, diubah) VALUES (?, ?, ?, ?)", (uid, judul, isi, time.time())).lastrowid
            permainan.catat_aksi(KON, uid, "catat", 1)
            permainan.xp_kegiatan(KON, uid, "catat")
        else:
            cur = KON.execute("UPDATE catatan SET judul = ?, isi = ?, diubah = ? WHERE id = ? AND pemakai_id = ?", (judul, isi, time.time(), cid, uid))
            if not cur.rowcount:
                raise permainan.Ditolak("Note tidak ditemukan.")
        return {"id": cid}
    return _aksi(request, kerja)


@app.post("/api/catatan/hapus")
async def catatan_hapus(request: Request):
    d = await _badan(request)

    def kerja(uid: int):
        KON.execute("DELETE FROM catatan WHERE id = ? AND pemakai_id = ?", (d.get("id"), uid))
        return {"ok": True}
    return _aksi(request, kerja)


# ------------------------------------------------------------------ admin

def _admin(request: Request):
    p = _pemakai(request)
    return p if p and p["peran"] == "admin" else None


@app.get("/api/admin/pemakai")
async def admin_daftar(request: Request):
    if not _admin(request):
        return galat("Khusus admin.", 403)
    with basis.KUNCI:
        baris = KON.execute(
            "SELECT p.id, p.username, p.peran, p.aktif, p.dibuat, k.nama, k.koin FROM pemakai p LEFT JOIN karakter k ON k.pemakai_id = p.id ORDER BY p.id").fetchall()
    return {"pemakai": [dict(b) for b in baris], "daring": [p["id"] for p in DUNIA.daring()]}


@app.post("/api/admin/pemakai")
async def admin_tambah(request: Request):
    if not _admin(request):
        return galat("Khusus admin.", 403)
    d = await _badan(request)
    try:
        with basis.KUNCI:
            uid = akun.buat_pemakai(KON, str(d.get("username") or ""), str(d.get("password") or ""), "admin" if d.get("admin") else "pemain")
    except akun.AkunDitolak as e:
        return galat(str(e))
    return {"id": uid}


@app.post("/api/admin/pemakai/ubah")
async def admin_ubah(request: Request):
    saya = _admin(request)
    if not saya:
        return galat("Khusus admin.", 403)
    d = await _badan(request)
    uid = d.get("id")
    try:
        with basis.KUNCI:
            if not KON.execute("SELECT 1 FROM pemakai WHERE id = ?", (uid,)).fetchone():
                return galat("Pemakai tidak ditemukan.", 404)
            if d.get("password"):
                akun.ganti_sandi(KON, uid, str(d["password"]))
            if "aktif" in d:
                if uid == saya["id"] and not d["aktif"]:
                    return galat("Tidak bisa menonaktifkan diri sendiri.")
                KON.execute("UPDATE pemakai SET aktif = ? WHERE id = ?", (1 if d["aktif"] else 0, uid))
                if not d["aktif"]:
                    KON.execute("DELETE FROM sesi WHERE pemakai_id = ?", (uid,))
            if "remote" in d:
                KON.execute("UPDATE pemakai SET remote = ? WHERE id = ?", (1 if d["remote"] else 0, uid))
            if d.get("totp_hapus"):
                if uid == saya["id"]:
                    return galat("TOTP sendiri dilepas lewat Menu di dalam game (butuh password dan kode).")
                akun.totp_hapus(KON, uid)
            if d.get("peran") in ("admin", "pemain"):
                if uid == saya["id"] and d["peran"] != "admin":
                    return galat("Tidak bisa mencabut admin diri sendiri.")
                KON.execute("UPDATE pemakai SET peran = ? WHERE id = ?", (d["peran"], uid))
            punya = KON.execute("SELECT 1 FROM karakter WHERE pemakai_id = ?", (uid,)).fetchone()
            if punya and isinstance(d.get("koin"), int) and not isinstance(d.get("koin"), bool) and d["koin"]:
                permainan.ubah_koin(KON, uid, max(-10 ** 6, min(10 ** 6, d["koin"])), f"penyesuaian admin ({saya['username']})")
            if punya and isinstance(d.get("stamina"), (int, float)) and not isinstance(d.get("stamina"), bool):
                permainan.ubah_stamina(KON, uid, float(d["stamina"]) - permainan.stamina(KON, uid))
            if punya and isinstance(d.get("xp"), int) and not isinstance(d.get("xp"), bool):
                KON.execute("UPDATE karakter SET xp = ? WHERE pemakai_id = ?", (max(0, min(10 ** 7, d["xp"])), uid))
    except (akun.AkunDitolak, permainan.Ditolak) as e:
        return galat(str(e))
    if d.get("aktif") is False:
        await DUNIA.tendang(uid, "Akun dinonaktifkan admin.")
    pemain = DUNIA.pemain.get(uid)
    if pemain:
        await DUNIA.kabar_level(pemain, pemain["level"])
        await DUNIA.kabar_stamina(uid)
    return {"ok": True}


@app.get("/api/admin/dasbor")
async def admin_dasbor(request: Request):
    """Ringkasan seluruh permainan untuk dashboard admin."""
    if not _admin(request):
        return galat("Khusus admin.", 403)
    kini = time.time()
    awal_hari = kini - ((kini + 7 * 3600) % 86400)
    with basis.KUNCI:
        satu = lambda q, *a: KON.execute(q, a).fetchone()[0]           # noqa: E731
        ringkas = {
            "pemakai": satu("SELECT COUNT(*) FROM pemakai"), "aktif": satu("SELECT COUNT(*) FROM pemakai WHERE aktif = 1"),
            "karakter": satu("SELECT COUNT(*) FROM karakter"), "koin_beredar": satu("SELECT COALESCE(SUM(koin), 0) FROM karakter"),
            "terminal_hari_ini": satu("SELECT COUNT(*) FROM log_terminal WHERE waktu >= ?", awal_hari),
            "obrolan_hari_ini": satu("SELECT COUNT(*) FROM obrolan WHERE waktu >= ?", awal_hari),
            "koin_masuk_hari_ini": satu("SELECT COALESCE(SUM(jumlah), 0) FROM buku_kas WHERE jumlah > 0 AND waktu >= ?", awal_hari),
            "koin_keluar_hari_ini": -satu("SELECT COALESCE(SUM(jumlah), 0) FROM buku_kas WHERE jumlah < 0 AND waktu >= ?", awal_hari),
            "catatan": satu("SELECT COUNT(*) FROM catatan"),
        }
        pemakai = []
        for r in KON.execute("SELECT p.id, p.username, p.peran, p.aktif, p.remote, p.totp IS NOT NULL AS totp, p.dibuat, k.nama, k.koin, k.xp, k.statistik, r.data AS rumah "
                             "FROM pemakai p LEFT JOIN karakter k ON k.pemakai_id = p.id LEFT JOIN rumah r ON r.pemakai_id = p.id ORDER BY p.id"):
            rumah = basis.muat_json(r["rumah"], {})
            pemakai.append({"id": r["id"], "username": r["username"], "peran": r["peran"], "aktif": r["aktif"], "remote": r["remote"], "totp": r["totp"], "nama": r["nama"],
                            "koin": r["koin"], "xp": r["xp"], "level": permainan.level_dari(r["xp"] or 0) if r["nama"] else None,
                            "statistik": basis.muat_json(r["statistik"], {}),
                            "benda": len(rumah.get("benda") or []) + len(rumah.get("lantai") or {}) + len(rumah.get("tembok") or {})})
        terminal_log = [dict(r) for r in KON.execute(
            "SELECT l.waktu, l.perintah, l.sasaran, COALESCE(k.nama, p.username) AS nama FROM log_terminal l "
            "LEFT JOIN pemakai p ON p.id = l.pemakai_id LEFT JOIN karakter k ON k.pemakai_id = l.pemakai_id ORDER BY l.id DESC LIMIT 40")]
        obrolan = [dict(r) for r in KON.execute("SELECT waktu, nama, saluran, teks FROM obrolan ORDER BY id DESC LIMIT 60")]
        kas = [dict(r) for r in KON.execute(
            "SELECT b.waktu, b.jumlah, b.alasan, k.nama FROM buku_kas b LEFT JOIN karakter k ON k.pemakai_id = b.pemakai_id ORDER BY b.id DESC LIMIT 40")]
        log_remote = [dict(r) for r in KON.execute(
            "SELECT l.waktu, l.selesai, l.proto, l.sasaran, l.port, l.pengguna, p.username FROM log_remote l "
            "LEFT JOIN pemakai p ON p.id = l.pemakai_id ORDER BY l.id DESC LIMIT 40")]
    ringkas["daring"] = len(DUNIA.pemain)
    return {"ringkas": ringkas, "remote": log_remote, "pemakai": pemakai, "daring": DUNIA.daring(), "terminal": terminal_log, "obrolan": obrolan, "kas": kas,
            "versi": konfig.VERSI}


@app.get("/api/admin/pengaturan")
async def admin_atur_baca(request: Request):
    if not _admin(request):
        return galat("Khusus admin.", 403)
    with basis.KUNCI:
        d = atur.baca(KON)
    return {"atur": d, "peran_npc": atur.PERAN_NPC, "jenis_titik": atur.JENIS_TITIK, "batas": atur.ANGKA,
            "pilihan": {"gaya_rambut": permainan.GAYA_RAMBUT, "kepala": permainan.KEPALA, "mata": permainan.MATA}}


@app.post("/api/admin/pengaturan")
async def admin_atur_simpan(request: Request):
    """Simpan sebagian pengaturan (hanya kunci yang dikirim); perubahan langsung tersiar ke semua pemain."""
    if not _admin(request):
        return galat("Khusus admin.", 403)
    d = await _badan(request)
    try:
        with basis.KUNCI:
            baru = atur.simpan(KON, d)
    except atur.AturDitolak as e:
        return galat(str(e))
    await DUNIA.siar_dunia()
    if d.get("pengumuman"):
        await DUNIA.siar(None, {"t": "umum", "teks": baru["pengumuman"]})
    return {"atur": baru}


@app.post("/api/admin/zombie/panggil")
async def admin_zombie_panggil(request: Request):
    """Gelombang zombie datang sekarang juga (untuk mencoba), walau sakelar utamanya mati."""
    if not _admin(request):
        return galat("Khusus admin.", 403)
    if not any(p["adegan"] == "kantor" for p in DUNIA.pemain.values()):
        return galat("Tidak ada pemain di kantor; zombie hanya datang bila ada orang.")
    DUNIA.battle.panggil()
    return {"ok": True}


async def _rute_peta(request: Request, fn):
    if not _admin(request):
        return galat("Khusus admin.", 403)
    d = await _badan(request)
    try:
        with basis.KUNCI:
            peta = fn(d)
    except permainan.Ditolak as e:
        return galat(str(e))
    await DUNIA.siar_peta()
    return {"peta": peta}


@app.post("/api/admin/peta/pasang")
async def admin_peta_pasang(request: Request):
    return await _rute_peta(request, lambda d: permainan.peta_pasang(KON, d))


@app.post("/api/admin/peta/angkat")
async def admin_peta_angkat(request: Request):
    return await _rute_peta(request, lambda d: permainan.peta_angkat(KON, d))


@app.get("/api/admin/peta/daftar")
async def admin_peta_daftar(request: Request):
    if not _admin(request):
        return galat("Khusus admin.", 403)
    with basis.KUNCI:
        return koleksi.daftar(KON)


async def _rute_koleksi(request: Request, fn, siar: bool = False):
    """Rute koleksi peta. `siar`: peta aktif berganti, jadi peta, NPC, dan titik disiarkan ke semua pemain."""
    if not _admin(request):
        return galat("Khusus admin.", 403)
    d = await _badan(request)
    try:
        with basis.KUNCI:
            hasil = fn(d)
    except (permainan.Ditolak, atur.AturDitolak) as e:
        return galat(str(e))
    if siar:
        await DUNIA.siar_dunia()
        await DUNIA.siar_peta()
    return hasil


@app.post("/api/admin/peta/baru")
async def admin_peta_baru(request: Request):
    return await _rute_koleksi(request, lambda d: koleksi.baru(KON, d))


@app.post("/api/admin/peta/aktifkan")
async def admin_peta_aktifkan(request: Request):
    return await _rute_koleksi(request, lambda d: koleksi.aktifkan(KON, d.get("id")), siar=True)


@app.post("/api/admin/peta/nama")
async def admin_peta_nama(request: Request):
    return await _rute_koleksi(request, lambda d: koleksi.ganti_nama(KON, d.get("id"), d.get("nama")))


@app.post("/api/admin/peta/hapus")
async def admin_peta_hapus(request: Request):
    return await _rute_koleksi(request, lambda d: koleksi.hapus(KON, d.get("id")))


@app.post("/api/admin/peta/simpan")
async def admin_peta_simpan(request: Request):
    return await _rute_peta(request, lambda d: permainan.peta_simpan(KON, d))


@app.post("/api/admin/peta/dasar")
async def admin_peta_dasar(request: Request):
    return await _rute_peta(request, lambda d: permainan.peta_dasar(KON, d))


@app.post("/api/admin/tendang")
async def admin_tendang(request: Request):
    if not _admin(request):
        return galat("Khusus admin.", 403)
    d = await _badan(request)
    if isinstance(d.get("id"), int):
        await DUNIA.tendang(d["id"], "Diputus oleh admin.")
    return {"ok": True}


@app.get("/api/laporan-token")
async def api_laporan_token(request: Request):
    if not _admin(request):
        return galat("Khusus admin.", 403)
    try:
        return json.loads(konfig.LAPORAN_TOKEN.read_text())
    except (OSError, ValueError):
        return {"kosong": True}


@app.post("/api/laporan-token/hitung")
async def api_laporan_hitung(request: Request):
    """Hitung ulang dari transkrip Claude Code di host (bisa beberapa detik untuk transkrip besar)."""
    if not _admin(request):
        return galat("Khusus admin.", 403)
    return await asyncio.to_thread(laporan_token.simpan)


# ------------------------------------------------------------------ dunia

@app.websocket("/ws")
async def ws_dunia(ws: WebSocket):
    if not _asal_sah(ws.headers.get("origin"), ws.headers.get("host")):
        await ws.close(code=4403)
        return
    with basis.KUNCI:
        pemakai = akun.dari_token(KON, ws.cookies.get(akun.NAMA_COOKIE))
        karakter = KON.execute("SELECT * FROM karakter WHERE pemakai_id = ?", (pemakai["id"],)).fetchone() if pemakai else None
    if not pemakai or not karakter:
        await ws.close(code=4401)
        return
    await ws.accept()
    p = await DUNIA.sambung(ws, pemakai, karakter)
    try:
        while True:
            m = await ws.receive_json()
            if isinstance(m, dict):
                await DUNIA.terima(p, m)
    except (WebSocketDisconnect, RuntimeError, ValueError):
        pass
    finally:
        await DUNIA.putus(p)


@app.websocket("/ws/remote")
async def ws_remote(ws: WebSocket):
    """Sesi SSH/telnet ke perangkat (lihat remote.py untuk pagarnya)."""
    if not _asal_sah(ws.headers.get("origin"), ws.headers.get("host")):
        await ws.close(code=4403)
        return
    with basis.KUNCI:
        pemakai = akun.dari_token(KON, ws.cookies.get(akun.NAMA_COOKIE))
        segar = akun.totp_segar(KON, ws.cookies.get(akun.NAMA_COOKIE))
    if not pemakai:
        await ws.close(code=4401)
        return
    await ws.accept()
    await remote.sesi(ws, KON, pemakai, segar)


app.mount("/static", StaticFiles(directory=str(konfig.STATIS)), name="static")
