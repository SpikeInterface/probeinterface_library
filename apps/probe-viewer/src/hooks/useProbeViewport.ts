import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";

import { VIEW_ZOOM_MAX, VIEW_ZOOM_MIN } from "../state/useAppStore";
import type { ProbeViewerCamera } from "../types/probe";

// The probe-space bounding box the viewport frames. Both the single-sided and
// double-sided canvases compute one of these and hand it to the hook.
export interface ViewportGeometry {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

// Projection from probe coordinates (micrometers, y-up) to canvas pixels
// (y-down). `scale` is pixels per micrometer at the current zoom.
export interface Projection {
  scale: number;
  offsetX: number;
  offsetY: number;
  projectPoint: (point: number[]) => [number, number];
}

interface UseProbeViewportArgs {
  geometry: ViewportGeometry | null;
  camera: ProbeViewerCamera;
  size: ViewportSize;
  onViewCenterChange: (x: number | null, y: number | null) => void;
  onZoom: (zoom: number) => void;
}

const PADDING = 40;

// Camera + interaction logic shared by every probe canvas. This is a verbatim
// extraction of the pan/zoom/projection math that used to live inside
// ProbeCanvas; keeping it in one place means a scroll-zoom or drag fix lands for
// both the single-sided and double-sided views at once. The hook owns no
// drawing: each canvas component runs its own draw effect using getProjection().
export function useProbeViewport({
  geometry,
  camera,
  size,
  onViewCenterChange,
  onZoom,
}: UseProbeViewportArgs) {
  const { zoom, centerX, centerY } = camera;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragOriginRef = useRef<{
    x: number;
    y: number;
    viewCenterX: number;
    viewCenterY: number;
  } | null>(null);
  // Coalesce pan updates to one per animation frame: pointermove fires far more
  // often than the screen repaints, so we keep only the latest target.
  const panRafRef = useRef(0);
  const pendingViewCenterRef = useRef<{ x: number; y: number } | null>(null);

  // Use geometry center when the camera has no explicit center yet.
  const effectiveViewCenterX = centerX ?? geometry?.centerX ?? 0;
  const effectiveViewCenterY = centerY ?? geometry?.centerY ?? 0;

  const clampZoom = useCallback(
    (value: number) => Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, value)),
    [],
  );

  const getScale = useCallback(() => {
    if (!size.width || !size.height || !geometry) return 1;
    const availableWidth = Math.max(10, size.width - PADDING * 2);
    const availableHeight = Math.max(10, size.height - PADDING * 2);
    const baseScale = Math.min(
      availableWidth / geometry.width,
      availableHeight / geometry.height,
    );
    return baseScale * zoom;
  }, [geometry, size.width, size.height, zoom]);

  // Current projection from probe coordinates to canvas pixels. Recomputed on
  // demand so the draw effect always sees the live camera.
  const getProjection = useCallback((): Projection | null => {
    if (!geometry || !size.width || !size.height) return null;
    const scale = getScale();
    const panX = (geometry.centerX - effectiveViewCenterX) * scale;
    const panY = (effectiveViewCenterY - geometry.centerY) * scale;
    const offsetX = size.width / 2 + panX;
    const offsetY = size.height / 2 + panY;
    const projectPoint = (point: number[]): [number, number] => [
      (point[0] - geometry.centerX) * scale + offsetX,
      -(point[1] - geometry.centerY) * scale + offsetY,
    ];
    return { scale, offsetX, offsetY, projectPoint };
  }, [geometry, size.width, size.height, getScale, effectiveViewCenterX, effectiveViewCenterY]);

  // Wheel-to-zoom is attached as a NATIVE, non-passive listener (not React's
  // onWheel) so preventDefault() actually stops the page from scrolling. React
  // registers wheel handlers as passive by default, which ignores preventDefault()
  // and lets the page scroll while we zoom. Live values are read through a ref so
  // the listener does not re-subscribe on every zoom/pan change; it only
  // re-attaches when the canvas itself changes.
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
    // Re-run once geometry becomes available so the listener attaches after the
    // canvas is actually rendered (it is conditional on geometry being non-null).
    // Live values are still read through wheelStateRef, so this never needs to
    // re-attach on plain zoom/pan changes.
  }, [geometry]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      setIsDragging(true);
      dragOriginRef.current = {
        x: event.clientX,
        y: event.clientY,
        viewCenterX: effectiveViewCenterX,
        viewCenterY: effectiveViewCenterY,
      };
      (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
    },
    [effectiveViewCenterX, effectiveViewCenterY],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
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
    },
    [getScale, isDragging, onViewCenterChange],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
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
    },
    [isDragging, onViewCenterChange],
  );

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

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const canvasCenterX = rect.width / 2;
      const canvasCenterY = rect.height / 2;
      const offsetFromCenterX = mouseX - canvasCenterX;
      const offsetFromCenterY = mouseY - canvasCenterY;

      const scale = getScale();
      const panX = (geometry.centerX - effectiveViewCenterX) * scale;
      const panY = (effectiveViewCenterY - geometry.centerY) * scale;

      // Shift-double-click zooms out; plain double-click zooms in.
      const zoomFactor = event.shiftKey ? 1 / 1.5 : 1.5;
      const nextZoom = clampZoom(zoom * zoomFactor);
      const actualZoomFactor = nextZoom / zoom;

      // Adjust pan so the clicked point stays fixed (see wheel handler note on
      // the (1 - factor) sign that anchors at the cursor rather than its mirror).
      const newPanX = panX * actualZoomFactor + offsetFromCenterX * (1 - actualZoomFactor);
      const newPanY = panY * actualZoomFactor + offsetFromCenterY * (1 - actualZoomFactor);

      const newScale = scale * actualZoomFactor;
      const newViewCenterX = geometry.centerX - newPanX / newScale;
      const newViewCenterY = geometry.centerY + newPanY / newScale;

      onViewCenterChange(newViewCenterX, newViewCenterY);
      onZoom(nextZoom);
    },
    [clampZoom, effectiveViewCenterX, effectiveViewCenterY, geometry, getScale, onViewCenterChange, onZoom, zoom],
  );

  return {
    canvasRef,
    isDragging,
    effectiveViewCenterX,
    effectiveViewCenterY,
    getScale,
    getProjection,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
  };
}
