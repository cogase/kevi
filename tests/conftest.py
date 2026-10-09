"""Uji tidak pernah menyentuh DB sungguhan atau .env produksi."""
import os
import tempfile

os.environ["KEVI_ABAIKAN_DOTENV"] = "1"
os.environ["KEVI_DB"] = os.path.join(tempfile.mkdtemp(prefix="kevi-uji-"), "uji.db")
os.environ["KEVI_LAJU"] = "3600"          # 1 jam kebun = 1 detik
os.environ["KEVI_KOIN_AWAL"] = "300"

import pytest  # noqa: E402

from app import akun, basis, permainan  # noqa: E402


@pytest.fixture()
def kon(tmp_path):
    return basis.buka(tmp_path / "kevi.db")


def setel_xp(kon, uid, xp):
    """Naikkan level tanpa membayar hadiah naik level (supaya hitungan koin di uji tetap sederhana)."""
    kon.execute("UPDATE karakter SET xp = ? WHERE pemakai_id = ?", (xp, uid))


@pytest.fixture()
def pemain(kon):
    uid = akun.buat_pemakai(kon, "budi", "sandi-panjang-1")
    permainan.buat_karakter(kon, uid, "Budi", {"kulit": "#f2c8a4", "kepala": "kupluk", "mata": "ngawur"})
    return uid
