import { AuthProvider } from "./shared/shell/AuthContext";
import { AuthGate } from "./shared/shell/AuthGate";
import { AppRouter } from "./shared/shell/AppRouter";
import { ToastProvider } from "./shared/ui/Toast";

/**
 * App root: auth state → toast host → auth gate → router/shell. The gate shows the
 * login page when signed out; once signed in, the router (built from the module nav
 * manifests) renders inside the app shell.
 */
export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthGate>
          <AppRouter />
        </AuthGate>
      </ToastProvider>
    </AuthProvider>
  );
}
