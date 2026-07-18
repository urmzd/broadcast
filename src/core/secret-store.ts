/**
 * The encrypted secret store: load, mutate, and atomically re-encrypt. The
 * plaintext is only ever held in memory here; the on-disk form is gpg
 * symmetric (AES-256).
 */

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "../config.js";
import { BroadcastError } from "../errors.js";
import type { SecretStore, Secrets } from "../interfaces.js";
import { decrypt, encrypt } from "./crypto.js";
import { parseEnv, serializeEnv } from "./env.js";

export class GpgSecretStore implements SecretStore {
  readonly path: string;

  constructor(path: string = config.store) {
    this.path = path;
  }

  exists(): boolean {
    return existsSync(this.path);
  }

  async load(passphrase: string): Promise<Secrets> {
    if (!this.exists()) {
      throw new BroadcastError(`no store at ${this.path} — run \`broadcast init\` first`);
    }
    const plain = await decrypt(readFileSync(this.path), passphrase);
    return parseEnv(plain.toString("utf-8"));
  }

  async save(secrets: Secrets, passphrase: string): Promise<void> {
    const cipher = await encrypt(Buffer.from(serializeEnv(secrets), "utf-8"), passphrase);
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = join(dirname(this.path), `.secrets.${randomBytes(6).toString("hex")}.tmp`);
    writeFileSync(tmp, cipher, { mode: 0o600 });
    renameSync(tmp, this.path); // atomic replace
    chmodSync(this.path, 0o600);
  }
}
