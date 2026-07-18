import { describe, expect, it } from "vitest";
import { mask, parseEnv, parseTokens, serializeEnv } from "./env.js";

describe("parseEnv", () => {
  it("handles export, quotes, and comments", () => {
    const text = [
      "# a comment",
      'export X_ACCESS_TOKEN="abc123"',
      "LINKEDIN_PERSON_URN=urn:li:person:xyz",
      "OPENAI_API_KEY='sk-secret'",
    ].join("\n");
    expect(parseEnv(text)).toEqual({
      X_ACCESS_TOKEN: "abc123",
      LINKEDIN_PERSON_URN: "urn:li:person:xyz",
      OPENAI_API_KEY: "sk-secret",
    });
  });

  it("round-trips through serializeEnv", () => {
    const secrets = { X_CLIENT_ID: "cid", X_ACCESS_TOKEN: "tok" };
    expect(parseEnv(serializeEnv(secrets))).toEqual(secrets);
  });
});

describe("parseTokens", () => {
  it("keeps wanted keys and rejects placeholders", () => {
    const out = ["export X_ACCESS_TOKEN=fresh-access", "export X_REFRESH_TOKEN=fresh-refresh"].join(
      "\n",
    );
    expect(parseTokens(out, new Set(["X_ACCESS_TOKEN", "X_REFRESH_TOKEN"]))).toEqual({
      X_ACCESS_TOKEN: "fresh-access",
      X_REFRESH_TOKEN: "fresh-refresh",
    });
    const bad = "export LINKEDIN_PERSON_URN=(userinfo failed — set manually)";
    expect(parseTokens(bad, new Set(["LINKEDIN_PERSON_URN"]))).toEqual({});
  });
});

describe("mask", () => {
  it("masks by length", () => {
    expect(mask("")).toBe("(empty)");
    expect(mask("short")).toBe("•••••");
    expect(mask("abcdefghij")).toBe("abc…ij");
  });
});
