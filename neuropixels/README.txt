All theses neuropixels probe have been generated from probeinterface.

This file contains all specifications known by us
probeinterface/src/probeinterface/neuropixel_tools.py

This file is to generate json and figures:
probeinterface/resources/generate_neuropixel_library.py

Important notes:
  * probes contains all possibles contacts but at recording only 384 are recorded
  * x (left-right axis) is the width of the probe
  * y (bottom-up axis) is the depth of the probe
  * The reference (0, 0) is the left bottom corner contact (NOT the border of the probe)
  * The polygon of probe is not totally garanty to be exact (but we try our best). The width should accurate.
