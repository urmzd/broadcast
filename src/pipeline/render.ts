/**
 * Render mermaid/math/table/code blocks to HiDPI PNGs via headless chromium,
 * using this package's own mermaid + katex builds. Mermaid sources also get an
 * SVG alongside the PNG.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { PACKAGE_ROOT } from "../config.js";
import type { ImageRenderer, Rendered } from "../interfaces.js";

function inlineMd(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");
}

function tableToHtml(md: string): string {
  const rows = md
    .trim()
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((c) => inlineMd(c.trim())),
    );
  const header = rows[0];
  const bodyRows = rows.filter((r, i) => i > 0 && !r.every((c) => /^:?-+:?$/.test(c)));
  const cell = (tag: string, cells: string[]) =>
    `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
  return `<table><thead>${cell("th", header)}</thead><tbody>${bodyRows
    .map((r) => cell("td", r))
    .join("")}</tbody></table>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// X crops article images taller than ~4:5, so repost diagrams render in
// landscape: flowcharts flip TD/TB → LR, state diagrams get direction LR.
function toLandscape(src: string): string {
  if (/^(flowchart|graph)\s+(TD|TB)\b/m.test(src)) {
    return src.replace(/^(flowchart|graph)\s+(?:TD|TB)\b/m, "$1 LR");
  }
  if (/^stateDiagram/m.test(src) && !/^\s*direction\s/m.test(src)) {
    return src.replace(/^(stateDiagram(?:-v2)?)\s*$/m, "$1\n    direction LR");
  }
  return src;
}

export async function renderImages(
  targets: Rendered[],
  imageDir: string,
  logPrefix: string,
): Promise<void> {
  if (targets.length === 0) return;
  mkdirSync(imageDir, { recursive: true });

  const stagePath = join(tmpdir(), `repost-render-${Date.now()}.html`);
  const katexCss = pathToFileURL(join(PACKAGE_ROOT, "node_modules/katex/dist/katex.min.css")).href;
  const katexJs = pathToFileURL(join(PACKAGE_ROOT, "node_modules/katex/dist/katex.min.js")).href;
  const mermaidJs = pathToFileURL(
    join(PACKAGE_ROOT, "node_modules/mermaid/dist/mermaid.min.js"),
  ).href;
  writeFileSync(
    stagePath,
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="${katexCss}">
  <script src="${mermaidJs}"></script>
  <script src="${katexJs}"></script>
  <style>
    body { background: #fff; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    #stage { display: inline-block; padding: 24px; }
    table { border-collapse: collapse; font-size: 15px; }
    th, td { border: 1px solid #d0d0d0; padding: 8px 14px; text-align: left; }
    th { background: #f5f5f5; }
    pre.code-stage { background: #16181d; color: #e6e6e6; padding: 20px 24px; border-radius: 8px; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 13px; line-height: 1.6; margin: 0; max-width: 860px; overflow: hidden; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body><div id="stage"></div></body>
</html>`,
  );

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 2600, height: 1600 },
    deviceScaleFactor: 2,
  });
  await page.goto(pathToFileURL(stagePath).href);

  for (const target of targets) {
    if (target.kind === "mermaid") {
      const svg = await page.evaluate(async (source) => {
        // @ts-expect-error mermaid is a page global
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          // Natural-size renders: without this, mermaid shrinks the SVG to the
          // container and the exported PNG text becomes unreadable.
          flowchart: { useMaxWidth: false },
          state: { useMaxWidth: false },
          sequence: { useMaxWidth: false },
        });
        // @ts-expect-error mermaid is a page global
        const { svg } = await mermaid.render(`d${Date.now() % 1e6}`, source);
        const stage = document.getElementById("stage") as HTMLElement;
        stage.innerHTML = svg;
        return svg as string;
      }, toLandscape(target.source));
      writeFileSync(join(imageDir, target.file.replace(/\.png$/, ".svg")), svg);
    } else if (target.kind === "math") {
      await page.evaluate((tex) => {
        const stage = document.getElementById("stage") as HTMLElement;
        // @ts-expect-error katex is a page global
        katex.render(tex, stage, { displayMode: true, throwOnError: false });
      }, target.source);
    } else if (target.kind === "code") {
      await page.evaluate(
        (html) => {
          (document.getElementById("stage") as HTMLElement).innerHTML = html;
        },
        `<pre class="code-stage">${escapeHtml(target.source)}</pre>`,
      );
    } else {
      await page.evaluate((html) => {
        (document.getElementById("stage") as HTMLElement).innerHTML = html;
      }, tableToHtml(target.source));
    }
    await page.locator("#stage").screenshot({ path: join(imageDir, target.file) });
    console.log(`✓ ${logPrefix}/${target.file}`);
  }

  await browser.close();
}

/** ImageRenderer backed by headless chromium. */
export class PlaywrightRenderer implements ImageRenderer {
  render(targets: Rendered[], imageDir: string, logPrefix: string): Promise<void> {
    return renderImages(targets, imageDir, logPrefix);
  }
}
