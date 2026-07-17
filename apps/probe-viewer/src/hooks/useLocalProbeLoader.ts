import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { useAppStore } from "../state/useAppStore";

// Shared plumbing for the two places a user can hand us a file: the catalog
// header (button + drag overlay) and the /local empty state.
//
// Every attempt lands on /local, whether the file was accepted or rejected: a
// compliant file renders there, and a rejected one shows its schema errors in
// the empty state's panel. That keeps /local the single place compliance errors
// are reported, so the catalog needs no error UI of its own.
export function useLocalProbeLoader() {
  const loadLocalProbe = useAppStore((state) => state.loadLocalProbe);
  const loading = useAppStore((state) => state.localProbeStatus === "loading");
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      await loadLocalProbe(file);
      navigate("/local");
    },
    [loadLocalProbe, navigate],
  );

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  // Spread onto a hidden <input type="file">. Resetting value on change lets the
  // same file be picked again after a rejection.
  const fileInputProps = {
    ref: inputRef,
    type: "file" as const,
    accept: "application/json,.json",
    className: "local-loader-input",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      void loadFile(event.target.files?.[0]);
      event.target.value = "";
    },
  };

  return { fileInputProps, loadFile, openPicker, loading };
}
