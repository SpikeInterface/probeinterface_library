"""Prototype generator for Diagnostic Biochips Deep Array probes.

Builds the four fully-specified linear Deep Array models from the 2022
Diagnostic Biochips catalog datasheets and writes each as
diagnostic-biochips/<model>/<model>.json in the probeinterface format.

The two staggered models (DA128-2, DA64-2) are intentionally omitted: the
catalog schematic is "not drawn to scale" and does not pin down the column
count or per-electrode coordinates, so their geometry is not yet known.

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

    half_width = SHANK_WIDTH_UM / 2.0
    y_top = (n_contacts - 1) * pitch_um + half_width
    contour = [
        [-half_width, y_top],
        [-half_width, -half_width],
        [0.0, -half_width - TIP_LENGTH_UM],
        [half_width, -half_width],
        [half_width, y_top],
    ]
    probe.set_planar_contour(contour)
    return probe


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    for model_name, n_contacts, pitch_um in LINEAR_MODELS:
        probe = build_linear_probe(model_name, n_contacts, pitch_um)
        group = ProbeGroup()
        group.add_probe(probe)

        out_dir = root / MANUFACTURER / model_name
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / f"{model_name}.json"
        write_probeinterface(out_file, group)
        span_mm = (n_contacts - 1) * pitch_um / 1000.0
        print(f"wrote {out_file}  ({n_contacts}ch, {pitch_um:g} um pitch, {span_mm:g} mm span)")


if __name__ == "__main__":
    main()
