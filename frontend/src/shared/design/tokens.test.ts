import { describe, it, expect } from "vitest";
import { colors, fontSize, tokens } from "./tokens";

const HEX = /^#[0-9a-f]{6}$/i;

describe("design tokens", () => {
  it("every color scale has the full 50→900 ramp as valid hex", () => {
    const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
    for (const name of ["primary", "secondary", "ink", "success", "warn", "error"] as const) {
      const scale = colors[name];
      for (const step of steps) {
        expect(scale[step], `${name}.${step}`).toMatch(HEX);
      }
    }
  });

  it("surface tokens are valid colors", () => {
    expect(colors.surface.raised).toMatch(HEX);
    expect(colors.surface.base).toMatch(HEX);
    expect(colors.surface.border).toMatch(HEX);
  });

  it("font sizes are [size, lineHeight] rem pairs", () => {
    for (const [, pair] of Object.entries(fontSize)) {
      expect(pair).toHaveLength(2);
      expect(pair[0]).toMatch(/rem$/);
      expect(pair[1]).toMatch(/rem$/);
    }
  });

  it("exposes a complete token bundle for tailwind", () => {
    expect(tokens.colors).toBe(colors);
    expect(tokens.spacing["nav-h"]).toBeDefined();
    expect(tokens.borderRadius.full).toBe("9999px");
  });
});
