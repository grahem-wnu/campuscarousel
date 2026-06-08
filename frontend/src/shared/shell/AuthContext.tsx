import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  configureAmplify,
  getCurrentAuthUser,
  signOutUser,
  type AuthUser,
} from "./amplify";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Re-read the session (call after a successful sign-in). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Holds auth state for the app. Configures Amplify and resolves the session on mount. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = useCallback(async () => {
    const current = await getCurrentAuthUser();
    setUser(current);
    setStatus(current ? "authenticated" : "unauthenticated");
  }, []);

  const signOut = useCallback(async () => {
    await signOutUser();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    try {
      configureAmplify();
    } catch {
      // Misconfigured/empty env (e.g. local build without .env): fall through to
      // refresh, which resolves to "unauthenticated" and shows the login page.
    }
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({ status, user, refresh, signOut }),
    [status, user, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access auth state. Must be used under an <AuthProvider>. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
