#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Build the probe-viewer app for the probeinterface_library GitHub Pages site.

Usage (from the repository root):
    uv run apps/probe-viewer/build.py

Or make executable and run directly:
    ./apps/probe-viewer/build.py

This script:
1. Reads the probe JSON files from this repository (the manufacturer folders)
2. Generates the manifest and copies probe JSON files to apps/probe-viewer/public/
3. Builds the frontend with Vite
4. Output is in apps/probe-viewer/dist/

The probe data lives in this same repository, so there is no clone step: the
manifest is generated directly from the manufacturer folders at the repo root.
The manifest metadata is read straight from the ProbeInterface JSON, so this
script has no third-party dependencies.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


# ============================================================================
# Manifest generation
# ============================================================================


@dataclass
class ManifestEntry:
    """Serializable manifest entry for a single probe model."""

    id: str
    manufacturer: str
    model: str
    display_name: str
    json_url: str
    contact_count: int
    shank_count: int
    has_3d_geometry: bool
    annotations: dict

    def to_json(self) -> dict:
        return asdict(self)


def iter_manufacturer_dirs(base_path: Path) -> Iterable[Path]:
    for path in sorted(base_path.iterdir()):
        if path.is_dir() and not path.name.startswith("."):
            yield path


def load_probe_metadata(json_path: Path) -> ManifestEntry:
    # The manifest metadata is read straight from the ProbeInterface JSON. The
    # repo's JSON is the source of truth, so no probe library is needed here; the
    # schema itself is validated separately by the data tests (tests.py).
    probefile = json.loads(json_path.read_text(encoding="utf-8"))
    probes = probefile.get("probes", [])
    if not probes:
        raise ValueError(f"No probes found in {json_path}")

    manufacturer = json_path.parents[1].name
    model = json_path.parent.name
    probe_id = f"{manufacturer}:{model}"

    total_contacts = sum(len(probe.get("contact_positions", [])) for probe in probes)
    shank_count = max(len(set(probe.get("shank_ids") or [None])) for probe in probes)
    has_3d = any(probe.get("ndim") == 3 for probe in probes)
    annotations = probes[0].get("annotations") or {}
    display_name = annotations.get("model_name") or model

    return ManifestEntry(
        id=probe_id,
        manufacturer=manufacturer,
        model=model,
        display_name=display_name,
        json_url=json_path.name,
        contact_count=total_contacts,
        shank_count=shank_count,
        has_3d_geometry=has_3d,
        annotations=annotations,
    )


def copy_model_assets(model_dir: Path, destination_dir: Path) -> None:
    destination_dir.mkdir(parents=True, exist_ok=True)
    for asset_path in model_dir.iterdir():
        if asset_path.suffix.lower() != ".json":
            continue
        dest_path = destination_dir / asset_path.name
        shutil.copy2(asset_path, dest_path)


def generate_manifest(
    repository_root: Path,
    output_dir: Path,
) -> list[ManifestEntry]:
    entries: list[ManifestEntry] = []

    data_dir = output_dir / "data"
    if data_dir.exists():
        shutil.rmtree(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)

    for manufacturer_dir in iter_manufacturer_dirs(repository_root):
        manufacturer = manufacturer_dir.name

        # Skip non-probe directories
        if manufacturer in {
            "apps",
            "frontend",
            "scripts",
            "docs",
            "tests",
            "node_modules",
            ".git",
            ".github",
            ".cache",
            ".venv",
        }:
            continue

        model_dirs = [
            model_dir
            for model_dir in iter_manufacturer_dirs(manufacturer_dir)
            if (model_dir / f"{model_dir.name}.json").exists()
        ]

        if not model_dirs:
            continue

        for model_dir in model_dirs:
            model = model_dir.name
            json_path = model_dir / f"{model}.json"

            try:
                entry = load_probe_metadata(json_path)
            except Exception as exc:
                print(f"Warning: Failed to parse {json_path}: {exc}", file=sys.stderr)
                continue

            copy_model_assets(model_dir, data_dir / manufacturer / model)
            entry.json_url = f"data/{manufacturer}/{model}/{entry.json_url}"
            entries.append(entry)

    entries.sort(key=lambda item: (item.manufacturer.lower(), item.model.lower()))
    return entries


def write_manifest(entries: Iterable[ManifestEntry], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    payload = [entry.to_json() for entry in entries]
    destination.write_text(
        json.dumps(payload, indent=2),
        encoding="utf-8",
    )


# ============================================================================
# Build logic
# ============================================================================


def run(cmd: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    """Run a command and print it."""
    print(f"  > {' '.join(cmd)}")
    return subprocess.run(cmd, cwd=cwd, check=check)


def build_frontend(frontend_dir: Path, base_path: str) -> Path:
    """Build the frontend and return the dist directory."""

    # Install dependencies if needed
    if not (frontend_dir / "node_modules").exists():
        print("Installing npm dependencies...")
        run(["npm", "install"], cwd=frontend_dir)

    # Build
    print("Building frontend...")
    run(["npx", "vite", "build", "--base", base_path], cwd=frontend_dir)

    return frontend_dir / "dist"


def main() -> None:
    parser = argparse.ArgumentParser(description="Build probe-viewer for GitHub Pages")
    parser.add_argument(
        "--base",
        default="/probeinterface_library/",
        help="Base public path the site is served from (default: /probeinterface_library/)",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Start dev server instead of building",
    )
    args = parser.parse_args()

    # This script lives at apps/probe-viewer/build.py, so the frontend source is
    # its own directory and the repo root is two levels up.
    frontend_dir = Path(__file__).resolve().parent
    repo_root = frontend_dir.parents[1]

    # The probe data is this repository: manufacturer folders live at the repo root.
    probe_data_root = repo_root

    public_dir = frontend_dir / "public"

    if not frontend_dir.exists():
        print(f"Error: Frontend source not found at {frontend_dir}", file=sys.stderr)
        sys.exit(1)

    # Generate manifest and copy probe JSONs to public/
    print(f"Generating manifest from {probe_data_root}...")
    entries = generate_manifest(probe_data_root, public_dir)
    manifest_path = public_dir / "probes-manifest.json"
    write_manifest(entries, manifest_path)
    print(f"Wrote {len(entries)} entries to {manifest_path}")

    if args.dev:
        # Start dev server
        print("Starting dev server...")
        run(["npm", "run", "dev"], cwd=frontend_dir)
    else:
        # Build frontend (hash routing means no 404.html redirect is needed)
        dist_dir = build_frontend(frontend_dir, args.base)

        print(f"Done! Build output at: {dist_dir}")


if __name__ == "__main__":
    main()
