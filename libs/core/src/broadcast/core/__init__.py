"""broadcast core — the logic behind the CLI and MCP front-ends.

``broadcast`` is a PEP 420 namespace package; importable surfaces live in the
member distributions (``broadcast.core``, ``broadcast.cli``, ``broadcast.mcp``).
This module re-exports the pieces a front-end needs:

    from broadcast.core import Settings, SecretStore, Runner, require
"""

from broadcast.core.config import Settings
from broadcast.core.env import (
    BROADCAST_KEYS,
    mask,
    parse_env,
    parse_tokens,
    serialize_env,
)
from broadcast.core.errors import BroadcastError
from broadcast.core.runner import Runner, require
from broadcast.core.store import SecretStore

__all__ = [
    "BROADCAST_KEYS",
    "BroadcastError",
    "Runner",
    "SecretStore",
    "Settings",
    "mask",
    "parse_env",
    "parse_tokens",
    "require",
    "serialize_env",
]
