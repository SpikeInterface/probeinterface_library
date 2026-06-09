"""Generator for Diagnostic Biochips Deep Array probes.

Builds the Deep Array models from the 2022 Diagnostic Biochips catalog
datasheets and writes each as diagnosticbiochips/<model>/<model>.json in the
probeinterface format.

Two layout families are produced:

- Linear models (DA128-1, DA64-1, DA32-1, DA32-2): a single column of sites,
  pitch from the datasheet, span = (n_contacts - 1) * pitch.

- Staggered models (DA128-2, DA64-2): a two-column triangular (hexagonal)
  lattice. The columns are 43.3 um apart horizontally, sites alternate columns
  going down the shank with a 25 um vertical step (so 50 um within a column),
  and the diagonal nearest-neighbor distance is sqrt(43.3**2 + 25**2) = 50 um.
  The datasheet schematic is "not drawn to scale", but span = (n_contacts - 1)
  * 25 um matches the printed recording span exactly for both models, which
  fixes the layout to one site per 25 um level, i.e. exactly two columns.

Run with:  uv run --with probeinterface scripts/generate_diagnostic_biochips.py
"""

from pathlib import Path

from probeinterface import Probe, ProbeGroup, write_probeinterface

MANUFACTURER = "diagnosticbiochips"
SITE_DIAMETER_UM = 20.0
SHANK_WIDTH_UM = 200.0  # 0.2 mm stainless steel shank
TIP_LENGTH_UM = 150.0   # cosmetic pointed tip below the deepest site

# (model, n_contacts, vertical_pitch_um)
LINEAR_MODELS = [
    ("DA128-1", 128, 40.0),
    ("DA64-1", 64, 100.0),
    ("DA32-1", 32, 65.0),
    ("DA32-2", 32, 100.0),
]

# (model, n_contacts) -- shared staggered lattice constants below.
STAGGERED_MODELS = [
    ("DA128-2", 128),
    ("DA64-2", 64),
]
STAGGERED_X_OFFSET_UM = 21.65  # 43.3 um column separation -> +/-21.65
STAGGERED_VERTICAL_STEP_UM = 25.0  # step between alternating columns


def _shank_contour(span_um: float) -> list:
    half_width = SHANK_WIDTH_UM / 2.0
    y_top = span_um + half_width
    return [
        [-half_width, y_top],
        [-half_width, -half_width],
        [0.0, -half_width - TIP_LENGTH_UM],
        [half_width, -half_width],
        [half_width, y_top],
    ]


def build_linear_probe(model_name: str, n_contacts: int, pitch_um: float) -> Probe:
    # Single column centered on the shank; site 0 at the tip, y increasing up.
    positions = [[0.0, index * pitch_um] for index in range(n_contacts)]

    probe = Probe(ndim=2, si_units="um")
    probe.set_contacts(
        positions=positions,
        shapes="circle",
        shape_params={"radius": SITE_DIAMETER_UM / 2.0},
    )
    probe.annotate(model_name=model_name, manufacturer=MANUFACTURER)
    probe.set_contact_ids([str(index) for index in range(n_contacts)])
    probe.set_planar_contour(_shank_contour((n_contacts - 1) * pitch_um))
    return probe


def build_staggered_probe(model_name: str, n_contacts: int) -> Probe:
    # Two columns +/-STAGGERED_X_OFFSET_UM apart; sites alternate columns going
    # up the shank with a STAGGERED_VERTICAL_STEP_UM step (site 0 at the tip).
    positions = []
    for index in range(n_contacts):
        x = -STAGGERED_X_OFFSET_UM if index % 2 == 0 else STAGGERED_X_OFFSET_UM
        positions.append([x, index * STAGGERED_VERTICAL_STEP_UM])

    probe = Probe(ndim=2, si_units="um")
    probe.set_contacts(
        positions=positions,
        shapes="circle",
        shape_params={"radius": SITE_DIAMETER_UM / 2.0},
    )
    probe.annotate(model_name=model_name, manufacturer=MANUFACTURER)
    probe.set_contact_ids([str(index) for index in range(n_contacts)])
    probe.set_planar_contour(_shank_contour((n_contacts - 1) * STAGGERED_VERTICAL_STEP_UM))
    return probe


def _write(root: Path, probe: Probe, model_name: str, n_contacts: int, span_um: float) -> None:
    group = ProbeGroup()
    group.add_probe(probe)
    out_dir = root / MANUFACTURER / model_name
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"{model_name}.json"
    write_probeinterface(out_file, group)
    print(f"wrote {out_file}  ({n_contacts}ch, {span_um / 1000.0:g} mm span)")


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    for model_name, n_contacts, pitch_um in LINEAR_MODELS:
        probe = build_linear_probe(model_name, n_contacts, pitch_um)
        _write(root, probe, model_name, n_contacts, (n_contacts - 1) * pitch_um)
    for model_name, n_contacts in STAGGERED_MODELS:
        probe = build_staggered_probe(model_name, n_contacts)
        span_um = (n_contacts - 1) * STAGGERED_VERTICAL_STEP_UM
        _write(root, probe, model_name, n_contacts, span_um)


if __name__ == "__main__":
    main()
