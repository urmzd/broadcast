/**
 * Runtime configuration, validated with zod from BROADCAST_* environment vars.
 * The zod schema is the single source of truth for defaults and types (the
 * TypeScript analog of a pydantic-settings model).
 *
 *   BROADCAST_STORE        encrypted secret store (default XDG config)
 *   BROADCAST_BLOG_DIR     directory holding <slug>.mdx / <slug>.md
 *   BROADCAST_OUTPUT_DIR   base for reposts/, public/images/reposts/, dist/og/
 *   BROADCAST_SITE_URL     public base URL of the blog (for deep links)
 *   BROADCAST_PASSPHRASE   store passphrase (else the front-end prompts)
 *   BROADCAST_X_OAUTH_PORT localhost callback port for `x auth`
 *   BROADCAST_LINKEDIN_VERSION  LinkedIn-Version header for the Posts API
 */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const home = homedir();

const SettingsSchema = z.object({
  passphrase: z.string().optional(),
  store: z.string().default(join(home, ".config", "broadcast", "secrets.gpg")),
  blogDir: z.string().default(join(home, "github", "urmzd.com", "src", "blog")),
  outputDir: z.string().default(join(home, "github", "urmzd.com")),
  siteUrl: z.string().default("https://urmzd.com"),
  xOauthPort: z.coerce.number().int().positive().default(8935),
  linkedinVersion: z.string().default("202606"),
});

export type Settings = z.infer<typeof SettingsSchema>;

/** Resolve and validate settings from an environment map (defaults to process.env). */
export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  return SettingsSchema.parse({
    passphrase: env.BROADCAST_PASSPHRASE,
    store: env.BROADCAST_STORE,
    blogDir: env.BROADCAST_BLOG_DIR,
    outputDir: env.BROADCAST_OUTPUT_DIR,
    siteUrl: env.BROADCAST_SITE_URL,
    xOauthPort: env.BROADCAST_X_OAUTH_PORT ?? env.X_OAUTH_PORT,
    linkedinVersion: env.BROADCAST_LINKEDIN_VERSION ?? env.LINKEDIN_VERSION,
  });
}

/** Process-wide resolved settings. Pipeline modules read paths from here. */
export const config: Settings = loadSettings();

// node_modules (katex/mermaid dist assets) live at the package root. This file
// is src/config.ts in source and dist/config.js when built; the package root
// is one directory up from either.
export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const blogUrlFor = (slug: string): string => `${config.siteUrl}/blog/${slug}`;
export const imageDirFor = (slug: string): string =>
  join(config.outputDir, "public", "images", "reposts", slug);
export const repostDirFor = (slug: string): string => join(config.outputDir, "reposts", slug);
export const ogPathFor = (slug: string): string =>
  join(config.outputDir, "dist", "og", `${slug}.png`);
