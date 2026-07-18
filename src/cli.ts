/**
 * broadcast command line (Commander). This file only wires arguments to the
 * library; all logic lives in the modules it imports.
 */

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { getLinkedInToken } from "./auth/linkedin-token.js";
import { getXToken } from "./auth/x-token.js";
import { config, PACKAGE_ROOT } from "./config.js";
import { BROADCAST_KEYS, mask, parseEnv, serializeEnv } from "./core/env.js";
import { GpgSecretStore } from "./core/secret-store.js";
import { BroadcastError } from "./errors.js";
import type { Secrets } from "./interfaces.js";
import { generateReposts } from "./pipeline/generate.js";
import { promptSecret, resolvePassphrase } from "./prompt.js";
import { draftLinkedInArticle, linkedinLogin } from "./publishers/linkedin-article.js";
import { shareLinkedIn } from "./publishers/linkedin-share.js";
import { publishXArticle } from "./publishers/x-article.js";

const store = new GpgSecretStore();

function version(): string {
  const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf-8"));
  return pkg.version as string;
}

function requireKeys(secrets: Secrets, keys: string[], step: string): void {
  const missing = keys.filter((k) => !secrets[k]);
  if (missing.length) {
    throw new BroadcastError(
      `${step} needs ${missing.join(", ")} — set them with \`broadcast set <KEY>\` or \`broadcast edit\``,
    );
  }
}

async function openStore(): Promise<{ secrets: Secrets; passphrase: string }> {
  const passphrase = await resolvePassphrase();
  return { secrets: await store.load(passphrase), passphrase };
}

async function upsert(secrets: Secrets, passphrase: string, tokens: Secrets): Promise<void> {
  const fresh = Object.fromEntries(Object.entries(tokens).filter(([, v]) => v));
  if (!Object.keys(fresh).length) throw new BroadcastError("no tokens returned; store unchanged");
  Object.assign(secrets, fresh);
  await store.save(secrets, passphrase);
  console.log(`\n✓ upserted into encrypted store: ${Object.keys(fresh).sort().join(", ")}`);
}

// --- command handlers ---

async function cmdInit(opts: { force?: boolean }): Promise<void> {
  if (store.exists() && !opts.force) {
    throw new BroadcastError(`${store.path} already exists — pass --force to overwrite`);
  }
  const passphrase = await resolvePassphrase(true);
  await store.save({}, passphrase);
  console.log(`✓ created empty encrypted store at ${store.path}`);
  console.log("  next: `broadcast import` or `broadcast edit` to add app creds");
}

async function cmdImport(file: string | undefined): Promise<void> {
  const src = file ?? join(process.env.HOME ?? "", ".envrc.local");
  if (!existsSync(src)) throw new BroadcastError(`source not found: ${src}`);
  const found = Object.fromEntries(
    Object.entries(parseEnv(readFileSync(src, "utf-8"))).filter(([k]) => BROADCAST_KEYS.has(k)),
  );
  if (!Object.keys(found).length) {
    throw new BroadcastError(`no broadcast keys (X_*/LINKEDIN_*) found in ${src}`);
  }
  const { secrets, passphrase } = await openStore();
  Object.assign(secrets, found); // last value wins — collapses appended duplicates
  await store.save(secrets, passphrase);
  console.log(`✓ imported ${Object.keys(found).length} keys from ${src}:`);
  for (const k of Object.keys(found).sort()) console.log(`    ${k}=${mask(found[k])}`);
  console.log(`\nThese now live only in ${store.path}. You can delete them from ${src}.`);
}

async function cmdSet(key: string, value: string | undefined): Promise<void> {
  const k = key.toUpperCase();
  const v = value ?? (await promptSecret(`${k}=`));
  const { secrets, passphrase } = await openStore();
  secrets[k] = v;
  await store.save(secrets, passphrase);
  console.log(`✓ set ${k}=${mask(v)}`);
}

async function cmdUnset(key: string): Promise<void> {
  const k = key.toUpperCase();
  const { secrets, passphrase } = await openStore();
  if (!(k in secrets)) throw new BroadcastError(`${k} not in store`);
  delete secrets[k];
  await store.save(secrets, passphrase);
  console.log(`✓ removed ${k}`);
}

async function cmdList(): Promise<void> {
  const { secrets } = await openStore();
  const keys = Object.keys(secrets).sort();
  if (!keys.length) {
    console.log("(store is empty)");
    return;
  }
  const width = Math.max(...keys.map((k) => k.length));
  for (const k of keys) console.log(`  ${k.padEnd(width)}  ${mask(secrets[k])}`);
}

