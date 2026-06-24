import { useEffect, useMemo, useRef } from "react";

import { useResizeObserver } from "../hooks/useResizeObserver";
import { useProbeViewport } from "../hooks/useProbeViewport";
import { CONTACT_COLORS, drawContactShape, renderScaleBar } from "../geometry/draw";
import { buildSideRenderPlan, type SideRenderPlan } from "../geometry/sides";
import type { ManifestEntry, ProbeInterfaceFile, ProbeViewerCamera } from "../types/probe";

interface DoubleSidedProbeCanvasProps {
  entry: ManifestEntry;
  probeData: ProbeInterfaceFile;
  camera: ProbeViewerCamera;
  showContactIds: boolean;
  showScaleBar: boolean;
  prominentSide: string | null;
  // Independent opacity (0–1) per side; a missing side defaults to 1.
  sideOpacity: Record<string, number>;
  // Separation between faces, in probe units (µm).
  offsetUm: number;
  onViewCenterChange: (x: number | null, y: number | null) => void;
  onZoom: (zoom: number) => void;
}

interface GeometrySummary {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

// Bounds over the laid-out contacts and contours. The back face is displaced in
// probe coordinates, so framing must include it; computing from the plan (rather
// than the raw positions) accounts for the offset automatically.
function computeGeometryFromPlan(plan: SideRenderPlan): GeometrySummary | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const update = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  plan.contacts.forEach((contact) => update(contact.x, contact.y));
  plan.contours.forEach((contour) => contour.points.forEach((p) => update(p[0], p[1])));

  if (!Number.isFinite(minX)) return null;

  const width = Math.max(10, maxX - minX);
  const height = Math.max(10, maxY - minY);
  return { width, height, centerX: minX + width / 2, centerY: minY + height / 2 };
}

function colorForSide(side: string | null) {
  return side === "back" ? CONTACT_COLORS.back : CONTACT_COLORS.front;
}

export function DoubleSidedProbeCanvas({
  entry,
  probeData,
  camera,
  showContactIds,
  showScaleBar,
  prominentSide,
  sideOpacity,
  offsetUm,
  onViewCenterChange,
  onZoom,
}: DoubleSidedProbeCanvasProps) {
  const { zoom, centerX, centerY } = camera;
  const { ref: containerRef, size } = useResizeObserver<HTMLDivElement>();
  const lastCanvasSizeRef = useRef({ w: 0, h: 0, dpr: 0 });

  const probe = probeData.probes?.[0];
  const plan = useMemo(
    () => (probe ? buildSideRenderPlan(probe, prominentSide, offsetUm) : null),
    [probe, prominentSide, offsetUm],
  );
  const geometry = useMemo(() => (plan ? computeGeometryFromPlan(plan) : null), [plan]);

  const {
    canvasRef,
    getProjection,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
  } = useProbeViewport({ geometry, camera, size, onViewCenterChange, onZoom });

  useEffect(() => {
    if (!canvasRef.current || !size.width || !size.height || !geometry || !probe || !plan) {
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

    const contactShapes = probe.contact_shapes ?? [];
    const contactShapeParams = probe.contact_shape_params ?? [];

    const drawContour = (points: number[][]) => {
      ctx.beginPath();
      points.forEach((point, index) => {
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
    };

    // Draw each face (shank outline + its contacts) as a unit, the prominent face
    // last (on top) with adjustable opacity. The whole back face is already
    // displaced in the plan, so the outline and contacts shift together.
    const facesInOrder = [...plan.info.sides].sort(
      (a, b) => Number(a === prominentSide) - Number(b === prominentSide),
    );

    facesInOrder.forEach((side) => {
      const alpha = sideOpacity[side] ?? 1;
      if (alpha === 0) return;
      ctx.globalAlpha = alpha;

      const contour = plan.contours.find((c) => c.side === side);
      if (contour) drawContour(contour.points);

      const colors = colorForSide(side);
      ctx.fillStyle = colors.fill;
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = Math.max(1.2, 2.5 * (scale / 150));
      plan.contacts.forEach((contact) => {
        if (contact.side !== side) return;
        const [px, py] = projectPoint([contact.x, contact.y]);
        const shape = contactShapes[contact.index] ?? "";
        const params = contactShapeParams[contact.index] ?? {};
        drawContactShape(ctx, px, py, shape, params, scale);
        ctx.fill();
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
    });

    // Contact IDs for the prominent (focused) face only; the two faces sit close
    // together, so showing both sets would overlap.
    if (showContactIds && probe.contact_ids) {
      const contactIds = probe.contact_ids;
      ctx.font = `${Math.max(10, Math.min(14, 10 * (scale / 100)))}px "Inter", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      plan.contacts.forEach((contact) => {
        if (contact.side !== prominentSide) return;
        const [px, py] = projectPoint([contact.x, contact.y]);
        ctx.fillText(String(contactIds[contact.index] ?? contact.index), px, py + 4);
      });
    }

    if (showScaleBar) {
      renderScaleBar(ctx, scale, heightPx);
    }
  }, [canvasRef, entry.id, geometry, getProjection, plan, prominentSide, probe, showContactIds, showScaleBar, size.height, size.width, zoom, centerX, centerY, sideOpacity]);

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
