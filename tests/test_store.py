import shutil

import pytest
from broadcast.core import SecretStore, Settings
from broadcast.core.errors import BroadcastError

pytestmark = pytest.mark.skipif(shutil.which("gpg") is None, reason="gpg not installed")


def _store(tmp_path):
    return SecretStore(Settings(store=tmp_path / "secrets.gpg"))


def test_encrypt_roundtrip_and_atomic_save(tmp_path):
    store = _store(tmp_path)
    assert not store.exists()
    store.save({"X_CLIENT_ID": "cid", "X_ACCESS_TOKEN": "tok-new-wins"}, "pw")
    assert store.exists()
    assert oct(store.path.stat().st_mode)[-3:] == "600"
    assert store.path.read_bytes().startswith(b"-----BEGIN PGP MESSAGE-----")
    assert store.load("pw") == {"X_CLIENT_ID": "cid", "X_ACCESS_TOKEN": "tok-new-wins"}


def test_wrong_passphrase_raises(tmp_path):
    store = _store(tmp_path)
    store.save({"K": "v"}, "right")
    with pytest.raises(BroadcastError):
        store.load("wrong")


def test_load_missing_store_raises(tmp_path):
    with pytest.raises(BroadcastError):
        _store(tmp_path).load("pw")
