/**
 * App shell public surface. Modules import the nav/slot contracts from here; the
 * app root mounts <AppRoot>. Modules never import the internal chrome components.
 */
export type { NavEntry, NavGroup, Role, AssembledNav } from "./types";
export { registerSlot, getSlot, type SlotName } from "./slots";
export { useAuth, AuthProvider, type AuthStatus } from "./AuthContext";
export { AppRouter } from "./AppRouter";
export { AuthGate } from "./AuthGate";
