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
  // Which face is on top (drawn last) and whose contact IDs show; null means
  // "the first side". Does not affect opacity.
  prominentSide: string | null;
  // Independent opacity per side, keyed by side name (e.g. "front"/"back").
  // Range 0–1; a missing side defaults to 1. Each side is controlled on its own
  // so "back opacity" always means the back face, regardless of stacking.
  sideOpacity: Record<string, number>;
  // Separation between the two faces in overlay mode, in probe units (µm).
  overlayOffsetUm: number;
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
  setViewCenter: (x: number | null, y: number | null) => void;
  markCameraInitialized: () => void;
  resetView: () => void;
  toggleContactIds: (value?: boolean) => void;
  toggleScaleBar: (value?: boolean) => void;
  toggleOverview: (value?: boolean) => void;
  setProminentSide: (side: string | null) => void;
  setSideOpacity: (side: string, opacity: number) => void;
  setOverlayOffsetUm: (offsetUm: number) => void;
}

export const VIEW_ZOOM_MIN = 0.1;
export const VIEW_ZOOM_MAX = 100;  // High max for long probes like Neuropixels

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
  prominentSide: null,
  // Both faces fully opaque by default; the offset alone keeps them readable.
  sideOpacity: {},
  // A slight separation by default so both faces are distinguishable on load.
  overlayOffsetUm: 10,
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
          zoom: clamp(zoom, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX),
        },
      },
    })),

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
        prominentSide: state.view.prominentSide,
        sideOpacity: state.view.sideOpacity,
        overlayOffsetUm: state.view.overlayOffsetUm,
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

  setProminentSide: (side) =>
    set((state) => ({ view: { ...state.view, prominentSide: side } })),

  setSideOpacity: (side, opacity) =>
    set((state) => ({
      view: {
        ...state.view,
        sideOpacity: {
          ...state.view.sideOpacity,
          [side]: Math.min(1, Math.max(0, opacity)),
        },
      },
    })),

  setOverlayOffsetUm: (offsetUm) =>
    set((state) => ({
      view: {
        ...state.view,
        overlayOffsetUm: Math.min(100, Math.max(0, offsetUm)),
      },
    })),
}));

export type { AppState, LoadStatus, ManifestEntry, ProbeInterfaceFile };
