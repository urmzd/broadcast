/**
 * Where the pipeline reads the blog from and writes its artifacts to.
 *
 * Decoupled from any single blog: everything defaults to a local urmzd.com
 * checkout so it runs with no config, but each path is env-overridable so the
 * same pipeline works for any blog.
 *
 *   BROADCAST_BLOG_DIR    directory holding <slug>.mdx / <slug>.md
 *   BROADCAST_OUTPUT_DIR  base dir for reposts/, public/images/reposts/, dist/og/
 *   BROADCAST_SITE_URL    public base URL of the blog (for deep links)
 *
 * katex/mermaid come from this package's own node_modules, never the blog's.
 */

import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const home = homedir();

export const SITE_URL = process.env.BROADCAST_SITE_URL ?? 'https://urmzd.com';

export const BLOG_DIR =
  process.env.BROADCAST_BLOG_DIR ?? join(home, 'github', 'urmzd.com', 'src', 'blog');

export const OUTPUT_DIR =
  process.env.BROADCAST_OUTPUT_DIR ?? join(home, 'github', 'urmzd.com');

// This file is <pipeline>/scripts/lib/config.ts, so the package root (where
// node_modules with katex/mermaid lives) is two directories up.
export const PIPELINE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const blogUrlFor = (slug: string): string => `${SITE_URL}/blog/${slug}`;
export const imageDirFor = (slug: string): string =>
  join(OUTPUT_DIR, 'public', 'images', 'reposts', slug);
export const repostDirFor = (slug: string): string => join(OUTPUT_DIR, 'reposts', slug);
export const ogPathFor = (slug: string): string => join(OUTPUT_DIR, 'dist', 'og', `${slug}.png`);
