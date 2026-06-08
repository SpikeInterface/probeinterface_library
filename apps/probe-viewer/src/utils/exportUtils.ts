import type { ProbeInterfaceFile, ContactShapeParams } from "../types/probe";

interface ExportViewState {
  zoom: number;
  panX: number;
  panY: number;
}

interface CanvasSize {
  width: number;
  height: number;
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

/**
 * Export probe visualization as PNG with white background.
 * Re-renders the probe without scale bar or contact IDs.
 */
export function exportProbeAsPng(
  probeData: ProbeInterfaceFile,
  viewState: ExportViewState,
  canvasSize: CanvasSize,
  filename: string
): void {
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvasSize.width * dpr;
  canvas.height = canvasSize.height * dpr;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

  // Render probe (no scale bar, no IDs)
  renderProbeToContext(ctx, probeData, viewState, canvasSize);

  // Download
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/**
 * Export probe visualization as SVG with transparent background.
 * Re-renders the probe without scale bar or contact IDs.
 */
export function exportProbeAsSvg(
  probeData: ProbeInterfaceFile,
  viewState: ExportViewState,
  canvasSize: CanvasSize,
  filename: string
): void {
  const svgString = generateProbeSvgString(probeData, viewState, canvasSize);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Render probe to a 2D canvas context (used for PNG export).
 * Mirrors the ProbeCanvas rendering logic but without scale bar or contact IDs.
 */
function renderProbeToContext(
  ctx: CanvasRenderingContext2D,
  probeData: ProbeInterfaceFile,
  viewState: ExportViewState,
  canvasSize: CanvasSize
): void {
  const geometry = computeGeometrySummary(probeData);
  const probe = probeData.probes?.[0];
  if (!geometry || !probe) return;

  const { zoom, panX, panY } = viewState;
  const { width: widthPx, height: heightPx } = canvasSize;

  const padding = 40;
  const availableWidth = Math.max(10, widthPx - padding * 2);
  const availableHeight = Math.max(10, heightPx - padding * 2);
  const baseScale = Math.min(
    availableWidth / geometry.width,
    availableHeight / geometry.height
  );
  const scale = baseScale * zoom;

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

  // Draw probe contour
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
    ctx.fillStyle = "rgba(180, 185, 195, 0.7)";
    ctx.strokeStyle = "rgba(100, 105, 115, 0.95)";
    ctx.lineWidth = Math.max(1.2, 2.5 * (scale / 100));
    ctx.fill();
    ctx.stroke();
  }

  const contactPositions = probe.contact_positions ?? [];
  const contactShapes = probe.contact_shapes ?? [];
  const contactShapeParams = probe.contact_shape_params ?? [];

  const drawContactShape = (
    x: number,
    y: number,
    shape: string,
    params: ContactShapeParams
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
        const markerSize = Math.max(3, Math.min(10, 7 * (scale / 100)));
        ctx.arc(x, y, markerSize * 0.4, 0, Math.PI * 2);
        ctx.closePath();
        ctx.moveTo(x - markerSize, y - markerSize);
        ctx.lineTo(x + markerSize, y + markerSize);
        ctx.moveTo(x + markerSize, y - markerSize);
        ctx.lineTo(x - markerSize, y + markerSize);
      }
    }
  };

  // Shadow offset for depth effect - subtle, proportional to scale
  const shadowOffset = 0.4 * scale;  // 0.4 micrometer offset for subtle depth

  // First pass: draw shadows
  contactPositions.forEach((position, index) => {
    const [x, y] = projectPoint(position);
    const shape = contactShapes[index] ?? "";
    const params = contactShapeParams[index] ?? {};

    drawContactShape(x + shadowOffset, y + shadowOffset, shape, params);
    ctx.fillStyle = "rgba(30, 20, 5, 0.7)";
    ctx.fill();
  });

  // Second pass: draw gold contacts
  contactPositions.forEach((position, index) => {
    const [x, y] = projectPoint(position);
    const shape = contactShapes[index] ?? "";
    const params = contactShapeParams[index] ?? {};

    drawContactShape(x, y, shape, params);

    ctx.fillStyle = "rgba(212, 175, 55, 1.0)";  // Fully opaque to cover shadow
    ctx.strokeStyle = "rgba(80, 60, 15, 0.9)";
    ctx.lineWidth = Math.max(1.2, 2.5 * (scale / 150));
    ctx.fill();
    ctx.stroke();
  });
}

