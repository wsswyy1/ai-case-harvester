import type { SourceCollector, SourceName } from "@/lib/types";
import { hnCollector } from "./hn";
import { githubCollector } from "./github";
import { redditCollector } from "./reddit";

export const collectors: Record<SourceName, SourceCollector> = {
  hn: hnCollector,
  github: githubCollector,
  reddit: redditCollector
};

export function enabledCollectors(enabled: SourceName[] = ["hn", "github", "reddit"]): SourceCollector[] {
  return enabled.map((name) => collectors[name]);
}
