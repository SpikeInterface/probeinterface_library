import { useMemo, useState } from "react";

import { useAppStore } from "../state/useAppStore";
import type { ManifestEntry } from "../types/probe";

// Logo files in public/logos/ for manufacturers we have an asset for. Add an
// entry (and drop the file in) to give a manufacturer a logo; everything else
// falls back to a brand-colored wordmark.
const MANUFACTURER_LOGOS: Record<string, string> = {
  cambridgeneurotech: "cambridgeneurotech.png",
  diagnosticbiochips: "diagnosticbiochips.png",
  imec: "imec.png",
  neuronexus: "neuronexus.svg",
  plexon: "plexon.png",
  "sinaps-research-platform": "sinaps-research-platform.svg",
};

function ManufacturerMedia({ groupKey, label }: { groupKey: string; label: string }) {
  const file = MANUFACTURER_LOGOS[groupKey];
  const [failed, setFailed] = useState(false);
  if (!file || failed) {
    return (
      <div className={`probe-card-logo probe-card-logo--${groupKey}`}>
        <span className="probe-card-logo-text">{label}</span>
      </div>
    );
  }
  return (
    <div className="probe-card-logo-tile">
      <img
        className="probe-card-logo-img"
        src={`${import.meta.env.BASE_URL}logos/${file}`}
        alt={label}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// Mirrors the Sidebar's friendly names.
const MANUFACTURER_DISPLAY_NAMES: Record<string, string> = {
  cambridgeneurotech: "Cambridge NeuroTech",
  diagnosticbiochips: "Diagnostic Biochips",
  imec: "IMEC · Neuropixels",
  neuronexus: "NeuroNexus",
  plexon: "Plexon",
  "sinaps-research-platform": "SINAPS",
};

interface ManufacturerGroup {
  key: string;
  entries: ManifestEntry[];
}

// Landing page: one card per manufacturer. Selecting a card enters the existing
// probe view (sidebar + viewer) on that manufacturer's first probe.
export function ProbeIndex() {
  const manifest = useAppStore((state) => state.manifest);
  const manifestStatus = useAppStore((state) => state.manifestStatus);
  const selectProbe = useAppStore((state) => state.selectProbe);

  const groups = useMemo<ManufacturerGroup[]>(() => {
    const map = new Map<string, ManifestEntry[]>();
    manifest.forEach((entry) => {
      const list = map.get(entry.manufacturer);
      if (list) list.push(entry);
      else map.set(entry.manufacturer, [entry]);
    });
    return Array.from(map.entries())
      .map(([key, entries]) => ({ key, entries }))
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { sensitivity: "base" }));
  }, [manifest]);

  return (
    <div className="index">
      <header className="index-header">
        <h1 className="index-title">Probe Catalog</h1>
        <p className="index-subtitle">Select a manufacturer to browse its probes.</p>
      </header>

      {manifestStatus === "loading" && <p className="index-hint">Loading catalog…</p>}
      {manifestStatus === "error" && <p className="index-error">Failed to load catalog.</p>}

      <div className="index-grid index-grid--manufacturers" role="list">
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            className="probe-card"
            onClick={() => selectProbe(group.entries[0].id)}
          >
            <ManufacturerMedia
              groupKey={group.key}
              label={MANUFACTURER_DISPLAY_NAMES[group.key] ?? group.key}
            />
            <div className="probe-card-body">
              <span className="probe-card-title">
                {MANUFACTURER_DISPLAY_NAMES[group.key] ?? group.key}
              </span>
              <span className="probe-card-meta">
                {group.entries.length} {group.entries.length === 1 ? "probe" : "probes"}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
