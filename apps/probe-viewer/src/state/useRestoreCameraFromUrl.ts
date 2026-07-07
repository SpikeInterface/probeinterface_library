import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { useAppStore } from "./useAppStore";

// Reads the camera (zoom/cx/cy) and view toggles (ids/scale/overview) from a
// shared link into the store.
function restoreViewFromParams(
  searchParams: URLSearchParams,
  setZoom: (zoom: number) => void,
  setViewCenter: (x: number | null, y: number | null) => void,
  toggleContactIds: (value?: boolean) => void,
  toggleScaleBar: (value?: boolean) => void,
  toggleOverview: (value?: boolean) => void,
) {
  const zoomParam = searchParams.get("zoom");
  if (zoomParam) {
    const zoom = parseFloat(zoomParam);
    if (!isNaN(zoom)) setZoom(zoom);
  }
  // A center needs both coordinates. If either is missing from the URL
  // (e.g. a link that only set zoom), there is no center to restore.
  const cxParam = searchParams.get("cx");
  const cyParam = searchParams.get("cy");
  const cx = cxParam ? parseFloat(cxParam) : NaN;
  const cy = cyParam ? parseFloat(cyParam) : NaN;
  if (!isNaN(cx) && !isNaN(cy)) {
    setViewCenter(cx, cy);
  }

  // Toggles are applied only when present, so a link that omits a flag leaves
  // that toggle at its default.
  if (searchParams.has("ids")) toggleContactIds(searchParams.get("ids") === "1");
  if (searchParams.has("scale")) toggleScaleBar(searchParams.get("scale") === "1");
  if (searchParams.has("overview")) toggleOverview(searchParams.get("overview") === "1");
}

// restore: URL -> store, once per page load. Applies a shared link's camera and
// view toggles on mount, then flips `cameraInitialized` so the URL writer is
// allowed to start. useSyncCameraToUrl is the other half.
export function useRestoreCameraFromUrl() {
  const [searchParams] = useSearchParams();
  const cameraInitialized = useAppStore((state) => state.cameraInitialized);
  const setZoom = useAppStore((state) => state.setZoom);
  const setViewCenter = useAppStore((state) => state.setViewCenter);
  const toggleContactIds = useAppStore((state) => state.toggleContactIds);
  const toggleScaleBar = useAppStore((state) => state.toggleScaleBar);
  const toggleOverview = useAppStore((state) => state.toggleOverview);
  const markCameraInitialized = useAppStore((state) => state.markCameraInitialized);

  useEffect(() => {
    if (cameraInitialized) return;
    restoreViewFromParams(
      searchParams,
      setZoom,
      setViewCenter,
      toggleContactIds,
      toggleScaleBar,
      toggleOverview,
    );
    markCameraInitialized();
  }, [
    cameraInitialized,
    searchParams,
    setZoom,
    setViewCenter,
    toggleContactIds,
    toggleScaleBar,
    toggleOverview,
    markCameraInitialized,
  ]);
}
