import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GpgSecretStore } from "./secret-store.js";

let hasGpg = true;
try {
  execSync("command -v gpg", { stdio: "ignore" });
} catch {
  hasGpg = false;
}

const store = () =>
  new GpgSecretStore(join(mkdtempSync(join(tmpdir(), "broadcast-")), "secrets.gpg"));

describe.skipIf(!hasGpg)("GpgSecretStore", () => {
  it("round-trips and writes ciphertext with 600 perms", async () => {
    const s = store();
    expect(s.exists()).toBe(false);
    await s.save({ X_CLIENT_ID: "cid", X_ACCESS_TOKEN: "tok-new-wins" }, "pw");
    expect(s.exists()).toBe(true);
    const { statSync, readFileSync } = await import("node:fs");
    expect((statSync(s.path).mode & 0o777).toString(8)).toBe("600");
    expect(readFileSync(s.path).toString().startsWith("-----BEGIN PGP MESSAGE-----")).toBe(true);
    await expect(s.load("pw")).resolves.toEqual({
      X_CLIENT_ID: "cid",
      X_ACCESS_TOKEN: "tok-new-wins",
    });
  });

  it("rejects a wrong passphrase", async () => {
    const s = store();
    await s.save({ K: "v" }, "right");
    await expect(s.load("wrong")).rejects.toThrow();
  });

  it("throws when loading a missing store", async () => {
    await expect(store().load("pw")).rejects.toThrow();
  });
});
