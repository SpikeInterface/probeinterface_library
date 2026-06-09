import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useAppStore } from "./useAppStore";

const DEFAULT_PROBE_ID = "plexon:8S1024";

// Keeps the selected probe and the URL path (/probes/:manufacturer/:model) in
// agreement:
//
//   select (path -> store)  on load / manifest change, picks the probe named in
//                           the URL, falling back to a default
//   sync   (store -> path)  navigates to match the selection when it changes
//
// Unlike the camera sync there is no shared flag: each effect carries its own
// loop-breaker (select no-ops when the selection is already valid; sync skips
// navigation when the path already matches), so the two cannot ping-pong.
export function useProbeRouteSync() {
  const { manufacturer, model } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const manifestStatus = useAppStore((state) => state.manifestStatus);
  const manifest = useAppStore((state) => state.manifest);
  const selectedProbeId = useAppStore((state) => state.selectedProbeId);
  const selectProbe = useAppStore((state) => state.selectProbe);

  const manifestById = useMemo(() => {
    const map = new Map<string, typeof manifest[number]>();
    manifest.forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [manifest]);

  // select: URL path -> store
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

  // sync: store -> URL path
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
}
