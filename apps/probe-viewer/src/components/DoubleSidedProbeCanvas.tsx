import { useEffect, useMemo, useRef } from "react";

import { useResizeObserver } from "../hooks/useResizeObserver";
import { useProbeViewport } from "../hooks/useProbeViewport";
import { CONTACT_COLORS, drawContactShape, renderScaleBar } from "../geometry/draw";
import type { ManifestEntry, ProbeInterfaceFile, ProbeViewerCamera } from "../types/probe";

interface DoubleSidedProbeCanvasProps {
  entry: ManifestEntry;
  probeData: ProbeInterfaceFile;
  camera: ProbeViewerCamera;
  showScaleBar: boolean;
  // "both" overlays the faces (registration view); a side name isolates one.
  overlaySide: string;
  onViewCenterChange: (x: number | null, y: number | null) => void;
  onZoom: (zoom: number) => void;
}

interface GeometrySummary {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

// Bounds over the raw contacts and contour (true positions — the overlay never
// displaces a face, so framing is just the probe's own extent).
function computeGeometry(positions: number[][], contour: number[][]): GeometrySummary | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const update = (point: number[]) => {
    if (point[0] < minX) minX = point[0];
    if (point[0] > maxX) maxX = point[0];
    if (point[1] < minY) minY = point[1];
    if (point[1] > maxY) maxY = point[1];
  };
  positions.forEach(update);
  contour.forEach(update);
  if (!Number.isFinite(minX)) return null;
  const width = Math.max(10, maxX - minX);
  const height = Math.max(10, maxY - minY);
  return { width, height, centerX: minX + width / 2, centerY: minY + height / 2 };
}

function colorForSide(side: string | undefined) {
  return side === "back" ? CONTACT_COLORS.back : CONTACT_COLORS.front;
}

export function DoubleSidedProbeCanvas({
  entry,
  probeData,
  camera,
  showScaleBar,
  overlaySide,
  onViewCenterChange,
  onZoom,
}: DoubleSidedProbeCanvasProps) {
  const { zoom, centerX, centerY } = camera;
  const { ref: containerRef, size } = useResizeObserver<HTMLDivElement>();
  const lastCanvasSizeRef = useRef({ w: 0, h: 0, dpr: 0 });

  const probe = probeData.probes?.[0];
  const geometry = useMemo(() => {
    if (!probe) return null;
    return computeGeometry(probe.contact_positions ?? [], probe.probe_planar_contour ?? []);
  }, [probe]);

  const {
    canvasRef,
    getProjection,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
  } = useProbeViewport({ geometry, camera, size, onViewCenterChange, onZoom });

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

    // Shared shank outline (both faces occupy the same shank).
    const contour = probe.probe_planar_contour ?? [];
    if (contour.length > 1) {
      ctx.beginPath();
      contour.forEach((point, index) => {
        const [x, y] = projectPoint(point);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(180, 185, 195, 0.7)";
      ctx.strokeStyle = "rgba(100, 105, 115, 0.95)";
      ctx.lineWidth = Math.max(1.2, 2.5 * (scale / 100));
      ctx.fill();
      ctx.stroke();
    }

    const positions = probe.contact_positions ?? [];
    const sides = probe.contact_sides ?? [];
    const contactShapes = probe.contact_shapes ?? [];
    const contactShapeParams = probe.contact_shape_params ?? [];

    // The view shows one face at a time as its own channel map: that face's
    // contacts in the face color, drawn solid. Front and back share positions,
    // so only one set is ever on screen, which is why the IDs below never collide.
    const colors = colorForSide(overlaySide);
    ctx.fillStyle = colors.fill;
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = Math.max(1.2, 2.5 * (scale / 150));
    positions.forEach((position, index) => {
      if ((sides[index] ?? "front") !== overlaySide) return;
      const [x, y] = projectPoint(position);
      drawContactShape(ctx, x, y, contactShapes[index] ?? "", contactShapeParams[index] ?? {}, scale);
      ctx.fill();
      ctx.stroke();
    });

    // Contact IDs make the isolated face a channel map (the point of the view).
    if (probe.contact_ids) {
      const contactIds = probe.contact_ids;
      ctx.font = `${Math.max(10, Math.min(14, 10 * (scale / 100)))}px "Inter", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      positions.forEach((position, index) => {
        if ((sides[index] ?? "front") !== overlaySide) return;
        const [x, y] = projectPoint(position);
        ctx.fillText(String(contactIds[index] ?? index), x, y + 4);
      });
    }

    if (showScaleBar) {
      renderScaleBar(ctx, scale, heightPx);
    }
  }, [canvasRef, entry.id, geometry, getProjection, overlaySide, probe, showScaleBar, size.height, size.width, zoom, centerX, centerY]);

  return (
    <div ref={containerRef} className="viewer-canvas-surface">
      {geometry && probe ? (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${entry.displayName} planar layout (double-sided)`}
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
