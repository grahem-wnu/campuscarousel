import { AuthProvider } from "./shared/shell/AuthContext";
import { AuthGate } from "./shared/shell/AuthGate";
import { AppRouter } from "./shared/shell/AppRouter";
import { ActiveStudentProvider } from "./shared/shell/ActiveStudentContext";
import { ToastProvider } from "./shared/ui/Toast";

/**
 * App root: auth state → toast host → auth gate → active-student → router/shell. The gate shows the
 * login page when signed out; once signed in, the active-student provider resolves the family roster
 * (so per-child requests are scoped) and the router renders inside the app shell.
 */
export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthGate>
          <ActiveStudentProvider>
            <AppRouter />
          </ActiveStudentProvider>
        </AuthGate>
      </ToastProvider>
    </AuthProvider>
  );
}
