import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { ProbeViewer } from "./components/ProbeViewer";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./state/useAppStore";
import "./App.css";

const DEFAULT_PROBE_ID = "plexon:8S1024";

function roundForUrl(value: number, decimals = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function App() {
  const { manufacturer, model } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const manifestStatus = useAppStore((state) => state.manifestStatus);
  const manifest = useAppStore((state) => state.manifest);
  const selectedProbeId = useAppStore((state) => state.selectedProbeId);
  const loadManifest = useAppStore((state) => state.loadManifest);
  const selectProbe = useAppStore((state) => state.selectProbe);

  const view = useAppStore((state) => state.view);
  const setZoom = useAppStore((state) => state.setZoom);
  const setViewCenter = useAppStore((state) => state.setViewCenter);

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  // Track whether we've initialized from URL to avoid overwriting on first render
  const initializedFromUrl = useRef(false);

  // Read view params from URL on initial load
  useEffect(() => {
    if (initializedFromUrl.current) return;
    initializedFromUrl.current = true;

    const zoomParam = searchParams.get("zoom");
    const cxParam = searchParams.get("cx");
    const cyParam = searchParams.get("cy");

    if (zoomParam) {
      const zoom = parseFloat(zoomParam);
      if (!isNaN(zoom)) setZoom(zoom);
    }
    if (cxParam && cyParam) {
      const cx = parseFloat(cxParam);
      const cy = parseFloat(cyParam);
      if (!isNaN(cx) && !isNaN(cy)) setViewCenter(cx, cy);
    }
  }, [searchParams, setZoom, setViewCenter]);

  // Debounced URL update when view state changes
  const updateUrlTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const updateSearchParams = useCallback(() => {
    const { zoom, viewCenterX, viewCenterY } = view;
    const isDefault = zoom === 1 && viewCenterX === null && viewCenterY === null;

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (isDefault) {
        next.delete("zoom");
        next.delete("cx");
        next.delete("cy");
      } else {
        next.set("zoom", String(roundForUrl(zoom, 2)));
        if (viewCenterX !== null && viewCenterY !== null) {
          next.set("cx", String(roundForUrl(viewCenterX, 1)));
          next.set("cy", String(roundForUrl(viewCenterY, 1)));
        } else {
          next.delete("cx");
          next.delete("cy");
        }
      }
      return next;
    }, { replace: true });
  }, [view, setSearchParams]);

  useEffect(() => {
    if (!initializedFromUrl.current) return;

    clearTimeout(updateUrlTimeout.current);
    updateUrlTimeout.current = setTimeout(updateSearchParams, 300);

    return () => clearTimeout(updateUrlTimeout.current);
  }, [view.zoom, view.viewCenterX, view.viewCenterY, updateSearchParams]);

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

    const getDefaultProbe = () =>
      manifestById.get(DEFAULT_PROBE_ID) ?? manifest[0];

    if (selectedProbeId && !currentSelected) {
      const fallback = routeEntry ?? getDefaultProbe();
      if (fallback && fallback.id !== selectedProbeId) {
        selectProbe(fallback.id);
      }
      return;
    }

    if (!selectedProbeId) {
      if (routeEntry) {
        selectProbe(routeEntry.id);
      } else {
        const fallback = getDefaultProbe();
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
