import { describe, expect, it } from "vitest";
import { AccessDeniedError, HttpClient, parseRetryAfter, RateLimitError, USER_AGENT } from "@/lib/http";
import { fakeHttp, headerOf, json } from "./helpers/fake-http";

describe("parseRetryAfter", () => {
  it("parses a delay-seconds value", () => {
    expect(parseRetryAfter("30")).toBe(30);
    expect(parseRetryAfter(" 0 ")).toBe(0);
  });

  it("parses an HTTP date relative to now", () => {
    const now = Date.parse("2026-11-13T00:00:00Z");
    expect(parseRetryAfter("Fri, 13 Nov 2026 00:02:00 GMT", now)).toBe(120);
    expect(parseRetryAfter("Thu, 12 Nov 2026 00:00:00 GMT", now)).toBe(0);
  });

  it("returns undefined for a missing or malformed header", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});

describe("HttpClient 429 stop rule", () => {
  it("stops the API after a 429, records Retry-After, and never retries it in the run", async () => {
    const { http, calls } = fakeHttp(() => json({}, 429, { "retry-after": "45" }));

    const first = await http.getJson("hn", "https://hn.test/a").catch((e: unknown) => e);
    expect(first).toBeInstanceOf(RateLimitError);
    expect((first as RateLimitError).retryAfterSeconds).toBe(45);
    expect(http.isStopped("hn")).toBe(true);
    expect(http.stopInfo("hn")?.retryAfterSeconds).toBe(45);

    await expect(http.getJson("hn", "https://hn.test/b")).rejects.toBeInstanceOf(RateLimitError);
    await expect(http.getJson("hn", "https://hn.test/c")).rejects.toBeInstanceOf(RateLimitError);
    expect(calls).toHaveLength(1);
  });

  it("keeps other APIs usable after one API is stopped", async () => {
    const { http, calls } = fakeHttp((url) => (url.host === "hn.test" ? json({}, 429) : json({ ok: true })));
    await http.getJson("hn", "https://hn.test/").catch(() => undefined);
    await expect(http.getJson("github", "https://gh.test/")).resolves.toMatchObject({ body: { ok: true } });
    expect(calls).toHaveLength(2);
  });

  it("applies to POSTs too (ingest)", async () => {
    const { http, calls } = fakeHttp(() => json({}, 429));
    await http.request("usecasecn", "https://in.test/submissions", { method: "POST", body: "{}", acceptStatuses: [429] }).catch(() => undefined);
    await http.request("usecasecn", "https://in.test/submissions", { method: "POST", body: "{}" }).catch(() => undefined);
    expect(calls).toHaveLength(1);
  });

  it("uses GitHub x-ratelimit-reset when Retry-After is absent", async () => {
    const { http } = fakeHttp(() => json({}, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(1_800_000_000 + 300) }));
    const err = (await http.getJson("github", "https://api.github.com/search/repositories").catch((e: unknown) => e)) as RateLimitError;
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfterSeconds).toBe(300);
  });
});

describe("HttpClient manners", () => {
  it("spaces requests to the same API by the configured delay", async () => {
    const { http, sleeps } = fakeHttp(() => json({}));
    await http.getJson("reddit", "https://r.test/1");
    await http.getJson("reddit", "https://r.test/2");
    await http.getJson("reddit", "https://r.test/3");
    expect(sleeps).toEqual([http.delayFor("reddit"), http.delayFor("reddit")]);
  });

  it("serializes concurrent callers so the delay still holds", async () => {
    const { http, sleeps, calls } = fakeHttp(() => json({}));
    await Promise.all([1, 2, 3].map((i) => http.getJson("hn", `https://hn.test/${i}`)));
    expect(calls).toHaveLength(3);
    expect(sleeps).toHaveLength(2);
  });

  it("always sends the fixed User-Agent, even if a caller tries to override it", async () => {
    const { http, calls } = fakeHttp(() => json({}));
    await http.getJson("hn", "https://hn.test/", { headers: { "User-Agent": "Mozilla/5.0 spoof" } });
    expect(headerOf(calls[0], "User-Agent")).toBe(USER_AGENT);
  });

  it("skips 401/403 and login walls without authenticating", async () => {
    const { http, calls } = fakeHttp((url) =>
      url.pathname === "/wall"
        ? new Response("<html>Log in</html>", { status: 200, headers: { "content-type": "text/html" } })
        : json({}, 401)
    );
    await expect(http.getJson("reddit", "https://r.test/auth")).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(http.getJson("reddit", "https://r.test/wall")).rejects.toBeInstanceOf(AccessDeniedError);
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => headerOf(c, "Authorization") === undefined)).toBe(true);
    expect(http.isStopped("reddit")).toBe(false);
  });

  it("does not use the global fetch when a fake is injected", () => {
    expect(() => new HttpClient({ fetchImpl: (async () => json({})) as typeof fetch })).not.toThrow();
  });
});
