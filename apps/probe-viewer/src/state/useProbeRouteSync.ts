import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useAppStore } from "./useAppStore";

// Keeps the selected probe and the URL path (/probes/:manufacturer/:model) in
// agreement:
//
//   select (path -> store)  acts only when the route's probe actually changes,
//                           so navigating away cannot re-add the probe we are
//                           leaving; the bare "/" landing clears the selection
//   sync   (store -> path)  navigates to match the selection when it changes,
//                           reading the live selection so a same-commit clear
//                           (e.g. the Home button) is respected
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

  // select: URL path -> store. Only react when the route's probe id actually
  // changes (tracked via a ref). This is what prevents a bounce: during a
  // navigation transient the route can briefly still name the old probe while
  // the selection has been cleared, and without this guard the effect would
  // re-select it. `null` is the "not yet run" sentinel; `undefined` is the
  // landing route.
  const lastRouteIdRef = useRef<string | undefined | null>(null);
  useEffect(() => {
    if (manifestStatus !== "success" || manifest.length === 0) return;

    const routeId =
      manufacturer && model ? `${manufacturer}:${model}` : undefined;
    if (routeId === lastRouteIdRef.current) return;
    lastRouteIdRef.current = routeId;

    if (!routeId) {
      // Landed on the catalog: clear any selection so the sync effect does not
      // pull us back into a probe view.
      if (useAppStore.getState().selectedProbeId) selectProbe(undefined);
      return;
    }

    const routeEntry = manifestById.get(routeId);
    if (routeEntry && routeEntry.id !== useAppStore.getState().selectedProbeId) {
      selectProbe(routeEntry.id);
    }
  }, [manifestStatus, manifest, manifestById, manufacturer, model, selectProbe]);

  // sync: store -> URL path.
  useEffect(() => {
    if (manifestStatus !== "success" || manifest.length === 0) return;

    // Read the live selection: if the select effect cleared it in this same
    // commit (landing), we must see that and not navigate back into a probe.
    const liveSelected = useAppStore.getState().selectedProbeId;
    if (!liveSelected) return;

    const selectedEntry = manifestById.get(liveSelected);
    if (!selectedEntry) return;

    const routeId =
      manufacturer && model ? `${manufacturer}:${model}` : undefined;
    if (routeId === selectedEntry.id) return;

    const targetPath = `/probes/${selectedEntry.manufacturer}/${selectedEntry.model}`;
    navigate(targetPath, { replace: location.pathname === "/" });
  }, [
    manifestStatus,
    manifest,
    manifestById,
    manufacturer,
    model,
    selectedProbeId,
    navigate,
    location.pathname,
  ]);
}
