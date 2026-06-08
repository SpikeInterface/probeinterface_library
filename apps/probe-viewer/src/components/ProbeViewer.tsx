import { useCallback, useEffect, useMemo, useRef } from "react";

import { useResizeObserver } from "../hooks/useResizeObserver";
import { useAppStore, VIEW_ZOOM_MAX, VIEW_ZOOM_MIN } from "../state/useAppStore";
import { exportProbeAsPng, exportProbeAsSvg } from "../utils/exportUtils";
import { JsonTree } from "./JsonTree";
import { ProbeCanvas } from "./ProbeCanvas";
import { ProbeOverview } from "./ProbeOverview";

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
  const setPan = useAppStore((state) => state.setPan);
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

  // Track canvas container size for minimap
  const { ref: canvasContainerRef, size: canvasSize } = useResizeObserver<HTMLDivElement>();

  // Export handlers
  const handleExportPng = useCallback(() => {
    if (probeData && entry) {
      exportProbeAsPng(
        probeData,
        { zoom: view.zoom, panX: view.panX, panY: view.panY },
        { width: canvasSize.width, height: canvasSize.height },
        `${entry.id}.png`
      );
    }
  }, [probeData, entry, view.zoom, view.panX, view.panY, canvasSize.width, canvasSize.height]);

  const handleExportSvg = useCallback(() => {
    if (probeData && entry) {
      exportProbeAsSvg(
        probeData,
        { zoom: view.zoom, panX: view.panX, panY: view.panY },
        { width: canvasSize.width, height: canvasSize.height },
        `${entry.id}.svg`
      );
    }
  }, [probeData, entry, view.zoom, view.panX, view.panY, canvasSize.width, canvasSize.height]);

  const lastResetProbeId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (selectedProbeId && lastResetProbeId.current !== selectedProbeId) {
      resetView();
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
    const aspectRatio = height / width;

    const TALL_THRESHOLD = 10;
    const TARGET_WIDTH_FRACTION = 1 / 3;

    if (aspectRatio > TALL_THRESHOLD) {
      // For very tall probes, start zoomed in
      const initialZoom = aspectRatio * TARGET_WIDTH_FRACTION;
      setZoom(initialZoom);

      // Calculate pan to show the bottom of the probe
      // Canvas projection: screenY = -(probeY - centerY) * scale + height/2 + panY
      // minY (probe base) maps to screen bottom, maxY (probe tip) maps to screen top
      // To show the base, we need to shift the view down (negative panY)
      const mainPadding = 40;
      const mainAvailW = Math.max(10, canvasSize.width - mainPadding * 2);
      const mainAvailH = Math.max(10, canvasSize.height - mainPadding * 2);
      const mainBaseScale = Math.min(mainAvailW / width, mainAvailH / height);
      const mainScale = mainBaseScale * initialZoom;

      // At panY=0, probe center is at screen center
      // screenY of minY = -(minY - centerY) * scale + height/2 = (centerY - minY) * scale + height/2
      // We want minY to appear near bottom of viewport (with margin)
      // Target screenY for minY = height - margin
      // So: (centerY - minY) * scale + height/2 + panY = height - margin
      // panY = height - margin - height/2 - (centerY - minY) * scale
      // panY = height/2 - margin - (height/2) * scale  (since centerY - minY = height/2)
      const probeHalfHeightScreen = (height / 2) * mainScale;
      const initialPanY = canvasSize.height / 2 - mainPadding - probeHalfHeightScreen;

      setPan(0, initialPanY);
    }

    lastSmartZoomProbeId.current = selectedProbeId;
  }, [probeData, selectedProbeId, setZoom, setPan, canvasSize.width, canvasSize.height]);

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
            {entry.shankCount} shanks
          </p>
        </div>
        <div className="viewer-header-actions">
          <button type="button" className="viewer-download" onClick={handleExportPng}>
            Export PNG
          </button>
          <button type="button" className="viewer-download" onClick={handleExportSvg}>
            Export SVG
          </button>
          <a
            className="viewer-download"
            href={entry.jsonUrl}
            target="_blank"
            rel="noreferrer"
          >
            Download JSON
          </a>
        </div>
      </header>

      <section className="viewer-controls">
        <div className="viewer-controls-group">
          <button
            type="button"
            onClick={() => setZoom(Math.min(view.zoom * 1.5, VIEW_ZOOM_MAX))}
          >
            Zoom in
          </button>
          <button
            type="button"
            onClick={() => setZoom(Math.max(view.zoom / 1.5, VIEW_ZOOM_MIN))}
          >
            Zoom out
          </button>
          <button type="button" onClick={() => resetView()}>
            Show full probe
          </button>
        </div>
        <div className="viewer-controls-group">
          <label className="viewer-toggle">
            <input
              type="checkbox"
              checked={view.showContactIds}
              onChange={(event) => toggleContactIds(event.target.checked)}
            />
            Show contact IDs
          </label>
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
      </section>

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
              zoom={view.zoom}
              panX={view.panX}
              panY={view.panY}
              showContactIds={view.showContactIds}
              showScaleBar={view.showScaleBar}
              onPan={(nextX, nextY) => setPan(nextX, nextY)}
              onZoom={(value) => setZoom(value)}
            />
            {view.showOverview && (
              <ProbeOverview
                probeData={probeData}
                zoom={view.zoom}
                panX={view.panX}
                panY={view.panY}
                mainWidth={canvasSize.width}
                mainHeight={canvasSize.height}
                onPan={(nextX, nextY) => setPan(nextX, nextY)}
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

      <section className="viewer-json-panel">
        <div className="viewer-json-header">
          <h3>Probe JSON</h3>
          {status === "success" && probeData && (
            <span className="viewer-json-meta">
              {probeData.specification} · v{probeData.version}
            </span>
          )}
        </div>
        {status === "loading" && <p>Fetching probe data…</p>}
        {status === "error" && (
          <p className="viewer-placeholder--error">{statusMessage}</p>
        )}
        {status === "success" && probeData && (
          <div className="viewer-json">
            <JsonTree
              data={probeData}
              name={entry.displayName}
              defaultExpanded={false}
            />
          </div>
        )}
      </section>
    </div>
  );
}
