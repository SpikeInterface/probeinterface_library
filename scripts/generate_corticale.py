# /// script
# requires-python = ">=3.12"
# dependencies = ["probeinterface"]
# ///
"""Generator for the Corticale SiNAPS probe library.

Builds one probeinterface JSON per probe model and writes it to
corticale/<model>/<model>.json. Every dimension comes from the Corticale
technical datasheet and is stored below in two levels:

- ``Arrangement`` describes a single shank. There is one for each electrode
  layout (2 or 4 columns): electrode size, horizontal and vertical pitch,
  where the columns sit across the shank width, and the shape of the tip.

- ``Model`` describes a probe (M0001 ... M0005). It picks an arrangement and
  adds what differs between probes: number of shanks, electrodes per shank,
  shank length and, for multi-shank probes, the distance between shanks.

Coordinates are in micrometres, with the probe seen from the front and the
tip pointing down. The origin is the centre of electrode 0 (bottom-left);
x grows to the right, y grows up the shank. An integrated reference strip
runs along the right edge of each shank, which is why the electrode columns
are not centred in the shank.

Electrodes are numbered shank by shank from the left, then row by row from
the tip up, then column by column from the left, starting at 0:

    id = shank * pixels_per_shank + row * columns + column

Besides model name and manufacturer, each JSON stores the tip of every shank
and the shank thickness, which a 2D layout cannot show. The IMEC probes in 
this library do the same.

Run with: uv run scripts/generate_corticale.py
"""

import math
from dataclasses import dataclass
from pathlib import Path

from probeinterface import Probe, ProbeGroup, write_probeinterface

MANUFACTURER = "corticale"
SHANK_THICKNESS_UM = 50.0  # shank (and base) thickness, all models
BASE_BAND_UM = 50.0  # height of the band joining the shanks at the top (multi-shank, drawing only)


@dataclass(frozen=True)
class Arrangement:
    """Electrode-array arrangement: the geometry of a single shank.

    All lengths in micrometres, with the symbols used on the datasheet.
    """

    columns: int  # electrode columns per shank
    Ew: float  # electrode side (square electrodes, Eh x Ew)
    Hp: float  # horizontal pitch between columns, centre to centre
    Vp: float  # vertical pitch between rows, centre to centre
    Rw: float  # width of the integrated reference strip along the right shank edge
    Rgw: float  # lateral gap between the last column and the reference strip
    Rgh: float  # gap between the end of the tapered tip and the lower edge of the first electrode
    d_tip: float  # distance from the tip to the lower edge of the first electrode
    W2: float  # shank width, the same for every model with this arrangement

    # -- Derived geometry, in the electrode-0 frame -------------------------

    @property
    def m_sx(self) -> float:
        """Left margin: left shank edge to left edge of the first column."""
        return self.W2 - self.Rw - self.Rgw - (self.columns - 1) * self.Hp - self.Ew

    @property
    def shank_left_x(self) -> float:
        """x of the left shank edge."""
        return -(self.m_sx + self.Ew / 2)

    @property
    def shank_right_x(self) -> float:
        """x of the right shank edge."""
        return self.shank_left_x + self.W2

    @property
    def reference_strip_x(self) -> tuple[float, float]:
        """x range of the integrated reference strip (not part of the contour)."""
        start = (self.columns - 1) * self.Hp + self.Ew / 2 + self.Rgw
        return (start, self.shank_right_x)

    @property
    def shoulder_y(self) -> float:
        """y where the shank stops tapering towards the tip."""
        return -(self.Rgh + self.Ew / 2)

    @property
    def tip(self) -> tuple[float, float]:
        """Tip of the shank: centred laterally on the shank."""
        return (self.shank_left_x + self.W2 / 2, -(self.d_tip + self.Ew / 2))

    @property
    def tip_angle_deg(self) -> float:
        """Full tip angle implied by the dimensions above (informative only)."""
        taper_length = self.shoulder_y - self.tip[1]
        return math.degrees(2 * math.atan((self.W2 / 2) / taper_length))


@dataclass(frozen=True)
class Model:
    """One SiNAPS probe model.

    All lengths in micrometres.
    """

    code: str  # model name, also the folder and file name
    arrangement: str  # key into ARRANGEMENTS
    shanks: int  # number of shanks
    pixels_per_shank: int  # electrodes on each shank
    L2: float  # shank length, measured from the tip
    W3: float | None = None  # shank pitch, centre to centre (multi-shank only)

    @property
    def spec(self) -> Arrangement:
        return ARRANGEMENTS[self.arrangement]

    @property
    def rows(self) -> int:
        """Electrode rows per shank."""
        rows, remainder = divmod(self.pixels_per_shank, self.spec.columns)
        assert remainder == 0, f"{self.code}: pixels per shank not a multiple of the columns"
        return rows

    def shank_offset(self, shank: int) -> float:
        """x shift of a shank with respect to shank 0."""
        return float(shank * self.W3) if self.shanks > 1 else 0.0


