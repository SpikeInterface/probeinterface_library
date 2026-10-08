import type { HierarchyConfig } from "./types";
import imecHierarchy from "./imec_neuropixels.json";
import cambridgeNeurotechHierarchy from "./cambridgeneurotech.json";

// Registry mapping a manufacturer key (as it appears in the manifest) to its
// explicit sidebar hierarchy. A manufacturer absent here has no hierarchy and
// renders as a flat list, which is the default for every manufacturer other
// than IMEC. Adding grouping for a new manufacturer is one JSON file plus one
// line here, with no engine changes.
//
// JSON is used because Vite imports it with no extra dependency.
const REGISTRY: Record<string, HierarchyConfig> = {
  imec: imecHierarchy as HierarchyConfig,
  cambridgeneurotech: cambridgeNeurotechHierarchy as HierarchyConfig,
};

export function getGroupingConfig(manufacturer: string): HierarchyConfig | undefined {
  return REGISTRY[manufacturer];
}
