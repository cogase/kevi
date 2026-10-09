"""Laporan pemakaian token pengerjaan proyek Kevi (permintaan yosi, 9 Okt 2026).

Sumber: transkrip Claude Code di ~/.claude/projects/. Setiap jawaban model tercatat beserta `usage`-nya; satu
jawaban bisa muncul di beberapa baris (per blok isi), jadi dihitung SEKALI per `message.id`.

Sesi yang dihitung:
  1. semua transkrip di folder proyek yang slug-nya berawalan "-home-yosi-kevi" (sesi yang bekerja di folder ini,
     termasuk worktree dan subagennya), dan
  2. id sesi tambahan di docs/laporan-token-sesi.json (sesi yang dimulai dari folder lain).

Tidak ada angka rupiah/dolar di sini: harga per token tidak dicatat di transkrip, jadi tidak dikarang.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import konfig

PROYEK_CLAUDE = Path.home() / ".claude" / "projects"
# Slug folder proyek Claude Code = jalur dengan "/" dan "." diganti "-"; worktree menambah akhiran, jadi dipotong.
AWALAN_SLUG = "-" + str(konfig.AKAR).strip("/").replace("/", "-").replace(".", "-").split("--claude-worktrees")[0]
DAFTAR_SESI = konfig.AKAR / "docs" / "laporan-token-sesi.json"
WIB = timezone(timedelta(hours=7))
KOLOM = ("masuk", "tulis_cache", "baca_cache", "keluar")
KERJA = ("masuk", "tulis_cache", "keluar")     # token pekerjaan = isi baru; baca cache hanya riwayat yang dibaca ulang


def _kosong() -> dict:
    return {"masuk": 0, "tulis_cache": 0, "baca_cache": 0, "keluar": 0, "panggilan": 0}


def _tambah(ke: dict, u: dict) -> None:
    ke["masuk"] += int(u.get("input_tokens") or 0)
    ke["tulis_cache"] += int(u.get("cache_creation_input_tokens") or 0)
    ke["baca_cache"] += int(u.get("cache_read_input_tokens") or 0)
    ke["keluar"] += int(u.get("output_tokens") or 0)
    ke["panggilan"] += 1


def _berkas_sesi() -> dict[str, list[Path]]:
    """id sesi -> berkas transkripnya (induk + subagen)."""
    hasil: dict[str, list[Path]] = {}
    if not PROYEK_CLAUDE.is_dir():
        return hasil
    for folder in PROYEK_CLAUDE.iterdir():
        if folder.is_dir() and folder.name.startswith(AWALAN_SLUG):
            for b in folder.glob("*.jsonl"):
                hasil.setdefault(b.stem, []).append(b)
    try:
        tambahan = json.loads(DAFTAR_SESI.read_text())
    except (OSError, ValueError):
        tambahan = []
    for sid in tambahan if isinstance(tambahan, list) else []:
        if isinstance(sid, str) and sid.replace("-", "").isalnum():
            for b in PROYEK_CLAUDE.glob(f"*/{sid}.jsonl"):
                if b not in hasil.setdefault(sid, []):
                    hasil[sid].append(b)
    for sid, daftar in hasil.items():                       # subagen: <slug>/<sesi>/subagents/*.jsonl
        for b in list(daftar):
            daftar.extend(sorted((b.parent / sid).glob("**/*.jsonl")))
    return hasil


def hitung() -> dict:
    total, sesi, per_jam, per_model = _kosong(), [], {}, {}
    for sid, daftar in sorted(_berkas_sesi().items()):
        s = dict(_kosong(), id=sid, judul="", mulai=None, akhir=None)
        terlihat: set[str] = set()
        for berkas in daftar:
            try:
                baris = berkas.open(encoding="utf-8", errors="replace")
            except OSError:
                continue
            with baris:
                for b in baris:
                    try:
                        j = json.loads(b)
                    except ValueError:
                        continue
                    if j.get("type") in ("custom-title", "ai-title") and isinstance(j.get("title") or j.get("customTitle"), str):
                        s["judul"] = j.get("customTitle") or j.get("title") or s["judul"]
                    m = j.get("message")
                    u = m.get("usage") if isinstance(m, dict) else None
                    if not isinstance(u, dict) or not m.get("id") or m["id"] in terlihat:
                        continue
                    terlihat.add(m["id"])
                    _tambah(s, u)
                    _tambah(total, u)
                    _tambah(per_model.setdefault(str(m.get("model") or "?"), _kosong()), u)
                    cap = j.get("timestamp")
                    if isinstance(cap, str):
                        s["mulai"] = min(s["mulai"] or cap, cap)
                        s["akhir"] = max(s["akhir"] or cap, cap)
                        try:
                            jam = datetime.fromisoformat(cap.replace("Z", "+00:00")).astimezone(WIB).strftime("%Y-%m-%d %H:00")
                        except ValueError:
                            continue
                        _tambah(per_jam.setdefault(jam, _kosong()), u)
        if s["panggilan"]:
            s["semua"] = sum(s[k] for k in KOLOM)
            s["kerja"] = sum(s[k] for k in KERJA)
            sesi.append(s)
    total["semua"] = sum(total[k] for k in KOLOM)
    total["kerja"] = sum(total[k] for k in KERJA)
    return {
        "dibuat": time.time(), "total": total, "sesi": sorted(sesi, key=lambda x: x["mulai"] or ""),
        "per_jam": [dict(v, jam=k, semua=sum(v[c] for c in KOLOM), kerja=sum(v[c] for c in KERJA)) for k, v in sorted(per_jam.items())],
        "per_model": [dict(v, model=k, semua=sum(v[c] for c in KOLOM), kerja=sum(v[c] for c in KERJA)) for k, v in sorted(per_model.items())],
    }


def simpan() -> dict:
    d = hitung()
    konfig.LAPORAN_TOKEN.parent.mkdir(parents=True, exist_ok=True)
    konfig.LAPORAN_TOKEN.write_text(json.dumps(d, ensure_ascii=False, indent=1))
    return d
