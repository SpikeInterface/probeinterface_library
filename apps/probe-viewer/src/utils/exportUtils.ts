import type { ProbeInterfaceFile, ContactShapeParams, ProbeViewerCamera } from "../types/probe";

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
 * Re-renders the probe without contact IDs. Scale bar included if enabled.
 */
export function exportProbeAsPng(
  probeData: ProbeInterfaceFile,
  camera: ProbeViewerCamera,
  canvasSize: CanvasSize,
  filename: string,
  showScaleBar: boolean
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

  // Render probe (no contact IDs, scale bar if enabled)
  renderProbeToContext(ctx, probeData, camera, canvasSize, showScaleBar);

  // Download
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/**
 * Export probe visualization as SVG with transparent background.
 * Re-renders the probe without contact IDs. Scale bar included if enabled.
 */
export function exportProbeAsSvg(
  probeData: ProbeInterfaceFile,
  camera: ProbeViewerCamera,
  canvasSize: CanvasSize,
  filename: string,
  showScaleBar: boolean
): void {
  const svgString = generateProbeSvgString(probeData, camera, canvasSize, showScaleBar);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Render probe to a 2D canvas context (used for PNG export).
 * Mirrors the ProbeCanvas rendering logic but without contact IDs.
 */
function renderProbeToContext(
  ctx: CanvasRenderingContext2D,
  probeData: ProbeInterfaceFile,
  camera: ProbeViewerCamera,
  canvasSize: CanvasSize,
  showScaleBar: boolean
): void {
  const geometry = computeGeometrySummary(probeData);
  const probe = probeData.probes?.[0];
  if (!geometry || !probe) return;

  const { zoom, centerX, centerY } = camera;
  const { width: widthPx, height: heightPx } = canvasSize;

  // Calculate effective view center (use geometry center if null)
  const effectiveViewCenterX = centerX ?? geometry.centerX;
  const effectiveViewCenterY = centerY ?? geometry.centerY;

  const padding = 40;
  const availableWidth = Math.max(10, widthPx - padding * 2);
  const availableHeight = Math.max(10, heightPx - padding * 2);
  const baseScale = Math.min(
    availableWidth / geometry.width,
    availableHeight / geometry.height
  );
  const scale = baseScale * zoom;

  // Calculate pixel pan from view center
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

  // Scale bar (L-shaped, bottom-left corner)
  if (showScaleBar) {
    const niceNumbers = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
    const targetPixels = 80;
    const targetUm = targetPixels / scale;
    const scaleBarUm = niceNumbers.reduce((prev, curr) =>
      Math.abs(curr - targetUm) < Math.abs(prev - targetUm) ? curr : prev
    );
    const scaleBarPixels = scaleBarUm * scale;

    const margin = 20;
    const cornerX = margin;
    const cornerY = heightPx - margin;
    const tickSize = 4;

    ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
    ctx.lineWidth = 2;
    ctx.lineCap = "square";

    // Draw L shape
    ctx.beginPath();
    ctx.moveTo(cornerX, cornerY);
    ctx.lineTo(cornerX, cornerY - scaleBarPixels);
    ctx.moveTo(cornerX, cornerY);
    ctx.lineTo(cornerX + scaleBarPixels, cornerY);
    ctx.stroke();

    // End ticks
    ctx.beginPath();
    ctx.moveTo(cornerX - tickSize, cornerY - scaleBarPixels);
    ctx.lineTo(cornerX + tickSize, cornerY - scaleBarPixels);
    ctx.moveTo(cornerX + scaleBarPixels, cornerY - tickSize);
    ctx.lineTo(cornerX + scaleBarPixels, cornerY + tickSize);
    ctx.stroke();

    // Labels
    const label = scaleBarUm >= 1000 ? `${scaleBarUm / 1000} mm` : `${scaleBarUm} μm`;
    ctx.font = '11px "Inter", sans-serif';
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label, cornerX + scaleBarPixels / 2, cornerY + 5);

    ctx.save();
    ctx.translate(cornerX - 6, cornerY - scaleBarPixels / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

/**
 * Generate SVG string for probe visualization.
 * Transparent background, no contact IDs. Scale bar included if enabled.
 * Contacts outside the current frame are omitted, so the export matches what is
 * on screen and stays small even when zoomed into a long probe.
 */
function generateProbeSvgString(
  probeData: ProbeInterfaceFile,
  camera: ProbeViewerCamera,
  canvasSize: CanvasSize,
  showScaleBar: boolean
): string {
  const geometry = computeGeometrySummary(probeData);
  const probe = probeData.probes?.[0];

  if (!geometry || !probe) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize.width}" height="${canvasSize.height}"></svg>`;
  }

  const { zoom, centerX, centerY } = camera;
  const { width: widthPx, height: heightPx } = canvasSize;

  // Calculate effective view center (use geometry center if null)
  const effectiveViewCenterX = centerX ?? geometry.centerX;
  const effectiveViewCenterY = centerY ?? geometry.centerY;

  const padding = 40;
  const availableWidth = Math.max(10, widthPx - padding * 2);
  const availableHeight = Math.max(10, heightPx - padding * 2);
  const baseScale = Math.min(
    availableWidth / geometry.width,
    availableHeight / geometry.height
  );
  const scale = baseScale * zoom;

  // Calculate pixel pan from view center
  const panX = (geometry.centerX - effectiveViewCenterX) * scale;
  const panY = (effectiveViewCenterY - geometry.centerY) * scale;

  const offsetX = widthPx / 2 + panX;
  const offsetY = heightPx / 2 + panY;

  const projectPoint = (point: number[]): [number, number] => {
    const [x, y] = point;
    const normX = (x - geometry.centerX) * scale + offsetX;
    const normY = -(y - geometry.centerY) * scale + offsetY;
    return [normX, normY];
  };

  const elements: string[] = [];

  // Round emitted coordinates to 2 decimals: sub-pixel precision is invisible
  // but keeps the markup compact and readable.
  const r2 = (n: number) => Math.round(n * 100) / 100;

  // Probe contour: technical line-art — a faint cool wash so the shank reads as
  // a region, with a thin precise outline. No fill gradient or shadow.
  if (probe.probe_planar_contour && probe.probe_planar_contour.length > 1) {
    const points = probe.probe_planar_contour
      .map((p) => {
        const [px, py] = projectPoint(p);
        return `${r2(px)},${r2(py)}`;
      })
      .join(" ");
    const strokeWidth = r2(Math.max(1, Math.min(1.6, 2 * (scale / 120))));
    elements.push(
      `<polygon points="${points}" fill="rgba(51, 65, 85, 0.05)" stroke="rgb(51, 65, 85)" stroke-opacity="0.9" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`
    );
  }

  const contactPositions = probe.contact_positions ?? [];
  const contactShapes = probe.contact_shapes ?? [];
  const contactShapeParams = probe.contact_shape_params ?? [];

  // Helper to generate one contact's geometry. The flat-gold style (fill,
  // bronze outline) is applied once on the wrapping <g>, not per element.
  // Rectangular pads get lightly rounded corners.
  const generateContactSvg = (
    x: number,
    y: number,
    shape: string,
    params: ContactShapeParams
  ): string => {
    switch (shape) {
      case "circle": {
        const radius = (params.radius ?? 5) * scale;
        return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(radius)}"/>`;
      }
      case "square": {
        const side = (params.width ?? 10) * scale;
        const rr = r2(side * 0.12);
        return `<rect x="${r2(x - side / 2)}" y="${r2(y - side / 2)}" width="${r2(side)}" height="${r2(side)}" rx="${rr}" ry="${rr}"/>`;
      }
      case "rect": {
        const w = (params.width ?? 10) * scale;
        const h = (params.height ?? 15) * scale;
        const rr = r2(Math.min(w, h) * 0.12);
        return `<rect x="${r2(x - w / 2)}" y="${r2(y - h / 2)}" width="${r2(w)}" height="${r2(h)}" rx="${rr}" ry="${rr}"/>`;
      }
      default: {
        // Unknown shape: a small plain dot.
        const markerSize = Math.max(3, Math.min(10, 7 * (scale / 100)));
        return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(markerSize * 0.4)}"/>`;
      }
    }
  };

  // Only emit contacts whose drawn body reaches the frame, so the export matches
  // what is on screen instead of carrying hundreds of off-screen contacts.
  const maxContactSizeUm = contactShapeParams.reduce((max, p) => {
    const size = Math.max((p.radius ?? 0) * 2, p.width ?? 0, p.height ?? 0);
    return Math.max(max, size);
  }, 10);
  const frameMargin = maxContactSizeUm * scale + 4;
  const isContactInFrame = (x: number, y: number) =>
    x >= -frameMargin &&
    x <= widthPx + frameMargin &&
    y >= -frameMargin &&
    y <= heightPx + frameMargin;

  // All contacts share one flat-gold style, set once on a group wrapper.
  const contactEls: string[] = [];
  contactPositions.forEach((position, index) => {
    const [x, y] = projectPoint(position);
    if (!isContactInFrame(x, y)) return;
    const shape = contactShapes[index] ?? "";
    const params = contactShapeParams[index] ?? {};
    contactEls.push(generateContactSvg(x, y, shape, params));
  });
  if (contactEls.length > 0) {
    const contactStrokeWidth = r2(Math.max(1, Math.min(1.8, 2.5 * (scale / 150))));
    elements.push(
      `<g fill="rgb(212, 175, 55)" stroke="rgb(110, 80, 25)" stroke-opacity="0.9" stroke-width="${contactStrokeWidth}">\n${contactEls.join("\n")}\n</g>`
    );
  }

  // Scale bar (L-shaped, bottom-left corner)
  if (showScaleBar) {
    const niceNumbers = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
    const targetPixels = 80;
    const targetUm = targetPixels / scale;
    const scaleBarUm = niceNumbers.reduce((prev, curr) =>
      Math.abs(curr - targetUm) < Math.abs(prev - targetUm) ? curr : prev
    );
    const scaleBarPixels = scaleBarUm * scale;

    const margin = 20;
    const cornerX = margin;
    const cornerY = heightPx - margin;
    const tickSize = 4;

    const label = scaleBarUm >= 1000 ? `${scaleBarUm / 1000} mm` : `${scaleBarUm} μm`;
    const col = "rgba(15, 23, 42, 0.9)";
    const x0 = r2(cornerX);
    const y0 = r2(cornerY);
    const xEnd = r2(cornerX + scaleBarPixels);
    const yTop = r2(cornerY - scaleBarPixels);

    // L shape + end ticks, sharing one stroke style on a group.
    elements.push(
      `<g stroke="${col}" stroke-width="2" fill="none">` +
        `<path d="M${x0},${y0} L${x0},${yTop} M${x0},${y0} L${xEnd},${y0}" stroke-linecap="square"/>` +
        `<path d="M${r2(cornerX - tickSize)},${yTop} L${r2(cornerX + tickSize)},${yTop} M${xEnd},${r2(cornerY - tickSize)} L${xEnd},${r2(cornerY + tickSize)}"/>` +
        `</g>`
    );

    // Both labels share one text style on a group.
    elements.push(
      `<g fill="${col}" font-family="Inter, sans-serif" font-size="11" text-anchor="middle">` +
        `<text x="${r2(cornerX + scaleBarPixels / 2)}" y="${r2(cornerY + 16)}">${label}</text>` +
        `<text x="${r2(cornerX - 6)}" y="${r2(cornerY - scaleBarPixels / 2)}" transform="rotate(-90, ${r2(cornerX - 6)}, ${r2(cornerY - scaleBarPixels / 2)})">${label}</text>` +
        `</g>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
${elements.join("\n")}
</svg>`;
}
