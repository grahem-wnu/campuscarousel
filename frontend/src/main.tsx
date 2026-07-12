import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installChunkReloadListener } from "./shared/shell/ChunkErrorBoundary";
import "./index.css";

// Stale-deploy recovery: when Vite's module preloader hits a chunk that no longer exists (the app
// was redeployed under this tab), reload once to pick up the fresh index.html.
installChunkReloadListener();

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
