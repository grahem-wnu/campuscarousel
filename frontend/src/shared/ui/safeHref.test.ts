import { describe, it, expect } from "vitest";
import { safeHref } from "./safeHref";

describe("safeHref", () => {
  it("passes through http(s) URLs", () => {
    expect(safeHref("https://example.edu/nursing")).toBe("https://example.edu/nursing");
    expect(safeHref("http://example.edu")).toBe("http://example.edu");
  });

  it("blocks javascript: and data: URIs", () => {
    expect(safeHref("javascript:alert(document.cookie)")).toBeUndefined();
    expect(safeHref("JavaScript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeUndefined();
  });

  it("returns undefined for empty/nullish input", () => {
    expect(safeHref(undefined)).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref("")).toBeUndefined();
    expect(safeHref("   ")).toBeUndefined();
  });
});
