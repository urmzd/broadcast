"""Runtime configuration, resolved from ``BROADCAST_*`` environment vars."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_store() -> Path:
    return Path.home() / ".config" / "broadcast" / "secrets.gpg"


def _default_scripts_dir() -> Path:
    # The tsx steps now live in this repo. Prefer a pipeline/ next to the
    # current checkout, falling back to the conventional clone location.
    local = Path.cwd() / "pipeline" / "scripts"
    if (local / "lib" / "repost-core.ts").exists():
        return local
    return Path.home() / "github" / "broadcast" / "pipeline" / "scripts"


class Settings(BaseSettings):
    """All knobs come from the environment; nothing is read from files.

    - ``BROADCAST_STORE``        encrypted secret store (default XDG config)
    - ``BROADCAST_SCRIPTS_DIR``  the tsx steps to drive
    - ``BROADCAST_TSX``          how to invoke tsx
    - ``BROADCAST_PASSPHRASE``   store passphrase (else the front-end prompts)
    """

    model_config = SettingsConfigDict(env_prefix="BROADCAST_")

    store: Path = Field(default_factory=_default_store)
    scripts_dir: Path = Field(default_factory=_default_scripts_dir)
    tsx: str = "npx tsx"
    passphrase: str | None = None
