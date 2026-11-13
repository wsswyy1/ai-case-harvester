import type { RawCandidate } from "./types";

export interface EligibleCandidate extends RawCandidate {
  projectUrl: string;
}

/**
 * Extract a concrete project URL and drop generic vendor homepages,
 * items with no link, and cheap non-case patterns (job posts, etc.).
 */
export function selectEligible(raw: RawCandidate): EligibleCandidate | null {
  void raw;
  // TODO: implement Requirement 2.
  return null;
}
