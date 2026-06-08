import { create } from "zustand";

import { fetchManifest } from "../services/manifest";
import { fetchProbeData } from "../services/probeLoader";
import type { ManifestEntry, ProbeInterfaceFile } from "../types/probe";

type LoadStatus = "idle" | "loading" | "success" | "error";

interface ProbeLoadState {
  status: LoadStatus;
  error?: string;
}

interface ViewState {
  zoom: number;
  viewCenterX: number | null;  // null = centered on geometry center
  viewCenterY: number | null;  // in probe coordinates (micrometers)
  showContactIds: boolean;
  showScaleBar: boolean;
  showOverview: boolean;
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

  loadManifest: () => Promise<void>;
  selectManufacturer: (manufacturer?: string) => void;
  setSearchQuery: (query: string) => void;
  selectProbe: (probeId?: string) => void;
  ensureProbeLoaded: (probeId: string) => Promise<ProbeInterfaceFile | undefined>;
  setZoom: (zoom: number) => void;
  setViewCenter: (x: number | null, y: number | null) => void;
  resetView: () => void;
  toggleContactIds: (value?: boolean) => void;
  toggleScaleBar: (value?: boolean) => void;
  toggleOverview: (value?: boolean) => void;
}

export const VIEW_ZOOM_MIN = 0.1;
export const VIEW_ZOOM_MAX = 100;  // High max for long probes like Neuropixels

const INITIAL_VIEW_STATE: ViewState = {
  zoom: 1,
  viewCenterX: null,
  viewCenterY: null,
  showContactIds: false,
  showScaleBar: true,
  showOverview: true,
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
        zoom: clamp(zoom, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX),
      },
    })),

  setViewCenter: (x, y) =>
    set((state) => ({
      view: {
        ...state.view,
        viewCenterX: x,
        viewCenterY: y,
      },
    })),

  resetView: () =>
    set((state) => ({
      view: {
        ...INITIAL_VIEW_STATE,
        showContactIds: state.view.showContactIds,
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
