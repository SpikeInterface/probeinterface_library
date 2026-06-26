# ProbeInterface Library

Library of probes in the **probeinterface** format, live at: https://spikeinterface.github.io/probeinterface_library


See:

  * GitHub repo: https://github.com/SpikeInterface/probeinterface
  * Documentation: https://probeinterface.readthedocs.io/


The format of probes is JSON-based. See [documentation](https://probeinterface.readthedocs.io/en/main/format_spec.html) for full specifications.


### Preview `probe-viewer` app locally

To build and preview the `probe-viewer` web-app locally:

```bash
cd apps/probe-viewer
uv run build.py
# build
npm run build
# run
npx vite preview
```
