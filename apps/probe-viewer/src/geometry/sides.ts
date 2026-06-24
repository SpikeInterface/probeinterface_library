import type { ProbeInterfaceProbe } from "../types/probe";

// Double-sided probes (front + back contacts at the same positions) are drawn as
// an overlay: the back face — its shank outline and its contacts together — is
// displaced from the front by an adjustable offset, and the emphasized face is
// drawn on top with adjustable opacity. (A separate side-by-side layout was
// removed for now; revisit later.)

export interface SideInfo {
  // True when the probe carries contacts on more than one face.
  isDoubleSided: boolean;
  // Distinct side labels in first-seen order, e.g. ["front", "back"].
  sides: string[];
}

export interface SideContact {
  index: number; // index into the probe's contact_* arrays
  x: number; // display x in probe coordinates (the back face is displaced)
  y: number;
  side: string | null;
  prominent: boolean; // the emphasized face (drawn on top, opacity-controlled)
}

export interface SideContour {
  points: number[][]; // display coordinates (displaced for the back face)
  side: string | null;
  prominent: boolean;
}

export interface SideRenderPlan {
  info: SideInfo;
  contacts: SideContact[];
  contours: SideContour[];
}

// A representative contact half-size in probe units (micrometers), used to scale
// the overlay offset to the probe geometry rather than to screen pixels. Takes
// the first contact's shape: radius for circles, half-width for squares, half of
// the larger side for rectangles. Falls back to 5 µm when shapes are missing.
export function representativeContactSize(probe: ProbeInterfaceProbe): number {
  const shape = probe.contact_shapes?.[0];
  const params = probe.contact_shape_params?.[0];
  if (params) {
    if (shape === "circle" && params.radius) return params.radius;
    if (shape === "square" && params.width) return params.width / 2;
    if (shape === "rect") return Math.max(params.width ?? 0, params.height ?? 0) / 2 || 5;
  }
  return 5;
}

export function getSideInfo(probe: ProbeInterfaceProbe | undefined): SideInfo {
  const sides = probe?.contact_sides;
  if (!sides || sides.length === 0) {
    return { isDoubleSided: false, sides: [] };
  }
  const distinct: string[] = [];
  for (const side of sides) {
    if (!distinct.includes(side)) distinct.push(side);
  }
  return { isDoubleSided: distinct.length > 1, sides: distinct };
}

// Resolve which side is the emphasized one. `null` (the default) means "the
// first side", so a fresh probe emphasizes "front" without the caller needing
// to know the side names up front.
export function resolveProminentSide(
  info: SideInfo,
  prominentSide: string | null,
): string | null {
  if (!info.isDoubleSided) return null;
  if (prominentSide && info.sides.includes(prominentSide)) return prominentSide;
  return info.sides[0] ?? null;
}

// Build the display layout. The first side stays in place; every later side
// (i.e. the back) is displaced horizontally by `offset` probe units — applied to
// both its contacts and its shank outline, so the whole face shifts as one. For
// single-sided probes this is a thin pass-through.
export function buildSideRenderPlan(
  probe: ProbeInterfaceProbe,
  prominentSide: string | null,
  offset: number,
): SideRenderPlan {
  const info = getSideInfo(probe);
  const positions = probe.contact_positions ?? [];
  const sidesArr = probe.contact_sides ?? [];
  const contour =
    probe.probe_planar_contour && probe.probe_planar_contour.length > 1
      ? probe.probe_planar_contour
      : null;

  if (!info.isDoubleSided) {
    return {
      info,
      contacts: positions.map((point, index) => ({
        index,
        x: point[0],
        y: point[1],
        side: sidesArr[index] ?? null,
        prominent: true,
      })),
      contours: contour ? [{ points: contour, side: null, prominent: true }] : [],
    };
  }

  const resolved = resolveProminentSide(info, prominentSide);
  const displacement = (side: string | null) =>
    side ? info.sides.indexOf(side) * offset : 0;

  const contacts: SideContact[] = positions.map((point, index) => {
    const side = sidesArr[index] ?? null;
    return {
      index,
      x: point[0] + displacement(side),
      y: point[1],
      side,
      prominent: side === resolved,
    };
  });

  // One shank outline per face, shifted by the same displacement as its contacts.
  const contours: SideContour[] = [];
  if (contour) {
    for (const side of info.sides) {
      const dx = displacement(side);
      contours.push({
        points: contour.map((point) => [point[0] + dx, point[1]]),
        side,
        prominent: side === resolved,
      });
    }
  }

  return { info, contacts, contours };
}
