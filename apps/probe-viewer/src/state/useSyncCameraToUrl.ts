import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { SetURLSearchParams } from "react-router-dom";

import { useAppStore } from "./useAppStore";
import type { ProbeViewerCamera } from "../types/probe";

// Coordinates are rounded before going into the URL so shared links stay short
// and stable (e.g. 2.5 / 100.3 instead of 2.4999999 / 100.34871).
function roundForUrl(value: number, decimals = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// Writes the current camera into the query string, dropping the params entirely
// when the camera is back at its default (zoom 1, no center).
function writeCameraToParams(
  camera: ProbeViewerCamera,
  setSearchParams: SetURLSearchParams,
) {
  const { zoom, centerX, centerY } = camera;
  const isDefault = zoom === 1 && centerX === null && centerY === null;

  setSearchParams(
    (prev) => {
      const next = new URLSearchParams(prev);
      if (isDefault) {
        next.delete("zoom");
        next.delete("cx");
        next.delete("cy");
      } else {
        next.set("zoom", String(roundForUrl(zoom, 2)));
        if (centerX !== null && centerY !== null) {
          next.set("cx", String(roundForUrl(centerX, 1)));
          next.set("cy", String(roundForUrl(centerY, 1)));
        } else {
          next.delete("cx");
          next.delete("cy");
        }
      }
      return next;
    },
    { replace: true },
  );
}

// sync: store -> URL, debounced. Writes the current camera into the query string
// on every zoom/pan, but only once `cameraInitialized` is set, so it can't wipe
// a shared link's params before useRestoreCameraFromUrl has read them. The
// restore-before-write ordering is documented on `cameraInitialized` in the store.
export function useSyncCameraToUrl() {
  const [, setSearchParams] = useSearchParams();
  const camera = useAppStore((state) => state.view.camera);
  const cameraInitialized = useAppStore((state) => state.cameraInitialized);

  const writeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!cameraInitialized) return;

    clearTimeout(writeTimeout.current);
    writeTimeout.current = setTimeout(() => {
      writeCameraToParams(camera, setSearchParams);
    }, 300);

    return () => clearTimeout(writeTimeout.current);
  }, [cameraInitialized, camera, setSearchParams]);
}
