// /signup is retired: Campus Carousel is invite-only (2026-08-10, bot/bill protection — the backend's
// PUBLIC_SIGNUP_ENABLED kill switch is off and POST /auth/signup 403s). The route is kept so old links
// and bookmarks land on a clear explanation instead of a dead form. Families join via an admin-issued
// invite link (/join) or a family invite (/join-family).

import { Card } from "../ui";

export function SignupPage() {
  return (
    <div className="flex min-h-full items-center justify-center bg-surface-base p-4">
      <Card className="w-full max-w-md space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ink-900">Campus Carousel</h1>
          <p className="text-sm text-ink-600">Campus Carousel is invite-only for now.</p>
        </div>
        <p className="text-sm leading-relaxed text-ink-600">
          New families join through an invite link — if someone shared one with you, open it and it will
          bring you straight in. Already have an account?{" "}
          <a href="/login" className="font-medium text-primary-700 hover:underline">
            Sign in
          </a>
          .
        </p>
      </Card>
    </div>
  );
}
