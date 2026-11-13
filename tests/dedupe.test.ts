import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newCaseRecord, openDatabase, type Database } from "@/lib/db";
import {
  canonicalKeyFor,
  canonicalProjectUrl,
  canonicalRepoKey,
  findPrimary,
  linkDuplicate
} from "@/lib/dedupe";

describe("canonicalRepoKey", () => {
  it.each([
    ["https://github.com/Acme/Widget", "github.com/acme/widget"],
    ["https://github.com/Acme/Widget.git", "github.com/acme/widget"],
    ["https://www.github.com/Acme/Widget/", "github.com/acme/widget"],
    ["https://github.com/Acme/Widget/tree/main/src", "github.com/acme/widget"],
    ["https://github.com/Acme/Widget/blob/main/README.md#usage", "github.com/acme/widget"],
    ["https://github.com/Acme/Widget/issues/12", "github.com/acme/widget"],
    ["https://github.com/Acme/Widget?utm_source=hn&tab=readme", "github.com/acme/widget"],
    ["git@github.com:Acme/Widget.git", "github.com/acme/widget"],
    ["https://gitlab.com/Group/Project/-/tree/main", "gitlab.com/group/project"],
    ["https://gitee.com/Foo/Bar", "gitee.com/foo/bar"],
    ["https://codeberg.org/Foo/Bar.git", "codeberg.org/foo/bar"],
    ["https://bitbucket.org/foo/bar/src/main/", "bitbucket.org/foo/bar"]
  ])("%s → %s", (input, key) => {
    expect(canonicalRepoKey(input)).toBe(key);
  });

  it.each([
    "https://github.com/Acme",
    "https://github.com/features/copilot",
    "https://example.com/acme/widget",
    "not a url",
    "ftp://github.com/a/b"
  ])("%s is not a repository", (input) => {
    expect(canonicalRepoKey(input)).toBeNull();
  });
});

describe("canonicalProjectUrl", () => {
  it.each([
    ["https://Example.com/app/?utm_source=hn", "https://example.com/app"],
    ["https://example.com:443/app", "https://example.com/app"],
    ["http://example.com:80/app/", "http://example.com/app"],
    ["https://example.com:8443/app", "https://example.com:8443/app"],
    ["https://example.com/", "https://example.com"],
    ["https://example.com/app?ref=producthunt&fbclid=x&si=y&utm_medium=z", "https://example.com/app"],
    ["https://example.com/app?b=2&a=1&utm_campaign=c", "https://example.com/app?a=1&b=2"],
    ["https://example.com/App#pricing", "https://example.com/App"]
  ])("%s → %s", (input, out) => {
    expect(canonicalProjectUrl(input)).toBe(out);
  });

  it("rejects non-http URLs", () => {
    expect(canonicalProjectUrl("mailto:a@b.c")).toBeNull();
    expect(canonicalProjectUrl("nope")).toBeNull();
  });
});

describe("canonicalKeyFor", () => {
  it("uses the repo key for repositories and a scheme-less URL otherwise", () => {
    expect(canonicalKeyFor(null)).toBeNull();
    expect(canonicalKeyFor("https://github.com/Acme/Widget/tree/x")).toBe("github.com/acme/widget");
    expect(canonicalKeyFor("https://www.Example.com/app/?utm_source=hn")).toBe("example.com/app");
    expect(canonicalKeyFor("http://example.com/app")).toBe(canonicalKeyFor("https://example.com/app/"));
  });
});

describe("duplicate linking", () => {
  let db: Database | undefined;
  let dir: string | undefined;

  afterEach(() => {
    db?.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    db = undefined;
    dir = undefined;
  });

  function freshDb(): Database {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "harvester-dedupe-"));
    db = openDatabase(path.join(dir, "test.db"), { nodeEnv: "test" });
    return db;
  }

  const base = {
    title: "Widget",
    author: "ada",
    excerpt: "",
    sourceCreatedAt: "2026-11-12T00:00:00.000Z",
    projectUrl: "https://github.com/acme/widget",
    canonicalKey: "github.com/acme/widget"
  };

  it("keeps the first record as primary and attaches later sources", () => {
    const store = freshDb();
    const primary = newCaseRecord({
      ...base,
      id: "p",
      source: "hn",
      sourceId: "1",
      sourceUrl: "https://news.ycombinator.com/item?id=1",
      status: "needs_review"
    });
    store.upsertCase(primary);

    const incoming = newCaseRecord({
      ...base,
      id: "d",
      source: "reddit",
      sourceId: "abc",
      sourceUrl: "https://www.reddit.com/r/LocalLLaMA/comments/abc/x/"
    });
    const found = findPrimary(store, canonicalKeyFor("https://github.com/Acme/Widget.git"));
    expect(found?.id).toBe("p");

    const dup = linkDuplicate(store, found!, incoming);
    store.upsertCase(dup);

    expect(store.getCase("d")).toMatchObject({ status: "duplicate", duplicateOfId: "p" });
    expect(store.getCase("p")?.relatedSources).toEqual(["https://www.reddit.com/r/LocalLLaMA/comments/abc/x/"]);
    expect(store.getCase("p")?.status).toBe("needs_review");
    expect(store.listCases({ status: "needs_review" })).toHaveLength(1);

    // Linking the same source again does not add it twice.
    linkDuplicate(store, store.getCase("p")!, incoming);
    expect(store.getCase("p")?.relatedSources).toHaveLength(1);
  });

  it("does not treat a record as a duplicate of itself", () => {
    const store = freshDb();
    store.upsertCase(
      newCaseRecord({ ...base, id: "p", source: "hn", sourceId: "1", sourceUrl: "https://news.ycombinator.com/item?id=1" })
    );
    expect(findPrimary(store, base.canonicalKey, "p")).toBeUndefined();
    expect(findPrimary(store, null)).toBeUndefined();
  });
});
