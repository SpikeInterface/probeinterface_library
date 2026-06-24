import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";

import { useResizeObserver } from "../hooks/useResizeObserver";
import { useProbeViewport } from "../hooks/useProbeViewport";
import { drawContactShape, renderScaleBar } from "../geometry/draw";
import type {
  ManifestEntry,
  ProbeInterfaceFile,
  ProbeViewerCamera,
} from "../types/probe";

interface ProbeCanvasProps {
  entry: ManifestEntry;
  probeData: ProbeInterfaceFile;
  camera: ProbeViewerCamera;
  showContactIds: boolean;
  showScaleBar: boolean;
  onViewCenterChange: (x: number | null, y: number | null) => void;
  onZoom: (zoom: number) => void;
}

interface GeometrySummary {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

function computeGeometrySummary(probeData: ProbeInterfaceFile): GeometrySummary | null {
  const probe = probeData.probes?.[0];
  if (!probe) {
    return null;
  }

  const positions = probe.contact_positions ?? [];
  if (positions.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const updateBounds = (point: number[]) => {
    const [x, y] = point;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  positions.forEach(updateBounds);
  (probe.probe_planar_contour ?? []).forEach(updateBounds);

  const width = Math.max(10, maxX - minX);
  const height = Math.max(10, maxY - minY);
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;

  return { minX, maxX, minY, maxY, width, height, centerX, centerY };
}

export const ProbeCanvas = forwardRef<HTMLCanvasElement, ProbeCanvasProps>(
  function ProbeCanvas(
    {
      entry,
      probeData,
      camera,
      showContactIds,
      showScaleBar,
      onViewCenterChange,
      onZoom,
    },
    ref
  ) {
  const { zoom, centerX, centerY } = camera;
  const { ref: containerRef, size } = useResizeObserver<HTMLDivElement>();
  // Track the last applied canvas backing-store size so we only reallocate (an
  // expensive clear + realloc of the whole pixel buffer) when the size or
  // device-pixel-ratio actually changes, not on every pan/zoom redraw.
  const lastCanvasSizeRef = useRef({ w: 0, h: 0, dpr: 0 });

  const geometry = useMemo(() => computeGeometrySummary(probeData), [probeData]);
  const probe = useMemo(() => probeData.probes?.[0], [probeData]);

  const {
    canvasRef,
    getProjection,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
  } = useProbeViewport({ geometry, camera, size, onViewCenterChange, onZoom });

  // Expose canvas to parent for export
  useImperativeHandle(ref, () => canvasRef.current!, [canvasRef]);

  useEffect(() => {
    if (!canvasRef.current || !size.width || !size.height || !geometry || !probe) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

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

    if (probe.probe_planar_contour && probe.probe_planar_contour.length > 1) {
      ctx.beginPath();
      probe.probe_planar_contour.forEach((point, index) => {
        const [x, y] = projectPoint(point);
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(180, 185, 195, 0.7)";  // Metallic silver
      ctx.strokeStyle = "rgba(100, 105, 115, 0.95)";
      ctx.lineWidth = Math.max(1.2, 2.5 * (scale / 100));
      ctx.fill();
      ctx.stroke();
    }

    const contactPositions = probe.contact_positions ?? [];
    const contactShapes = probe.contact_shapes ?? [];
    const contactShapeParams = probe.contact_shape_params ?? [];

    // Shadow offset for depth effect - subtle, proportional to scale
    const shadowOffset = 0.4 * scale;  // 0.4 micrometer offset for subtle depth

    // First pass: draw shadows (offset dark shapes)
    contactPositions.forEach((position, index) => {
      const [x, y] = projectPoint(position);
      const shape = contactShapes[index] ?? "";
      const params = contactShapeParams[index] ?? {};

      drawContactShape(ctx, x + shadowOffset, y + shadowOffset, shape, params, scale);
      ctx.fillStyle = "rgba(30, 20, 5, 0.7)";  // Even darker and more opaque
      ctx.fill();
    });

    // Second pass: draw gold contacts on top
    contactPositions.forEach((position, index) => {
      const [x, y] = projectPoint(position);
      const shape = contactShapes[index] ?? "";
      const params = contactShapeParams[index] ?? {};

      drawContactShape(ctx, x, y, shape, params, scale);

      ctx.fillStyle = "rgba(212, 175, 55, 1.0)";  // Gold contacts - fully opaque to cover shadow
      ctx.strokeStyle = "rgba(80, 60, 15, 0.9)";  // Dark bronze outline
      ctx.lineWidth = Math.max(1.2, 2.5 * (scale / 150));
      ctx.fill();
      ctx.stroke();
    });

    if (showContactIds && probe.contact_ids) {
      const contactIds = probe.contact_ids;
      ctx.font = `${Math.max(10, Math.min(14, 10 * (scale / 100)))}px "Inter", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      contactPositions.forEach((position, index) => {
        const [x, y] = projectPoint(position);
        // Show the probe's actual contact id, not the array index.
        ctx.fillText(String(contactIds[index] ?? index), x, y + 4);
      });
    }

    if (showScaleBar) {
      renderScaleBar(ctx, scale, heightPx);
    }
  }, [canvasRef, entry.id, geometry, getProjection, probe, probeData, showContactIds, showScaleBar, size.height, size.width, zoom, centerX, centerY]);

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
});
