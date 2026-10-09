"""Pemasang sprite Kevi (tools/pasang_sprite.py): hanya PNG sah bernama sesuai pola yang masuk, daftar.json ditulis ulang."""
import json
import struct
import zlib

from tools import pasang_sprite


def _png(w, h):
    def potong(jenis, isi):
        return struct.pack(">I", len(isi)) + jenis + isi + struct.pack(">I", zlib.crc32(jenis + isi) & 0xFFFFFFFF)
    baris = b"".join(b"\x00" + b"\x00\x00\x00\x00" * w for _ in range(h))
    return b"\x89PNG\r\n\x1a\n" + potong(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + potong(b"IDAT", zlib.compress(baris)) + potong(b"IEND", b"")


def test_pasang_sprite_menyaring_nama_dan_isi(tmp_path, monkeypatch, capsys):
    serah, tujuan = tmp_path / "serah", tmp_path / "kevi"
    serah.mkdir()
    (serah / "zombie_biasa_a_bawah_0.png").write_bytes(_png(16, 20))
    (serah / "senjata_sapu_pegang.png").write_bytes(_png(12, 12))
    (serah / "pratinjau.png").write_bytes(_png(16, 16))                    # nama di luar pola
    (serah / "zombie_besar_bawah_0.png").write_bytes(b"bukan png")         # bukan PNG
    (serah / "zombie_raksasa_bawah_0.png").write_bytes(_png(200, 20))      # terlalu besar
    (serah / "CATATAN.md").write_text("abaikan")
    monkeypatch.setattr(pasang_sprite, "TUJUAN", tujuan)
    monkeypatch.setattr(pasang_sprite, "AKAR", tmp_path)
    assert pasang_sprite.utama(serah) == 0
    assert sorted(p.name for p in tujuan.iterdir()) == ["daftar.json", "senjata_sapu_pegang.png", "zombie_biasa_a_bawah_0.png"]
    assert json.loads((tujuan / "daftar.json").read_text()) == ["senjata_sapu_pegang", "zombie_biasa_a_bawah_0"]
    keluar = capsys.readouterr().out
    assert "dipasang 2 berkas" in keluar and "pratinjau.png" in keluar and "terlalu besar 200x20" in keluar
    assert pasang_sprite.utama(tmp_path / "tidak-ada") == 2
    assert pasang_sprite.ukuran_png(_png(16, 20)) == (16, 20) and pasang_sprite.ukuran_png(b"x") is None
