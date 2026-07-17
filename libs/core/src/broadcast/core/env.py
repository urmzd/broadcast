"""Dotenv-style parsing/serialization and the set of keys broadcast owns.

Pure helpers, no I/O — the encrypted store's plaintext form is a flat
``KEY=value`` file, and the tsx auth steps print ``export KEY=value`` lines
that get parsed the same way.
"""

from __future__ import annotations

import re

# The only keys broadcast manages. `import` slurps just these from a foreign
# env file; everything else (OpenAI, Cargo, ...) is left where it is.
BROADCAST_KEYS: frozenset[str] = frozenset(
    {
        "X_API_KEY",
        "X_API_SECRET",
        "X_ACCESS_TOKEN",
        "X_ACCESS_TOKEN_SECRET",
        "X_CLIENT_ID",
        "X_CLIENT_SECRET",
        "X_REFRESH_TOKEN",
        "X_OAUTH_PORT",
        "LINKEDIN_CLIENT_ID",
        "LINKEDIN_CLIENT_SECRET",
        "LINKEDIN_ACCESS_TOKEN",
        "LINKEDIN_PERSON_URN",
        "LINKEDIN_VERSION",
    }
)

_EXPORT_RE = re.compile(r"^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$")


def parse_env(text: str) -> dict[str, str]:
    """Parse ``KEY=value`` / ``export KEY=value`` lines, ignoring comments."""
    out: dict[str, str] = {}
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = _EXPORT_RE.match(line)
        if not m:
            continue
        val = m.group(2).strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        out[m.group(1)] = val
    return out


def serialize_env(secrets: dict[str, str]) -> str:
    header = "# broadcast secrets — encrypted at rest, decrypted only in memory.\n"
    return header + "".join(f"{k}={secrets[k]}\n" for k in sorted(secrets))


def parse_tokens(text: str, keys: set[str] | frozenset[str]) -> dict[str, str]:
    """Extract the wanted token keys from an auth step's stdout, rejecting
    empty values and human placeholders like ``(userinfo failed …)``."""
    return {
        k: v
        for k, v in parse_env(text).items()
        if k in keys and v and " " not in v and "(" not in v
    }


def mask(value: str) -> str:
    if not value:
        return "(empty)"
    return value[:3] + "…" + value[-2:] if len(value) > 8 else "•" * len(value)
