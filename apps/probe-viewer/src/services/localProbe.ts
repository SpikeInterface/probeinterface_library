import type { ManifestEntry, ProbeInterfaceFile } from "../types/probe";

// Manufacturer label shown for a locally loaded probe. Also used by the viewer
// to recognise a local entry and hide the GitHub/Share affordances that only
// make sense for catalog probes.
export const LOCAL_MANUFACTURER = "Local file";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/\.json$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "probe"
  );
}

// Builds the synthetic manifest entry that drives the viewer header for a
// locally loaded probe. Mirrors the metadata build.py derives for catalog
// probes so the header reads the same (contacts / shanks counts, display name).
export function buildLocalEntry(
  file: ProbeInterfaceFile,
  fileName: string,
): ManifestEntry {
  const probe = file.probes?.[0];
  const annotations = probe?.annotations ?? {};
  const modelName =
    typeof annotations.model_name === "string" ? annotations.model_name : undefined;
  const displayName = modelName || fileName.replace(/\.json$/i, "");
  const slug = slugify(displayName);

  const contactCount = probe?.contact_positions?.length ?? 0;
  const shankCount = new Set(probe?.shank_ids ?? [null]).size;
  const numSides = probe?.contact_sides
    ? new Set(probe.contact_sides).size
    : 1;
  const has3dGeometry = probe?.ndim === 3;

  return {
    id: `local:${slug}`,
    manufacturer: LOCAL_MANUFACTURER,
    model: slug,
    displayName,
    jsonUrl: "",
    contactCount,
    shankCount,
    numSides,
    has3dGeometry,
    annotations,
  };
}
