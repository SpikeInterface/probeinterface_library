import { create } from "zustand";

import { fetchManifest } from "../services/manifest";
import { fetchProbeData } from "../services/probeLoader";
import type { ManifestEntry, ProbeInterfaceFile, ProbeViewerCamera } from "../types/probe";

type LoadStatus = "idle" | "loading" | "success" | "error";

interface ProbeLoadState {
  status: LoadStatus;
  error?: string;
}

interface ViewState {
  camera: ProbeViewerCamera;
  showContactIds: boolean;
  showScaleBar: boolean;
  showOverview: boolean;
  // Per-probe zoom ceiling, computed from geometry so the smallest contact can
  // fill the viewport regardless of probe length (see setMaxZoom callers).
  maxZoom: number;
}

interface AppState {
  manifest: ManifestEntry[];
  manifestStatus: LoadStatus;
  manifestError?: string;
  selectedManufacturer?: string;
  selectedProbeId?: string;
  searchQuery: string;
  probeCache: Record<string, ProbeInterfaceFile>;
  probeStatus: Record<string, ProbeLoadState>;
  view: ViewState;
  // false until the camera has been seeded from the URL on load (or there was
  // nothing to seed). The URL writer holds off until this flips, so it cannot
  // clobber a shared link with the default camera at mount.
  cameraInitialized: boolean;

  loadManifest: () => Promise<void>;
  selectManufacturer: (manufacturer?: string) => void;
  setSearchQuery: (query: string) => void;
  selectProbe: (probeId?: string) => void;
  ensureProbeLoaded: (probeId: string) => Promise<ProbeInterfaceFile | undefined>;
  setZoom: (zoom: number) => void;
  setMaxZoom: (value: number) => void;
  setViewCenter: (x: number | null, y: number | null) => void;
  markCameraInitialized: () => void;
  resetView: () => void;
  toggleContactIds: (value?: boolean) => void;
  toggleScaleBar: (value?: boolean) => void;
  toggleOverview: (value?: boolean) => void;
}

export const VIEW_ZOOM_MIN = 0.1;
export const VIEW_ZOOM_MAX = 100;  // Default ceiling until a per-probe cap is computed
// Hard ceiling purely against floating-point wobble at extreme scales; the real
// per-probe cap (view.maxZoom) is almost always well below this.
export const VIEW_ZOOM_ABSOLUTE_MAX = 1e5;

const INITIAL_CAMERA: ProbeViewerCamera = {
  zoom: 1,
  centerX: null,
  centerY: null,
};

const INITIAL_VIEW_STATE: ViewState = {
  camera: INITIAL_CAMERA,
  showContactIds: false,
  showScaleBar: true,
  showOverview: true,
  maxZoom: VIEW_ZOOM_MAX,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export const useAppStore = create<AppState>((set, get) => ({
  manifest: [],
  manifestStatus: "idle",
  manifestError: undefined,
  selectedManufacturer: undefined,
  selectedProbeId: undefined,
  searchQuery: "",
  probeCache: {},
  probeStatus: {},
  view: INITIAL_VIEW_STATE,
  cameraInitialized: false,

  loadManifest: async () => {
    const { manifestStatus } = get();
    if (manifestStatus === "loading" || manifestStatus === "success") {
      return;
    }

    set({ manifestStatus: "loading", manifestError: undefined });
    try {
      const manifest = await fetchManifest();
      set((state) => {
        const nextManufacturer =
          state.selectedManufacturer ?? manifest[0]?.manufacturer;
        return {
          manifest,
          manifestStatus: "success" as const,
          selectedManufacturer: nextManufacturer,
        };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown manifest error";
      set({
        manifestStatus: "error",
        manifestError: message,
      });
    }
  },

  selectManufacturer: (manufacturer) => set({ selectedManufacturer: manufacturer }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  selectProbe: (probeId) =>
    set((state) => {
      if (!probeId) {
        return { selectedProbeId: undefined };
      }
      const entry = state.manifest.find((item) => item.id === probeId);
      return {
        selectedProbeId: probeId,
        selectedManufacturer: entry?.manufacturer ?? state.selectedManufacturer,
      };
    }),

  ensureProbeLoaded: async (probeId) => {
    const { probeCache, probeStatus, manifest } = get();
    if (probeCache[probeId]) {
      return probeCache[probeId];
    }

    const existingStatus = probeStatus[probeId];
    if (existingStatus?.status === "loading") {
      return undefined;
    }

    const entry = manifest.find((item) => item.id === probeId);
    if (!entry) {
      set((state) => ({
        probeStatus: {
          ...state.probeStatus,
          [probeId]: { status: "error", error: "Unknown probe" },
        },
      }));
      return undefined;
    }

    set((state) => ({
      probeStatus: {
        ...state.probeStatus,
        [probeId]: { status: "loading" },
      },
    }));

    try {
      const data = await fetchProbeData(entry);
      set((state) => ({
        probeCache: { ...state.probeCache, [probeId]: data },
        probeStatus: {
          ...state.probeStatus,
          [probeId]: { status: "success" },
        },
      }));
      return data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load probe data";
      set((state) => ({
        probeStatus: {
          ...state.probeStatus,
          [probeId]: { status: "error", error: message },
        },
      }));
      return undefined;
    }
  },

  setZoom: (zoom) =>
    set((state) => ({
      view: {
        ...state.view,
        camera: {
          ...state.view.camera,
          zoom: clamp(zoom, VIEW_ZOOM_MIN, state.view.maxZoom),
        },
      },
    })),

  setMaxZoom: (value) =>
    set((state) => {
      const maxZoom = clamp(value, VIEW_ZOOM_MIN, VIEW_ZOOM_ABSOLUTE_MAX);
      return {
        view: {
          ...state.view,
          maxZoom,
          // Re-clamp the current zoom so a tighter cap pulls the view back in.
          camera: {
            ...state.view.camera,
            zoom: Math.min(state.view.camera.zoom, maxZoom),
          },
        },
      };
    }),

  setViewCenter: (x, y) =>
    set((state) => ({
      view: {
        ...state.view,
        camera: { ...state.view.camera, centerX: x, centerY: y },
      },
    })),

  markCameraInitialized: () => set({ cameraInitialized: true }),

  resetView: () =>
    set((state) => ({
      view: {
        ...INITIAL_VIEW_STATE,
        showContactIds: state.view.showContactIds,
        // The cap is a property of the probe, not the camera; keep it across a reset.
        maxZoom: state.view.maxZoom,
      },
    })),

  toggleContactIds: (value) =>
    set((state) => ({
      view: {
        ...state.view,
        showContactIds:
          value !== undefined ? value : !state.view.showContactIds,
      },
    })),

  toggleScaleBar: (value) =>
    set((state) => ({
      view: {
        ...state.view,
        showScaleBar:
          value !== undefined ? value : !state.view.showScaleBar,
      },
    })),

  toggleOverview: (value) =>
    set((state) => ({
      view: {
        ...state.view,
        showOverview:
          value !== undefined ? value : !state.view.showOverview,
      },
    })),
}));

export type { AppState, LoadStatus, ManifestEntry, ProbeInterfaceFile };
