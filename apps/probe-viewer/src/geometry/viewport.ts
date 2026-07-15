import type { ProbeViewerCamera } from "../types/probe";

// The probe-space bounding box the viewport frames.
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

// Margin (px) reserved around the probe when fitting it to the viewport.
export const VIEWPORT_PADDING = 40;

// Bounds over the contacts and contour (true positions frame the probe). Shared
// by every viewport consumer so framing is computed one way everywhere.
export function computeGeometry(
  positions: number[][],
  contour: number[][],
): ViewportGeometry | null {
  if (positions.length === 0) return null;
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

// Pixels-per-micrometer: the base scale that fits the probe into the padded
// viewport, times the current zoom.
export function computeScale(
  geometry: ViewportGeometry | null,
  size: ViewportSize,
  zoom: number,
): number {
  if (!size.width || !size.height || !geometry) return 1;
  const availableWidth = Math.max(10, size.width - VIEWPORT_PADDING * 2);
  const availableHeight = Math.max(10, size.height - VIEWPORT_PADDING * 2);
  const baseScale = Math.min(
    availableWidth / geometry.width,
    availableHeight / geometry.height,
  );
  return baseScale * zoom;
}

// Projection for the current camera. Returns null when there is nothing to
// frame yet (no geometry or an unmeasured canvas).
export function computeProjection(
  geometry: ViewportGeometry | null,
  camera: ProbeViewerCamera,
  size: ViewportSize,
): Projection | null {
  if (!geometry || !size.width || !size.height) return null;
  const effectiveViewCenterX = camera.centerX ?? geometry.centerX;
  const effectiveViewCenterY = camera.centerY ?? geometry.centerY;
  const scale = computeScale(geometry, size, camera.zoom);
  const panX = (geometry.centerX - effectiveViewCenterX) * scale;
  const panY = (effectiveViewCenterY - geometry.centerY) * scale;
  const offsetX = size.width / 2 + panX;
  const offsetY = size.height / 2 + panY;
  const projectPoint = (point: number[]): [number, number] => [
    (point[0] - geometry.centerX) * scale + offsetX,
    -(point[1] - geometry.centerY) * scale + offsetY,
  ];
  return { scale, offsetX, offsetY, projectPoint };
}
