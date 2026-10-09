"""Remote SSH / Telnet dari dalam game: jembatan WebSocket <-> sesi terminal ke perangkat jaringan.

Ini membuka jalan dari peramban ke perangkat di jaringan dalam, jadi pagarnya berlapis:
  * hanya admin, atau pemain yang diberi izin `remote` oleh admin;
  * akun itu harus memasang kode sekali pakai (TOTP), dan sesi perambannya harus membuktikan kode dalam
    10 menit terakhir (akun.TOTP_SEGAR) sebelum sesi remote dibuka;
  * fitur bisa dimatikan seluruhnya (pengaturan `remote_aktif`);
  * sasaran harus berada di jaringan yang didaftarkan admin (`remote_jaringan`) dan port yang diizinkan
    (`remote_port`); nama host di-resolve DULU lalu alamat IP-nya yang diperiksa dan dipakai menyambung;
  * SSH dijalankan tanpa shell, tanpa konfigurasi dan TANPA kunci milik akun server (hanya password yang diketik
    pemakai), tanpa penerusan port/agent, tanpa karakter escape;
  * Telnet ditangani langsung di Python (bukan program `telnet`, yang punya escape ke shell);
  * tiap sesi dicatat (siapa, ke mana, kapan) — isi layarnya tidak pernah disimpan;
  * batas sesi serentak, batas diam, dan batas lama.
Kredensial perangkat hanya lewat, tidak pernah ditulis ke disk atau log.
"""
from __future__ import annotations

import asyncio
import fcntl
import ipaddress
import os
import re
import signal
import socket
import struct
import termios
import time

from fastapi import WebSocket, WebSocketDisconnect

from . import atur, basis, konfig, terminal

POLA_USER = re.compile(r"^[A-Za-z0-9._@-]{1,64}$")
SERENTAK_PER_PEMAKAI = 3
SERENTAK_SEMUA = 12
DIAM_MAKS = 20 * 60            # detik tanpa ketikan maupun keluaran
LAMA_MAKS = 6 * 3600
_aktif: dict[int, int] = {}

# Perangkat jaringan lama sering hanya mendukung algoritma usang; ditambahkan (bukan menggantikan) daftar bawaan.
OPSI_SSH = [
    "-F", "/dev/null", "-tt",
    "-o", "StrictHostKeyChecking=accept-new", "-o", "GlobalKnownHostsFile=/dev/null",
    "-o", "PubkeyAuthentication=no", "-o", "IdentityFile=/dev/null", "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none",
    "-o", "PreferredAuthentications=keyboard-interactive,password", "-o", "NumberOfPasswordPrompts=3",
    "-o", "ForwardAgent=no", "-o", "ForwardX11=no", "-o", "ClearAllForwardings=yes", "-o", "PermitLocalCommand=no",
    "-o", "EscapeChar=none", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3",
    "-o", "KexAlgorithms=+diffie-hellman-group14-sha1,diffie-hellman-group1-sha1,diffie-hellman-group-exchange-sha1",
    "-o", "HostKeyAlgorithms=+ssh-rsa", "-o", "Ciphers=+aes128-cbc,aes256-cbc,3des-cbc",
]


class RemoteDitolak(ValueError):
    pass


def boleh(kon, pemakai) -> bool:
    """Admin selalu boleh; pemain hanya bila diberi izin. Fitur mati = tak seorang pun."""
    if not atur.baca(kon)["remote_aktif"]:
        return False
    return pemakai["peran"] == "admin" or bool(pemakai["remote"])


def sasaran_boleh(d: dict, host: str, port) -> str:
    """Alamat IP sasaran bila diizinkan; RemoteDitolak bila tidak."""
    if isinstance(port, bool) or not isinstance(port, int) or port not in d["remote_port"]:
        raise RemoteDitolak("Port itu tidak diizinkan admin (izin: " + ", ".join(str(p) for p in d["remote_port"]) + ").")
    try:
        host = terminal.sasaran_sah(host)
    except terminal.TerminalDitolak as e:
        raise RemoteDitolak(str(e)) from e
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        try:
            info = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        except OSError as e:
            raise RemoteDitolak("Nama host tidak ditemukan.") from e
        ip = ipaddress.ip_address(info[0][4][0])
    if ip.is_loopback or ip.is_unspecified or ip.is_multicast or ip.is_link_local:
        raise RemoteDitolak("Alamat itu tidak boleh dituju.")
    if not any(ip in ipaddress.ip_network(j) for j in d["remote_jaringan"]):
        raise RemoteDitolak("Alamat itu di luar jaringan yang diizinkan admin.")
    return str(ip)


def _ukuran(fd: int, kolom, baris) -> None:
    kolom = max(20, min(400, int(kolom) if isinstance(kolom, (int, float)) else 80))
    baris = max(5, min(200, int(baris) if isinstance(baris, (int, float)) else 24))
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", baris, kolom, 0, 0))


