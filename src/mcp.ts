/**
 * broadcast MCP server: the non-interactive steps as MCP tools over stdio.
 *
 * A server has no terminal, so the passphrase comes from BROADCAST_PASSPHRASE
 * and the interactive browser auth flows stay CLI-only. Pipeline functions log
 * to stdout, which is the stdio transport, so tool calls capture console output
 * (and return it as the result) instead of letting it corrupt the protocol.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "./config.js";
import { mask } from "./core/env.js";
import { GpgSecretStore } from "./core/secret-store.js";
import { BroadcastError } from "./errors.js";
import type { Secrets } from "./interfaces.js";
import { generateReposts } from "./pipeline/generate.js";
import { shareLinkedIn } from "./publishers/linkedin-share.js";
import { publishXArticle } from "./publishers/x-article.js";

const store = new GpgSecretStore();

function passphrase(): string {
  if (!config.passphrase) {
    throw new BroadcastError("set BROADCAST_PASSPHRASE for the MCP server to unlock the store");
  }
  return config.passphrase;
}

async function loadSecrets(): Promise<Secrets> {
  return store.load(passphrase());
}

/** Run a pipeline step with console.log redirected off stdout, returning what it logged. */
async function capture(fn: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: "broadcast", version: "0.1.0" });

  server.tool("status", "Which broadcast credentials are present (masked)", {}, async () => {
    const secrets = await loadSecrets();
    const lines = [`store:   ${store.path}`, `blog:    ${config.blogDir}`, "secrets:"];
    const keys = Object.keys(secrets).sort();
    if (keys.length) for (const k of keys) lines.push(`  ${k}=${mask(secrets[k])}`);
    else lines.push("  (empty)");
    return text(lines.join("\n"));
  });

  server.tool(
    "generate",
    "Generate paste-ready repost artifacts for a slug (no credentials)",
    { slug: z.string() },
    async ({ slug }) => text(await capture(() => generateReposts(slug))),
  );

  server.tool(
    "x_publish",
    "Create an X Article draft. publish makes it public; dryRun skips API calls",
    { slug: z.string(), publish: z.boolean().optional(), dryRun: z.boolean().optional() },
    async ({ slug, publish, dryRun }) => {
      const secrets = await loadSecrets();
      if (!secrets.X_ACCESS_TOKEN) throw new BroadcastError("x publish needs X_ACCESS_TOKEN");
      Object.assign(process.env, secrets);
      return text(await capture(() => publishXArticle(slug, { publish, dryRun })));
    },
  );

  server.tool(
    "linkedin_share",
    "Preview (default) or, with confirm, publish the LinkedIn feed share live",
    { slug: z.string(), confirm: z.boolean().optional() },
    async ({ slug, confirm }) => {
      const secrets = await loadSecrets();
      if (!secrets.LINKEDIN_ACCESS_TOKEN || !secrets.LINKEDIN_PERSON_URN) {
        throw new BroadcastError(
          "linkedin share needs LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN",
        );
      }
      Object.assign(process.env, secrets);
      return text(await capture(() => shareLinkedIn(slug, { confirm })));
    },
  );

  return server;
}

export async function main(): Promise<void> {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}
