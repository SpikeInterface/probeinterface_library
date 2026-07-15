import type { ProbeInterfaceFile, ContactShapeParams, ProbeViewerCamera } from "../types/probe";
import { computeGeometry, computeProjection } from "../geometry/viewport";
import { CONTACT_COLORS, drawContactShape, renderScaleBar } from "../geometry/draw";

interface CanvasSize {
  width: number;
  height: number;
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
 * Uses the same shared geometry/projection and draw primitives as the on-screen
 * canvas, plus export-only touches: a white background (set by the caller), a
 * drop-shadow depth pass, and an opaque contour so the shank reads in a
 * standalone image. Contact IDs are intentionally omitted.
 */
function renderProbeToContext(
  ctx: CanvasRenderingContext2D,
  probeData: ProbeInterfaceFile,
  camera: ProbeViewerCamera,
  canvasSize: CanvasSize,
  showScaleBar: boolean
): void {
  const probe = probeData.probes?.[0];
  if (!probe) return;
  const geometry = computeGeometry(
    probe.contact_positions ?? [],
    probe.probe_planar_contour ?? []
  );
  const projection = computeProjection(geometry, camera, canvasSize);
  if (!geometry || !projection) return;

  const { scale, projectPoint } = projection;
  const { height: heightPx } = canvasSize;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Probe contour: opaque gray so the shank reads as a region in a standalone
  // image (the on-screen view uses a fainter wash over the app background).
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

  // First pass: drop shadows for a subtle depth effect (export only).
  const shadowOffset = 0.4 * scale; // 0.4 micrometer offset
  ctx.fillStyle = "rgba(30, 20, 5, 0.7)";
  contactPositions.forEach((position, index) => {
    const [x, y] = projectPoint(position);
    drawContactShape(
      ctx,
      x + shadowOffset,
      y + shadowOffset,
      contactShapes[index] ?? "",
      contactShapeParams[index] ?? {},
      scale
    );
    ctx.fill();
  });

  // Second pass: flat gold contacts (fully opaque to cover the shadow), the same
  // front-face style as the on-screen canvas.
  ctx.fillStyle = CONTACT_COLORS.front.fill;
  ctx.strokeStyle = CONTACT_COLORS.front.stroke;
  ctx.lineWidth = Math.max(1.2, 2.5 * (scale / 150));
  contactPositions.forEach((position, index) => {
    const [x, y] = projectPoint(position);
    drawContactShape(
      ctx,
      x,
      y,
      contactShapes[index] ?? "",
      contactShapeParams[index] ?? {},
      scale
    );
    ctx.fill();
    ctx.stroke();
  });

  if (showScaleBar) {
    renderScaleBar(ctx, scale, heightPx);
  }
}

/**
 * Generate SVG string for probe visualization.
 * Transparent background, no contact IDs. Scale bar included if enabled.
 * Contacts outside the current frame are omitted, so the export matches what is
 * on screen and stays small even when zoomed into a long probe.
 *
 * Shares the geometry and projection math with the canvas, but the shapes and
 * scale bar are emitted as SVG markup (not canvas calls), so that part cannot
 * reuse the canvas draw primitives.
 */
function generateProbeSvgString(
  probeData: ProbeInterfaceFile,
  camera: ProbeViewerCamera,
  canvasSize: CanvasSize,
  showScaleBar: boolean
): string {
  const probe = probeData.probes?.[0];
  const geometry = computeGeometry(
    probe?.contact_positions ?? [],
    probe?.probe_planar_contour ?? []
  );
  const projection = computeProjection(geometry, camera, canvasSize);

  const { width: widthPx, height: heightPx } = canvasSize;
  if (!geometry || !projection || !probe) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}"></svg>`;
  }

  const { scale, projectPoint } = projection;

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