async function cmdEdit(): Promise<void> {
  const { secrets, passphrase } = await openStore();
  const editor = process.env.EDITOR ?? "vi";
  const dir = mkdtempSync(join(tmpdir(), "broadcast-"));
  chmodSync(dir, 0o700);
  const tmp = join(dir, "secrets.env");
  try {
    writeFileSync(tmp, serializeEnv(secrets), { mode: 0o600 });
    const [bin, ...args] = editor.split(" ");
    const res = spawnSync(bin, [...args, tmp], { stdio: "inherit" });
    if (res.status !== 0) throw new BroadcastError("editor exited non-zero — store unchanged");
    await store.save(parseEnv(readFileSync(tmp, "utf-8")), passphrase);
    console.log(`✓ re-encrypted store at ${store.path}`);
  } finally {
    if (existsSync(tmp)) writeFileSync(tmp, Buffer.alloc(64)); // shred
    rmSync(dir, { recursive: true, force: true });
  }
}

async function cmdXAuth(): Promise<void> {
  const { secrets, passphrase } = await openStore();
  requireKeys(secrets, ["X_CLIENT_ID"], "x auth");
  const tokens = await getXToken({
    clientId: secrets.X_CLIENT_ID,
    clientSecret: secrets.X_CLIENT_SECRET,
    port: config.xOauthPort,
  });
  await upsert(secrets, passphrase, tokens);
}

async function cmdXPublish(
  slug: string,
  opts: { dryRun?: boolean; publish?: boolean },
): Promise<void> {
  const { secrets } = await openStore();
  requireKeys(secrets, ["X_ACCESS_TOKEN"], "x publish"); // bearer or oauth1 both need it
  Object.assign(process.env, secrets);
  await publishXArticle(slug, { dryRun: opts.dryRun, publish: opts.publish });
}

async function cmdLinkedInAuth(): Promise<void> {
  const { secrets, passphrase } = await openStore();
  requireKeys(secrets, ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"], "linkedin auth");
  const tokens = await getLinkedInToken({
    clientId: secrets.LINKEDIN_CLIENT_ID,
    clientSecret: secrets.LINKEDIN_CLIENT_SECRET,
    port: config.xOauthPort,
  });
  await upsert(secrets, passphrase, tokens);
}

async function cmdLinkedInShare(slug: string, opts: { yes?: boolean }): Promise<void> {
  const { secrets } = await openStore();
  requireKeys(secrets, ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_PERSON_URN"], "linkedin share");
  Object.assign(process.env, secrets);
  await shareLinkedIn(slug, { confirm: opts.yes });
}

async function cmdLinkedInArticle(
  slug: string | undefined,
  opts: { login?: boolean },
): Promise<void> {
  if (opts.login) {
    await linkedinLogin();
    return;
  }
  if (!slug) throw new BroadcastError("linkedin article needs a <slug> (or --login)");
  await draftLinkedInArticle(slug);
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("broadcast")
    .description("Turn a blog post into platform-native content, from one CLI")
    .version(version());

  program
    .command("version")
    .description("print the version")
    .action(() => {
      console.log(`broadcast v${version()}`);
    });

  program
    .command("init")
    .description("create the encrypted store")
    .option("--force", "overwrite an existing store")
    .action(cmdInit);

  program
    .command("import [file]")
    .description("pull X_*/LINKEDIN_* from ~/.envrc.local (or FILE)")
    .action(cmdImport);

  program
    .command("set <key> [value]")
    .description("upsert one secret (prompts if VALUE is omitted)")
    .action(cmdSet);

  program.command("unset <key>").description("remove one secret").action(cmdUnset);
  program.command("list").description("keys with masked values").action(cmdList);
  program.command("edit").description("$EDITOR on the decrypted store").action(cmdEdit);

  const x = program.command("x").description("X: auth | publish");
  x.command("auth").description("OAuth token for X, upserted").action(cmdXAuth);
  x.command("publish <slug>")
    .description("create an X Article draft")
    .option("--dry-run", "build the draft but make no API calls")
    .option("--publish", "make the article public (after review)")
    .action(cmdXPublish);

  const linkedin = program.command("linkedin").description("LinkedIn: auth | share | article");
  linkedin.command("auth").description("token + person URN, upserted").action(cmdLinkedInAuth);
  linkedin
    .command("share <slug>")
    .description("feed share (preview, then --yes to post live)")
    .option("--yes", "post live to the feed")
    .action(cmdLinkedInShare);
  linkedin
    .command("article [slug]")
    .description("draft a long-form article by driving the editor")
    .option("--login", "sign in once and save the browser session")
    .action(cmdLinkedInArticle);

  program
    .command("generate <slug>")
    .description("paste-ready artifacts (no secrets)")
    .action((slug: string) => generateReposts(slug));

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  try {
    await buildProgram().parseAsync(argv);
  } catch (err) {
    if (err instanceof BroadcastError) {
      console.error(`broadcast: ${err.message}`);
      process.exitCode = 1;
    } else {
      throw err;
    }
  }
}
