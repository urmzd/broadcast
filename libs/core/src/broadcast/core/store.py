"""The encrypted secret store: load, mutate, and atomically re-encrypt."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from broadcast.core.config import Settings
from broadcast.core.crypto import decrypt, encrypt
from broadcast.core.env import parse_env, serialize_env
from broadcast.core.errors import BroadcastError


class SecretStore:
    """A GPG-symmetric-encrypted ``KEY=value`` file.

    Decryption happens in memory; the plaintext is never written to disk by
    this class. The passphrase is passed in per call — resolving it (env var
    or interactive prompt) is the front-end's job.
    """

    def __init__(self, settings: Settings) -> None:
        self._path: Path = settings.store

    @property
    def path(self) -> Path:
        return self._path

    def exists(self) -> bool:
        return self._path.exists()

    def load(self, passphrase: str) -> dict[str, str]:
        if not self.exists():
            raise BroadcastError(f"no store at {self._path} — run `broadcast init` first")
        return parse_env(decrypt(self._path.read_bytes(), passphrase).decode())

    def save(self, secrets: dict[str, str], passphrase: str) -> None:
        cipher = encrypt(serialize_env(secrets).encode(), passphrase)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(self._path.parent), prefix=".secrets.", suffix=".tmp")
        try:
            os.write(fd, cipher)
            os.close(fd)
            os.chmod(tmp, 0o600)
            os.replace(tmp, self._path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
        os.chmod(self._path, 0o600)
