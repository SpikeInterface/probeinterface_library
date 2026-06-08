import { useEffect, useMemo } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { ProbeViewer } from "./components/ProbeViewer";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./state/useAppStore";
import "./App.css";

function App() {
  const { manufacturer, model } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const manifestStatus = useAppStore((state) => state.manifestStatus);
  const manifest = useAppStore((state) => state.manifest);
  const selectedProbeId = useAppStore((state) => state.selectedProbeId);
  const loadManifest = useAppStore((state) => state.loadManifest);
  const selectProbe = useAppStore((state) => state.selectProbe);

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  const manifestById = useMemo(() => {
    const map = new Map<string, typeof manifest[number]>();
    manifest.forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [manifest]);

  useEffect(() => {
    if (manifestStatus !== "success" || manifest.length === 0) {
      return;
    }

    const routeId =
      manufacturer && model ? `${manufacturer}:${model}` : undefined;
    const routeEntry = routeId ? manifestById.get(routeId) : undefined;
    const currentSelected = selectedProbeId
      ? manifestById.get(selectedProbeId)
      : undefined;

    if (selectedProbeId && !currentSelected) {
      const fallback = routeEntry ?? manifest[0];
      if (fallback && fallback.id !== selectedProbeId) {
        selectProbe(fallback.id);
      }
      return;
    }

    if (!selectedProbeId) {
      if (routeEntry) {
        selectProbe(routeEntry.id);
      } else {
        const fallback = manifest[0];
        if (fallback) {
          selectProbe(fallback.id);
        }
      }
    }
  }, [
    manifestStatus,
    manifest,
    manifestById,
    manufacturer,
    model,
    selectedProbeId,
    selectProbe,
  ]);

  useEffect(() => {
    if (
      manifestStatus !== "success" ||
      !selectedProbeId ||
      manifest.length === 0
    ) {
      return;
    }

    const selectedEntry = manifestById.get(selectedProbeId);
    if (!selectedEntry) {
      return;
    }

    const routeId =
      manufacturer && model ? `${manufacturer}:${model}` : undefined;
    if (routeId === selectedEntry.id) {
      return;
    }

    const targetPath = `/probes/${selectedEntry.manufacturer}/${selectedEntry.model}`;
    const replace = location.pathname === "/";
    navigate(targetPath, { replace });
  }, [
    manifestStatus,
    selectedProbeId,
    manifestById,
    manufacturer,
    model,
    navigate,
    location.pathname,
    manifest.length,
  ]);

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
