import { describe, it, expect } from "vitest";
import { assembleNav, canSee } from "./nav";
import type { NavEntry } from "./types";

const stubEl = () => Promise.resolve({ default: () => null });

function entry(over: Partial<NavEntry> & Pick<NavEntry, "id" | "route">): NavEntry {
  return {
    label: over.id,
    group: "primary",
    order: 10,
    icon: "home",
    element: stubEl,
    ...over,
  } as NavEntry;
}

describe("assembleNav", () => {
  it("splits primary/secondary and sorts by order then label", () => {
    const out = assembleNav([
      entry({ id: "b", route: "/b", order: 20, label: "B" }),
      entry({ id: "a", route: "/a", order: 10, label: "A" }),
      entry({ id: "s2", route: "/s2", group: "secondary", order: 5, label: "Zeta" }),
      entry({ id: "s1", route: "/s1", group: "secondary", order: 5, label: "Alpha" }),
    ]);
    expect(out.primary.map((e) => e.id)).toEqual(["a", "b"]);
    // same order → tie-broken by label
    expect(out.secondary.map((e) => e.id)).toEqual(["s1", "s2"]);
  });

  it("filters by role but lets role-less entries through", () => {
    const out = assembleNav(
      [
        entry({ id: "all", route: "/all" }),
        entry({ id: "studentOnly", route: "/s", roles: ["student"] }),
        entry({ id: "adminOnly", route: "/a", roles: ["admin"] }),
      ],
      "student",
    );
    expect(out.primary.map((e) => e.id).sort()).toEqual(["all", "studentOnly"]);
  });

  it("keeps hidden entries out of menus but in routes", () => {
    const out = assembleNav([
      entry({ id: "list", route: "/colleges" }),
      entry({ id: "detail", route: "/colleges/:id", hidden: true }),
    ]);
    expect(out.primary.map((e) => e.id)).toEqual(["list"]);
    expect(out.routes.map((e) => e.id).sort()).toEqual(["detail", "list"]);
  });

  it("throws on duplicate id or route", () => {
    expect(() =>
      assembleNav([entry({ id: "x", route: "/x" }), entry({ id: "x", route: "/y" })]),
    ).toThrow(/Duplicate nav id/);
    expect(() =>
      assembleNav([entry({ id: "a", route: "/x" }), entry({ id: "b", route: "/x" })]),
    ).toThrow(/Duplicate nav route/);
  });
});

describe("canSee", () => {
  it("respects role membership", () => {
    expect(canSee(entry({ id: "a", route: "/a" }), "parent")).toBe(true);
    expect(canSee(entry({ id: "a", route: "/a", roles: ["student"] }), "parent")).toBe(false);
    expect(canSee(entry({ id: "a", route: "/a", roles: ["student"] }), "student")).toBe(true);
    expect(canSee(entry({ id: "a", route: "/a", roles: ["student"] }))).toBe(false);
  });
});
