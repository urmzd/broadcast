<div align="center">

# broadcast

Turn a blog post into platform-native content — X Articles, LinkedIn posts,
and whatever ships next — from one CLI.

</div>

## Status

Planning. The working implementation currently lives in
[`urmzd.com`](https://github.com/urmzd/urmzd.com) and will migrate here:

| Source (urmzd.com) | Becomes |
| --- | --- |
| `scripts/lib/repost-core.ts` | Core: post loading, markdown preprocessing, block scanning, headless PNG rendering (mermaid / math / tables / code) |
| `scripts/generate-reposts.ts` | `broadcast generate <slug>` — paste-ready HTML (data-URI images), feed-post text, per-fence code files, cover image |
| `scripts/publish-x-article.ts` | `broadcast x draft <slug>` — markdown → DraftJS, media upload, `POST /2/articles/draft` (draft-only; `publish` is a separate explicit verb) |
| `scripts/get-linkedin-token.ts` | `broadcast linkedin auth` — 3-legged OAuth, prints token + person URN |
| `scripts/publish-linkedin-post.ts` | `broadcast linkedin share <slug>` — feed post with article card via `POST /rest/posts` (preview by default; `--yes` to go live) |
| `skills/publish-reposts/SKILL.md` | `skills/` — agent-facing workflow docs |

## Design constraints (learned the hard way)

- **X**: full Articles API with a real draft state (`POST /2/articles/draft`,
  then `/publish`). No code-block type — code renders to monospace PNGs with
  a deep link to the highlighted original. OAuth 1.0a user context.
- **LinkedIn**: long-form articles have **no public API** (retrieve/delete
  only) — the article body remains an editor paste flow; only the feed share
  automates. The Posts API has **no draft state on creation** ("PUBLISHED is
  the only accepted value"), so the CLI treats LinkedIn shares as
  irreversible: preview by default, explicit confirmation to post.
- Neither platform's editor fetches pasted image URLs; paste-ready HTML
  embeds rendered images as `data:` URIs so the pixels travel with the
  clipboard.
- Feed-post hashtag casing needs an acronym map (`#RAG`, not `#Rag`).

## Planned shape

```text
broadcast generate <post.md>         # all paste-ready artifacts
broadcast x draft <post.md>          # X Article draft via API
broadcast x publish <article-id>     # explicit, separate publish step
broadcast linkedin auth              # one-time token bootstrap
broadcast linkedin share <post.md>   # feed share (preview → --yes)
```

Input is any markdown/MDX blog post with frontmatter (`title`,
`description`, `shareText`, `tags`); the source repo stays decoupled so this
works for any blog, not just urmzd.com.

## Layout

A `uv` workspace: pure logic in `libs/`, thin front-ends in `apps/`, sharing
one `broadcast` namespace package.

```text
libs/core   → broadcast.core   encrypted store, gpg crypto, tsx step runner
apps/cli    → broadcast.cli     argparse front-end (the `broadcast` command)
apps/mcp    → broadcast.mcp     the same steps exposed as MCP tools
```

The TypeScript steps still live in `urmzd.com/scripts`; the launcher drives
them with credentials injected, so broadcast owns the flow before the code
migrates here.

## Running it today

```sh
uv sync                                  # install the workspace (cli + mcp + core)

uv run broadcast init                    # create the encrypted store
uv run broadcast import                  # one-time pull from ~/.envrc.local
uv run broadcast edit                    # $EDITOR to add app keys
uv run broadcast x auth                  # OAuth token for X, upserted
uv run broadcast x publish <slug> [--dry-run] [--publish]
uv run broadcast linkedin auth           # token + person URN, upserted
uv run broadcast linkedin share <slug> [--yes]
uv run broadcast generate <slug>         # paste-ready artifacts (no secrets)

uv run broadcast-mcp                      # MCP server: status, generate,
                                          # x_publish, linkedin_share tools
```

`just check` runs fmt + lint + tests. Overrides: `BROADCAST_SCRIPTS_DIR`
(default `~/github/urmzd.com/scripts`), `BROADCAST_TSX` (default `npx tsx`),
`BROADCAST_STORE`, `BROADCAST_PASSPHRASE`.

## Credentials

Encrypted at rest, self-contained, never dependent on `~/.envrc.local`. All
secrets live in `secrets.gpg` (GPG symmetric, AES-256, default
`~/.config/broadcast/`); the passphrase comes from `$BROADCAST_PASSPHRASE` or
an interactive prompt and is fed to gpg over a pipe fd, never on argv or disk.
Each step decrypts the store **in memory** and injects the vars straight into
the child process environment, so no plaintext env file is ever written. Auth
steps print fresh tokens; the launcher captures them and re-encrypts the store
(upsert, never append), so there is a single writer and no piling-up
duplicates. The MCP server has no terminal, so it requires `BROADCAST_PASSPHRASE`
and leaves the interactive browser auth flows to the CLI.

Keys owned by the store:
`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`,
`X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REFRESH_TOKEN`,
`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_ACCESS_TOKEN`,
`LINKEDIN_PERSON_URN`.