/**
 * Generate SVG string for probe visualization.
 * Transparent background, no scale bar, no contact IDs.
 */
function generateProbeSvgString(
  probeData: ProbeInterfaceFile,
  viewState: ExportViewState,
  canvasSize: CanvasSize
): string {
  const geometry = computeGeometrySummary(probeData);
  const probe = probeData.probes?.[0];

  if (!geometry || !probe) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize.width}" height="${canvasSize.height}"></svg>`;
  }

  const { zoom, panX, panY } = viewState;
  const { width: widthPx, height: heightPx } = canvasSize;

  const padding = 40;
  const availableWidth = Math.max(10, widthPx - padding * 2);
  const availableHeight = Math.max(10, heightPx - padding * 2);
  const baseScale = Math.min(
    availableWidth / geometry.width,
    availableHeight / geometry.height
  );
  const scale = baseScale * zoom;

  const offsetX = widthPx / 2 + panX;
  const offsetY = heightPx / 2 + panY;

  const projectPoint = (point: number[]): [number, number] => {
    const [x, y] = point;
    const normX = (x - geometry.centerX) * scale + offsetX;
    const normY = -(y - geometry.centerY) * scale + offsetY;
    return [normX, normY];
  };

  const elements: string[] = [];

  // Probe contour
  if (probe.probe_planar_contour && probe.probe_planar_contour.length > 1) {
    const points = probe.probe_planar_contour
      .map((p) => projectPoint(p).join(","))
      .join(" ");
    const strokeWidth = Math.max(1.2, 2.5 * (scale / 100));
    elements.push(
      `<polygon points="${points}" fill="rgba(180, 185, 195, 0.7)" stroke="rgba(100, 105, 115, 0.95)" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`
    );
  }

  const contactPositions = probe.contact_positions ?? [];
  const contactShapes = probe.contact_shapes ?? [];
  const contactShapeParams = probe.contact_shape_params ?? [];
  const shadowOffset = 0.4 * scale;  // 0.4 micrometer offset for subtle depth
  const contactStrokeWidth = Math.max(1.2, 2.5 * (scale / 150));

  // Helper to generate contact SVG element
  const generateContactSvg = (
    x: number,
    y: number,
    shape: string,
    params: ContactShapeParams,
    isShadow: boolean
  ): string => {
    const fill = isShadow ? "rgba(30, 20, 5, 0.7)" : "rgba(212, 175, 55, 1.0)";
    const stroke = isShadow ? "none" : "rgba(80, 60, 15, 0.9)";
    const sw = isShadow ? 0 : contactStrokeWidth;

    switch (shape) {
      case "circle": {
        const radius = (params.radius ?? 5) * scale;
        return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case "square": {
        const side = (params.width ?? 10) * scale;
        return `<rect x="${x - side / 2}" y="${y - side / 2}" width="${side}" height="${side}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case "rect": {
        const w = (params.width ?? 10) * scale;
        const h = (params.height ?? 15) * scale;
        return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      default: {
        // Unknown shape: small circle
        const markerSize = Math.max(3, Math.min(10, 7 * (scale / 100)));
        return `<circle cx="${x}" cy="${y}" r="${markerSize * 0.4}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
    }
  };

  // First pass: shadows
  contactPositions.forEach((position, index) => {
    const [x, y] = projectPoint(position);
    const shape = contactShapes[index] ?? "";
    const params = contactShapeParams[index] ?? {};
    elements.push(
      generateContactSvg(x + shadowOffset, y + shadowOffset, shape, params, true)
    );
  });

  // Second pass: gold contacts
  contactPositions.forEach((position, index) => {
    const [x, y] = projectPoint(position);
    const shape = contactShapes[index] ?? "";
    const params = contactShapeParams[index] ?? {};
    elements.push(generateContactSvg(x, y, shape, params, false));
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
${elements.join("\n")}
</svg>`;
}
