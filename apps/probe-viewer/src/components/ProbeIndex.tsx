import { useMemo, useRef, useState } from "react";

import { useLocalProbeLoader } from "../hooks/useLocalProbeLoader";
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

const UploadIcon = (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

// Landing page: one card per manufacturer. Selecting a card enters the existing
// probe view (sidebar + viewer) on that manufacturer's first probe.
export function ProbeIndex() {
  const manifest = useAppStore((state) => state.manifest);
  const manifestStatus = useAppStore((state) => state.manifestStatus);
  const selectProbe = useAppStore((state) => state.selectProbe);
  const { fileInputProps, loadFile, openPicker } = useLocalProbeLoader();

  // Dragging a file anywhere over the catalog reveals a drop target, so the
  // capability surfaces exactly when the user's intent is evident rather than
  // costing a permanent dropzone on a page whose job is browsing. dragDepth
  // counts enter/leave across nested children, which would otherwise flicker.
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const isFileDrag = (event: React.DragEvent) =>
    event.dataTransfer.types.includes("Files");

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
    <div
      className="index"
      onDragEnter={(event) => {
        if (!isFileDrag(event)) return;
        dragDepth.current += 1;
        setDragActive(true);
      }}
      onDragOver={(event) => {
        // Required for the drop event to fire at all.
        if (isFileDrag(event)) event.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragActive(false);
        }
      }}
      onDrop={(event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragActive(false);
        void loadFile(event.dataTransfer.files?.[0]);
      }}
    >
      <input {...fileInputProps} />

      {dragActive && (
        <div className="index-drop-overlay">
          <div className="index-drop-overlay-inner">
            {UploadIcon}
            <p>Drop your probeinterface JSON to load it</p>
          </div>
        </div>
      )}

      <header className="index-header">
        <div className="index-header-row">
          <h1 className="index-title">Probe Catalog</h1>
          <button
            type="button"
            className="index-load-button"
            onClick={openPicker}
            title="Load a probeinterface JSON file from your computer"
          >
            {UploadIcon}
            Load your own file
          </button>
        </div>
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
