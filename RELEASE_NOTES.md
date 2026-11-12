# RELEASES

## 2026-11-12

- Updated all Cambridge NeuroTech probe JSON files.
- CI auto-PRs and tests now use the released `probeinterface` version.
- Bumped Python 3.10 -> 3.12 in CI.

## 2026-10-2

- Updated Neuropixels (NP) probe JSON files.

## 2026-03-25

- Added the probe viewer app (search, Neuropixels grouping, manufacturer landing page, SVG/PNG export).
- Viewer: support for double-sided probes with side selection, loading your own probeinterface file, JSON download and probeinterface snippet, and phone/short-screen layout.
- Added Diagnostic Biochips probes.
- Updated imec library with new probes and updated NP JSON files.
- Fixed contact-id label clustering on double-sided probes.
- Fixed JSON check to skip `probe_ids`/`version` and update old versions.

## 2025-10-02

- Unified naming convention: `{manufacturer}/{model_name}/{model_name}.json`.
- Added `generate_image.py` script to create probe images from JSON files.
- Added test to ensure naming convention.
- Added `RELEASE_NOTES.md` for tracking changes.

### Changes in probes:
- `sinaps`: folder renamed to `sinaps-research-platform`
- `plexon`: manufacturer name in JSON files changed from `Plexon-SiNAPS` to `plexon`