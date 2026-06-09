import type { ManifestEntry } from "../types/probe";

// Explicit, hand-curated sidebar hierarchy for one manufacturer. There are no
// rules: every probe is placed by model id under the tree in imec.json, with
// model ids at the leaves. A manufacturer with no config renders as a flat list
// (see ./index.ts).
//
// Collapsibility is a per-node property that propagates to descendants: a node
// uses its own `collapsible` when set, otherwise it inherits the resolved value
// of its parent. The top-level default is `true`. So a platform marked
// collapsible flows that down to its families, and a length band marked
// non-collapsible flows that down to its probes, without either having to be
// repeated on every node.

export interface HierarchyNode {
  label: string;
  // true => a collapsible group header; false => a static, always-open divider.
  // Omitted => inherit the parent's resolved value (root default: true).
  collapsible?: boolean;
  children?: HierarchyNode[];
  probes?: string[]; // model ids, in display order
}

export interface HierarchyConfig {
  hierarchy: HierarchyNode[];
}

// One node of the resolved tree the walker returns, with manifest entries
// attached and `collapsible` resolved to a concrete boolean. A node has either
// `children` (sub-divided) or `entries` (a leaf), never both.
export interface GroupNode {
  label: string;
  collapsible: boolean;
  count: number;
  children?: GroupNode[];
  entries?: ManifestEntry[];
}
