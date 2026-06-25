import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useResizeObserver } from "../hooks/useResizeObserver";
import { useAppStore } from "../state/useAppStore";
import { exportProbeAsPng, exportProbeAsSvg } from "../utils/exportUtils";
import type { ContactShapeParams, ProbeInterfaceProbe } from "../types/probe";
import { ProbeCanvas } from "./ProbeCanvas";
import { ProbeOverview } from "./ProbeOverview";

const CANVAS_PADDING = 40;
// How far past "the smallest contact exactly fills the viewport" the zoom cap
// allows, so you can still pan around inside one contact. 2 = up to twice the
// viewport.
const ZOOM_HEADROOM = 2;

function contactExtent(shape: string, params: ContactShapeParams): number {
  if (shape === "circle") return 2 * (params.radius ?? 5);
  if (shape === "square") return params.width ?? 10;
  if (shape === "rect") return Math.max(params.width ?? 10, params.height ?? 15);
  return 10;
}

interface CameraFit {
  // Per-probe zoom ceiling (smallest contact ~fills the viewport).
  maxZoom: number;
  // Zoom + center that frame the contacts' bounding box (ignoring the contour).
  contactsZoom: number;
  contactsCenterX: number;
  contactsCenterY: number;
}

// Derives the zoom cap and the "fit the contacts" camera from the probe geometry
// and the current canvas size. Bounds for the cap and the full-probe scale use
// contacts + contour; the contacts framing uses contacts only, which is what
// makes a long shank (e.g. Neuropixels, contacts in a small band) frame usefully.
function computeCameraFit(
  probe: ProbeInterfaceProbe,
  canvasWidth: number,
  canvasHeight: number,
): CameraFit | null {
  const positions = probe.contact_positions ?? [];
  if (positions.length === 0) return null;
  const contour = probe.probe_planar_contour ?? [];

  let cMinX = Infinity, cMaxX = -Infinity, cMinY = Infinity, cMaxY = -Infinity;
  let fMinX = Infinity, fMaxX = -Infinity, fMinY = Infinity, fMaxY = -Infinity;
  positions.forEach(([x, y]) => {
    if (x < cMinX) cMinX = x;
    if (x > cMaxX) cMaxX = x;
    if (y < cMinY) cMinY = y;
    if (y > cMaxY) cMaxY = y;
  });
  fMinX = cMinX; fMaxX = cMaxX; fMinY = cMinY; fMaxY = cMaxY;
  contour.forEach(([x, y]) => {
    if (x < fMinX) fMinX = x;
    if (x > fMaxX) fMaxX = x;
    if (y < fMinY) fMinY = y;
    if (y > fMaxY) fMaxY = y;
  });

  const availW = Math.max(10, canvasWidth - CANVAS_PADDING * 2);
  const availH = Math.max(10, canvasHeight - CANVAS_PADDING * 2);
  const baseScale = Math.min(
    availW / Math.max(10, fMaxX - fMinX),
    availH / Math.max(10, fMaxY - fMinY),
  );

  const shapes = probe.contact_shapes ?? [];
  const params = probe.contact_shape_params ?? [];
  let smallest = Infinity;
  positions.forEach((_, i) => {
    smallest = Math.min(smallest, contactExtent(shapes[i] ?? "", params[i] ?? {}));
  });
  if (!Number.isFinite(smallest) || smallest <= 0) smallest = 10;

  const contactsScale = Math.min(
    availW / Math.max(10, cMaxX - cMinX),
    availH / Math.max(10, cMaxY - cMinY),
  );

  return {
    maxZoom: (ZOOM_HEADROOM * Math.min(availW, availH)) / smallest / baseScale,
    contactsZoom: contactsScale / baseScale,
    contactsCenterX: (cMinX + cMaxX) / 2,
    contactsCenterY: (cMinY + cMaxY) / 2,
  };
}

const ZoomInIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    <line x1="11" y1="8" x2="11" y2="14"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>
);

const ZoomOutIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>
);

const ShareIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

const CheckIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const DownloadIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

// Curly-braces glyph, the de-facto standard symbol for JSON/code.
const JsonIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/>
    <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>
  </svg>
);

// Leading icons for the view-toggle chips: an eye (show/hide contact IDs), an
// I-beam matching the on-canvas scale bar, and a minimap frame for the overview.
const EyeIcon = (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const ScaleBarIcon = (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="8" x2="3" y2="16"/>
    <line x1="21" y1="8" x2="21" y2="16"/>
  </svg>
);

const MinimapIcon = (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <rect x="13" y="13" width="6" height="6" rx="1"/>
  </svg>
);

export function ProbeViewer() {
  const manifest = useAppStore((state) => state.manifest);
  const manifestStatus = useAppStore((state) => state.manifestStatus);
  const manifestError = useAppStore((state) => state.manifestError);
  const selectedProbeId = useAppStore((state) => state.selectedProbeId);
  const ensureProbeLoaded = useAppStore((state) => state.ensureProbeLoaded);
  const probeCache = useAppStore((state) => state.probeCache);
  const probeStatus = useAppStore((state) => state.probeStatus);
  const view = useAppStore((state) => state.view);
  const setZoom = useAppStore((state) => state.setZoom);
  const setMaxZoom = useAppStore((state) => state.setMaxZoom);
  const setViewCenter = useAppStore((state) => state.setViewCenter);
  const resetView = useAppStore((state) => state.resetView);
  const toggleContactIds = useAppStore((state) => state.toggleContactIds);
  const toggleScaleBar = useAppStore((state) => state.toggleScaleBar);
  const toggleOverview = useAppStore((state) => state.toggleOverview);

  useEffect(() => {
    if (selectedProbeId) {
      void ensureProbeLoaded(selectedProbeId);
    }
  }, [selectedProbeId, ensureProbeLoaded]);

  const entry = useMemo(
    () => manifest.find((item) => item.id === selectedProbeId),
    [manifest, selectedProbeId],
  );

  const status = selectedProbeId
    ? probeStatus[selectedProbeId]?.status ?? "idle"
    : "idle";
  const statusMessage = selectedProbeId
    ? probeStatus[selectedProbeId]?.error
    : manifestError;

  const probeData = selectedProbeId ? probeCache[selectedProbeId] : undefined;

  // Only offer the "Show contact IDs" toggle when the probe actually carries them.
  const hasContactIds = !!probeData?.probes?.[0]?.contact_ids?.length;

  // Track canvas container size for minimap
  const { ref: canvasContainerRef, size: canvasSize } = useResizeObserver<HTMLDivElement>();

  // Export handlers
  const handleExportPng = useCallback(() => {
    if (probeData && entry) {
      exportProbeAsPng(
        probeData,
        view.camera,
        { width: canvasSize.width, height: canvasSize.height },
        `${entry.id}.png`,
        view.showScaleBar
      );
    }
  }, [probeData, entry, view.camera, canvasSize.width, canvasSize.height, view.showScaleBar]);

  const handleExportSvg = useCallback(() => {
    if (probeData && entry) {
      exportProbeAsSvg(
        probeData,
        view.camera,
        { width: canvasSize.width, height: canvasSize.height },
        `${entry.id}.svg`,
        view.showScaleBar
      );
    }
  }, [probeData, entry, view.camera, canvasSize.width, canvasSize.height, view.showScaleBar]);

  const [shareCopied, setShareCopied] = useState(false);
  const handleShareView = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  }, []);

  const lastResetProbeId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (selectedProbeId && lastResetProbeId.current !== selectedProbeId) {
      // Get current view state directly from store (not stale closure value)
      // This is critical because App.tsx's URL effect may have updated the store
      // after this component rendered but before this effect runs
      const currentCamera = useAppStore.getState().view.camera;
      const hasUrlViewState = currentCamera.zoom !== 1 || currentCamera.centerX !== null || currentCamera.centerY !== null;
      if (!hasUrlViewState) {
        resetView();
      }
      lastResetProbeId.current = selectedProbeId;
    }
    if (!selectedProbeId) {
      lastResetProbeId.current = undefined;
    }
  }, [selectedProbeId, resetView]);

  // Frame the contacts (ignoring the probe outline) and center on them. Reused
  // by the default-view effect and the "Full Contacts View" button.
  const fullContactsView = useCallback(() => {
    const probe = probeData?.probes?.[0];
    if (!probe) return;
    const fit = computeCameraFit(probe, canvasSize.width, canvasSize.height);
    if (!fit) return;
    setZoom(fit.contactsZoom);
    setViewCenter(fit.contactsCenterX, fit.contactsCenterY);
  }, [probeData, canvasSize.width, canvasSize.height, setZoom, setViewCenter]);

  // Per-probe zoom cap. Recomputed on probe switch and on resize, since the cap
  // ("smallest contact fills the viewport") is expressed in viewport pixels and
  // must follow the canvas size. Declared before the default-view effect so the
  // cap is committed before any zoom is applied (Zustand set is synchronous).
  useEffect(() => {
    if (!probeData) return;
    if (canvasSize.width === 0 || canvasSize.height === 0) return;
    const probe = probeData.probes?.[0];
    if (!probe) return;
    const fit = computeCameraFit(probe, canvasSize.width, canvasSize.height);
    if (fit) setMaxZoom(fit.maxZoom);
  }, [probeData, canvasSize.width, canvasSize.height, setMaxZoom]);

  // Default framing: every probe opens fitted to its contacts. The only
  // exception is the very first probe of a session opened from a shared link
  // whose URL carried a camera at load time (left for useRestoreCameraFromUrl).
  // Basing this on the load-time URL, not the live camera, is what makes the
  // contacts framing apply on every probe switch (the live camera is non-default
  // after the first probe, which previously made later probes skip it).
  const [searchParams] = useSearchParams();
  const initialUrlHadCameraRef = useRef(searchParams.has("zoom"));
  const lastDefaultViewProbeId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!probeData || !selectedProbeId) return;
    if (lastDefaultViewProbeId.current === selectedProbeId) return;
    if (canvasSize.width === 0 || canvasSize.height === 0) return;

    const isFirstProbe = lastDefaultViewProbeId.current === undefined;
    const respectSharedLink = isFirstProbe && initialUrlHadCameraRef.current;
    if (!respectSharedLink) {
      fullContactsView();
    }
    lastDefaultViewProbeId.current = selectedProbeId;
  }, [probeData, selectedProbeId, canvasSize.width, canvasSize.height, fullContactsView]);

  if (manifestStatus === "loading") {
    return (
      <div className="viewer-placeholder">
        <p>Loading manifest…</p>
      </div>
    );
  }

  if (manifestStatus === "error") {
    return (
      <div className="viewer-placeholder viewer-placeholder--error">
        <p>{statusMessage ?? "Unable to load catalog."}</p>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="viewer-placeholder">
        <p>Select a probe to see its details.</p>
      </div>
    );
  }

  return (
    <div className="viewer-panel">
      <header className="viewer-header">
        <div>
          <h2 className="viewer-title">{entry.displayName}</h2>
          <p className="viewer-subtitle">
            {entry.manufacturer} · {entry.contactCount} contacts ·{" "}
            {entry.shankCount} shanks ·{" "}
            <a
              className="viewer-json-link"
              href={`https://github.com/SpikeInterface/probeinterface_library/blob/main/${entry.manufacturer}/${entry.model}/${entry.model}.json`}
              target="_blank"
              rel="noreferrer"
              title="View this probe's JSON on GitHub"
            >
              {JsonIcon}
              <span className="viewer-json-link-text">JSON</span>
            </a>
          </p>
        </div>
        <div className="viewer-header-actions">
          <button
            type="button"
            className="viewer-download"
            onClick={handleExportPng}
            title="Export current view as PNG (white background). If scale bar is enabled, it will be included."
          >
            {DownloadIcon}
            Export PNG
          </button>
          <button
            type="button"
            className="viewer-download"
            onClick={handleExportSvg}
            title="Export current view as SVG (transparent background). If scale bar is enabled, it will be included."
          >
            {DownloadIcon}
            Export SVG
          </button>
          <button
            type="button"
            className="viewer-download"
            onClick={handleShareView}
            title="Copy a link to the current view"
            aria-label="Copy a link to the current view"
          >
            {shareCopied ? (
              <>
                {CheckIcon}
                Link copied!
              </>
            ) : (
              <>
                {ShareIcon}
                Share Current View
              </>
            )}
          </button>
        </div>
      </header>

      {status !== "error" && probeData && (
        <section className="viewer-toolbar viewer-toolbar--top">
          <button type="button" onClick={() => resetView()} title="Show the whole probe outline">
            Full Probe View
          </button>
          <button type="button" onClick={fullContactsView} title="Zoom to fit just the contacts">
            Full Contacts View
          </button>
        </section>
      )}

      <section className="viewer-canvas" ref={canvasContainerRef}>
        {status === "error" && (
          <div className="viewer-placeholder viewer-placeholder--error">
            <p>{statusMessage ?? "Failed to load probe data."}</p>
          </div>
        )}
        {status !== "error" && probeData && (
          <>
            <ProbeCanvas
              entry={entry}
              probeData={probeData}
              camera={view.camera}
              maxZoom={view.maxZoom}
              showContactIds={view.showContactIds}
              showScaleBar={view.showScaleBar}
              onViewCenterChange={(x, y) => setViewCenter(x, y)}
              onZoom={(value) => setZoom(value)}
            />
            {view.showOverview && (
              <ProbeOverview
                probeData={probeData}
                camera={view.camera}
                mainWidth={canvasSize.width}
                mainHeight={canvasSize.height}
                onViewCenterChange={(x, y) => setViewCenter(x, y)}
              />
            )}

            <div className="canvas-controls canvas-controls--nav">
              <button
                type="button"
                onClick={() => setZoom(view.camera.zoom * 1.5)}
                title="Zoom in"
              >
                {ZoomInIcon}
              </button>
              <button
                type="button"
                onClick={() => setZoom(view.camera.zoom / 1.5)}
                title="Zoom out"
              >
                {ZoomOutIcon}
              </button>
            </div>
          </>
        )}
        {status === "loading" && (
          <div className="viewer-placeholder">
            <p>Loading probe geometry…</p>
          </div>
        )}
      </section>

      {status !== "error" && probeData && (
        <section className="viewer-toolbar viewer-toolbar--bottom">
          {hasContactIds && (
            <label className="viewer-toggle">
              <input
                type="checkbox"
                checked={view.showContactIds}
                onChange={(event) => toggleContactIds(event.target.checked)}
              />
              {EyeIcon}
              Show contact IDs
            </label>
          )}
          <label className="viewer-toggle">
            <input
              type="checkbox"
              checked={view.showScaleBar}
              onChange={(event) => toggleScaleBar(event.target.checked)}
            />
            {ScaleBarIcon}
            Scale bar
          </label>
          <label className="viewer-toggle">
            <input
              type="checkbox"
              checked={view.showOverview}
              onChange={(event) => toggleOverview(event.target.checked)}
            />
            {MinimapIcon}
            Overview
          </label>
        </section>
      )}

      <div className="viewer-issue-link">
        <a
          href="https://github.com/SpikeInterface/probeinterface_library/issues"
          target="_blank"
          rel="noreferrer"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="currentColor"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          See a problem? Open an issue
        </a>
      </div>

    </div>
  );
}
