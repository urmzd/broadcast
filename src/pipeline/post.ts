/**
 * Blog post loading, markdown preprocessing, and block scanning.
 *
 * Paths (blog source, site URL) come from ../config. Image rendering lives in
 * ./render.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { blogUrlFor, config } from "../config.js";
import type { CodeFence, LoadedPost, Rendered } from "../interfaces.js";

export const SITE = config.siteUrl;

export function loadPost(slug: string): LoadedPost {
  const mdxPath = join(config.blogDir, `${slug}.mdx`);
  const mdPath = join(config.blogDir, `${slug}.md`);
  let raw: string;
  try {
    raw = readFileSync(mdxPath, "utf-8");
  } catch {
    try {
      raw = readFileSync(mdPath, "utf-8");
    } catch {
      throw new Error(`Blog post not found: ${mdxPath} or ${mdPath}`);
    }
  }

  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error("Could not parse frontmatter");
  }

  const frontmatterRaw = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  const extractField = (field: string): string => {
    const match = frontmatterRaw.match(new RegExp(`^${field}:\\s*"(.+)"`, "m"));
    return match ? match[1] : "";
  };

  const tagsMatch = frontmatterRaw.match(/^tags:\s*\[(.+)\]$/m);
  const tags = tagsMatch ? [...tagsMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];

  return {
    frontmatter: {
      title: extractField("title"),
      description: extractField("description"),
      pubDate:
        extractField("pubDate") || frontmatterRaw.match(/^pubDate:\s*(.+)$/m)?.[1]?.trim() || "",
      shareText: extractField("shareText"),
      tags,
    },
    body,
    blogUrl: blogUrlFor(slug),
  };
}

/**
 * Normalize the post body for repost rendering: replace the Snippet of the
 * Week with a teaser link, unwrap <details>, flatten #### headings, and
 * convert GitHub-style callouts to <blockquote> blocks.
 */
export function preprocessBody(body: string, blogUrl: string): string {
  // Strip trailing --- (section divider before References) to avoid double <hr>
  let cleanBody = body.replace(/\n---\s*$/, "");

  // The Snippet of the Week is a collapsible bonus on the blog; inlining it
  // here would dump equations and code after the post's closing line, so the
  // reposts end with a teaser that links back to it instead.
  cleanBody = cleanBody.replace(
    /^## Snippet of the Week\s*\n[\s\S]*?(?=^## |(?![\s\S]))/m,
    (section) => {
      const summary = section.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim();
      const teaser = summary ? `**${summary}**` : "a bonus snippet";
      return `## Snippet of the Week

This post ends with a bonus: ${teaser}. [Read it on the original post →](${blogUrl}#snippet-of-the-week)
`;
    },
  );

  // Unwrap <details>/<summary>: platform editors strip the tags, so flatten
  // the summary into bold text and keep the content inline.
  cleanBody = cleanBody
    .replace(/<summary>([\s\S]*?)<\/summary>/g, "**$1**")
    .replace(/<\/?details>\s*/g, "");

  // #### headings fall through mdxToHtml untouched; flatten to bold.
  cleanBody = cleanBody.replace(/^####\s+(.+)$/gm, "**$1**");

  // GitHub-style callouts (> [!note] Title \n > body) aren't handled by
  // mdxToHtml; flatten to a <blockquote> block, which passes through.
  cleanBody = cleanBody.replace(
    /^> \[!\w+\] (.+)\n((?:^> .*\n?)+)/gm,
    (_match, title: string, bodyLines: string) => {
      const bodyText = bodyLines
        .split("\n")
        .map((l) => l.replace(/^> ?/, ""))
        .join(" ")
        .trim();
      return `<blockquote><p><strong>${title.trim()}</strong><br>${bodyText}</p></blockquote>\n`;
    },
  );

  return cleanBody;
}

// rehype-slug (github-slugger) approximation, for deep links into the post.
export function headingAnchor(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

export interface ScannedBlocks {
  rendered: Rendered[];
  codeFences: CodeFence[];
}

/**
 * Scan for blocks the platforms can't render: mermaid, display math, GFM
 * tables. Records the nearest preceding heading for every block so each can
 * link back to its section in the original post.
 */
export function scanBlocks(cleanBody: string): ScannedBlocks {
  const rendered: Rendered[] = [];
  const codeFences: CodeFence[] = [];

  const scanner =
    /^##\s+(.+)$|^```(\w*)\n([\s\S]*?)^```$|^\$\$\s*\n([\s\S]*?)\n\$\$\s*$|^((?:\|.*\|\s*\n){2,})/gm;
  let anchor = "";
  let mermaidN = 0;
  let mathN = 0;
  let tableN = 0;
  for (const m of cleanBody.matchAll(scanner)) {
    if (m[1] !== undefined) {
      anchor = headingAnchor(m[1]);
    } else if (m[2] !== undefined) {
      if (m[2] === "mermaid") {
        mermaidN += 1;
        rendered.push({
          kind: "mermaid",
          source: m[3].trim(),
          anchor,
          file: `mermaid-${mermaidN}.png`,
          alt: `Diagram — view the interactive version on ${SITE.replace("https://", "")}`,
        });
      } else {
        codeFences.push({ anchor, lang: m[2], source: m[3].trimEnd() });
      }
    } else if (m[4] !== undefined) {
      mathN += 1;
      rendered.push({
        kind: "math",
        source: m[4].trim(),
        anchor,
        file: `math-${mathN}.png`,
        alt: "Equation — view on the original post",
      });
    } else if (m[5] !== undefined) {
      tableN += 1;
      rendered.push({
        kind: "table",
        source: m[5].trim(),
        anchor,
        file: `table-${tableN}.png`,
        alt: "Table — view on the original post",
      });
    }
  }

  return { rendered, codeFences };
}
