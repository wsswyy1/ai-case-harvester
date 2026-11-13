import fs from "node:fs";
import path from "node:path";
import { HttpClient } from "@/lib/http";

export function loadFixture<T = unknown>(name: string): T {
  const file = path.resolve(__dirname, "..", "fixtures", name);
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export interface FakeCall {
  url: string;
  init: RequestInit;
}

export type FakeHandler = (url: URL, init: RequestInit) => Response | Promise<Response>;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

/** HttpClient with no real network and no real sleeping. */
export function fakeHttp(handler: FakeHandler): { http: HttpClient; calls: FakeCall[]; sleeps: number[] } {
  const calls: FakeCall[] = [];
  const sleeps: number[] = [];
  let clock = 1_800_000_000_000;
  const http = new HttpClient({
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    fetchImpl: (async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, init });
      return handler(new URL(url), init);
    }) as typeof fetch
  });
  return { http, calls, sleeps };
}

export function headerOf(call: FakeCall, name: string): string | undefined {
  const headers = call.init.headers as Record<string, string> | undefined;
  if (!headers) return undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}
