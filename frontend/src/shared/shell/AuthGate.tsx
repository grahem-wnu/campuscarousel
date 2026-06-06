import type { ReactNode } from "react";
import { Spinner } from "../ui/Spinner";
import { useAuth } from "./AuthContext";
import { LoginPage } from "./LoginPage";

/**
 * Gates the app on auth state: a brief loading spinner while the session resolves,
 * the login page when signed out, and the app (children) when signed in. Visibility
 * of data is still enforced server-side off the JWT — this gate is UX, not security.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-full items-center justify-center bg-surface-base text-primary-600">
        <Spinner size={28} />
      </div>
    );
  }

  if (status === "unauthenticated") return <LoginPage />;

  return <>{children}</>;
}
