import type { ManifestEntry } from "../types/probe";

// Explicit, hand-curated sidebar hierarchy for one manufacturer. There are no
// rules: every probe is placed by model id under the tree in imec.json, with
// model ids at the leaves. A manufacturer with no config renders as a flat list
// (see ./index.ts).
//
// Collapsibility is per node and defaults to `true`, so only the exceptions
// need stating: the length bands set `collapsible: false` to render as static
// dividers, and every other node omits it and stays a foldable header.

export interface DisplayCategory {
  label: string;
  // true (default) => a collapsible group header; false => a static, always-open
  // divider.
  collapsible?: boolean;
  // Free-text rationale for a non-obvious placement. Documentation only, since
  // JSON has no comments; not rendered.
  note?: string;
  children?: DisplayCategory[];
  probes?: string[]; // model ids, in display order
}

export interface HierarchyConfig {
  hierarchy: DisplayCategory[];
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
