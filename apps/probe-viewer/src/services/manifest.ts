import type { ManifestEntry, RawManifestEntry } from "../types/probe";

const MANIFEST_URL = `${import.meta.env.BASE_URL}probes-manifest.json`;

function normalizeEntry(raw: RawManifestEntry): ManifestEntry {
  return {
    id: raw.id,
  manufacturer: raw.manufacturer,
  model: raw.model,
  displayName: raw.display_name,
  jsonUrl: `${import.meta.env.BASE_URL}${raw.json_url}`,
  contactCount: raw.contact_count,
  shankCount: raw.shank_count,
  has3dGeometry: raw.has_3d_geometry,
  annotations: raw.annotations ?? {},
};
}

export async function fetchManifest(): Promise<ManifestEntry[]> {
  const response = await fetch(MANIFEST_URL, {
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load manifest (${response.status})`);
  }

  const data: RawManifestEntry[] = await response.json();
  return data.map(normalizeEntry);
}
