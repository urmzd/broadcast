/**
 * Publish the LinkedIn feed post announcing a blog article, via the Posts API
 * (POST /rest/posts) with an article link card.
 *
 * IMPORTANT: unlike the X Articles API, LinkedIn's Posts API has NO draft
 * state on creation ("PUBLISHED is the only accepted field during creation"),
 * so `confirm` posts LIVE to the feed immediately. The default run is a
 * preview that makes no write calls.
 *
 * Env (injected by the CLI from the store):
 *   LINKEDIN_ACCESS_TOKEN   member token with w_member_social
 *   LINKEDIN_PERSON_URN     urn:li:person:...
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config, ogPathFor, repostDirFor } from "../config.js";
import { BroadcastError } from "../errors.js";
import { loadPost } from "../pipeline/post.js";

const API = "https://api.linkedin.com";

// "little" text format: these characters are reserved and must be escaped.
// # and @ are left alone so hashtags stay live (the text contains no mentions).
function escapeLittle(text: string): string {
  return text.replace(/[\\|{}<>[\]()*_~]/g, (c) => `\\${c}`);
}

export interface LinkedInShareOptions {
  confirm?: boolean;
}

export async function shareLinkedIn(slug: string, opts: LinkedInShareOptions = {}): Promise<void> {
  const { confirm = false } = opts;

  const { frontmatter, blogUrl } = loadPost(slug);
  const feedPostPath = join(repostDirFor(slug), "linkedin-post.txt");
  if (!existsSync(feedPostPath)) {
    throw new BroadcastError(`Missing ${feedPostPath} — run \`broadcast generate ${slug}\` first.`);
  }
  const commentaryRaw = readFileSync(feedPostPath, "utf-8").trim();
  const commentary = escapeLittle(commentaryRaw);

  console.log("--- Post preview -------------------------------------------");
  console.log(commentaryRaw);
  console.log("--- Link card ----------------------------------------------");
  console.log(`title:       ${frontmatter.title}`);
  console.log(`description: ${frontmatter.description.slice(0, 120)}...`);
  console.log(`source:      ${blogUrl}`);
  console.log("------------------------------------------------------------");

  if (!confirm) {
    console.log("\nPreview only. LinkedIn has NO draft state for API-created posts;");
    console.log("rerun with --yes to publish LIVE to your feed.");
    return;
  }

  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const author = process.env.LINKEDIN_PERSON_URN;
  if (!token || !author) {
    throw new BroadcastError(
      "Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN (run `broadcast linkedin auth`).",
    );
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": config.linkedinVersion,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };

  // --- Thumbnail: upload the OG card via the Images API ---
  let thumbnail: string | undefined;
  const ogPath = ogPathFor(slug);
  if (existsSync(ogPath)) {
    const init = await fetch(`${API}/rest/images?action=initializeUpload`, {
      method: "POST",
      headers,
      body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
    });
    const initJson = (await init.json()) as { value: { uploadUrl: string; image: string } };
    if (!init.ok) throw new BroadcastError(`initializeUpload failed: ${JSON.stringify(initJson)}`);
    const { uploadUrl, image } = initJson.value;
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: readFileSync(ogPath),
    });
    if (!put.ok) throw new BroadcastError(`image PUT failed: ${put.status}`);
    thumbnail = image;
    console.log(`✓ uploaded thumbnail → ${image}`);
  } else {
    console.log("! No dist/og cover found; posting without a custom thumbnail");
  }

  // --- Create the post (LIVE) ---
  const body = {
    author,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    content: {
      article: {
        source: blogUrl,
        title: frontmatter.title,
        description: frontmatter.description,
        ...(thumbnail ? { thumbnail } : {}),
      },
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  const res = await fetch(`${API}/rest/posts`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new BroadcastError(`POST /rest/posts → ${res.status}: ${await res.text()}`);
  }
  const postUrn = res.headers.get("x-restli-id");
  console.log(`✓ PUBLISHED: ${postUrn}`);
  console.log(`  view: https://www.linkedin.com/feed/update/${postUrn}/`);
}
