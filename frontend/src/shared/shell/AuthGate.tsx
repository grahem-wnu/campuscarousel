import type { ReactNode } from "react";
import { Spinner } from "../ui/Spinner";
import { useAuth } from "./AuthContext";
import { JoinPage } from "./JoinPage";
import { LoginPage } from "./LoginPage";
import { SignupPage } from "./SignupPage";

/**
 * Gates the app on auth state: a brief loading spinner while the session resolves,
 * the login page when signed out, and the app (children) when signed in. Visibility
 * of data is still enforced server-side off the JWT — this gate is UX, not security.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  // PUBLIC pages: /join (invite redemption) and /signup (open signup) must work WITHOUT auth —
  // the arriving family has no account yet.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/join")) {
    return <JoinPage />;
  }
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/signup")) {
    return <SignupPage />;
  }

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
