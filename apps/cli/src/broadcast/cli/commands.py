"""CLI command handlers.

These own everything I/O: passphrase prompts, ``$EDITOR``, stdout formatting.
All logic (crypto, store, dispatch) lives in ``broadcast.core``.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from getpass import getpass
from pathlib import Path

from broadcast.core import (
    BROADCAST_KEYS,
    BroadcastError,
    Runner,
    SecretStore,
    Settings,
    mask,
    parse_env,
    parse_tokens,
    require,
    serialize_env,
)

_X_TOKENS = {"X_ACCESS_TOKEN", "X_REFRESH_TOKEN"}
_LINKEDIN_TOKENS = {"LINKEDIN_ACCESS_TOKEN", "LINKEDIN_PERSON_URN"}


def _passphrase(settings: Settings, confirm: bool = False) -> str:
    if settings.passphrase:
        return settings.passphrase
    if not sys.stdin.isatty():
        raise BroadcastError("no passphrase: set BROADCAST_PASSPHRASE or run in a terminal")
    pw = getpass("Passphrase: ")
    if confirm and pw != getpass("Confirm passphrase: "):
        raise BroadcastError("passphrases did not match")
    if not pw:
        raise BroadcastError("empty passphrase")
    return pw


def _open(store: SecretStore, settings: Settings) -> tuple[dict[str, str], str]:
    pw = _passphrase(settings)
    return store.load(pw), pw


def init(settings: Settings, store: SecretStore, force: bool) -> int:
    if store.exists() and not force:
        raise BroadcastError(f"{store.path} already exists — pass --force to overwrite")
    pw = _passphrase(settings, confirm=True)
    store.save({}, pw)
    print(f"✓ created empty encrypted store at {store.path}")
    print("  next: `broadcast import` or `broadcast edit` to add app creds")
    return 0


def do_import(settings: Settings, store: SecretStore, file: str | None) -> int:
    src = Path(file).expanduser() if file else Path.home() / ".envrc.local"
    if not src.exists():
        raise BroadcastError(f"source not found: {src}")
    found = {k: v for k, v in parse_env(src.read_text()).items() if k in BROADCAST_KEYS}
    if not found:
        raise BroadcastError(f"no broadcast keys (X_*/LINKEDIN_*) found in {src}")
    secrets, pw = _open(store, settings)
    secrets.update(found)  # last value wins — collapses appended duplicates
    store.save(secrets, pw)
    print(f"✓ imported {len(found)} keys from {src}:")
    for k in sorted(found):
        print(f"    {k}={mask(found[k])}")
    print(
        f"\nThese now live only in {store.path}. You can delete the "
        f"X_*/LINKEDIN_* lines from {src}."
    )
    return 0


def set_(settings: Settings, store: SecretStore, key: str, value: str | None) -> int:
    key = key.upper()
    val = value if value is not None else getpass(f"{key}=")
    secrets, pw = _open(store, settings)
    secrets[key] = val
    store.save(secrets, pw)
    print(f"✓ set {key}={mask(val)}")
    return 0


def unset(settings: Settings, store: SecretStore, key: str) -> int:
    key = key.upper()
    secrets, pw = _open(store, settings)
    if key not in secrets:
        raise BroadcastError(f"{key} not in store")
    del secrets[key]
    store.save(secrets, pw)
    print(f"✓ removed {key}")
    return 0


def list_(settings: Settings, store: SecretStore) -> int:
    secrets, _ = _open(store, settings)
    if not secrets:
        print("(store is empty)")
        return 0
    width = max(len(k) for k in secrets)
    for k in sorted(secrets):
        print(f"  {k.ljust(width)}  {mask(secrets[k])}")
    return 0


def edit(settings: Settings, store: SecretStore) -> int:
    secrets, pw = _open(store, settings)
    editor = os.environ.get("EDITOR", "vi")
    workdir = tempfile.mkdtemp(prefix="broadcast-")
    os.chmod(workdir, 0o700)
    tmp = Path(workdir) / "secrets.env"
    try:
        tmp.write_text(serialize_env(secrets))
        os.chmod(tmp, 0o600)
        import shlex

        if subprocess.run([*shlex.split(editor), str(tmp)]).returncode != 0:
            raise BroadcastError("editor exited non-zero — store unchanged")
        store.save(parse_env(tmp.read_text()), pw)
        print(f"✓ re-encrypted store at {store.path}")
    finally:
        if tmp.exists():
            tmp.write_bytes(os.urandom(tmp.stat().st_size or 1))  # shred
            tmp.unlink()
        os.rmdir(workdir)
    return 0


def _auth(
    settings: Settings,
    store: SecretStore,
    runner: Runner,
    script: str,
    needs: list[str],
    token_keys: set[str],
    step: str,
) -> int:
    secrets, pw = _open(store, settings)
    require(secrets, needs, step)
    rc, out = runner.run_capture(script, [], secrets)
    if rc != 0:
        return rc
    tokens = parse_tokens(out, token_keys)
    if not tokens:
        raise BroadcastError("no valid tokens parsed from the auth step; store unchanged")
    secrets.update(tokens)
    store.save(secrets, pw)
    print("\n✓ upserted into encrypted store: " + ", ".join(sorted(tokens)))
    return 0


def x(settings: Settings, store: SecretStore, runner: Runner, action: str, rest: list[str]) -> int:
    if action == "auth":
        return _auth(
            settings, store, runner, "get-x-token.ts", ["X_CLIENT_ID"], _X_TOKENS, "x auth"
        )
    secrets, _ = _open(store, settings)
    require(secrets, ["X_ACCESS_TOKEN"], "x publish")  # bearer or oauth1 both need it
    return runner.run("publish-x-article.ts", rest, secrets)


def linkedin(
    settings: Settings, store: SecretStore, runner: Runner, action: str, rest: list[str]
) -> int:
    if action == "auth":
        return _auth(
            settings,
            store,
            runner,
            "get-linkedin-token.ts",
            ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
            _LINKEDIN_TOKENS,
            "linkedin auth",
        )
    if action == "article":
        # Long-form article draft via browser UI automation (a saved LinkedIn
        # session, not the API), so no store secrets are needed. Pass <slug>
        # or --login through.
        return runner.run("publish-linkedin-article.ts", rest, {})
    secrets, _ = _open(store, settings)
    require(secrets, ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_PERSON_URN"], "linkedin share")
    return runner.run("publish-linkedin-post.ts", rest, secrets)


def generate(runner: Runner, slug: str) -> int:
    return runner.run("generate-reposts.ts", [slug], {})


def run(
    settings: Settings, store: SecretStore, runner: Runner, script: str, rest: list[str]
) -> int:
    secrets, _ = _open(store, settings)
    return runner.run(script, rest, secrets)
