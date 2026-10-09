"""Laporan token: satu jawaban model dihitung sekali walau muncul di beberapa baris transkrip."""
import json

from app import laporan_token


def _baris(mid, masuk, keluar, cap="2026-10-08T20:31:13.621Z", cache=0):
    return json.dumps({"type": "assistant", "timestamp": cap, "message": {"id": mid, "model": "claude-uji", "usage": {
        "input_tokens": masuk, "output_tokens": keluar, "cache_read_input_tokens": cache, "cache_creation_input_tokens": 5}}})


def test_dedup_per_pesan_dan_rekap(tmp_path, monkeypatch):
    slug = tmp_path / "-proyek-kevi"
    (slug / "sesi-a" / "subagents").mkdir(parents=True)
    (slug / "sesi-a.jsonl").write_text("\n".join([
        _baris("m1", 10, 100), _baris("m1", 10, 100),            # jawaban yang sama, dua blok isi
        _baris("m2", 3, 7, "2026-10-08T21:05:00.000Z", cache=1000), "bukan json", json.dumps({"type": "user", "message": {"content": "hai"}}),
    ]))
    (slug / "sesi-a" / "subagents" / "anak.jsonl").write_text(_baris("m3", 1, 1))
    lain = tmp_path / "-proyek-lain"
    lain.mkdir()
    (lain / "sesi-b.jsonl").write_text(_baris("x1", 999, 999))    # proyek lain: tidak ikut
    monkeypatch.setattr(laporan_token, "PROYEK_CLAUDE", tmp_path)
    monkeypatch.setattr(laporan_token, "AWALAN_SLUG", "-proyek-kevi")
    monkeypatch.setattr(laporan_token, "DAFTAR_SESI", tmp_path / "tidak-ada.json")
    d = laporan_token.hitung()
    assert d["total"]["panggilan"] == 3
    assert d["total"]["masuk"] == 14 and d["total"]["keluar"] == 108 and d["total"]["baca_cache"] == 1000 and d["total"]["tulis_cache"] == 15
    assert d["total"]["semua"] == 14 + 108 + 1000 + 15
    assert len(d["sesi"]) == 1 and d["sesi"][0]["id"] == "sesi-a"
    assert [j["jam"] for j in d["per_jam"]] == ["2026-10-09 03:00", "2026-10-09 04:00"]      # WIB
    assert d["per_model"][0]["model"] == "claude-uji"


def test_sesi_tambahan_dari_daftar(tmp_path, monkeypatch):
    lain = tmp_path / "-rumah"
    lain.mkdir()
    (lain / "abc-123.jsonl").write_text(_baris("x1", 2, 3))
    daftar = tmp_path / "sesi.json"
    daftar.write_text('["abc-123", "../../etc/passwd"]')
    monkeypatch.setattr(laporan_token, "PROYEK_CLAUDE", tmp_path)
    monkeypatch.setattr(laporan_token, "AWALAN_SLUG", "-tidak-ada")
    monkeypatch.setattr(laporan_token, "DAFTAR_SESI", daftar)
    d = laporan_token.hitung()
    assert d["total"]["masuk"] == 2 and d["sesi"][0]["id"] == "abc-123"
