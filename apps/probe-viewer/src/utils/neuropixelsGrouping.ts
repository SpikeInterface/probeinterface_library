import type { ManifestEntry } from "../types/probe";

// Groups the flat Neuropixels (imec) probe list into the hierarchy a user
// actually reasons about: platform (electronics generation) -> family (physical
// design). This is a frontend-only, best-effort derivation: platform comes from
// the part-number prefix, family from the probe's free-text description. It is a
// prototype heuristic; the authoritative version would have probeinterface emit
// explicit platform/family fields into the probe JSON.

export interface ProbeSubGroup {
  // A static (non-collapsible) divider within a family. An empty label means
  // the family is rendered as a flat list with no divider.
  label: string;
  entries: ManifestEntry[];
}

export interface ProbeFamilyGroup {
  family: string;
  entries: ManifestEntry[];
  subgroups: ProbeSubGroup[];
}

export interface ProbePlatformGroup {
  platform: string;
  count: number;
  families: ProbeFamilyGroup[];
}

const PLATFORM_ORDER = [
  "Neuropixels 1.0",
  "Neuropixels 2.0",
  "Neuropixels NXT",
  "Other",
];

const FAMILY_ORDER = [
  "Standard",
  "Non-human-primate",
  "Ultra High Density",
  "Optogenetics",
  "Single-shank",
  "Multi-shank",
  "Passive",
  "Legacy",
  "Other",
];

// Length variants shown as static sub-dividers inside the Non-human-primate
// family. Length (short ~10 mm, medium ~25 mm, long/max ~45 mm) is the key
// differentiator for these probes, so it is preserved as a divider rather than
// flattened away.
const NHP_SUB_ORDER = ["short", "medium", "long / max", "passive", "other"];

function nhpLengthDivider(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("passive")) return "passive";
  if (d.includes("short")) return "short";
  if (d.includes("medium")) return "medium";
  if (d.includes("long") || d.includes("max")) return "long / max";
  return "other";
}

export function platformOf(entry: ManifestEntry): string {
  const model = entry.model;
  // Legacy PRB_* SKUs are the same Neuropixels 1.0 / 2.0 probes under the older
  // naming scheme, so they belong to those platforms (as a "Legacy" family),
  // not to a platform of their own.
  if (/^PRB2/i.test(model)) return "Neuropixels 2.0";
  if (/^PRB_?1/i.test(model)) return "Neuropixels 1.0";
  if (/^NP1/.test(model)) return "Neuropixels 1.0";
  if (/^NP2/.test(model)) return "Neuropixels 2.0";
  if (/^NP3/.test(model)) return "Neuropixels NXT";
  return "Other";
}

function descriptionOf(entry: ManifestEntry): string {
  const raw = (entry.annotations as Record<string, unknown>)?.description;
  return typeof raw === "string" ? raw.toLowerCase() : "";
}

export function familyOf(entry: ManifestEntry): string {
  if (/^PRB/i.test(entry.model)) return "Legacy";
  const d = descriptionOf(entry);
  if (d.includes("uhd")) return "Ultra High Density";
  if (d.includes("opto")) return "Optogenetics";
  if (d.includes("nhp")) return "Non-human-primate";
  if (d.includes("passive")) return "Passive";
  if (entry.shankCount >= 4) return "Multi-shank";
  if (platformOf(entry).startsWith("Neuropixels 1.0")) return "Standard";
  if (d.includes("single") || entry.shankCount === 1) return "Single-shank";
  return "Other";
}

// Short, human label for what distinguishes one variant from its siblings:
// the tail of the description after the platform/family boilerplate. Falls back
// to the full description when nothing meaningful is left.
export function variantLabel(entry: ManifestEntry): string {
  const raw = (entry.annotations as Record<string, unknown>)?.description;
  const full = typeof raw === "string" ? raw : "";
  const trimmed = full
    .replace(/^(neuropixels|npix)\s*[0-9.]*\s*/i, "")
    .replace(/\bnhp\b/gi, "")
    .replace(/\bprobe\b/gi, "")
    .replace(/\b(short|medium|long|max|uhd\d*|opto\w*|passive|multi[\s-]?shank|single[\s-]?shank)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
  return trimmed.length > 1 ? trimmed : full;
}

export function groupNeuropixels(entries: ManifestEntry[]): ProbePlatformGroup[] {
  const byPlatform = new Map<string, Map<string, ManifestEntry[]>>();
  for (const entry of entries) {
    const platform = platformOf(entry);
    const family = familyOf(entry);
    if (!byPlatform.has(platform)) byPlatform.set(platform, new Map());
    const families = byPlatform.get(platform)!;
    if (!families.has(family)) families.set(family, []);
    families.get(family)!.push(entry);
  }

  const platformRank = (p: string) => {
    const index = PLATFORM_ORDER.indexOf(p);
    return index === -1 ? PLATFORM_ORDER.length : index;
  };
  const familyRank = (f: string) => {
    const index = FAMILY_ORDER.indexOf(f);
    return index === -1 ? FAMILY_ORDER.length : index;
  };

  const groups: ProbePlatformGroup[] = [];
  for (const [platform, familyMap] of byPlatform) {
    const families = [...familyMap.entries()]
      .sort((a, b) => familyRank(a[0]) - familyRank(b[0]))
      .map(([family, list]) => {
        const entries = list.sort((a, b) => a.model.localeCompare(b.model));
        let subgroups: ProbeSubGroup[];
        if (family === "Non-human-primate") {
          const byLength = new Map<string, ManifestEntry[]>();
          for (const entry of entries) {
            const divider = nhpLengthDivider(descriptionOf(entry));
            if (!byLength.has(divider)) byLength.set(divider, []);
            byLength.get(divider)!.push(entry);
          }
          subgroups = [...byLength.entries()]
            .sort(
              (a, b) =>
                NHP_SUB_ORDER.indexOf(a[0]) - NHP_SUB_ORDER.indexOf(b[0]),
            )
            .map(([label, items]) => ({ label, entries: items }));
        } else {
          subgroups = [{ label: "", entries }];
        }
        return { family, entries, subgroups };
      });
    const count = families.reduce((sum, f) => sum + f.entries.length, 0);
    groups.push({ platform, count, families });
  }
  return groups.sort((a, b) => platformRank(a.platform) - platformRank(b.platform));
}
