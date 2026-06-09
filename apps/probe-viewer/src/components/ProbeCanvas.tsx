import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import { useResizeObserver } from "../hooks/useResizeObserver";
import { VIEW_ZOOM_MAX, VIEW_ZOOM_MIN } from "../state/useAppStore";
import type {
  ContactShapeParams,
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Expose canvas to parent for export
  useImperativeHandle(ref, () => canvasRef.current!, []);
  const { ref: containerRef, size } = useResizeObserver<HTMLDivElement>();
  const [isDragging, setIsDragging] = useState(false);
  const dragOriginRef = useRef<{ x: number; y: number; viewCenterX: number; viewCenterY: number } | null>(null);
  // Track the last applied canvas backing-store size so we only reallocate (an
  // expensive clear + realloc of the whole pixel buffer) when the size or
  // device-pixel-ratio actually changes, not on every pan/zoom redraw.
  const lastCanvasSizeRef = useRef({ w: 0, h: 0, dpr: 0 });
  // Coalesce pan updates to one per animation frame: pointermove fires far more
  // often than the screen repaints, so we keep only the latest target.
  const panRafRef = useRef(0);
  const pendingViewCenterRef = useRef<{ x: number; y: number } | null>(null);

  const geometry = useMemo(() => computeGeometrySummary(probeData), [probeData]);
  const probe = useMemo(() => probeData.probes?.[0], [probeData]);

  // Calculate effective view center (use geometry center if null)
  const effectiveViewCenterX = centerX ?? geometry?.centerX ?? 0;
  const effectiveViewCenterY = centerY ?? geometry?.centerY ?? 0;

  useEffect(() => {
    if (!canvasRef.current || !size.width || !size.height || !geometry || !probe) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

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

    const padding = 40;
    const availableWidth = Math.max(10, widthPx - padding * 2);
    const availableHeight = Math.max(10, heightPx - padding * 2);
    const baseScale = Math.min(
      availableWidth / geometry.width,
      availableHeight / geometry.height,
    );
    const scale = baseScale * zoom;

    // Calculate pixel pan from view center in probe coordinates
    const panX = (geometry.centerX - effectiveViewCenterX) * scale;
    const panY = (effectiveViewCenterY - geometry.centerY) * scale;

    const offsetX = widthPx / 2 + panX;
    const offsetY = heightPx / 2 + panY;

    const projectPoint = (point: number[]) => {
      const [x, y] = point;
      const normX = (x - geometry.centerX) * scale + offsetX;
      const normY = -(y - geometry.centerY) * scale + offsetY;
      return [normX, normY];
    };

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

    // Helper to draw a contact shape
    const drawContactShape = (
      x: number,
      y: number,
      shape: string,
      params: ContactShapeParams,
    ) => {
      ctx.beginPath();
      switch (shape) {
        case "circle": {
          const radius = (params.radius ?? 5) * scale;
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          break;
        }
        case "square": {
          const side = (params.width ?? 10) * scale;
          ctx.rect(x - side / 2, y - side / 2, side, side);
          break;
        }
        case "rect": {
          const w = (params.width ?? 10) * scale;
          const h = (params.height ?? 15) * scale;
          ctx.rect(x - w / 2, y - h / 2, w, h);
          break;
        }
        default: {
          // Unknown/missing shape: draw a dot with X to indicate missing data
          const markerSize = Math.max(3, Math.min(10, 7 * (scale / 100)));
          // Draw small circle
          ctx.arc(x, y, markerSize * 0.4, 0, Math.PI * 2);
          ctx.closePath();
          // Draw X through the center
          ctx.moveTo(x - markerSize, y - markerSize);
          ctx.lineTo(x + markerSize, y + markerSize);
          ctx.moveTo(x + markerSize, y - markerSize);
          ctx.lineTo(x - markerSize, y + markerSize);
        }
      }
    };

    // Shadow offset for depth effect - subtle, proportional to scale
    const shadowOffset = 0.4 * scale;  // 0.4 micrometer offset for subtle depth

    // First pass: draw shadows (offset dark shapes)
    contactPositions.forEach((position, index) => {
      const [x, y] = projectPoint(position);
      const shape = contactShapes[index] ?? "";
      const params = contactShapeParams[index] ?? {};

      drawContactShape(x + shadowOffset, y + shadowOffset, shape, params);
      ctx.fillStyle = "rgba(30, 20, 5, 0.7)";  // Even darker and more opaque
      ctx.fill();
    });

    // Second pass: draw gold contacts on top
    contactPositions.forEach((position, index) => {
      const [x, y] = projectPoint(position);
      const shape = contactShapes[index] ?? "";
      const params = contactShapeParams[index] ?? {};

      drawContactShape(x, y, shape, params);

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

    // === L-Shaped Scale Bar ===
    // Renders a scale bar in the bottom-left corner showing reference lengths
    // for both X and Y dimensions. The length adapts to zoom level using "nice" numbers.
    const renderScaleBar = () => {
      // Calculate adaptive scale bar length using "nice" numbers
      const niceNumbers = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
      const targetPixels = 80; // Target bar length in pixels
      const targetUm = targetPixels / scale;
      const scaleBarUm = niceNumbers.reduce((prev, curr) =>
        Math.abs(curr - targetUm) < Math.abs(prev - targetUm) ? curr : prev
      );
      const scaleBarPixels = scaleBarUm * scale;

      // Position: bottom-left corner
      const margin = 20;
      const cornerX = margin;
      const cornerY = heightPx - margin;
      const tickSize = 4;

      // Style for L shape
      ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
      ctx.lineWidth = 2;
      ctx.lineCap = "square";

      // Draw L shape
      ctx.beginPath();
      // Vertical arm (Y) - goes up from corner
      ctx.moveTo(cornerX, cornerY);
      ctx.lineTo(cornerX, cornerY - scaleBarPixels);
      // Horizontal arm (X) - goes right from corner
      ctx.moveTo(cornerX, cornerY);
      ctx.lineTo(cornerX + scaleBarPixels, cornerY);
      ctx.stroke();

      // End ticks
      ctx.beginPath();
      // Top of vertical arm
      ctx.moveTo(cornerX - tickSize, cornerY - scaleBarPixels);
      ctx.lineTo(cornerX + tickSize, cornerY - scaleBarPixels);
      // Right of horizontal arm
      ctx.moveTo(cornerX + scaleBarPixels, cornerY - tickSize);
      ctx.lineTo(cornerX + scaleBarPixels, cornerY + tickSize);
      ctx.stroke();

      // Labels
      const label = scaleBarUm >= 1000 ? `${scaleBarUm / 1000} mm` : `${scaleBarUm} μm`;
      ctx.font = '11px "Inter", sans-serif';
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";

      // X label (below horizontal arm)
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, cornerX + scaleBarPixels / 2, cornerY + 5);

      // Y label (rotated, to the left of vertical arm)
      ctx.save();
      ctx.translate(cornerX - 6, cornerY - scaleBarPixels / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    };

    if (showScaleBar) {
      renderScaleBar();
    }
  }, [entry.id, effectiveViewCenterX, effectiveViewCenterY, geometry, probe, probeData, showContactIds, showScaleBar, size.height, size.width, zoom]);

  const clampZoom = useCallback(
    (value: number) => Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, value)),
    [],
  );

  // Helper to calculate scale (needed for coordinate conversion in handlers)
  const getScale = useCallback(() => {
    if (!size.width || !size.height || !geometry) return 1;
    const padding = 40;
    const availableWidth = Math.max(10, size.width - padding * 2);
    const availableHeight = Math.max(10, size.height - padding * 2);
    const baseScale = Math.min(
      availableWidth / geometry.width,
      availableHeight / geometry.height,
    );
    return baseScale * zoom;
  }, [geometry, size.width, size.height, zoom]);

  // Wheel-to-zoom is attached as a NATIVE, non-passive listener (not React's
  // onWheel) so preventDefault() actually stops the page from scrolling. React
  // registers wheel handlers as passive by default, which ignores preventDefault()
  // and lets the page scroll while we zoom. The listener lives only on the canvas.
  // Live values are read through a ref so the listener does not re-subscribe on
  // every zoom/pan change; it only re-attaches when the canvas itself changes.
  const wheelStateRef = useRef({
    zoom,
    effectiveViewCenterX,
    effectiveViewCenterY,
    geometry,
    getScale,
    clampZoom,
    onViewCenterChange,
    onZoom,
  });
  wheelStateRef.current = {
    zoom,
    effectiveViewCenterX,
    effectiveViewCenterY,
    geometry,
    getScale,
    clampZoom,
    onViewCenterChange,
    onZoom,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const {
        zoom,
        effectiveViewCenterX,
        effectiveViewCenterY,
        geometry,
        getScale,
        clampZoom,
        onViewCenterChange,
        onZoom,
      } = wheelStateRef.current;
      if (!geometry) return;

      // Normalize wheel units so zoom speed is consistent across devices: mouse
      // wheels often report "line" deltas, trackpads report pixels.
      const unit =
        event.deltaMode === 1
          ? 16 // lines -> ~16px
          : event.deltaMode === 2
            ? canvas.clientHeight // pages -> viewport height
            : 1; // already pixels
      // Holding Shift moves the scroll onto the horizontal axis on most systems.
      const delta = (event.deltaY || event.deltaX) * unit;

      const rect = canvas.getBoundingClientRect();
      const offsetFromCenterX = event.clientX - rect.left - rect.width / 2;
      const offsetFromCenterY = event.clientY - rect.top - rect.height / 2;

      const scale = getScale();
      const panX = (geometry.centerX - effectiveViewCenterX) * scale;
      const panY = (effectiveViewCenterY - geometry.centerY) * scale;

      const zoomFactor = Math.exp(-delta * 0.002);
      const nextZoom = clampZoom(zoom * zoomFactor);
      const actualZoomFactor = nextZoom / zoom;

      // Keep the point under the cursor fixed. The (1 - factor) sign anchors the
      // zoom at the cursor; (factor - 1) would anchor at the cursor's mirror across
      // the center, which is what made zoom feel like it pulled toward the middle.
      const newPanX = panX * actualZoomFactor + offsetFromCenterX * (1 - actualZoomFactor);
      const newPanY = panY * actualZoomFactor + offsetFromCenterY * (1 - actualZoomFactor);

      // Convert back to probe coordinates.
      const newScale = scale * actualZoomFactor;
      const newViewCenterX = geometry.centerX - newPanX / newScale;
      const newViewCenterY = geometry.centerY + newPanY / newScale;

      onViewCenterChange(newViewCenterX, newViewCenterY);
      onZoom(nextZoom);
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [geometry, probe]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    setIsDragging(true);
    dragOriginRef.current = {
      x: event.clientX,
      y: event.clientY,
      viewCenterX: effectiveViewCenterX,
      viewCenterY: effectiveViewCenterY,
    };
    (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
  }, [effectiveViewCenterX, effectiveViewCenterY]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDragging || !dragOriginRef.current) {
      return;
    }
    event.preventDefault();
    const deltaX = event.clientX - dragOriginRef.current.x;
    const deltaY = event.clientY - dragOriginRef.current.y;

    // Convert pixel delta to probe coordinate delta, but only apply one update
    // per animation frame so a flood of pointermove events collapses into a
    // single redraw.
    const scale = getScale();
    pendingViewCenterRef.current = {
      x: dragOriginRef.current.viewCenterX - deltaX / scale,
      y: dragOriginRef.current.viewCenterY + deltaY / scale,
    };
    if (!panRafRef.current) {
      panRafRef.current = requestAnimationFrame(() => {
        panRafRef.current = 0;
        const pending = pendingViewCenterRef.current;
        if (pending) onViewCenterChange(pending.x, pending.y);
      });
    }
  }, [getScale, isDragging, onViewCenterChange]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      event.preventDefault();
      // Flush any pending coalesced pan so the final position is exact.
      if (panRafRef.current) {
        cancelAnimationFrame(panRafRef.current);
        panRafRef.current = 0;
      }
      const pending = pendingViewCenterRef.current;
      if (pending) {
        onViewCenterChange(pending.x, pending.y);
        pendingViewCenterRef.current = null;
      }
      setIsDragging(false);
      dragOriginRef.current = null;
      (event.target as HTMLCanvasElement).releasePointerCapture(event.pointerId);
    }
  }, [isDragging, onViewCenterChange]);

  // Cancel any pending pan frame on unmount.
  useEffect(() => {
    return () => {
      if (panRafRef.current) cancelAnimationFrame(panRafRef.current);
    };
  }, []);

  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      if (!geometry) return;

      // Get click position relative to canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Canvas center
      const canvasCenterX = rect.width / 2;
      const canvasCenterY = rect.height / 2;

      // Mouse offset from center
      const offsetFromCenterX = mouseX - canvasCenterX;
      const offsetFromCenterY = mouseY - canvasCenterY;

      // Calculate scale and pan in pixels
      const scale = getScale();
      const panX = (geometry.centerX - effectiveViewCenterX) * scale;
      const panY = (effectiveViewCenterY - geometry.centerY) * scale;

      // Calculate new zoom
      const zoomFactor = event.shiftKey ? 1 / 1.5 : 1.5;
      const nextZoom = clampZoom(zoom * zoomFactor);
      const actualZoomFactor = nextZoom / zoom;

      // Adjust pan so the clicked point stays fixed (see wheel handler note on
      // the (1 - factor) sign that anchors at the cursor rather than its mirror).
      const newPanX = panX * actualZoomFactor + offsetFromCenterX * (1 - actualZoomFactor);
      const newPanY = panY * actualZoomFactor + offsetFromCenterY * (1 - actualZoomFactor);

      // Convert back to probe coordinates
      const newScale = scale * actualZoomFactor;
      const newViewCenterX = geometry.centerX - newPanX / newScale;
      const newViewCenterY = geometry.centerY + newPanY / newScale;

      onViewCenterChange(newViewCenterX, newViewCenterY);
      onZoom(nextZoom);
    },
    [clampZoom, effectiveViewCenterX, effectiveViewCenterY, geometry, getScale, onViewCenterChange, onZoom, zoom],
  );

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
