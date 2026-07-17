"""Symmetric encryption via ``gpg``.

The passphrase is handed to gpg over a dedicated pipe fd — never on argv
(where ``ps`` would show it) and never written to disk.
"""

from __future__ import annotations

import os
import subprocess

from broadcast.core.errors import BroadcastError


def _gpg(args: list[str], data: bytes, passphrase: str) -> bytes:
    read_fd, write_fd = os.pipe()
    os.write(write_fd, passphrase.encode() + b"\n")
    os.close(write_fd)
    try:
        proc = subprocess.run(
            [
                "gpg",
                "--batch",
                "--yes",
                "--quiet",
                "--pinentry-mode",
                "loopback",
                "--passphrase-fd",
                str(read_fd),
                *args,
            ],
            input=data,
            capture_output=True,
            pass_fds=(read_fd,),
        )
    except FileNotFoundError as exc:  # pragma: no cover - env-specific
        raise BroadcastError("gpg not found on PATH") from exc
    finally:
        os.close(read_fd)
    if proc.returncode != 0:
        raise BroadcastError("gpg failed: " + proc.stderr.decode(errors="replace").strip())
    return proc.stdout


def encrypt(plain: bytes, passphrase: str) -> bytes:
    return _gpg(["--symmetric", "--cipher-algo", "AES256", "--armor"], plain, passphrase)


def decrypt(cipher: bytes, passphrase: str) -> bytes:
    return _gpg(["--decrypt"], cipher, passphrase)
