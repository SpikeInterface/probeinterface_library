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

  // Uniform contact-id sizing info (widest label + smallest pad in µm), shared
  // with the single-sided canvas so labels track contact size the same way.
  const labelInfo = useMemo(() => computeIdLabelInfo(probe), [probe]);

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
    // Same fit-to-contact sizing as the single-sided canvas, restricted to the
    // face on screen so labels stay legible and never overflow their pads.
    if (probe.contact_ids && labelInfo) {
      drawContactIds(ctx, {
        positions,
        contactIds: probe.contact_ids,
        labelInfo,
        scale,
        projectPoint,
        shouldDraw: (index) => (sides[index] ?? "front") === overlaySide,
      });
    }

    if (showScaleBar) {
      renderScaleBar(ctx, scale, heightPx);
    }
  }, [canvasRef, entry.id, geometry, getProjection, labelInfo, overlaySide, probe, showScaleBar, size.height, size.width, zoom, centerX, centerY]);

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
