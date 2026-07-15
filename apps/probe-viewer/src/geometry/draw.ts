import type { ContactShapeParams } from "../types/probe";

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
