import type { ProbeInterfaceProbe } from "../types/probe";

// Double-sided probes carry front and back contacts at the same (x, y) positions
// (distinguished by `contact_sides`). They are drawn as a registration overlay:
// both faces in one true-scale frame, color-coded and semi-transparent, like a
// two-layer PCB view. A Both / front / back selector isolates a single face.

export interface SideInfo {
  // True when the probe carries contacts on more than one face.
  isDoubleSided: boolean;
  // Distinct side labels in first-seen order, e.g. ["front", "back"].
  sides: string[];
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
