"""broadcast MCP server — the publishing steps as MCP tools.

Same core as the CLI. A server has no terminal, so the passphrase must come
from ``BROADCAST_PASSPHRASE`` (there is no interactive prompt), and the
interactive browser auth flows (``x auth`` / ``linkedin auth``) stay
CLI-only — run those once by hand, then the tokens live in the store.
"""

from __future__ import annotations

from broadcast.core import (
    BroadcastError,
    Runner,
    SecretStore,
    Settings,
    mask,
    require,
)

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("broadcast")


def _context() -> tuple[Settings, SecretStore, Runner, str]:
    settings = Settings()
    if not settings.passphrase:
        raise BroadcastError("set BROADCAST_PASSPHRASE for the MCP server to unlock the store")
    return settings, SecretStore(settings), Runner(settings), settings.passphrase


def _run_captured(runner: Runner, script: str, args: list[str], secrets: dict[str, str]) -> str:
    rc, out = runner.run_capture(script, args, secrets, on_line=lambda _line: None)
    return f"exit {rc}\n{out}".rstrip()


@mcp.tool()
def status() -> str:
    """Which broadcast credentials are present (masked), and where the store
    and tsx scripts live."""
    settings, store, _runner, pw = _context()
    secrets = store.load(pw)
    lines = [f"store:   {store.path}", f"scripts: {settings.scripts_dir}", "secrets:"]
    lines += [f"  {k}={mask(v)}" for k, v in sorted(secrets.items())] or ["  (empty)"]
    return "\n".join(lines)


@mcp.tool()
def generate(slug: str) -> str:
    """Generate paste-ready repost artifacts for a post slug (no secrets)."""
    _settings, _store, runner, _pw = _context()
    return _run_captured(runner, "generate-reposts.ts", [slug], {})


@mcp.tool()
def x_publish(slug: str, publish: bool = False, dry_run: bool = False) -> str:
    """Create an X Article draft for a slug. ``publish`` makes it public;
    ``dry_run`` skips all write calls."""
    _settings, store, runner, pw = _context()
    secrets = store.load(pw)
    require(secrets, ["X_ACCESS_TOKEN"], "x publish")
    args = [slug] + (["--dry-run"] if dry_run else []) + (["--publish"] if publish else [])
    return _run_captured(runner, "publish-x-article.ts", args, secrets)


@mcp.tool()
def linkedin_share(slug: str, confirm: bool = False) -> str:
    """Preview (default) or, with ``confirm``, publish LIVE the LinkedIn feed
    post for a slug."""
    _settings, store, runner, pw = _context()
    secrets = store.load(pw)
    require(secrets, ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_PERSON_URN"], "linkedin share")
    args = [slug] + (["--yes"] if confirm else [])
    return _run_captured(runner, "publish-linkedin-post.ts", args, secrets)


def main() -> None:
    mcp.run()
