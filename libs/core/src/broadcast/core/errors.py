"""Core raises; front-ends (CLI, MCP) decide how to surface the failure."""

from __future__ import annotations


class BroadcastError(Exception):
    """Any expected, user-facing failure (bad passphrase, missing key, ...).

    Core never calls ``sys.exit`` or prints errors — it raises this and lets
    the CLI translate it to an exit code or the MCP server to a tool error.
    """
