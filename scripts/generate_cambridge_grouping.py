# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Generate the explicit sidebar-grouping config for Cambridge NeuroTech.

The probe-viewer sidebar groups one manufacturer from a hand-curated JSON tree
(see apps/probe-viewer/src/grouping/). This script emits that JSON for Cambridge
NeuroTech so every one of its ~171 models is placed (no "Ungrouped" bucket),
then it can be hand-tuned. It reads only the committed probe JSON (stdlib only).

Decode of the model id ASSY-<series>-<variant>:
  - series number  -> channel count + acute/chronic + connector (SERIES table)
  - variant letter -> electrode-layout family (E/P/F/H/L/M)
  - full variant   -> the specific geometry (H3, P-1, M1v1, F8-0, ...)

Hierarchy (chosen after web research on how these probes are cited): the type
letter is the top level (researchers cite the geometry, e.g. "H3", and Cambridge
brands the H family), then channel count, then the specific geometry variant as
the leaf, whose probes are the packaging options (the different ASSY numbers).

Run with:  uv run scripts/generate_cambridge_grouping.py
"""

import json
import re
from pathlib import Path

MANUFACTURER = "cambridgeneurotech"

# series number -> (modality, channels, connector). From the Cambridge NeuroTech
# probe-maps table (cambridgeneurotech.com/probe-maps); used for sort order only.
SERIES = {
    "1": ("Acute", 16, "Samtec"),
    "37": ("Acute", 32, "Samtec"),
    "77": ("Acute", 64, "Samtec"),
    "79": ("Chronic", 16, "Omnetics"),
    "116": ("Chronic", 32, "Omnetics"),
    "156": ("Chronic", 64, "Omnetics"),
    "158": ("Chronic", 64, "Omnetics"),
    "196": ("Chronic", 32, "Molex"),
    "236": ("Chronic", 64, "Molex"),
    "276": ("Chronic", 64, "TDT Zif-Clip"),
    "325": ("Chronic", 64, "Intan (digital)"),
    "325D": ("Chronic", 128, "Intan (digital)"),
    "350": ("Chronic", 128, "Intan (digital)"),
}

# Type-letter families, in display order. H first (largest, the only family
# Cambridge brands). The parenthetical for E/P/F/L/M is a descriptive label
# inferred from geometry, not an official Cambridge name (only "H-series" is
# documented); recorded in TYPE_NOTE below.
TYPE_ORDER = ["H", "P", "E", "F", "L", "M"]
TYPE_LABEL = {
    "H": "H (high-resolution / dense recording)",
    "P": "P (compact array)",
    "E": "E (compact edge array)",
    "F": "F (fine-pitch multi-shank)",
    "L": "L (linear / laminar)",
    "M": "M (single-shank)",
}
TYPE_NOTE = (
    "Descriptive label inferred from geometry; Cambridge publishes an official "
    "name only for the H-series."
)


def parse(model: str):
    m = re.match(r"ASSY-([0-9]+D?)-(.+)", model)
    series, variant = m.group(1), m.group(2)
    # The family is always the single leading letter (E/P/F/H/L/M). Match one
    # char only, so "Fb" -> "F" (not "Fb") while "H10b" -> "H".
    letter = variant[0]
    return series, letter, variant


def variant_sort_key(variant: str):
    # Natural order: H2 < H3 < H9 < H10 < H10b; P-1 < P-2; F8-0 < F8-1.
    nums = [int(n) for n in re.findall(r"\d+", variant)]
    return (re.match(r"[A-Za-z]+", variant).group(0), nums, variant)


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    probes = []
    for path in sorted((root / MANUFACTURER).glob("*/*.json")):
        data = json.load(open(path))["probes"][0]
        model = data["annotations"]["model_name"]
        channels = len(data["contact_positions"])
        shank_ids = data.get("shank_ids")
        shanks = len(set(shank_ids)) if shank_ids else 1
        series, letter, variant = parse(model)
        # Bucket the lone 63-channel probe with 64.
        channel_bucket = 64 if channels == 63 else channels
        probes.append((letter, channel_bucket, variant, model, series, shanks))

    def series_sort(series):
        modality, _, connector = SERIES[series]
        return (0 if modality == "Acute" else 1, int(re.sub(r"\D", "", series)), connector)

    hierarchy = []
    for letter in TYPE_ORDER:
        fam = [p for p in probes if p[0] == letter]
        if not fam:
            continue
        channel_nodes = []
        for channel in sorted(set(p[1] for p in fam)):
            in_channel = [p for p in fam if p[1] == channel]
            variant_nodes = []
            for variant in sorted(set(p[2] for p in in_channel), key=variant_sort_key):
                group = [p for p in in_channel if p[2] == variant]
                group.sort(key=lambda p: series_sort(p[4]))
                shank_set = set(p[5] for p in group)
                if len(shank_set) == 1:
                    n = next(iter(shank_set))
                    label = f"{variant} ({n} shank{'s' if n != 1 else ''})"
                else:
                    label = variant
                variant_nodes.append({"label": label, "probes": [p[3] for p in group]})
            channel_nodes.append({"label": f"{channel} channel", "children": variant_nodes})
        node = {"label": TYPE_LABEL[letter], "children": channel_nodes}
        if letter != "H":
            node["note"] = TYPE_NOTE
        hierarchy.append(node)

    out = root / "apps" / "probe-viewer" / "src" / "grouping" / f"{MANUFACTURER}.json"
    out.write_text(json.dumps({"hierarchy": hierarchy}, indent=2) + "\n")

    placed = sum(len(v["probes"]) for fam in hierarchy for ch in fam["children"] for v in ch["children"])
    print(f"wrote {out}")
    print(f"placed {placed} / {len(probes)} probes")
    # Textual preview + leaf-size audit.
    for fam in hierarchy:
        print(f"\n{fam['label']}")
        for ch in fam["children"]:
            print(f"  {ch['label']}")
            for v in ch["children"]:
                print(f"    {v['label']:14} [{len(v['probes'])}]  {', '.join(v['probes'])}")


if __name__ == "__main__":
    main()
