<div align="center">

# blogger

Turn a blog post into platform-native content — X Articles, LinkedIn posts,
and whatever ships next — from one CLI.

</div>

## Status

Planning. The working implementation currently lives in
[`urmzd.com`](https://github.com/urmzd/urmzd.com) and will migrate here:

| Source (urmzd.com) | Becomes |
| --- | --- |
| `scripts/lib/repost-core.ts` | Core: post loading, markdown preprocessing, block scanning, headless PNG rendering (mermaid / math / tables / code) |
| `scripts/generate-reposts.ts` | `blogger generate <slug>` — paste-ready HTML (data-URI images), feed-post text, per-fence code files, cover image |
| `scripts/publish-x-article.ts` | `blogger x draft <slug>` — markdown → DraftJS, media upload, `POST /2/articles/draft` (draft-only; `publish` is a separate explicit verb) |
| `scripts/get-linkedin-token.ts` | `blogger linkedin auth` — 3-legged OAuth, prints token + person URN |
| `scripts/publish-linkedin-post.ts` | `blogger linkedin share <slug>` — feed post with article card via `POST /rest/posts` (preview by default; `--yes` to go live) |
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
blogger generate <post.md>         # all paste-ready artifacts
blogger x draft <post.md>          # X Article draft via API
blogger x publish <article-id>     # explicit, separate publish step
blogger linkedin auth              # one-time token bootstrap
blogger linkedin share <post.md>   # feed share (preview → --yes)
```

Input is any markdown/MDX blog post with frontmatter (`title`,
`description`, `shareText`, `tags`); the source repo stays decoupled so this
works for any blog, not just urmzd.com.

## Credentials

All via environment, never committed:
`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`,
`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_ACCESS_TOKEN`,
`LINKEDIN_PERSON_URN`.
