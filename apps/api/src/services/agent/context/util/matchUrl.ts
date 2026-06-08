// Returns true when a page's url_pattern glob matches the given URL.
// Falls back to substring match if no pattern is set.
export function matchUrl(pageUrlPattern: string | null, url: string): boolean {
  if (!pageUrlPattern) return false;
  // Simple glob: * matches any segment
  const regex = new RegExp(
    "^" +
      pageUrlPattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*") +
      "$",
  );
  try {
    return regex.test(new URL(url).pathname) || regex.test(url);
  } catch {
    return url.includes(pageUrlPattern);
  }
}
