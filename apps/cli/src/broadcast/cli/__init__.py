"""broadcast — one launcher for the blog-to-platform publishing steps.

Argparse front-end. Every operation lives in ``broadcast.core``; this module
only parses arguments, constructs the core objects, and maps
``BroadcastError`` to an exit code.
"""

from __future__ import annotations

import argparse
import sys

from broadcast.cli import commands
from broadcast.core import BroadcastError, Runner, SecretStore, Settings


def _build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="broadcast", description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init", help="create the encrypted store")
    p.add_argument("--force", action="store_true")

    p = sub.add_parser("import", help="pull X_*/LINKEDIN_* from ~/.envrc.local")
    p.add_argument("file", nargs="?")

    p = sub.add_parser("set", help="upsert one secret")
    p.add_argument("key")
    p.add_argument("value", nargs="?")

    p = sub.add_parser("unset", help="remove one secret")
    p.add_argument("key")

    sub.add_parser("list", help="keys with masked values")
    sub.add_parser("edit", help="$EDITOR on the decrypted store")

    p = sub.add_parser("x", help="X: auth | publish")
    p.add_argument("action", choices=["auth", "publish"])
    p.add_argument("rest", nargs=argparse.REMAINDER, help="<slug> [--dry-run] [--publish]")

    p = sub.add_parser("linkedin", help="LinkedIn: auth | share")
    p.add_argument("action", choices=["auth", "share"])
    p.add_argument("rest", nargs=argparse.REMAINDER, help="<slug> [--yes]")

    p = sub.add_parser("generate", help="paste-ready artifacts (no secrets)")
    p.add_argument("slug")

    p = sub.add_parser("run", help="run any tsx script with secrets injected")
    p.add_argument("script")
    p.add_argument("rest", nargs=argparse.REMAINDER)

    return ap


def _dispatch(args: argparse.Namespace) -> int:
    settings = Settings()
    store = SecretStore(settings)
    runner = Runner(settings)
    match args.cmd:
        case "init":
            return commands.init(settings, store, args.force)
        case "import":
            return commands.do_import(settings, store, args.file)
        case "set":
            return commands.set_(settings, store, args.key, args.value)
        case "unset":
            return commands.unset(settings, store, args.key)
        case "list":
            return commands.list_(settings, store)
        case "edit":
            return commands.edit(settings, store)
        case "x":
            return commands.x(settings, store, runner, args.action, args.rest)
        case "linkedin":
            return commands.linkedin(settings, store, runner, args.action, args.rest)
        case "generate":
            return commands.generate(runner, args.slug)
        case "run":
            return commands.run(settings, store, runner, args.script, args.rest)
    return 2


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        return _dispatch(args)
    except BroadcastError as exc:
        print(f"broadcast: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130
