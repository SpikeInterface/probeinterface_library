import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAppStore } from "../state/useAppStore";
import type { ManifestEntry } from "../types/probe";
import { groupEntries } from "../grouping/groupEntries";
import { getGroupingConfig } from "../grouping";
import type { GroupNode } from "../grouping/types";

const MANUFACTURER_DISPLAY_NAMES: Record<string, string> = {
  cambridgeneurotech: "Cambridge NeuroTech",
  diagnosticbiochips: "Diagnostic Biochips",
  imec: "IMEC (Neuropixels)",
  neuronexus: "NeuroNexus",
  plexon: "Plexon",
  "sinaps-research-platform": "SINAPS",
};

export function Sidebar() {
  const manifest = useAppStore((state) => state.manifest);
  const manifestStatus = useAppStore((state) => state.manifestStatus);
  const selectedManufacturer = useAppStore((state) => state.selectedManufacturer);
  const selectManufacturer = useAppStore((state) => state.selectManufacturer);
  const selectedProbeId = useAppStore((state) => state.selectedProbeId);
  const selectProbe = useAppStore((state) => state.selectProbe);
  const navigate = useNavigate();
  const searchQuery = useAppStore((state) => state.searchQuery);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);

  const manufacturers = useMemo(() => {
    const unique = new Set<string>();
    manifest.forEach((entry) => unique.add(entry.manufacturer));
    return Array.from(unique.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [manifest]);

  useEffect(() => {
    if (!selectedManufacturer && manufacturers.length > 0) {
      selectManufacturer(manufacturers[0]);
    }
  }, [manufacturers, selectedManufacturer, selectManufacturer]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return manifest.filter((entry) => {
      if (selectedManufacturer && entry.manufacturer !== selectedManufacturer) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        entry.model.toLowerCase().includes(query) ||
        entry.displayName.toLowerCase().includes(query)
      );
    });
  }, [manifest, selectedManufacturer, searchQuery]);

  useEffect(() => {
    // Re-pick a probe only when a stale one is selected (e.g. after switching
    // manufacturer). Do NOT auto-pick when nothing is selected, or the Home
    // button (which clears the selection) would immediately bounce back here.
    if (
      selectedProbeId &&
      filteredEntries.length > 0 &&
      !filteredEntries.some((entry) => entry.id === selectedProbeId)
    ) {
      selectProbe(filteredEntries[0].id);
    }
  }, [filteredEntries, selectedProbeId, selectProbe]);

  // A manufacturer with a grouping config (only IMEC today) gets a hierarchy;
  // every other manufacturer keeps the simple flat list.
  const groupingConfig = selectedManufacturer
    ? getGroupingConfig(selectedManufacturer)
    : undefined;
  const groups = useMemo(
    () => (groupingConfig ? groupEntries(filteredEntries, groupingConfig) : null),
    [groupingConfig, filteredEntries],
  );

  // While searching, force every group open so matches aren't hidden inside a
  // collapsed group (filteredEntries already contains only the hits). When the
  // search clears, the user's manual expand/collapse state takes over again.
  const isSearching = searchQuery.trim().length > 0;

  // Every collapsible node starts collapsed. Expansion is keyed by the node's
  // full path (joined ancestor labels), so the same key is stable across the
  // arbitrary-depth hierarchy.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderItem = (entry: ManifestEntry) => (
    <button
      key={entry.id}
      type="button"
      className={
        entry.id === selectedProbeId
          ? "sidebar-item sidebar-item--active"
          : "sidebar-item"
      }
      onClick={() => selectProbe(entry.id)}
    >
      <span className="sidebar-item-name">{entry.displayName}</span>
      <span className="sidebar-item-meta">
        {entry.contactCount} contacts · {entry.shankCount} shanks
      </span>
    </button>
  );

  // Renders one node of the grouped tree at any depth. A collapsible node is a
  // toggle header; a non-collapsible one is a static divider. Open nodes recurse
  // into their children, or list their entries when they are leaves.
  const renderNode = (node: GroupNode, depth: number, parentPath: string[]) => {
    const path = [...parentPath, node.label];
    const key = path.join("||");
    const open = !node.collapsible || isSearching || expanded.has(key);
    const wrapClass =
      depth === 0
        ? "sidebar-group"
        : depth === 1
          ? "sidebar-subgroup"
          : "sidebar-subdivision";
    return (
      <div className={wrapClass} key={key}>
        {node.collapsible ? (
          <button
            type="button"
            className={
              depth === 0 ? "sidebar-group-header" : "sidebar-subgroup-header"
            }
            aria-expanded={open}
            onClick={() => toggle(key)}
          >
            <span className="sidebar-group-caret">{open ? "▾" : "▸"}</span>
            <span
              className={
                depth === 0 ? "sidebar-group-title" : "sidebar-subgroup-title"
              }
            >
              {node.label}
            </span>
            <span className="sidebar-group-count">{node.count}</span>
          </button>
        ) : (
          <p className="sidebar-subgroup-divider">{node.label}</p>
        )}
        {open &&
          (node.children
            ? node.children.map((child) => renderNode(child, depth + 1, path))
            : node.entries?.map((entry) => renderItem(entry)))}
      </div>
    );
  };

  return (
    <div className="sidebar">
      <header className="sidebar-header">
        <button
          type="button"
          className="sidebar-home"
          onClick={() => {
            selectProbe(undefined);
            navigate("/");
          }}
          title="Back to the manufacturer catalog"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Home
        </button>
        <h1 className="sidebar-title">Probe Catalog</h1>
        <p className="sidebar-subtitle">
          Browse available probe layouts and inspect their geometry.
        </p>
      </header>

      <div className="sidebar-control">
        <label className="sidebar-label" htmlFor="manufacturer-select">
          Manufacturer
        </label>
        <select
          id="manufacturer-select"
          value={selectedManufacturer ?? ""}
          onChange={(event) => selectManufacturer(event.target.value || undefined)}
          disabled={manifestStatus !== "success"}
        >
          {manufacturers.map((manufacturer) => (
            <option key={manufacturer} value={manufacturer}>
              {MANUFACTURER_DISPLAY_NAMES[manufacturer] ?? manufacturer}
            </option>
          ))}
        </select>
      </div>

      <div className="sidebar-control">
        <label className="sidebar-label" htmlFor="probe-search">
          Search by model
        </label>
        <input
          id="probe-search"
          type="search"
          placeholder="Start typing a model name"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          disabled={manifestStatus !== "success"}
        />
      </div>

      <div className="sidebar-list" role="list">
        {manifestStatus === "loading" && (
          <p className="sidebar-hint">Loading manifest…</p>
        )}
        {manifestStatus === "error" && (
          <p className="sidebar-error">Failed to load manifest.</p>
        )}
        {manifestStatus === "success" && filteredEntries.length === 0 && (
          <p className="sidebar-hint">No probes match the current filters.</p>
        )}

        {manifestStatus === "success" &&
          !groups &&
          filteredEntries.map((entry) => renderItem(entry))}

        {manifestStatus === "success" &&
          groups &&
          groups.map((node) => renderNode(node, 0, []))}
      </div>
    </div>
  );
}
