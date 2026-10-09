"""Terminal dalam game: sekumpulan kecil perintah jaringan yang dijalankan SERVER atas nama pemain.

Ini bukan shell. Tiap perintah dipetakan ke daftar argumen tetap dan dijalankan tanpa shell
(`create_subprocess_exec`); satu-satunya masukan pemain yang sampai ke proses adalah SASARAN, yang harus lolos
`sasaran_sah` (nama host / IPv4 / IPv6, tak pernah berawalan "-"). Ada batas laju per pemain, batas proses
serentak seluruh server, dan batas waktu per perintah.
"""
from __future__ import annotations

import asyncio
import ipaddress
import re
import shutil
import socket
import time
from collections.abc import AsyncIterator

from . import konfig

POLA_HOST = re.compile(r"^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,62})(\.[A-Za-z0-9]([A-Za-z0-9-]{0,62}))*\.?$")

BANTUAN = [
    "Perintah yang tersedia:",
    "  ping <host>        kirim 4 paket ICMP",
    "  trace <host>       jejak rute (traceroute, maks 20 lompatan)",
    "  mtr <host>         ringkasan rute + kehilangan paket (5 putaran)",
    "  dns <host>         alamat IP sebuah nama",
    "  port <host> <n>    cek port TCP terbuka atau tidak",
    "  catat [judul]      simpan keluaran terakhir ke Note",
    "  clear              bersihkan layar",
    "  help               daftar ini",
]


class TerminalDitolak(ValueError):
    pass


def sasaran_sah(s: str) -> str:
    s = (s or "").strip()
    if not s or s.startswith("-") or len(s) > 253:
        raise TerminalDitolak("Sasaran tidak sah.")
    try:
        return str(ipaddress.ip_address(s))
    except ValueError:
        pass
    if not POLA_HOST.match(s):
        raise TerminalDitolak("Sasaran harus nama host atau alamat IP.")
    return s


_semafor: asyncio.Semaphore | None = None
_riwayat: dict[int, list[float]] = {}


def _cek_laju(uid: int) -> None:
    kini = time.time()
    daftar = [t for t in _riwayat.get(uid, []) if kini - t < 60]
    if len(daftar) >= konfig.TERMINAL_PER_MENIT:
        raise TerminalDitolak(f"Pelan-pelan: paling banyak {konfig.TERMINAL_PER_MENIT} perintah jaringan per menit.")
    daftar.append(kini)
    _riwayat[uid] = daftar


def urai(baris: str) -> tuple[str, list[str]]:
    kata = (baris or "").strip().split()
    if not kata:
        raise TerminalDitolak("")
    if len(baris) > 300:
        raise TerminalDitolak("Perintah terlalu panjang.")
    alias = {"traceroute": "trace", "tracert": "trace", "tracepath": "trace", "nslookup": "dns", "dig": "dns", "host": "dns",
             "?": "help", "cls": "clear", "nc": "port", "telnet": "port"}
    perintah = alias.get(kata[0].lower(), kata[0].lower())
    return perintah, kata[1:]


def _argumen(perintah: str, sasaran: str) -> list[str] | None:
    if perintah == "ping" and shutil.which("ping"):
        return ["ping", "-c", "4", "-W", "2", "-n", "--", sasaran]
    if perintah == "trace":
        if shutil.which("traceroute"):
            return ["traceroute", "-n", "-w", "1", "-q", "1", "-m", "20", "--", sasaran]
        if shutil.which("tracepath"):
            return ["tracepath", "-n", "-m", "20", sasaran]
    if perintah == "mtr" and shutil.which("mtr"):
        return ["mtr", "-n", "-r", "-c", "5", "-m", "20", "--", sasaran]
    return None


async def _dns(sasaran: str) -> list[str]:
    loop = asyncio.get_running_loop()
    try:
        info = await asyncio.wait_for(loop.getaddrinfo(sasaran, None, type=socket.SOCK_STREAM), 6)
    except (socket.gaierror, asyncio.TimeoutError, OSError) as e:
        return [f"dns: {sasaran}: tidak ditemukan ({e.__class__.__name__})"]
    alamat = sorted({i[4][0] for i in info})
    return [f"{sasaran} -> {a}" for a in alamat] or [f"dns: {sasaran}: tanpa alamat"]


async def _port(sasaran: str, port: int) -> list[str]:
    mulai = time.time()
    try:
        _, w = await asyncio.wait_for(asyncio.open_connection(sasaran, port), 4)
        w.close()
        return [f"{sasaran}:{port} TERBUKA ({(time.time() - mulai) * 1000:.0f} ms)"]
    except asyncio.TimeoutError:
        return [f"{sasaran}:{port} tak menjawab (timeout 4 dtk)"]
    except OSError as e:
        return [f"{sasaran}:{port} TERTUTUP ({e.strerror or e.__class__.__name__})"]


async def jalankan(uid: int, perintah: str, arg: list[str]) -> AsyncIterator[str]:
    """Baris keluaran satu perintah jaringan. Perintah lokal (help/clear/catat) ditangani pemanggil."""
    global _semafor
    if not konfig.TERMINAL_AKTIF:
        raise TerminalDitolak("Terminal dimatikan admin.")
    if perintah not in {"ping", "trace", "mtr", "dns", "port"}:
        raise TerminalDitolak(f"{perintah}: perintah tidak dikenal. Ketik help.")
    if not arg:
        raise TerminalDitolak(f"Pakai: {perintah} <host>")
    sasaran = sasaran_sah(arg[0])
    _cek_laju(uid)
    if perintah == "dns":
        for b in await _dns(sasaran):
            yield b
        return
    if perintah == "port":
        if len(arg) < 2 or not arg[1].isdigit() or not 1 <= int(arg[1]) <= 65535:
            raise TerminalDitolak("Pakai: port <host> <1-65535>")
        for b in await _port(sasaran, int(arg[1])):
            yield b
        return
    argumen = _argumen(perintah, sasaran)
    if not argumen:
        raise TerminalDitolak(f"{perintah} tidak terpasang di server.")
    if _semafor is None:
        _semafor = asyncio.Semaphore(konfig.TERMINAL_SERENTAK)
    if _semafor.locked():
        yield "(antre: terminal lain sedang berjalan...)"
    async with _semafor:
        proses = await asyncio.create_subprocess_exec(
            *argumen, stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        batas = time.time() + konfig.TERMINAL_BATAS_DETIK
        jumlah = 0
        try:
            while True:
                try:
                    baris = await asyncio.wait_for(proses.stdout.readline(), max(0.1, batas - time.time()))
                except asyncio.TimeoutError:
                    yield f"(dihentikan: melewati {konfig.TERMINAL_BATAS_DETIK} detik)"
                    break
                if not baris:
                    break
                jumlah += 1
                if jumlah > 200:
                    yield "(keluaran dipotong)"
                    break
                yield baris.decode("utf-8", "replace").rstrip()[:300]
        finally:
            if proses.returncode is None:
                try:
                    proses.kill()
                except ProcessLookupError:
                    pass
            await proses.wait()
