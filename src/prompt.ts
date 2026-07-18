/**
 * Terminal passphrase entry. Reads from BROADCAST_PASSPHRASE when set,
 * otherwise prompts with the input hidden. Never echoes the passphrase.
 */

import { config } from "./config.js";
import { BroadcastError } from "./errors.js";

// Control byte codes, avoiding literal control characters in source.
const LF = 10;
const CR = 13;
const ETX = 3; // Ctrl-C
const EOT = 4; // Ctrl-D
const BS = 8;
const DEL = 127;

function promptHidden(promptText: string): Promise<string> {
  return new Promise<string>((resolve) => {
    process.stdout.write(promptText);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    let input = "";
    const onData = (chunk: Buffer) => {
      const byte = chunk[0];
      if (byte === LF || byte === CR || byte === EOT) {
        stdin.setRawMode?.(wasRaw ?? false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (byte === ETX) {
        process.stdout.write("\n");
        process.exit(130);
      } else if (byte === BS || byte === DEL) {
        input = input.slice(0, -1);
      } else {
        input += chunk.toString("utf8");
      }
    };
    stdin.on("data", onData);
  });
}

/** Resolve the store passphrase: env var, else an interactive hidden prompt. */
export async function resolvePassphrase(confirm = false): Promise<string> {
  if (config.passphrase) return config.passphrase;
  if (!process.stdin.isTTY) {
    throw new BroadcastError("no passphrase: set BROADCAST_PASSPHRASE or run in a terminal");
  }
  const pw = await promptHidden("Passphrase: ");
  if (confirm && pw !== (await promptHidden("Confirm passphrase: "))) {
    throw new BroadcastError("passphrases did not match");
  }
  if (!pw) throw new BroadcastError("empty passphrase");
  return pw;
}

/** Prompt for a secret value with the input hidden. */
export async function promptSecret(label: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new BroadcastError(`cannot prompt for ${label}: not a terminal`);
  }
  return promptHidden(label);
}

/** Prompt for a non-secret value, visible. */
export function promptVisible(promptText: string): Promise<string> {
  return new Promise<string>((resolve) => {
    process.stdout.write(promptText);
    const onData = (chunk: Buffer) => {
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      resolve(chunk.toString("utf8").replace(/\r?\n$/, ""));
    };
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}
