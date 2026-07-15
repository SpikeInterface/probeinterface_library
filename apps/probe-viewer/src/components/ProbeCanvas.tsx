import { useEffect, useMemo, useRef } from "react";

import { useResizeObserver } from "../hooks/useResizeObserver";
import { useProbeViewport } from "../hooks/useProbeViewport";
import { computeGeometry } from "../geometry/viewport";
import {
  CONTACT_COLORS,
  computeIdLabelInfo,
  drawContactIds,
  drawContactShape,
  renderScaleBar,
} from "../geometry/draw";
import type {
  ManifestEntry,
  ProbeInterfaceFile,
  ProbeViewerCamera,
} from "../types/probe";

interface ProbeCanvasProps {
  entry: ManifestEntry;
  probeData: ProbeInterfaceFile;
  camera: ProbeViewerCamera;
  maxZoom: number;
  showContactIds: boolean;
  showScaleBar: boolean;
  onViewCenterChange: (x: number | null, y: number | null) => void;
  onZoom: (zoom: number) => void;
}

export function ProbeCanvas({
  entry,
  probeData,
  camera,
  maxZoom,
  showContactIds,
  showScaleBar,
  onViewCenterChange,
  onZoom,
}: ProbeCanvasProps) {
  const { zoom, centerX, centerY } = camera;
  const { ref: containerRef, size } = useResizeObserver<HTMLDivElement>();
  // Track the last applied canvas backing-store size so we only reallocate (an
  // expensive clear + realloc of the whole pixel buffer) when the size or
  // device-pixel-ratio actually changes, not on every pan/zoom redraw.
  const lastCanvasSizeRef = useRef({ w: 0, h: 0, dpr: 0 });

  const probe = useMemo(() => probeData.probes?.[0], [probeData]);
  const geometry = useMemo(() => {
    if (!probe) return null;
    return computeGeometry(
      probe.contact_positions ?? [],
      probe.probe_planar_contour ?? [],
    );
  }, [probe]);

  // Uniform contact-id sizing info (widest label + smallest pad in µm). These are
  // zoom-independent, so they are computed once per probe.
  const labelInfo = useMemo(() => computeIdLabelInfo(probe), [probe]);

  const {
    canvasRef,
    getProjection,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
  } = useProbeViewport({
    geometry,
    camera,
    size,
    maxZoom,
    onViewCenterChange,
    onZoom,
  });

  useEffect(() => {
    if (!canvasRef.current || !size.width || !size.height || !geometry || !probe) {
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const projection = getProjection();
    if (!projection) return;
    const { scale, projectPoint } = projection;

    const devicePixelRatio = window.devicePixelRatio || 1;
    const widthPx = size.width;
    const heightPx = size.height;
    // Only reallocate the backing store when the size/dpr actually changes;
    // assigning canvas.width/height clears and reallocates the whole pixel
    // buffer, so doing it on every pan frame is wasteful (especially on dense,
    // zoomed-in probes like Neuropixels). The per-frame clear below is cheap.
    const targetW = Math.round(widthPx * devicePixelRatio);
    const targetH = Math.round(heightPx * devicePixelRatio);
    const lastSize = lastCanvasSizeRef.current;
    if (lastSize.w !== targetW || lastSize.h !== targetH || lastSize.dpr !== devicePixelRatio) {
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = `${widthPx}px`;
      canvas.style.height = `${heightPx}px`;
      lastCanvasSizeRef.current = { w: targetW, h: targetH, dpr: devicePixelRatio };
    }
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Technical line-art: a faint cool wash so the shank reads as a region, with
    // a thin precise outline. No fill gradient or shadow.
    const contour = probe.probe_planar_contour ?? [];
    if (contour.length > 1) {
      ctx.beginPath();
      contour.forEach((point, index) => {
        const [x, y] = projectPoint(point);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(51, 65, 85, 0.05)";
      ctx.fill();
      ctx.strokeStyle = "rgba(51, 65, 85, 0.9)";
      ctx.lineWidth = Math.max(1, Math.min(1.6, 2 * (scale / 120)));
      ctx.stroke();
    }

    const positions = probe.contact_positions ?? [];
    const contactShapes = probe.contact_shapes ?? [];
    const contactShapeParams = probe.contact_shape_params ?? [];

    // Flat gold contacts (the recognizable electrode convention), with a defined
    // bronze outline and no gradient or shadow.
    ctx.fillStyle = CONTACT_COLORS.front.fill;
    ctx.strokeStyle = CONTACT_COLORS.front.stroke;
    ctx.lineWidth = Math.max(1, Math.min(1.8, 2.5 * (scale / 150)));
    positions.forEach((position, index) => {
      const [x, y] = projectPoint(position);
      drawContactShape(
        ctx,
        x,
        y,
        contactShapes[index] ?? "",
        contactShapeParams[index] ?? {},
        scale,
      );
      ctx.fill();
      ctx.stroke();
    });

    if (showContactIds && probe.contact_ids && labelInfo) {
      drawContactIds(ctx, {
        positions,
        contactIds: probe.contact_ids,
        labelInfo,
        scale,
        projectPoint,
      });
    }

    if (showScaleBar) {
      renderScaleBar(ctx, scale, heightPx);
    }
  }, [
    canvasRef,
    entry.id,
    geometry,
    getProjection,
    labelInfo,
    probe,
    showContactIds,
    showScaleBar,
    size.height,
    size.width,
    zoom,
    centerX,
    centerY,
  ]);

  return (
    <div ref={containerRef} className="viewer-canvas-surface">
      {geometry && probe ? (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${entry.displayName} planar layout`}
          // Reflect the current view state onto the DOM so end-to-end tests can
          // read it directly (instead of parsing the hash). These mirror the URL
          // params: cx/cy are omitted at the default view, exactly like the URL.
          data-zoom={zoom}
          data-view-cx={centerX ?? undefined}
          data-view-cy={centerY ?? undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        />
      ) : (
        <div className="viewer-placeholder">
          <p>No planar geometry available for this probe.</p>
        </div>
      )}
    </div>
  );
}
