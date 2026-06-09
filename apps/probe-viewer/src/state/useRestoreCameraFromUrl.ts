import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { useAppStore } from "./useAppStore";

// Reads the camera params (zoom/cx/cy) from a shared link into the store.
function restoreCameraFromParams(
  searchParams: URLSearchParams,
  setZoom: (zoom: number) => void,
  setViewCenter: (x: number | null, y: number | null) => void,
) {
  const zoomParam = searchParams.get("zoom");
  const cxParam = searchParams.get("cx");
  const cyParam = searchParams.get("cy");

  if (zoomParam) {
    const zoom = parseFloat(zoomParam);
    if (!isNaN(zoom)) setZoom(zoom);
  }
  // A center needs both coordinates. If either is missing from the URL
  // (e.g. a link that only set zoom), there is no center to restore.
  const cx = cxParam ? parseFloat(cxParam) : NaN;
  const cy = cyParam ? parseFloat(cyParam) : NaN;
  const hasCenter = !isNaN(cx) && !isNaN(cy);
  if (hasCenter) {
    setViewCenter(cx, cy);
  }
}

// restore: URL -> store, once per page load. Applies a shared link's camera on
// mount, then flips `cameraInitialized` so the URL writer is allowed to start.
// The restore-before-write ordering this guarantees is documented on
// `cameraInitialized` in the store; useSyncCameraToUrl is the other half.
export function useRestoreCameraFromUrl() {
  const [searchParams] = useSearchParams();
  const cameraInitialized = useAppStore((state) => state.cameraInitialized);
  const setZoom = useAppStore((state) => state.setZoom);
  const setViewCenter = useAppStore((state) => state.setViewCenter);
  const markCameraInitialized = useAppStore((state) => state.markCameraInitialized);

  useEffect(() => {
    if (cameraInitialized) return;
    restoreCameraFromParams(searchParams, setZoom, setViewCenter);
    markCameraInitialized();
  }, [cameraInitialized, searchParams, setZoom, setViewCenter, markCameraInitialized]);
}
