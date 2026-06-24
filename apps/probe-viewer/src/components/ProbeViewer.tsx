import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useResizeObserver } from "../hooks/useResizeObserver";
import { useAppStore, VIEW_ZOOM_MAX, VIEW_ZOOM_MIN } from "../state/useAppStore";
import { exportProbeAsPng, exportProbeAsSvg } from "../utils/exportUtils";
import { getSideInfo } from "../geometry/sides";
import { ProbeCanvas } from "./ProbeCanvas";
import { DoubleSidedProbeCanvas } from "./DoubleSidedProbeCanvas";
import { ProbeOverview } from "./ProbeOverview";

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

// Curly-braces glyph, the de-facto standard symbol for JSON/code.
const JsonIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/>
    <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>
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
  const setViewCenter = useAppStore((state) => state.setViewCenter);
  const resetView = useAppStore((state) => state.resetView);
  const toggleContactIds = useAppStore((state) => state.toggleContactIds);
  const toggleScaleBar = useAppStore((state) => state.toggleScaleBar);
  const toggleOverview = useAppStore((state) => state.toggleOverview);
  const setOverlaySide = useAppStore((state) => state.setOverlaySide);

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

  // Double-sided probes (front + back contacts at the same positions) get a
  // dedicated canvas and a layout control; single-sided probes are unaffected.
  const sideInfo = useMemo(
    () => getSideInfo(probeData?.probes?.[0]),
    [probeData],
  );
  const isDoubleSided = sideInfo.isDoubleSided;
  // Fall back to the probe's first side if the stored selection is not one of
  // this probe's sides (e.g. a stale value from a previous probe).
  const activeSide = sideInfo.sides.includes(view.overlaySide)
    ? view.overlaySide
    : sideInfo.sides[0];
  // Per-side contact counts, for the "double-sided" badge.
  const sideCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const side of probeData?.probes?.[0]?.contact_sides ?? []) {
      counts[side] = (counts[side] ?? 0) + 1;
    }
    return counts;
  }, [probeData]);

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

  // Smart initial zoom and pan for very tall probes (like Neuropixels)
  // When probe geometry has extreme aspect ratio, zoom in so probe is ~1/3 of viewport width
  // and pan to show the bottom (base) of the probe
  const lastSmartZoomProbeId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!probeData || !selectedProbeId) return;
    if (lastSmartZoomProbeId.current === selectedProbeId) return;
    // Wait for canvas size to be available
    if (canvasSize.width === 0 || canvasSize.height === 0) return;

    // Get current view state directly from store (not stale closure value)
    const currentCamera = useAppStore.getState().view.camera;
    const hasUrlViewState = currentCamera.zoom !== 1 || currentCamera.centerX !== null || currentCamera.centerY !== null;
    if (hasUrlViewState) {
      lastSmartZoomProbeId.current = selectedProbeId;
      return;
    }

    const probe = probeData.probes?.[0];
    if (!probe) return;

    const positions = probe.contact_positions ?? [];
    const contour = probe.probe_planar_contour ?? [];
    if (positions.length === 0) return;

    // Calculate geometry bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const updateBounds = (point: number[]) => {
      const [x, y] = point;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };
    positions.forEach(updateBounds);
    contour.forEach(updateBounds);

    const width = Math.max(10, maxX - minX);
    const height = Math.max(10, maxY - minY);
    const centerX = minX + width / 2;
    const aspectRatio = height / width;

    const TALL_THRESHOLD = 10;
    const TARGET_WIDTH_FRACTION = 1 / 3;

    if (aspectRatio > TALL_THRESHOLD) {
      // For very tall probes, start zoomed in
      const initialZoom = aspectRatio * TARGET_WIDTH_FRACTION;
      setZoom(initialZoom);

      // Set view center to show the bottom (base) of the probe
      // We want minY (probe base) to appear near bottom of viewport
      // Calculate the Y coordinate that should be at screen center
      const mainPadding = 40;
      const mainAvailW = Math.max(10, canvasSize.width - mainPadding * 2);
      const mainAvailH = Math.max(10, canvasSize.height - mainPadding * 2);
      const mainBaseScale = Math.min(mainAvailW / width, mainAvailH / height);
      const mainScale = mainBaseScale * initialZoom;

      // How much of probe height fits in the viewport?
      const viewportHeightInProbeUnits = (canvasSize.height - mainPadding * 2) / mainScale;
      // Center the view so minY is near the bottom edge
      const initialViewCenterY = minY + viewportHeightInProbeUnits / 2;

      setViewCenter(centerX, initialViewCenterY);
    }

    lastSmartZoomProbeId.current = selectedProbeId;
  }, [probeData, selectedProbeId, setZoom, setViewCenter, canvasSize.width, canvasSize.height]);

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
            Export PNG
          </button>
          <button
            type="button"
            className="viewer-download"
            onClick={handleExportSvg}
            title="Export current view as SVG (transparent background). If scale bar is enabled, it will be included."
          >
            Export SVG
          </button>
        </div>
      </header>

      <section className="viewer-controls">
        <div className="viewer-controls-group">
          <button
            type="button"
            onClick={() => setZoom(Math.min(view.camera.zoom * 1.5, VIEW_ZOOM_MAX))}
            title="Zoom in"
          >
            {ZoomInIcon}
          </button>
          <button
            type="button"
            onClick={() => setZoom(Math.max(view.camera.zoom / 1.5, VIEW_ZOOM_MIN))}
            title="Zoom out"
          >
            {ZoomOutIcon}
          </button>
          <button type="button" onClick={() => resetView()} title="Show full probe">
            Full Probe View
          </button>
          <button
            type="button"
            onClick={handleShareView}
            title="Copy a link to the current view"
            aria-label="Copy a link to the current view"
          >
            {shareCopied ? (
              <>
                {CheckIcon}
                Copied view to clipboard!
              </>
            ) : (
              <>
                {ShareIcon}
                Share View
              </>
            )}
          </button>
        </div>
        <div className="viewer-controls-group">
          {hasContactIds && (
            <label className="viewer-toggle">
              <input
                type="checkbox"
                checked={view.showContactIds}
                onChange={(event) => toggleContactIds(event.target.checked)}
              />
              Show contact IDs
            </label>
          )}
          <label className="viewer-toggle">
            <input
              type="checkbox"
              checked={view.showScaleBar}
              onChange={(event) => toggleScaleBar(event.target.checked)}
            />
            Scale bar
          </label>
          <label className="viewer-toggle">
            <input
              type="checkbox"
              checked={view.showOverview}
              onChange={(event) => toggleOverview(event.target.checked)}
            />
            Overview
          </label>
        </div>
        {isDoubleSided && (
          <div className="viewer-controls-group viewer-controls-sides">
            <span className="viewer-controls-label">
              Double-sided ·{" "}
              {sideInfo.sides.map((side) => `${sideCounts[side] ?? 0} ${side}`).join(" / ")}
            </span>
            <div className="viewer-segmented" role="group" aria-label="Which face to show">
              {sideInfo.sides.map((side) => (
                <button
                  key={side}
                  type="button"
                  className={activeSide === side ? "is-active" : ""}
                  onClick={() => setOverlaySide(side)}
                  title={`Show the ${side} face channel map`}
                >
                  <span className={`viewer-side-swatch viewer-side-swatch--${side}`} />
                  {side}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="viewer-canvas" ref={canvasContainerRef}>
        {status === "error" && (
          <div className="viewer-placeholder viewer-placeholder--error">
            <p>{statusMessage ?? "Failed to load probe data."}</p>
          </div>
        )}
        {status !== "error" && probeData && (
          <>
            {isDoubleSided ? (
              <DoubleSidedProbeCanvas
                entry={entry}
                probeData={probeData}
                camera={view.camera}
                showScaleBar={view.showScaleBar}
                overlaySide={activeSide}
                onViewCenterChange={(x, y) => setViewCenter(x, y)}
                onZoom={(value) => setZoom(value)}
              />
            ) : (
              <ProbeCanvas
                entry={entry}
                probeData={probeData}
                camera={view.camera}
                showContactIds={view.showContactIds}
                showScaleBar={view.showScaleBar}
                onViewCenterChange={(x, y) => setViewCenter(x, y)}
                onZoom={(value) => setZoom(value)}
              />
            )}
            {view.showOverview && (
              <ProbeOverview
                probeData={probeData}
                camera={view.camera}
                mainWidth={canvasSize.width}
                mainHeight={canvasSize.height}
                onViewCenterChange={(x, y) => setViewCenter(x, y)}
              />
            )}
          </>
        )}
        {status === "loading" && (
          <div className="viewer-placeholder">
            <p>Loading probe geometry…</p>
          </div>
        )}
      </section>

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
