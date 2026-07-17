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

interface ViewFlags {
  showContactIds: boolean;
  showScaleBar: boolean;
  showOverview: boolean;
}

// A flag is written to the URL only when it differs from its default, so a
// default view carries no flag params at all.
const FLAG_DEFAULTS: ViewFlags = {
  showContactIds: false,
  showScaleBar: true,
  showOverview: true,
};

// Every param this hook owns. Listed so they can all be dropped again when no
// probe is in view (see the `enabled` handling below).
const VIEW_PARAM_KEYS = ["zoom", "cx", "cy", "ids", "scale", "overview"];

function clearViewParams(setSearchParams: SetURLSearchParams) {
  setSearchParams(
    (prev) => {
      const next = new URLSearchParams(prev);
      VIEW_PARAM_KEYS.forEach((key) => next.delete(key));
      return next;
    },
    { replace: true },
  );
}

function setOrDeleteFlag(
  params: URLSearchParams,
  key: string,
  value: boolean,
  defaultValue: boolean,
) {
  if (value === defaultValue) params.delete(key);
  else params.set(key, value ? "1" : "0");
}

// Writes the camera and the view toggles into the query string, dropping each
// back out when it returns to its default so a default view has a clean URL.
function writeViewToParams(
  camera: ProbeViewerCamera,
  flags: ViewFlags,
  setSearchParams: SetURLSearchParams,
) {
  const { zoom, centerX, centerY } = camera;
  const isDefaultCamera = zoom === 1 && centerX === null && centerY === null;

  setSearchParams(
    (prev) => {
      const next = new URLSearchParams(prev);
      if (isDefaultCamera) {
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
      setOrDeleteFlag(next, "ids", flags.showContactIds, FLAG_DEFAULTS.showContactIds);
      setOrDeleteFlag(next, "scale", flags.showScaleBar, FLAG_DEFAULTS.showScaleBar);
      setOrDeleteFlag(next, "overview", flags.showOverview, FLAG_DEFAULTS.showOverview);
      return next;
    },
    { replace: true },
  );
}

// sync: store -> URL, debounced. Writes the camera and view toggles into the
// query string on every change, but only once `cameraInitialized` is set, so it
// can't wipe a shared link's params before useRestoreCameraFromUrl has read them.
// The restore-before-write ordering is documented on `cameraInitialized`.
//
// `enabled` is false wherever no probe is on screen (the catalog landing). There
// the params describe nothing, so this drops them instead of writing: otherwise
// the camera of whichever probe you last viewed rides along on the catalog URL,
// and useRestoreCameraFromUrl reads it straight back in, making the pair
// self-perpetuating and the params impossible to clear.
export function useSyncCameraToUrl(enabled: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();
  const camera = useAppStore((state) => state.view.camera);
  const showContactIds = useAppStore((state) => state.view.showContactIds);
  const showScaleBar = useAppStore((state) => state.view.showScaleBar);
  const showOverview = useAppStore((state) => state.view.showOverview);
  const cameraInitialized = useAppStore((state) => state.cameraInitialized);

  // Guarded on presence so clearing settles after one pass instead of looping:
  // once the params are gone this is false and the effect no-ops.
  const hasViewParams = VIEW_PARAM_KEYS.some((key) => searchParams.has(key));

  const writeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!enabled) {
      if (hasViewParams) clearViewParams(setSearchParams);
      return;
    }
    if (!cameraInitialized) return;

    clearTimeout(writeTimeout.current);
    writeTimeout.current = setTimeout(() => {
      writeViewToParams(
        camera,
        { showContactIds, showScaleBar, showOverview },
        setSearchParams,
      );
    }, 300);

    return () => clearTimeout(writeTimeout.current);
  }, [
    enabled,
    hasViewParams,
    cameraInitialized,
    camera,
    showContactIds,
    showScaleBar,
    showOverview,
    setSearchParams,
  ]);
}
