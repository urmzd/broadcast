/**
 * Dotenv-style parsing/serialization and the set of keys broadcast owns.
 * Pure helpers, no I/O: the encrypted store's plaintext form is a flat
 * KEY=value file, and the auth flows print `export KEY=value` lines parsed
 * the same way.
 */

import type { Secrets } from "../interfaces.js";

/** The only keys broadcast manages; `import` slurps just these from a foreign env file. */
export const BROADCAST_KEYS: ReadonlySet<string> = new Set([
  "X_API_KEY",
  "X_API_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_TOKEN_SECRET",
  "X_CLIENT_ID",
  "X_CLIENT_SECRET",
  "X_REFRESH_TOKEN",
  "X_OAUTH_PORT",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_ACCESS_TOKEN",
  "LINKEDIN_PERSON_URN",
  "LINKEDIN_VERSION",
]);

const EXPORT_RE = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/;

export function parseEnv(text: string): Secrets {
  const out: Secrets = {};
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const m = line.match(EXPORT_RE);
    if (!m) continue;
    let val = m[2].trim();
    if (val.length >= 2 && val[0] === val[val.length - 1] && (val[0] === '"' || val[0] === "'")) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

export function serializeEnv(secrets: Secrets): string {
  const header = "# broadcast secrets — encrypted at rest, decrypted only in memory.\n";
  const body = Object.keys(secrets)
    .sort()
    .map((k) => `${k}=${secrets[k]}\n`)
    .join("");
  return header + body;
}

/**
 * Extract the wanted token keys from an auth flow's output, rejecting empty
 * values and human placeholders like `(userinfo failed …)`.
 */
export function parseTokens(text: string, keys: ReadonlySet<string>): Secrets {
  const out: Secrets = {};
  for (const [k, v] of Object.entries(parseEnv(text))) {
    if (keys.has(k) && v && !v.includes(" ") && !v.includes("(")) out[k] = v;
  }
  return out;
}

export function mask(value: string): string {
  if (!value) return "(empty)";
  return value.length > 8 ? `${value.slice(0, 3)}…${value.slice(-2)}` : "•".repeat(value.length);
}
