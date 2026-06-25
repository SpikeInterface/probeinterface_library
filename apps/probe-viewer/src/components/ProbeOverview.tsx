import { useEffect, useRef, useMemo } from "react";
import type { ProbeInterfaceFile, ProbeViewerCamera } from "../types/probe";

interface ProbeOverviewProps {
  probeData: ProbeInterfaceFile;
  camera: ProbeViewerCamera;
  /** Main canvas dimensions */
  mainWidth: number;
  mainHeight: number;
  onViewCenterChange?: (x: number | null, y: number | null) => void;
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
  if (!probe) return null;

  const positions = probe.contact_positions ?? [];
  if (positions.length === 0) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

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

export function ProbeOverview({
  probeData,
  camera,
  mainWidth,
  mainHeight,
  onViewCenterChange,
}: ProbeOverviewProps) {
  const { zoom, centerX, centerY } = camera;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const geometry = useMemo(() => computeGeometrySummary(probeData), [probeData]);
  const probe = useMemo(() => probeData.probes?.[0], [probeData]);

  // Calculate effective view center (use geometry center if null)
  const effectiveViewCenterX = centerX ?? geometry?.centerX ?? 0;
  const effectiveViewCenterY = centerY ?? geometry?.centerY ?? 0;

  // Fixed minimap size
  const MINIMAP_WIDTH = 120;
  const MINIMAP_HEIGHT = 160;

  useEffect(() => {
    if (!canvasRef.current || !geometry || !probe) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_WIDTH * dpr;
    canvas.height = MINIMAP_HEIGHT * dpr;
    canvas.style.width = `${MINIMAP_WIDTH}px`;
    canvas.style.height = `${MINIMAP_HEIGHT}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear with background
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Draw title at top
    const titleHeight = 16;
    ctx.font = '9px "Inter", sans-serif';
    ctx.fillStyle = "rgba(71, 85, 105, 0.9)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Full probe view", MINIMAP_WIDTH / 2, 4);

    // Calculate scale to fit probe in minimap (accounting for title)
    const padding = 8;
    const availW = MINIMAP_WIDTH - padding * 2;
    const availH = MINIMAP_HEIGHT - padding * 2 - titleHeight;
    const minimapScale = Math.min(availW / geometry.width, availH / geometry.height);

    const offsetX = MINIMAP_WIDTH / 2;
    const offsetY = (MINIMAP_HEIGHT + titleHeight) / 2;  // Shift down to account for title

    const projectPoint = (point: number[]) => {
      const [x, y] = point;
      return [
        (x - geometry.centerX) * minimapScale + offsetX,
        -(y - geometry.centerY) * minimapScale + offsetY,
      ];
    };

    // Draw probe contour
    if (probe.probe_planar_contour && probe.probe_planar_contour.length > 1) {
      ctx.beginPath();
      probe.probe_planar_contour.forEach((point, index) => {
        const [x, y] = projectPoint(point);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      // Technical line-art: a faint cool wash with a thin outline, matching the
      // main canvas.
      ctx.fillStyle = "rgba(51, 65, 85, 0.06)";
      ctx.strokeStyle = "rgba(51, 65, 85, 0.85)";
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    }

    // Calculate and draw viewport rectangle
    // In main canvas: scale = baseScale * zoom, where baseScale fits probe to mainCanvas
    const mainPadding = 40;
    const mainAvailW = Math.max(10, mainWidth - mainPadding * 2);
    const mainAvailH = Math.max(10, mainHeight - mainPadding * 2);
    const mainBaseScale = Math.min(mainAvailW / geometry.width, mainAvailH / geometry.height);
    const mainScale = mainBaseScale * zoom;

    // Visible area in probe coordinates (micrometers)
    const visibleWidthUm = mainWidth / mainScale;
    const visibleHeightUm = mainHeight / mainScale;

    // Convert to minimap coordinates using the effective view center
    const viewRectWidth = visibleWidthUm * minimapScale;
    const viewRectHeight = visibleHeightUm * minimapScale;
    const viewRectX = (effectiveViewCenterX - geometry.centerX) * minimapScale + offsetX - viewRectWidth / 2;
    const viewRectY = -(effectiveViewCenterY - geometry.centerY) * minimapScale + offsetY - viewRectHeight / 2;

    // Draw viewport rectangle (graphite accent, matching the monochrome chrome)
    ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillStyle = "rgba(15, 23, 42, 0.08)";
    ctx.lineWidth = 2;
    ctx.fillRect(viewRectX, viewRectY, viewRectWidth, viewRectHeight);
    ctx.strokeRect(viewRectX, viewRectY, viewRectWidth, viewRectHeight);

    // Scale bar in bottom-left corner
    const niceNumbers = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
    const targetBarPixels = 30; // Target bar length in pixels
    const targetUm = targetBarPixels / minimapScale;
    const scaleBarUm = niceNumbers.reduce((prev, curr) =>
      Math.abs(curr - targetUm) < Math.abs(prev - targetUm) ? curr : prev
    );
    const scaleBarPixels = scaleBarUm * minimapScale;

    const barMargin = 6;
    const barY = MINIMAP_HEIGHT - barMargin;
    const barX = barMargin;

    // Draw scale bar line
    ctx.strokeStyle = "rgba(15, 23, 42, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + scaleBarPixels, barY);
    ctx.stroke();

    // End ticks
    ctx.beginPath();
    ctx.moveTo(barX, barY - 3);
    ctx.lineTo(barX, barY + 1);
    ctx.moveTo(barX + scaleBarPixels, barY - 3);
    ctx.lineTo(barX + scaleBarPixels, barY + 1);
    ctx.stroke();

    // Label
    const label = scaleBarUm >= 1000 ? `${scaleBarUm / 1000} mm` : `${scaleBarUm} μm`;
    ctx.font = '8px "Inter", sans-serif';
    ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, barX + scaleBarPixels / 2, barY - 4);

    // Border around minimap
    ctx.strokeStyle = "rgba(51, 65, 85, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, MINIMAP_WIDTH - 1, MINIMAP_HEIGHT - 1);

  }, [geometry, probe, zoom, effectiveViewCenterX, effectiveViewCenterY, mainWidth, mainHeight]);

  // Handle click to pan
  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!geometry || !onViewCenterChange || mainWidth === 0 || mainHeight === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Account for title offset
    const titleHeight = 16;
    const padding = 8;
    const availW = MINIMAP_WIDTH - padding * 2;
    const availH = MINIMAP_HEIGHT - padding * 2 - titleHeight;
    const minimapScale = Math.min(availW / geometry.width, availH / geometry.height);

    const offsetX = MINIMAP_WIDTH / 2;
    const offsetY = (MINIMAP_HEIGHT + titleHeight) / 2;

    // Convert click position to probe coordinates
    const probeX = (clickX - offsetX) / minimapScale + geometry.centerX;
    const probeY = geometry.centerY - (clickY - offsetY) / minimapScale; // Y inverted

    // Set view center to the clicked point
    onViewCenterChange(probeX, probeY);
  };

  if (!geometry || !probe) return null;

  return (
    <canvas
      ref={canvasRef}
      className="probe-overview"
      onClick={handleClick}
      title="Click to navigate"
    />
  );
}
