import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useLocalProbeLoader } from "../hooks/useLocalProbeLoader";
import { useAppStore } from "../state/useAppStore";

// probeinterface documentation for producing a compliant file, linked so a user
// who has no file knows how to export one.
const WRITE_DOCS_URL =
  "https://probeinterface.readthedocs.io/en/main/api.html#probeinterface.io.write_probeinterface";

// The /local screen when no probe is loaded: either a cold visit (local bytes
// cannot survive a reload) or a file we rejected, in which case the schema
// errors are shown above the dropzone so the user can fix and retry.
export function LocalProbePanel() {
  const { fileInputProps, loadFile, openPicker, loading } = useLocalProbeLoader();
  const localProbeError = useAppStore((state) => state.localProbeError);
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="local-loader-panel">
      <div
        className={`local-loader-dropzone${dragOver ? " is-dragover" : ""}`}
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void loadFile(event.dataTransfer.files?.[0]);
        }}
      >
        <input {...fileInputProps} />
        <p className="local-loader-title">
          {loading
            ? "Loading…"
            : localProbeError
              ? "This file could not be loaded"
              : "No probe loaded"}
        </p>
        <p className="local-loader-hint">
          Drop a probeinterface JSON file here, or click to browse.
        </p>
      </div>

      {localProbeError && (
        <pre className="local-loader-error">{localProbeError}</pre>
      )}

      <p className="local-loader-links">
        Need a file?{" "}
        <button
          type="button"
          className="local-loader-link"
          onClick={() => navigate("/")}
        >
          Browse the catalog
        </button>{" "}
        or export one with{" "}
        <a href={WRITE_DOCS_URL} target="_blank" rel="noreferrer">
          write_probeinterface
        </a>
        .
      </p>
    </div>
  );
}
