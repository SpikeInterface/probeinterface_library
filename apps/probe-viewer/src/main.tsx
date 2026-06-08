import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";

import App from "./App.tsx";
import "./index.css";

// =============================================================================
// Hash Router for GitHub Pages
// =============================================================================
//
// We use hash-based routing (URLs like /#/probes/imec/NP1000) instead of
// browser-based routing (/probes/imec/NP1000) because:
//
// 1. GitHub Pages is a static file server - it can only serve files that exist
// 2. With browser routing, /probes/imec/NP1000 returns 404 (no such file)
// 3. Hash fragments (#...) are never sent to the server - the browser handles them
// 4. So /#/probes/imec/NP1000 requests /, server returns index.html, React handles the rest
//
// Trade-off: URLs are slightly uglier, but direct links and refresh work perfectly.
// =============================================================================

const router = createHashRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/probes/:manufacturer/:model",
    element: <App />,
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
