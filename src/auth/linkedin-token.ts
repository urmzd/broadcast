/**
 * OAuth 2.0 (3-legged) flow: obtain a LinkedIn member access token and resolve
 * the member URN. Resolves with the tokens; the CLI upserts them.
 *
 * Prereqs (developer app, linkedin.com/developers/apps):
 *   - Products "Share on LinkedIn" and "Sign In with LinkedIn using OpenID
 *     Connect" (the latter provides the openid/profile scopes used to resolve
 *     the person URN).
 *   - Auth → Authorized redirect URLs must include http://localhost:<port>/callback
 */

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { BroadcastError } from "../errors.js";
import type { Secrets } from "../interfaces.js";

const SCOPES = "openid profile w_member_social";

export interface LinkedInTokenOptions {
  clientId: string;
  clientSecret: string;
  port: number;
}

export function getLinkedInToken(opts: LinkedInTokenOptions): Promise<Secrets> {
  const { clientId, clientSecret, port } = opts;
  const redirectUri = `http://localhost:${port}/callback`;
  const state = randomBytes(16).toString("hex");
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
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
            `LinkedIn callback error: ${url.searchParams.get("error_description") ?? "state mismatch"}`,
          ),
        );
        return;
      }

      const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        }),
      });
      const token = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
      if (!tokenRes.ok || !token.access_token) {
        res.writeHead(500).end("Token exchange failed — check the terminal.");
        server.close();
        reject(new BroadcastError(`LinkedIn token exchange failed: ${JSON.stringify(token)}`));
        return;
      }

      // Resolve the member URN for the posts `author` field.
      const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      const me = (await meRes.json()) as { sub?: string };
      const personUrn = me.sub
        ? `urn:li:person:${me.sub}`
        : "(userinfo failed — set LINKEDIN_PERSON_URN manually)";

      res
        .writeHead(200, { "Content-Type": "text/html" })
        .end("<h3>Done — you can close this tab.</h3>");
      console.log(`(token expires in ${Math.round((token.expires_in ?? 0) / 86400)} days)`);
      server.close();
      resolve({
        LINKEDIN_ACCESS_TOKEN: token.access_token,
        LINKEDIN_PERSON_URN: personUrn,
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
