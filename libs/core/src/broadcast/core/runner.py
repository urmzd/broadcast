"""Drive the tsx publishing steps with secrets injected into the child env.

Secrets are passed via the process environment (``subprocess`` ``env=``), so
no plaintext file is ever written. ``run`` inherits stdio for interactive
steps; ``run_capture`` tees stdout so auth steps' printed tokens can be
parsed back out.
"""

from __future__ import annotations

import shlex
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from broadcast.core.config import Settings
from broadcast.core.errors import BroadcastError


class Runner:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def scripts_dir(self) -> Path:
        d = self._settings.scripts_dir.expanduser()
        if not (d / "lib" / "repost-core.ts").exists():
            raise BroadcastError(f"tsx scripts not found at {d} — set BROADCAST_SCRIPTS_DIR")
        return d.resolve()

    def _command(self, script: str, args: Sequence[str]) -> list[str]:
        base = shlex.split(self._settings.tsx)
        return [*base, str(self.scripts_dir() / script), *args]

    def _child_env(self, secrets: dict[str, str]) -> dict[str, str]:
        import os

        env = os.environ.copy()
        env.update(secrets)
        return env

    def run(self, script: str, args: Sequence[str], secrets: dict[str, str]) -> int:
        """Run a step with stdio inherited (interactive). Returns exit code."""
        proc = subprocess.run(
            self._command(script, args),
            env=self._child_env(secrets),
            cwd=str(self.scripts_dir().parent),
        )
        return proc.returncode

    def run_capture(
        self,
        script: str,
        args: Sequence[str],
        secrets: dict[str, str],
        on_line: Callable[[str], None] | None = None,
    ) -> tuple[int, str]:
        """Run a step, collecting stdout while streaming it to ``on_line``
        (default: echo to our stdout). stderr is inherited for live prompts."""
        if on_line is None:

            def on_line(line: str) -> None:
                sys.stdout.write(line)
                sys.stdout.flush()

        proc = subprocess.Popen(
            self._command(script, args),
            env=self._child_env(secrets),
            cwd=str(self.scripts_dir().parent),
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        collected: list[str] = []
        assert proc.stdout is not None
        for line in proc.stdout:
            on_line(line)
            collected.append(line)
        return proc.wait(), "".join(collected)


def require(secrets: dict[str, str], keys: Sequence[str], step: str) -> None:
    missing = [k for k in keys if not secrets.get(k)]
    if missing:
        raise BroadcastError(
            f"{step} needs {', '.join(missing)} — set them with "
            f"`broadcast set <KEY>` or `broadcast edit`"
        )
