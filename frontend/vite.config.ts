import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for the SPA. No hardcoded config: runtime values (Cognito pool/client,
// API base URL, region) are read from `VITE_*` env at build time — see `.env.example`.
// CI/CD injects them from SSM (`/keiras-journey/<env>/...`) at build.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
