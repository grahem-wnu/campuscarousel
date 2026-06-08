import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy strings and drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("applies conditional class maps", () => {
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });

  it("returns an empty string for no truthy input", () => {
    expect(cn(false, null, undefined)).toBe("");
  });
});
