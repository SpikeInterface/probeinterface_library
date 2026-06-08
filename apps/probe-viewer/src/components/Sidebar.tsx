import { useEffect, useMemo, useState } from "react";

import { useAppStore } from "../state/useAppStore";
import type { ManifestEntry } from "../types/probe";
import { groupNeuropixels, variantLabel } from "../utils/neuropixelsGrouping";

const MANUFACTURER_DISPLAY_NAMES: Record<string, string> = {
  cambridgeneurotech: "Cambridge NeuroTech",
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
    if (
      filteredEntries.length > 0 &&
      !filteredEntries.some((entry) => entry.id === selectedProbeId)
    ) {
      selectProbe(filteredEntries[0].id);
    }
  }, [filteredEntries, selectedProbeId, selectProbe]);

  // Neuropixels (imec) gets a hierarchy-grouped list (platform -> family);
  // every other manufacturer keeps the simple flat list.
  const isNeuropixels = selectedManufacturer === "imec";
  const groups = useMemo(
    () => (isNeuropixels ? groupNeuropixels(filteredEntries) : []),
    [isNeuropixels, filteredEntries],
  );

  // While searching, force every group open so matches aren't hidden inside a
  // collapsed group (filteredEntries already contains only the hits). When the
  // search clears, the user's manual expand/collapse state takes over again.
  const isSearching = searchQuery.trim().length > 0;

  // Both levels start collapsed (empty expanded sets). A platform shows its
  // families only when expanded; a family shows its probes only when expanded.
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(
    () => new Set(),
  );
  const togglePlatform = (platform: string) =>
    setExpandedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  const toggleFamily = (key: string) =>
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderItem = (entry: ManifestEntry, showVariant: boolean) => (
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
      <span className="sidebar-item-name">
        {entry.displayName}
        {showVariant && variantLabel(entry) ? (
          <span className="sidebar-item-variant"> {variantLabel(entry)}</span>
        ) : null}
      </span>
      <span className="sidebar-item-meta">
        {entry.contactCount} contacts · {entry.shankCount} shanks
      </span>
    </button>
  );

  return (
    <div className="sidebar">
      <header className="sidebar-header">
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
          !isNeuropixels &&
          filteredEntries.map((entry) => renderItem(entry, false))}

        {manifestStatus === "success" &&
          isNeuropixels &&
          groups.map((group) => {
            const platformOpen = isSearching || expandedPlatforms.has(group.platform);
            return (
              <div className="sidebar-group" key={group.platform}>
                <button
                  type="button"
                  className="sidebar-group-header"
                  aria-expanded={platformOpen}
                  onClick={() => togglePlatform(group.platform)}
                >
                  <span className="sidebar-group-caret">
                    {platformOpen ? "▾" : "▸"}
                  </span>
                  <span className="sidebar-group-title">{group.platform}</span>
                  <span className="sidebar-group-count">{group.count}</span>
                </button>
                {platformOpen &&
                  group.families.map((fam) => {
                    const familyKey = `${group.platform}||${fam.family}`;
                    const familyOpen = isSearching || expandedFamilies.has(familyKey);
                    return (
                      <div className="sidebar-subgroup" key={fam.family}>
                        <button
                          type="button"
                          className="sidebar-subgroup-header"
                          aria-expanded={familyOpen}
                          onClick={() => toggleFamily(familyKey)}
                        >
                          <span className="sidebar-group-caret">
                            {familyOpen ? "▾" : "▸"}
                          </span>
                          <span className="sidebar-subgroup-title">
                            {fam.family}
                          </span>
                          <span className="sidebar-group-count">
                            {fam.entries.length}
                          </span>
                        </button>
                        {familyOpen &&
                          fam.subgroups.map((sub) => (
                            <div
                              className="sidebar-subdivision"
                              key={sub.label || "_flat"}
                            >
                              {sub.label && (
                                <p className="sidebar-subgroup-divider">
                                  {sub.label}
                                </p>
                              )}
                              {sub.entries.map((entry) =>
                                renderItem(entry, true),
                              )}
                            </div>
                          ))}
                      </div>
                    );
                  })}
              </div>
            );
          })}
      </div>
    </div>
  );
}
