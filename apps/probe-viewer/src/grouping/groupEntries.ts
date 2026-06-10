import type { ManifestEntry } from "../types/probe";
import type { GroupNode, HierarchyConfig, DisplayCategory } from "./types";

// Label for the trailing bucket that catches any probe present in the manifest
// but not placed anywhere in the hierarchy. It is the visible signal that a new
// probe needs a home in the config.
const UNGROUPED_LABEL = "Ungrouped";

// Resolves the explicit hierarchy against the given (already search-filtered)
// entries: attaches each entry to the node that lists its model id, prunes
// empty branches, and gathers anything unplaced into a trailing "Ungrouped"
// group. `collapsible` is per node and defaults to true.
export function groupEntries(
  entries: ManifestEntry[],
  config: HierarchyConfig,
): GroupNode[] {
  const byModel = new Map<string, ManifestEntry>();
  for (const entry of entries) byModel.set(entry.model, entry);
  const placed = new Set<string>();

  const walk = (node: DisplayCategory): GroupNode | null => {
    const collapsible = node.collapsible ?? true;

    if (node.children) {
      const children = node.children
        .map((child) => walk(child))
        .filter((child): child is GroupNode => child !== null);
      if (children.length === 0) return null;
      const count = children.reduce((sum, child) => sum + child.count, 0);
      return { label: node.label, collapsible, count, children };
    }

    const found: ManifestEntry[] = [];
    for (const model of node.probes ?? []) {
      const entry = byModel.get(model);
      if (entry) {
        found.push(entry);
        placed.add(model);
      }
    }
    if (found.length === 0) return null;
    return { label: node.label, collapsible, count: found.length, entries: found };
  };

  const groups = config.hierarchy
    .map((node) => walk(node))
    .filter((group): group is GroupNode => group !== null);

  const leftovers = entries.filter((entry) => !placed.has(entry.model));
  if (leftovers.length > 0) {
    groups.push({
      label: UNGROUPED_LABEL,
      collapsible: true,
      count: leftovers.length,
      entries: leftovers,
    });
  }

  return groups;
}
