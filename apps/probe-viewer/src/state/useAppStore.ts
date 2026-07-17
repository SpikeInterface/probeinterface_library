import { create } from "zustand";

import { fetchManifest } from "../services/manifest";
import { buildLocalEntry } from "../services/localProbe";
import { fetchProbeData } from "../services/probeLoader";
import { validateProbeFile } from "../services/validateProbe";
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
  // Double-sided probes: which face to show as a channel map. A side name
  // ("front"/"back"); resolved against the probe's actual sides at render time.
  overlaySide: string;
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
  // Filter the list to probes with this many sides; null = show all. Only
  // meaningful for manufacturers whose catalog mixes side counts.
  sideFilter: number | null;
  probeCache: Record<string, ProbeInterfaceFile>;
  probeStatus: Record<string, ProbeLoadState>;
  // A probe loaded from the user's own file, kept out of the manifest and the
  // router: local bytes have no shareable URL, so this lives in its own state
  // and renders at /local. undefined until a file is loaded this session.
  localProbe?: { entry: ManifestEntry; file: ProbeInterfaceFile };
  localProbeStatus: LoadStatus;
  localProbeError?: string;
  view: ViewState;
  // false until the camera has been seeded from the URL on load (or there was
  // nothing to seed). The URL writer holds off until this flips, so it cannot
  // clobber a shared link with the default camera at mount.
  cameraInitialized: boolean;

  loadManifest: () => Promise<void>;
  selectManufacturer: (manufacturer?: string) => void;
  setSearchQuery: (query: string) => void;
  setSideFilter: (sides: number | null) => void;
  selectProbe: (probeId?: string) => void;
  ensureProbeLoaded: (probeId: string) => Promise<ProbeInterfaceFile | undefined>;
  // Reads, parses and schema-validates a user-provided file. On a compliant file
  // localProbe is set; otherwise localProbeError carries a readable reason.
  // Callers navigate to /local either way, where both outcomes are rendered.
  loadLocalProbe: (file: File) => Promise<void>;
  clearLocalProbe: () => void;
  setZoom: (zoom: number) => void;
  setMaxZoom: (value: number) => void;
  setViewCenter: (x: number | null, y: number | null) => void;
  markCameraInitialized: () => void;
  resetView: () => void;
  toggleContactIds: (value?: boolean) => void;
  toggleScaleBar: (value?: boolean) => void;
  toggleOverview: (value?: boolean) => void;
  setOverlaySide: (side: string) => void;
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
  // Default to the front face; resolved to the probe's first side if absent.
  overlaySide: "front",
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
  sideFilter: null,
  probeCache: {},
  probeStatus: {},
  localProbe: undefined,
  localProbeStatus: "idle",
  localProbeError: undefined,
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

  // Switching manufacturer clears the side filter — it's specific to whichever
  // catalog was showing and rarely applies to the next one.
  selectManufacturer: (manufacturer) =>
    set({ selectedManufacturer: manufacturer, sideFilter: null }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSideFilter: (sides) => set({ sideFilter: sides }),

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

  loadLocalProbe: async (file) => {
    set({ localProbeStatus: "loading", localProbeError: undefined });

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      set({
        localProbeStatus: "error",
        localProbeError: "This file is not valid JSON.",
      });
      return;
    }

    try {
      const result = await validateProbeFile(parsed);
      if (!result.valid) {
        set({
          localProbeStatus: "error",
          localProbeError: `This file is not a compliant probeinterface file:\n${result.errors.join("\n")}`,
        });
        return;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not validate the file.";
      set({ localProbeStatus: "error", localProbeError: message });
      return;
    }

    const probeFile = parsed as ProbeInterfaceFile;
    const entry = buildLocalEntry(probeFile, file.name);
    set({
      localProbe: { entry, file: probeFile },
      localProbeStatus: "success",
      localProbeError: undefined,
      // A local probe is not a manifest selection; clear any so the viewer
      // resolves to the local probe while at /local.
      selectedProbeId: undefined,
    });
  },

  clearLocalProbe: () =>
    set({
      localProbe: undefined,
      localProbeStatus: "idle",
      localProbeError: undefined,
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
        overlaySide: state.view.overlaySide,
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

  setOverlaySide: (side) =>
    set((state) => ({ view: { ...state.view, overlaySide: side } })),
}));

export type { AppState, LoadStatus, ManifestEntry, ProbeInterfaceFile };
