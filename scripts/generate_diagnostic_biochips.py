# /// script
# requires-python = ">=3.10"
# dependencies = ["probeinterface"]
# ///
"""Generator for Diagnostic Biochips Deep Array probes.

The source of truth is the 2022 Diagnostic Biochips catalog (one datasheet page
per model). Each model's spec table and schematic dimensions are transcribed
verbatim below into a DeepArraySpec, in the exact units printed on the sheet.
Everything written to diagnosticbiochips/<model>/<model>.json is derived from
those values; nothing geometric is invented here.

The probeinterface JSON follows the same convention as the Neuropixels and
Cambridge NeuroTech entries in this library: the geometry is stored
geometrically (contact positions, contact shape, full-shank contour) and the
annotations carry only what the geometry cannot express. For these passive
probes that is just the shank material; site diameter, shank diameter, max
shank length and recording span are all recoverable from the geometry.

Two layout families appear on the datasheets:

- Linear (DA128-1, DA64-1, DA32-1, DA32-2): a single column of sites at the
  printed vertical pitch.

- Staggered (DA128-2, DA64-2): a two-column triangular (hexagonal) lattice.
  The columns are 43.3 um apart horizontally and sites alternate columns going
  up the shank with a 25 um vertical step (so 50 um within a column); the
  diagonal nearest-neighbor distance is sqrt(43.3**2 + 25**2) = 50 um. The
  schematic is "not drawn to scale", but (n_channels - 1) * 25 um equals the
  printed recording span exactly, which fixes the layout to one site per 25 um
  level, i.e. exactly two columns. This is checked against the datasheet value
  for every model before writing (see _build_probe).

Dependencies are declared inline (PEP 723), so this runs standalone:

    uv run scripts/generate_diagnostic_biochips.py
"""

from dataclasses import dataclass
from pathlib import Path

from probeinterface import Probe, ProbeGroup, write_probeinterface

MANUFACTURER = "diagnosticbiochips"
TIP_LENGTH_UM = 150.0  # cosmetic pointed tip below the shank base (not on the sheet)


@dataclass(frozen=True)
class DeepArraySpec:
    """Verbatim transcription of one 2022 Diagnostic Biochips catalog page.

    Spec-table fields keep the units printed on the datasheet; the two layout
    fields are read from the schematic dimension callouts.
    """

    model: str
    num_channels: int
    layout: str  # "linear" or "staggered"
    # Spec table
    site_diameter_um: float
    shank_diameter_mm: float
    max_shank_length_mm: float
    recording_span_mm: float
    shank_material: str
    # Schematic dimension callouts
    vertical_pitch_um: float  # linear: column pitch; staggered: step between alternating sites
    horizontal_offset_um: float | None = None  # staggered only: full column separation


# One entry per datasheet page, values exactly as printed on the 2022 catalog.
DATASHEETS = [
    DeepArraySpec("DA128-1", 128, "linear", 20.0, 0.2, 90.0, 5.08, "stainless steel", 40.0),
    DeepArraySpec("DA64-1", 64, "linear", 20.0, 0.2, 90.0, 6.3, "stainless steel", 100.0),
    DeepArraySpec("DA32-1", 32, "linear", 20.0, 0.2, 90.0, 2.015, "stainless steel", 65.0),
    DeepArraySpec("DA32-2", 32, "linear", 20.0, 0.2, 90.0, 3.1, "stainless steel", 100.0),
    DeepArraySpec("DA128-2", 128, "staggered", 20.0, 0.2, 90.0, 3.175, "stainless steel", 25.0, 43.3),
    DeepArraySpec("DA64-2", 64, "staggered", 20.0, 0.2, 90.0, 1.575, "stainless steel", 25.0, 43.3),
]


def _contact_positions(spec: DeepArraySpec) -> list:
    # Site 0 sits at the tip (y = 0) and the band grows up the shank.
    if spec.layout == "linear":
        # Single column centered on the shank.
        return [[0.0, index * spec.vertical_pitch_um] for index in range(spec.num_channels)]
    if spec.layout == "staggered":
        # Two columns +/-(horizontal_offset / 2), alternating every site.
        half_offset = spec.horizontal_offset_um / 2.0
        positions = []
        for index in range(spec.num_channels):
            x = -half_offset if index % 2 == 0 else half_offset
            positions.append([x, index * spec.vertical_pitch_um])
        return positions
    raise ValueError(f"unknown layout {spec.layout!r} for {spec.model}")


def _shank_contour(spec: DeepArraySpec) -> list:
    # Outline of the full physical shaft (tip to body): the printed shank
    # diameter sets the width, the printed max shank length sets the height.
    half_width = spec.shank_diameter_mm * 1000.0 / 2.0
    length_um = spec.max_shank_length_mm * 1000.0
    return [
        [-half_width, length_um],
        [-half_width, -half_width],
        [0.0, -half_width - TIP_LENGTH_UM],
        [half_width, -half_width],
        [half_width, length_um],
    ]


def _build_probe(spec: DeepArraySpec) -> Probe:
    positions = _contact_positions(spec)

    # The contact extent must reproduce the printed recording span.
    span_um = positions[-1][1] - positions[0][1]
    expected_um = spec.recording_span_mm * 1000.0
    assert abs(span_um - expected_um) < 1e-6, (
        f"{spec.model}: derived span {span_um} um != datasheet {expected_um} um"
    )

    probe = Probe(ndim=2, si_units="um")
    probe.set_contacts(
        positions=positions,
        shapes="circle",
        shape_params={"radius": spec.site_diameter_um / 2.0},
    )
    # Geometry encodes site diameter (radius), shank diameter (contour width),
    # max shank length (contour height) and recording span (contact extent), so
    # shank material is the only spec stored as an annotation.
    probe.annotate(
        model_name=spec.model,
        manufacturer=MANUFACTURER,
        shank_material=spec.shank_material,
    )
    probe.set_contact_ids([str(index) for index in range(spec.num_channels)])
    probe.set_planar_contour(_shank_contour(spec))
    return probe


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    for spec in DATASHEETS:
        probe = _build_probe(spec)
        group = ProbeGroup()
        group.add_probe(probe)

        out_dir = root / MANUFACTURER / spec.model
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / f"{spec.model}.json"
        write_probeinterface(out_file, group)
        print(f"wrote {out_file}  ({spec.num_channels}ch, {spec.layout}, {spec.recording_span_mm:g} mm span)")


if __name__ == "__main__":
    main()
