/**
 * Symmetric encryption via gpg. The passphrase is handed to gpg over a
 * dedicated pipe fd (fd 3), never on argv (where `ps` would show it) and never
 * written to disk. Ciphertext/plaintext travel over stdin/stdout.
 */

import { spawn } from "node:child_process";
import { BroadcastError } from "../errors.js";

function gpg(args: string[], input: Buffer, passphrase: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "gpg",
      [
        "--batch",
        "--yes",
        "--quiet",
        "--pinentry-mode",
        "loopback",
        "--passphrase-fd",
        "3",
        ...args,
      ],
      { stdio: ["pipe", "pipe", "pipe", "pipe"] },
    );
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));
    child.on("error", (e) =>
      reject(
        new BroadcastError(e.message.includes("ENOENT") ? "gpg not found on PATH" : e.message),
      ),
    );
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new BroadcastError(`gpg failed: ${Buffer.concat(err).toString().trim()}`));
    });

    // fd 3 is the passphrase pipe; write it and close before feeding stdin.
    const passphraseStream = child.stdio[3] as NodeJS.WritableStream;
    passphraseStream.write(`${passphrase}\n`);
    passphraseStream.end();
    child.stdin.write(input);
    child.stdin.end();
  });
}

export function encrypt(plain: Buffer, passphrase: string): Promise<Buffer> {
  return gpg(["--symmetric", "--cipher-algo", "AES256", "--armor"], plain, passphrase);
}

export function decrypt(cipher: Buffer, passphrase: string): Promise<Buffer> {
  return gpg(["--decrypt"], cipher, passphrase);
}
