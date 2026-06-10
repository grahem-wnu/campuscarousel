import type { ComponentType } from "react";

/**
 * App-wide slot registry. The shell renders a couple of cross-cutting surfaces that a
 * module owns the *contents* of — without that module having to edit the shell:
 *
 *  - `ai-panel`   → the AI Assistant slide-over body (opened by the floating chat button)
 *  - `quick-add`  → the global Quick-Add form body (opened by the FAB)
 *
 * A module registers its component from its `nav.manifest.ts` (which the shell imports
 * eagerly when globbing nav), e.g.:
 *
 *   import { registerSlot } from "../../shared/shell/slots";
 *   registerSlot("ai-panel", () => import("./AiPanel"));
 *
 * If no module has registered a slot, the shell shows a friendly placeholder. This is
 * the only sanctioned way to inject into the shell; modules never edit shell files.
 */
export type SlotName = "ai-panel" | "quick-add" | "onboarding";

type SlotLoader = () => Promise<{ default: ComponentType }>;

const registry = new Map<SlotName, SlotLoader>();

/** Register (or replace) the component that fills a shell slot. */
export function registerSlot(name: SlotName, loader: SlotLoader): void {
  registry.set(name, loader);
}

/** Get the loader for a slot, or undefined if nothing is registered. */
export function getSlot(name: SlotName): SlotLoader | undefined {
  return registry.get(name);
}
