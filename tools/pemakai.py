"""Kelola akun Kevi dari baris perintah.

    venv/bin/python -m tools.pemakai tambah <username> [--admin] [--password <sandi>]
    venv/bin/python -m tools.pemakai sandi <username> [--password <sandi>]
    venv/bin/python -m tools.pemakai daftar

Tanpa --password, sandi acak dibuat dan dicetak SEKALI. Jalankan dari akar proyek.
"""
from __future__ import annotations

import argparse
import secrets
import sys

from app import akun, basis, konfig


def main() -> int:
    p = argparse.ArgumentParser(prog="tools.pemakai")
    sub = p.add_subparsers(dest="perintah", required=True)
    t = sub.add_parser("tambah")
    t.add_argument("username")
    t.add_argument("--admin", action="store_true")
    t.add_argument("--password")
    s = sub.add_parser("sandi")
    s.add_argument("username")
    s.add_argument("--password")
    sub.add_parser("daftar")
    a = p.parse_args()
    kon = basis.buka(konfig.BASIS_DATA)
    try:
        if a.perintah == "daftar":
            for r in kon.execute("SELECT id, username, peran, aktif FROM pemakai ORDER BY id"):
                print(f"{r['id']:>3}  {r['username']:<24} {r['peran']:<7} {'aktif' if r['aktif'] else 'nonaktif'}")
            return 0
        sandi = a.password or secrets.token_urlsafe(9)
        if a.perintah == "tambah":
            akun.buat_pemakai(kon, a.username, sandi, "admin" if a.admin else "pemain")
        else:
            r = kon.execute("SELECT id FROM pemakai WHERE username = ?", (a.username.lower(),)).fetchone()
            if not r:
                print("Username tidak ditemukan.", file=sys.stderr)
                return 1
            akun.ganti_sandi(kon, r["id"], sandi)
        print(f"username: {a.username.lower()}")
        if not a.password:
            print(f"password: {sandi}")
        return 0
    except akun.AkunDitolak as e:
        print(str(e), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
