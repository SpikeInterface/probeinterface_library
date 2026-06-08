import { useEffect, useMemo } from "react";

import { useAppStore } from "../state/useAppStore";

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
              {manufacturer}
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
        {filteredEntries.map((entry) => (
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
        ))}
      </div>
    </div>
  );
}
