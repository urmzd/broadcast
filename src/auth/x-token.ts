/**
 * OAuth 2.0 PKCE flow: obtain an X user access token with the scopes the
 * publisher needs (media upload included). Resolves with the tokens; the CLI
 * upserts them into the encrypted store.
 *
 * Prereqs (console.x.com → app → User authentication settings):
 *   - Native App (public client) or Web App (confidential; pass clientSecret)
 *   - Callback URI registered: http://localhost:<port>/callback
 */

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { BroadcastError } from "../errors.js";
import type { Secrets } from "../interfaces.js";

const SCOPES = "tweet.read tweet.write users.read media.write offline.access";

export interface XTokenOptions {
  clientId: string;
  clientSecret?: string;
  port: number;
}

export function getXToken(opts: XTokenOptions): Promise<Secrets> {
  const { clientId, clientSecret, port } = opts;
  const redirectUri = `http://localhost:${port}/callback`;
  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const authUrl = `https://x.com/i/oauth2/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString()}`;

  return new Promise<Secrets>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      if (!code || url.searchParams.get("state") !== state) {
        res.writeHead(400).end("Missing code or state mismatch — check the terminal.");
        server.close();
        reject(
          new BroadcastError(
            `X callback error: ${url.searchParams.get("error_description") ?? "state mismatch"}`,
          ),
        );
        return;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      };
      if (clientSecret) {
        headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
      }
      const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers,
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        }),
      });
      const token = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        scope?: string;
        expires_in?: number;
      };
      if (!tokenRes.ok || !token.access_token) {
        res.writeHead(500).end("Token exchange failed — check the terminal.");
        server.close();
        reject(new BroadcastError(`X token exchange failed: ${JSON.stringify(token)}`));
        return;
      }

      res
        .writeHead(200, { "Content-Type": "text/html" })
        .end("<h3>Done — you can close this tab.</h3>");
      console.log(
        `(scopes: ${token.scope ?? SCOPES}; expires in ${Math.round((token.expires_in ?? 7200) / 3600)}h — refresh with X_REFRESH_TOKEN)`,
      );
      server.close();
      resolve({
        X_ACCESS_TOKEN: token.access_token,
        X_REFRESH_TOKEN: token.refresh_token ?? "",
      });
    });

    server.on("error", reject);
    server.listen(port, () => {
      console.log("Open this URL in your browser and approve access:\n");
      console.log(authUrl);
      console.log(`\nWaiting for the callback on ${redirectUri} ...`);
    });
  });
}