def siapkan_tty(nama: str):
    """preexec_fn untuk proses anak: sesi baru + pty `nama` sebagai terminal kendali (ssh meminta password di /dev/tty).
    Pty dibuka lewat NAMANYA: tty pertama yang dibuka pemimpin sesi menjadi terminal kendalinya. Jangan memakai
    ioctl(0, TIOCSCTTY): di bawah uvloop (uvicorn) preexec_fn berjalan sebelum stdin dialihkan ke pty, jadi fd 0
    belum berupa terminal dan proses gagal dinyalakan ("Exception occurred in preexec_fn")."""
    def siapkan() -> None:
        os.setsid()
        os.close(os.open(nama, os.O_RDWR))
    return siapkan


async def _ssh(ws: WebSocket, ip: str, port: int, user: str, m: dict, sentuh) -> None:
    induk, anak = os.openpty()
    _ukuran(induk, m.get("kolom"), m.get("baris"))
    siapkan = siapkan_tty(os.ttyname(anak))
    kenal = konfig.BASIS_DATA.parent / "remote_known_hosts"
    proses = await asyncio.create_subprocess_exec(
        "ssh", *OPSI_SSH, "-o", f"UserKnownHostsFile={kenal}", "-p", str(port), "-l", user, "--", ip,
        stdin=anak, stdout=anak, stderr=anak, preexec_fn=siapkan, close_fds=True,
        env={"TERM": "xterm-256color", "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "HOME": "/nonexistent"})
    os.close(anak)
    loop = asyncio.get_running_loop()
    antre: asyncio.Queue[bytes | None] = asyncio.Queue()

    def terbaca() -> None:
        try:
            data = os.read(induk, 8192)
        except OSError:
            data = b""
        antre.put_nowait(data or None)
        if not data:
            loop.remove_reader(induk)

    loop.add_reader(induk, terbaca)

    async def ke_peramban() -> None:
        while (data := await antre.get()) is not None:
            sentuh()
            await ws.send_bytes(data)

    async def dari_peramban() -> None:
        while True:
            p = await ws.receive_json()
            if p.get("k") == "data" and isinstance(p.get("d"), str):
                sentuh()
                os.write(induk, p["d"].encode()[:4096])
            elif p.get("k") == "ukur":
                _ukuran(induk, p.get("c"), p.get("r"))

    try:
        await _berpacu(ke_peramban(), dari_peramban())
    finally:
        try:
            loop.remove_reader(induk)
        except (ValueError, OSError):
            pass
        if proses.returncode is None:
            try:
                os.killpg(proses.pid, signal.SIGHUP)
            except (ProcessLookupError, PermissionError):
                pass
        os.close(induk)
        try:
            await asyncio.wait_for(proses.wait(), 3)
        except asyncio.TimeoutError:
            proses.kill()


IAC, DONT, DO, WONT, WILL, SB, SE = 255, 254, 253, 252, 251, 250, 240
T_ECHO, T_SGA = 1, 3


async def _telnet(ws: WebSocket, ip: str, port: int, sentuh) -> None:
    """Klien telnet minimal: menerima ECHO dan SUPPRESS-GO-AHEAD dari server, menolak semua tawaran lain."""
    try:
        r, w = await asyncio.wait_for(asyncio.open_connection(ip, port), 10)
    except (OSError, asyncio.TimeoutError) as e:
        raise RemoteDitolak(f"Tidak bisa menyambung ke {ip}:{port} ({e.__class__.__name__}).") from e

    async def ke_peramban() -> None:
        sisa = b""
        while True:
            data = await r.read(8192)
            if not data:
                return
            sentuh()
            buf, keluar, jawab, i = sisa + data, bytearray(), bytearray(), 0
            sisa = b""
            while i < len(buf):
                b = buf[i]
                if b != IAC:
                    keluar.append(b)
                    i += 1
                    continue
                if i + 1 >= len(buf):
                    sisa = buf[i:]
                    break
                c = buf[i + 1]
                if c == IAC:
                    keluar.append(IAC)
                    i += 2
                elif c in (DO, DONT, WILL, WONT):
                    if i + 2 >= len(buf):
                        sisa = buf[i:]
                        break
                    o = buf[i + 2]
                    if c == WILL:
                        jawab += bytes([IAC, DO if o in (T_ECHO, T_SGA) else DONT, o])
                    elif c == DO:
                        jawab += bytes([IAC, WILL if o == T_SGA else WONT, o])
                    i += 3
                elif c == SB:
                    akhir = buf.find(bytes([IAC, SE]), i + 2)
                    if akhir < 0:
                        sisa = buf[i:]
                        break
                    i = akhir + 2
                else:
                    i += 2
            if jawab:
                w.write(bytes(jawab))
            if keluar:
                await ws.send_bytes(bytes(keluar))

    async def dari_peramban() -> None:
        while True:
            p = await ws.receive_json()
            if p.get("k") == "data" and isinstance(p.get("d"), str):
                sentuh()
                w.write(p["d"].encode()[:4096].replace(b"\xff", b"\xff\xff"))      # 0xFF digandakan: itu penanda perintah telnet
                await w.drain()

    try:
        await _berpacu(ke_peramban(), dari_peramban())
    finally:
        w.close()


async def _berpacu(*kerja) -> None:
    """Jalankan bersamaan; begitu satu selesai atau gagal, yang lain dibatalkan."""
    tugas = [asyncio.ensure_future(k) for k in kerja]
    try:
        selesai, _ = await asyncio.wait(tugas, return_when=asyncio.FIRST_COMPLETED)
        for t in selesai:
            if t.exception() and not isinstance(t.exception(), (WebSocketDisconnect, RuntimeError)):
                raise t.exception()
    finally:
        for t in tugas:
            t.cancel()
        await asyncio.gather(*tugas, return_exceptions=True)


async def sesi(ws: WebSocket, kon, pemakai, totp_segar: bool = False) -> None:
    """Satu sesi remote. Pesan pertama dari peramban: {proto, host, port, user, kolom, baris}."""
    uid = pemakai["id"]

    async def tutup(pesan: str) -> None:
        try:
            await ws.send_bytes(("\r\n\x1b[33m[kevi] " + pesan + "\x1b[0m\r\n").encode())
            await ws.close()
        except Exception:  # noqa: BLE001
            pass

    try:
        m = await asyncio.wait_for(ws.receive_json(), 20)
    except (asyncio.TimeoutError, WebSocketDisconnect, ValueError, RuntimeError):
        return
    try:
        with basis.KUNCI:
            d = atur.baca(kon)
            if not boleh(kon, pemakai):
                raise RemoteDitolak("Kamu tidak punya izin remote, atau fitur ini dimatikan admin.")
        if not pemakai["totp"]:
            raise RemoteDitolak("Remote butuh kode sekali pakai (TOTP). Pasang dulu lewat Menu.")
        if not totp_segar:
            raise RemoteDitolak("Masukkan kode sekali pakai dulu sebelum membuka remote.")
        proto = m.get("proto")
        if proto not in ("ssh", "telnet"):
            raise RemoteDitolak("Protokol harus ssh atau telnet.")
        user = str(m.get("user") or "")
        if proto == "ssh" and (not POLA_USER.match(user) or user.startswith("-")):
            raise RemoteDitolak("Username perangkat tidak sah.")
        ip = await asyncio.to_thread(sasaran_boleh, d, str(m.get("host") or ""), m.get("port"))
        if _aktif.get(uid, 0) >= SERENTAK_PER_PEMAKAI or sum(_aktif.values()) >= SERENTAK_SEMUA:
            raise RemoteDitolak("Terlalu banyak sesi remote terbuka. Tutup yang lain dulu.")
    except RemoteDitolak as e:
        await tutup(str(e))
        return

    port = int(m["port"])
    with basis.KUNCI:
        lid = kon.execute("INSERT INTO log_remote (pemakai_id, waktu, proto, sasaran, port, pengguna) VALUES (?, ?, ?, ?, ?, ?)",
                          (uid, time.time(), proto, ip, port, user if proto == "ssh" else "")).lastrowid
    _aktif[uid] = _aktif.get(uid, 0) + 1
    mulai = terakhir = time.time()

    def sentuh() -> None:
        nonlocal terakhir
        terakhir = time.time()

    async def penjaga() -> None:
        while True:
            await asyncio.sleep(15)
            if time.time() - terakhir > DIAM_MAKS:
                raise RemoteDitolak("Sesi ditutup: terlalu lama diam.")
            if time.time() - mulai > LAMA_MAKS:
                raise RemoteDitolak("Sesi ditutup: batas lama tercapai.")

    pesan = "Sesi selesai."
    try:
        await ws.send_bytes(f"\x1b[33m[kevi] {proto} ke {ip}:{port} ...\x1b[0m\r\n".encode())
        await _berpacu(_ssh(ws, ip, port, user, m, sentuh) if proto == "ssh" else _telnet(ws, ip, port, sentuh), penjaga())
    except RemoteDitolak as e:
        pesan = str(e)
    except (WebSocketDisconnect, RuntimeError):
        pesan = ""
    finally:
        _aktif[uid] = max(0, _aktif.get(uid, 1) - 1)
        with basis.KUNCI:
            kon.execute("UPDATE log_remote SET selesai = ? WHERE id = ?", (time.time(), lid))
    if pesan:
        await tutup(pesan)
