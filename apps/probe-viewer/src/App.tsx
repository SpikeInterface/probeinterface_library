import { useEffect } from "react";

import { ProbeViewer } from "./components/ProbeViewer";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./state/useAppStore";
import { useProbeRouteSync } from "./state/useProbeRouteSync";
import { useRestoreCameraFromUrl } from "./state/useRestoreCameraFromUrl";
import { useSyncCameraToUrl } from "./state/useSyncCameraToUrl";
import "./App.css";

function App() {
  const loadManifest = useAppStore((state) => state.loadManifest);

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  // Selected probe <-> URL path (/probes/:manufacturer/:model).
  useProbeRouteSync();

  // Camera <-> URL query string: restore from a shared link on load, then keep
  // the URL updated as the user zooms/pans. Coordinated via the store's
  // `cameraInitialized` flag so the writer can't clobber the link at mount.
  useRestoreCameraFromUrl();
  useSyncCameraToUrl();

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
