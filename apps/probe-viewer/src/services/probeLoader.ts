import type { ManifestEntry, ProbeInterfaceFile } from "../types/probe";

export async function fetchProbeData(
  entry: ManifestEntry,
): Promise<ProbeInterfaceFile> {
  const response = await fetch(entry.jsonUrl, {
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load probe ${entry.id} (${response.statusText})`,
    );
  }

  const data: ProbeInterfaceFile = await response.json();
  return data;
}
