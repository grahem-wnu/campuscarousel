import type { ReactNode } from "react";
import { Spinner } from "../ui/Spinner";
import { useAuth } from "./AuthContext";
import { JoinFamilyPage } from "./JoinFamilyPage";
import { JoinPage } from "./JoinPage";
import { LandingPage } from "./LandingPage";
import { LoginPage } from "./LoginPage";
import { SignupPage } from "./SignupPage";

/**
 * Gates the app on auth state: a brief loading spinner while the session resolves,
 * the public pages when signed out, and the app (children) when signed in. Visibility
 * of data is still enforced server-side off the JWT — this gate is UX, not security.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  // PUBLIC pages: /join-family (accept a family invite), /join (front-door redemption), and /signup
  // (open signup) must work WITHOUT auth — the arriving person has no account yet. NOTE the order:
  // /join-family MUST be checked before /join, since startsWith("/join") also matches "/join-family".
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/join-family")) {
    return <JoinFamilyPage />;
  }
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

  if (status === "unauthenticated") {
    // Signed-out visitors to the root get the storefront, not a bare login form. Deep links
    // (someone's bookmarked /dashboard) still go straight to sign-in and keep their path.
    if (typeof window !== "undefined" && window.location.pathname === "/") {
      return <LandingPage />;
    }
    return <LoginPage />;
  }

  return <>{children}</>;
}