# Electrode-array arrangements, from the technical datasheet.
ARRANGEMENTS = {
    "2col": Arrangement(columns=2, Ew=15, Hp=27, Vp=30.33, Rw=23, Rgw=8, Rgh=13, d_tip=185, W2=88),
    "4col": Arrangement(columns=4, Ew=15, Hp=27, Vp=30.33, Rw=36, Rgw=8, Rgh=13, d_tip=300, W2=156),
}

# Probe models, from the technical datasheet: all SiNAPS Generation II.
MODELS = [
    Model("M0001", "2col", shanks=1, pixels_per_shank=256, L2=5920),
    Model("M0002", "2col", shanks=4, pixels_per_shank=256, L2=5800, W3=560),
    Model("M0003", "2col", shanks=1, pixels_per_shank=512, L2=9706),
    Model("M0004", "2col", shanks=8, pixels_per_shank=128, L2=5070, W3=300),
    Model("M0005", "4col", shanks=1, pixels_per_shank=512, L2=6900),
]


def contact_positions(model: Model) -> list[list[float]]:
    """Electrode centres, in id order (shank, then row, then column).

    Rounded to 0.01 um to drop floating-point noise (e.g. 3 * 30.33).
    """
    spec = model.spec
    return [
        [round(model.shank_offset(shank) + column * spec.Hp, 2), round(row * spec.Vp, 2)]
        for shank in range(model.shanks)
        for row in range(model.rows)
        for column in range(spec.columns)
    ]


def shank_tips(model: Model) -> list[list[float]]:
    """Tip of every shank, left to right."""
    tip_x, tip_y = model.spec.tip
    return [[model.shank_offset(shank) + tip_x, tip_y] for shank in range(model.shanks)]


def planar_contour(model: Model) -> list[list[float]]:
    """Outline of the shanks, from the tips up to the base.

    Five points per shank (top-left, left shoulder, tip, right shoulder,
    top-right). Shanks are chained left to right at the top, where they join
    the base. On multi-shank probes the two outer corners are raised by
    BASE_BAND_UM, so the shanks hang from a visible band, as in the
    sinaps-research-platform entries.
    """
    spec = model.spec
    tip_x, tip_y = spec.tip
    top_y = tip_y + model.L2
    contour = []
    for shank in range(model.shanks):
        dx = model.shank_offset(shank)
        contour += [
            [dx + spec.shank_left_x, top_y],
            [dx + spec.shank_left_x, spec.shoulder_y],
            [dx + tip_x, tip_y],
            [dx + spec.shank_right_x, spec.shoulder_y],
            [dx + spec.shank_right_x, top_y],
        ]
    if model.shanks > 1:
        contour[0][1] += BASE_BAND_UM
        contour[-1][1] += BASE_BAND_UM
    return contour


def description(model: Model) -> str:
    shanks = "1 shank" if model.shanks == 1 else f"{model.shanks} shanks"
    return (
        f"SiNAPS Generation II, {model.shanks * model.pixels_per_shank} electrodes, "
        f"{shanks}, {model.spec.columns} columns"
    )


def build_probe(model: Model) -> Probe:
    spec = model.spec
    probe = Probe(ndim=2, si_units="um")
    probe.set_contacts(
        positions=contact_positions(model),
        shapes="square",
        shape_params={"width": spec.Ew},
        shank_ids=[str(i // model.pixels_per_shank) for i in range(model.shanks * model.pixels_per_shank)]
        if model.shanks > 1
        else None,
    )
    probe.set_contact_ids([str(i) for i in range(probe.get_contact_count())])
    probe.set_planar_contour(planar_contour(model))
    probe.annotate(
        model_name=model.code,
        manufacturer=MANUFACTURER,
        first_index=0,
        description=description(model),
        shank_tips=shank_tips(model),
        shank_thickness_um=SHANK_THICKNESS_UM,
    )
    return probe


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    for model in MODELS:
        probe = build_probe(model)
        group = ProbeGroup()
        group.add_probe(probe)

        out_dir = root / MANUFACTURER / model.code
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / f"{model.code}.json"
        write_probeinterface(out_file, group)
        print(f"wrote {out_file}  ({description(model)})")


if __name__ == "__main__":
    main()
