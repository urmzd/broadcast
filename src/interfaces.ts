/**
 * The seams the rest of the code programs against. Concrete implementations
 * (a gpg-backed store, a Playwright renderer) live behind these so callers,
 * tests, and future backends stay decoupled.
 */

export type Secrets = Record<string, string>;

/** An encrypted credential store, decrypted only in memory. */
export interface SecretStore {
  readonly path: string;
  exists(): boolean;
  load(passphrase: string): Promise<Secrets>;
  save(secrets: Secrets, passphrase: string): Promise<void>;
}

/** Renders the blocks the platforms cannot display (mermaid/math/table/code) to images. */
export interface ImageRenderer {
  render(targets: Rendered[], imageDir: string, logPrefix: string): Promise<void>;
}

export interface PostFrontmatter {
  title: string;
  description: string;
  pubDate: string;
  updatedDate?: string;
  heroImage?: string;
  shareText?: string;
  tags: string[];
}

export interface LoadedPost {
  frontmatter: PostFrontmatter;
  body: string;
  blogUrl: string;
}

export interface Rendered {
  kind: "mermaid" | "math" | "table" | "code";
  source: string;
  anchor: string;
  file: string;
  alt: string;
  lang?: string;
}

export interface CodeFence {
  anchor: string;
  lang: string;
  source: string;
}
