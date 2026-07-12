import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for the SPA. No hardcoded config: runtime values (Cognito pool/client,
// API base URL, region) are read from `VITE_*` env at build time — see `.env.example`.
// CI/CD injects them from SSM (`/keiras-journey/<env>/...`) at build.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // 'hidden' emits maps for local debugging but does NOT reference them from the shipped
    // bundle, so original TypeScript source isn't published to CloudFront for anyone to read.
    sourcemap: "hidden",
  },
  server: {
    port: 5173,
  },
});
