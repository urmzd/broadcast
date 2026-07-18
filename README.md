<p align="center">
  <h1 align="center">broadcast</h1>
  <p align="center">
    Turn a blog post into platform-native content, X Articles and LinkedIn posts, from one CLI.
    <br /><br />
    <a href="https://github.com/urmzd/broadcast/issues">Report Bug</a>
    &middot;
    <a href="https://urmzd.com">urmzd.com</a>
  </p>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/urmzd/broadcast" alt="License"></a>
</p>

broadcast takes a written blog post and produces the platform-native versions:
an X Article draft (created through the API), a LinkedIn feed share, and
paste-ready HTML for the editors that have no API. Credentials for both
platforms live in a single gpg-encrypted store, unlocked with one passphrase,
never written to disk in plaintext.

The rendering and API steps are TypeScript, in [`pipeline/`](pipeline/); the
Python CLI holds your credentials and drives them. The pipeline reads any
blog's markdown and defaults to a local urmzd.com checkout, but every path is
env-overridable (see [Configuration](#configuration)), so it works for any
blog.

## Features

- **One encrypted credential store.** X and LinkedIn app keys and OAuth tokens
  in a single AES-256 file, unlocked by one passphrase. Nothing in plaintext on
  disk, ever.
- **Token bootstrap built in.** `x auth` and `linkedin auth` run the OAuth
  browser flow and write the resulting tokens back into the store for you.
- **Draft-safe by default.** X articles are created as drafts; LinkedIn shares
  preview until you pass `--yes`. Publishing is always an explicit step.
- **CLI and MCP.** The same operations are a command line (`broadcast`) and an
  MCP server (`broadcast-mcp`) you can wire into an agent.

## Installation

### Prerequisites

| Requirement | Why |
| --- | --- |
| [uv](https://docs.astral.sh/uv/) | run the Python CLI / MCP server |
| [gpg](https://gnupg.org/) | encrypt the credential store |
| [Node](https://nodejs.org/) | run the TypeScript pipeline in `pipeline/` |

You also need a developer app on each platform you publish to (see
[Platform setup](#platform-setup)).

### Setup

```sh
git clone https://github.com/urmzd/broadcast
cd broadcast

uv sync                                   # Python CLI, MCP server, shared core

cd pipeline && npm install                # rendering + publishing steps
npx playwright install chromium           # headless browser for diagram/table PNGs
cd ..
```

`uv sync` installs into a managed virtualenv; prefix commands with `uv run`, or
activate it once with `direnv allow`. The pipeline's `npm install` and the
one-time `playwright install` provide the headless renderer.

## Quick Start

```sh
# 1. Create the encrypted store (prompts for a passphrase).
uv run broadcast init

# 2. Add your app credentials (opens $EDITOR on the decrypted store).
uv run broadcast edit

# 3. Bootstrap user tokens through the OAuth browser flow.
uv run broadcast x auth
uv run broadcast linkedin auth

# 4. Publish. X lands as a draft; LinkedIn previews until --yes.
uv run broadcast x publish my-post-slug
uv run broadcast linkedin share my-post-slug
```

`<slug>` is the blog post's slug (the filename under the source repo's posts
directory). `generate` needs no credentials and just writes the paste-ready
artifacts:

```sh
uv run broadcast generate my-post-slug
```

## Platform setup

broadcast never creates the developer apps for you. Set each one up once, then
put its keys in the store with `broadcast edit`.

### X

1. At [console.x.com](https://console.x.com), create an app.
2. Under **User authentication settings**, enable OAuth 2.0. Set the app type
   to **Native App** (public client) or **Web App** (confidential, also needs
   `X_CLIENT_SECRET`).
3. Add the callback URL `http://localhost:8935/callback`.
4. Copy the **OAuth 2.0 Client ID** into the store as `X_CLIENT_ID`.
5. Run `broadcast x auth`. It requests the `tweet.read tweet.write users.read
   media.write offline.access` scopes and writes `X_ACCESS_TOKEN` /
   `X_REFRESH_TOKEN` back.

`x publish` works with either the OAuth 2.0 token (`X_ACCESS_TOKEN`) or the full
OAuth 1.0a set (`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`,
`X_ACCESS_TOKEN_SECRET`) if you prefer that path.

### LinkedIn

1. At [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps),
   create an app.
2. Add the products **Share on LinkedIn** and **Sign In with LinkedIn using
   OpenID Connect**.
3. Under **Auth**, add the redirect URL `http://localhost:8935/callback`, and
   copy the client ID and secret into the store as `LINKEDIN_CLIENT_ID` /
   `LINKEDIN_CLIENT_SECRET`.
4. Run `broadcast linkedin auth`. It requests `openid profile w_member_social`
   and writes `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_PERSON_URN` back. Tokens last
   about two months.

The LinkedIn long-form article has no public API. `linkedin article` drives
the editor with a headless browser instead: run `linkedin article --login`
once to save a session, then `linkedin article <slug>` pastes the generated
HTML and leaves an autosaved draft for review (it never publishes). The feed
share (`linkedin share`) uses the Posts API and has no draft state, so
`--yes` posts live immediately.

## Commands

| Command | Description |
| --- | --- |
| `broadcast init [--force]` | Create the encrypted store. |
| `broadcast import [FILE]` | Pull `X_*`/`LINKEDIN_*` from `~/.envrc.local` (or FILE) into the store. |
| `broadcast set KEY [VALUE]` | Upsert one secret (prompts if VALUE is omitted). |
| `broadcast unset KEY` | Remove one secret. |
| `broadcast list` | List stored keys with masked values. |
| `broadcast edit` | Open `$EDITOR` on the decrypted store, then re-encrypt. |
| `broadcast x auth` | OAuth browser flow for X; upserts the tokens. |
| `broadcast x publish <slug> [--dry-run] [--publish]` | Create an X Article draft; `--publish` makes it public. |
| `broadcast linkedin auth` | OAuth browser flow for LinkedIn; upserts token and person URN. |
| `broadcast linkedin share <slug> [--yes]` | Preview, then with `--yes` post the feed share live. |
| `broadcast linkedin article <slug>` / `--login` | Draft a long-form LinkedIn article by driving the editor (saved browser session). |
| `broadcast generate <slug>` | Write paste-ready artifacts (no credentials). |
| `broadcast run <script.ts> [args...]` | Run any tsx step with the store injected. |

## Credentials and security

Secrets live in one gpg-symmetric file (AES-256), by default at
`~/.config/broadcast/secrets.gpg`. The passphrase comes from
`$BROADCAST_PASSPHRASE` or an interactive prompt and is handed to gpg over a
pipe file descriptor, never on the command line or disk. Every step decrypts
the store in memory and injects the variables straight into the child process
environment, so no plaintext credential file is written. The `auth` steps
capture the freshly printed tokens and re-encrypt the store, replacing rather
than appending, so a value never accumulates duplicates.

Keys the store manages: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`,
`X_ACCESS_TOKEN_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REFRESH_TOKEN`,
`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_ACCESS_TOKEN`,
`LINKEDIN_PERSON_URN`, `LINKEDIN_VERSION`.

Migrating from loose env vars? `broadcast import` reads those keys out of
`~/.envrc.local`, collapses any duplicates (last value wins), and leaves the
rest of the file untouched.

## MCP server

`broadcast-mcp` exposes the non-interactive steps as MCP tools (`status`,
`generate`, `x_publish`, `linkedin_share`) over stdio. A server has no
terminal, so it reads the passphrase from `BROADCAST_PASSPHRASE` and leaves the
interactive `auth` flows to the CLI. Wire it into an MCP client like so:

```json
{
  "mcpServers": {
    "broadcast": {
      "command": "uv",
      "args": ["run", "broadcast-mcp"],
      "cwd": "/path/to/broadcast",
      "env": { "BROADCAST_PASSPHRASE": "..." }
    }
  }
}
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `BROADCAST_PASSPHRASE` | prompt | Unlock the store non-interactively (required for the MCP server). |
| `BROADCAST_STORE` | `~/.config/broadcast/secrets.gpg` | Encrypted store location. |
| `BROADCAST_BLOG_DIR` | `~/github/urmzd.com/src/blog` | Directory holding `<slug>.mdx` / `<slug>.md`. |
| `BROADCAST_OUTPUT_DIR` | `~/github/urmzd.com` | Base for `reposts/`, `public/images/reposts/`, `dist/og/`. |
| `BROADCAST_SITE_URL` | `https://urmzd.com` | Public base URL of the blog, for deep links. |
| `BROADCAST_SCRIPTS_DIR` | `<repo>/pipeline/scripts` | The tsx publishing steps to drive. |
| `BROADCAST_TSX` | `npx tsx` | How to invoke tsx. |

Point the first three at another blog and broadcast works for it: no urmzd.com
coupling beyond the defaults.

## License

Apache-2.0. See [LICENSE](LICENSE).
