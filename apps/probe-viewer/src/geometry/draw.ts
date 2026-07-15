import type { ContactShapeParams, ProbeInterfaceProbe } from "../types/probe";

// Trace a single contact's outline onto the current path. Caller sets fill/stroke
// and paints. Shared by the single-sided and double-sided canvases so the two
// views render contacts identically.
export function drawContactShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  shape: string,
  params: ContactShapeParams,
  scale: number,
): void {
  ctx.beginPath();
  switch (shape) {
    case "circle": {
      const radius = (params.radius ?? 5) * scale;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      break;
    }
    case "square":
    case "rect": {
      const w = (params.width ?? 10) * scale;
      const h = (shape === "square" ? params.width ?? 10 : params.height ?? 15) * scale;
      // Lightly rounded corners so pads read as electrodes, not hard tiles.
      const r = Math.min(w, h) * 0.12;
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
      } else {
        ctx.rect(x - w / 2, y - h / 2, w, h);
      }
      break;
    }
    default: {
      // Unknown/missing shape: draw a dot with X to indicate missing data
      const markerSize = Math.max(3, Math.min(10, 7 * (scale / 100)));
      ctx.arc(x, y, markerSize * 0.4, 0, Math.PI * 2);
      ctx.closePath();
      ctx.moveTo(x - markerSize, y - markerSize);
      ctx.lineTo(x + markerSize, y + markerSize);
      ctx.moveTo(x + markerSize, y - markerSize);
      ctx.lineTo(x - markerSize, y + markerSize);
    }
  }
}

// L-shaped scale bar in the bottom-left corner showing reference lengths for the
// X and Y axes. The length adapts to zoom using "nice" round numbers.
export function renderScaleBar(
  ctx: CanvasRenderingContext2D,
  scale: number,
  heightPx: number,
): void {
  const niceNumbers = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  const targetPixels = 80;
  const targetUm = targetPixels / scale;
  const scaleBarUm = niceNumbers.reduce((prev, curr) =>
    Math.abs(curr - targetUm) < Math.abs(prev - targetUm) ? curr : prev,
  );
  const scaleBarPixels = scaleBarUm * scale;

  const margin = 20;
  const cornerX = margin;
  const cornerY = heightPx - margin;
  const tickSize = 4;

  ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
  ctx.lineWidth = 2;
  ctx.lineCap = "square";

  ctx.beginPath();
  // Vertical arm (Y) - goes up from corner
  ctx.moveTo(cornerX, cornerY);
  ctx.lineTo(cornerX, cornerY - scaleBarPixels);
  // Horizontal arm (X) - goes right from corner
  ctx.moveTo(cornerX, cornerY);
  ctx.lineTo(cornerX + scaleBarPixels, cornerY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cornerX - tickSize, cornerY - scaleBarPixels);
  ctx.lineTo(cornerX + tickSize, cornerY - scaleBarPixels);
  ctx.moveTo(cornerX + scaleBarPixels, cornerY - tickSize);
  ctx.lineTo(cornerX + scaleBarPixels, cornerY + tickSize);
  ctx.stroke();

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

// Gold for the (single-sided or "front") face, steel-blue for the back face.
// Single-sided probes keep the original gold look exactly.
export const CONTACT_COLORS = {
  front: { fill: "rgba(212, 175, 55, 1.0)", stroke: "rgba(80, 60, 15, 0.9)" },
  back: { fill: "rgba(70, 130, 180, 1.0)", stroke: "rgba(25, 55, 90, 0.9)" },
} as const;

// Per-probe inputs for uniform contact-id sizing: the widest id label (so one
// font fits the longest) and the smallest contact box in micrometers (so it
// fits every pad). Zoom-independent, so a caller computes it once per probe.
export interface IdLabelInfo {
  widestLabel: string;
  minWidthUm: number;
  minHeightUm: number;
}

export function computeIdLabelInfo(
  probe: ProbeInterfaceProbe | undefined,
): IdLabelInfo | null {
  const ids = probe?.contact_ids;
  const positions = probe?.contact_positions;
  if (!ids || !positions || positions.length === 0) return null;
  const shapes = probe.contact_shapes ?? [];
  const params = probe.contact_shape_params ?? [];
  let widestLabel = "";
  let minWidthUm = Infinity;
  let minHeightUm = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const label = String(ids[i] ?? i);
    if (label.length > widestLabel.length) widestLabel = label;
    const shape = shapes[i] ?? "";
    const p = params[i] ?? {};
    const widthUm = shape === "circle" ? 2 * (p.radius ?? 5) : p.width ?? 10;
    const heightUm =
      shape === "circle"
        ? 2 * (p.radius ?? 5)
        : shape === "rect"
          ? p.height ?? 15
          : p.width ?? 10;
    if (widthUm < minWidthUm) minWidthUm = widthUm;
    if (heightUm < minHeightUm) minHeightUm = heightUm;
  }
  return { widestLabel, minWidthUm, minHeightUm };
}

// Draw contact ids at a single per-probe font size: the size at which the widest
// id fits the smallest contact (by width and height). Text width scales linearly
// with font size, so we measure the widest label once at a reference size and
// solve. The font tracks zoom and real contact size, so labels never overflow a
// pad and stay a constant fraction of it — shared by both canvases so this holds
// for single-sided and double-sided probes alike. `shouldDraw` lets the caller
// restrict labels to one face (the double-sided overlay draws a single side).
export function drawContactIds(
  ctx: CanvasRenderingContext2D,
  options: {
    positions: number[][];
    contactIds: (string | number)[];
    labelInfo: IdLabelInfo;
    scale: number;
    projectPoint: (point: number[]) => [number, number];
    shouldDraw?: (index: number) => boolean;
  },
): void {
  const { positions, contactIds, labelInfo, scale, projectPoint, shouldDraw } = options;
  const { widestLabel, minWidthUm, minHeightUm } = labelInfo;

  const REF_FONT = 100;
  ctx.font = `${REF_FONT}px "Inter", sans-serif`;
  const widestWidthAtRef = Math.max(1, ctx.measureText(widestLabel).width);
  const fontByWidth = (REF_FONT * minWidthUm * scale) / widestWidthAtRef;
  const fontByHeight = minHeightUm * scale;
  const fontPx = Math.min(fontByWidth, fontByHeight) * 0.85;

  ctx.font = `${fontPx}px "Inter", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
  positions.forEach((position, index) => {
    if (shouldDraw && !shouldDraw(index)) return;
    const [x, y] = projectPoint(position);
    // Show the probe's actual contact id, not the array index.
    ctx.fillText(String(contactIds[index] ?? index), x, y);
  });
}
