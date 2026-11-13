/**
 * Canonical repository and URL keys used for deduplication.
 * See Requirement 5.
 */
export function canonicalRepoKey(url: string): string | null {
  void url;
  // TODO: host/owner/repo, lowercase, strip .git and /tree|/blob|/issues
  return null;
}

export function canonicalProjectUrl(url: string): string | null {
  void url;
  // TODO: lowercase host, drop default ports, trailing slash, utm_*/ref/fbclid/si
  return null;
}

export function canonicalKeyFor(projectUrl: string | null): string | null {
  if (!projectUrl) return null;
  return canonicalRepoKey(projectUrl) ?? canonicalProjectUrl(projectUrl);
}
