import { useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";

import { ProbeIndex } from "./components/ProbeIndex";
import { ProbeViewer } from "./components/ProbeViewer";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./state/useAppStore";
import { useProbeRouteSync } from "./state/useProbeRouteSync";
import { useRestoreCameraFromUrl } from "./state/useRestoreCameraFromUrl";
import { useSyncCameraToUrl } from "./state/useSyncCameraToUrl";
import "./App.css";

function App() {
  const loadManifest = useAppStore((state) => state.loadManifest);
  // Present on /probes/:manufacturer/:model, absent on the bare "/" landing.
  const { model } = useParams();
  // /local renders the viewer for a user-loaded file even though it has no
  // :model param, so it is distinguished from the "/" landing by pathname.
  const isLocalRoute = useLocation().pathname === "/local";

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  // Selected probe <-> URL path (/probes/:manufacturer/:model).
  useProbeRouteSync();

  // Camera <-> URL query string: restore from a shared link on load, then keep
  // the URL updated as the user zooms/pans. Coordinated via the store's
  // `cameraInitialized` flag so the writer can't clobber the link at mount.
  // Both are scoped to the routes that actually show a probe; on the catalog
  // landing there is no camera, and running them there left the last probe's
  // zoom stuck on the URL (each hook re-feeding the other).
  const isProbeInView = !!model || isLocalRoute;
  useRestoreCameraFromUrl(isProbeInView);
  useSyncCameraToUrl(isProbeInView);

  // No probe in the route: show the catalog landing instead of a probe view.
  // /local is the exception: it renders the viewer for a locally loaded file.
  if (!isProbeInView) {
    return <ProbeIndex />;
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Sidebar />
      </aside>
      <main className="app-main">
        <ProbeViewer />
      </main>
    </div>
  );
}

export default App;
