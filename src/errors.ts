/**
 * Expected, user-facing failures (bad passphrase, missing key, ...). The CLI
 * and MCP server catch these and turn them into an exit code or tool error;
 * library code throws them instead of calling process.exit.
 */
export class BroadcastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BroadcastError";
  }
}
