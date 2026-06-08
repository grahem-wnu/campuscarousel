import { Suspense, lazy, useMemo, type ComponentType } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Spinner } from "../ui/Spinner";
import { EmptyState } from "../ui/EmptyState";
import { useAuth } from "./AuthContext";
import { assembleNav, loadNavEntries } from "./nav";
import { AppShell } from "./AppShell";

/** Suspense fallback for a lazily-loaded page. */
function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-primary-500">
      <Spinner size={28} />
    </div>
  );
}

/** Shown at "/" before any module registers a primary route. */
function Welcome() {
  return (
    <EmptyState
      icon="school"
      title="Welcome to Keira's Journey"
      description="Your modules will appear here as they come online. This is the home of the path to a BSN."
    />
  );
}

function NotFound() {
  return (
    <EmptyState
      icon="info"
      title="Page not found"
      description="That page doesn't exist (yet). Use the navigation to find your way."
    />
  );
}

/**
 * Builds the router from the globbed module manifests, role-filtered for the current
 * user, and renders everything inside the app shell. The home route redirects to the
 * first primary tab once modules exist; otherwise it shows a welcome state.
 */
export function AppRouter() {
  const { user } = useAuth();

  const { nav, routes } = useMemo(() => {
    const assembled = assembleNav(loadNavEntries(), user?.role);
    const built = assembled.routes.map((entry) => ({
      path: entry.route,
      Component: lazy(entry.element) as ComponentType,
    }));
    return { nav: assembled, routes: built };
  }, [user?.role]);

  const homeTarget = nav.primary[0]?.route;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell nav={nav} />}>
          <Route
            index
            element={homeTarget ? <Navigate to={homeTarget} replace /> : <Welcome />}
          />
          {routes.map(({ path, Component }) => (
            <Route
              key={path}
              path={path}
              element={
                <Suspense fallback={<PageFallback />}>
                  <Component />
                </Suspense>
              }
            />
          ))}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
