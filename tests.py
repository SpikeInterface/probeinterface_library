import glob
import json

import jsonschema
import pytest
import requests

schema_url = "https://raw.githubusercontent.com/SpikeInterface/probeinterface/main/src/probeinterface/schema/probe.json.schema"

response = requests.get(schema_url)
response.raise_for_status()

# Probe files live at <manufacturer>/<model>/<model>.json. Exclude directories
# that are not probe data (the probe-viewer app ships its own JSON config files).
NON_PROBE_DIRS = {"apps", "scripts", "node_modules", ".github"}
files = [
    file
    for file in glob.glob("*/*/*.json")
    if file.split("/")[0] not in NON_PROBE_DIRS
]


@pytest.mark.parametrize("file", files)
def test_valid_probe_dict(file):
    with open(file) as f:
        data = json.load(f)
        jsonschema.validate(data, response.json())

@pytest.mark.parametrize("file", files)
def test_naming_convention(file):
    """Check that model_name and manufacturer are lowercase. and they correspond to the path."""
    with open(file) as f:
        data = json.load(f)
        probe_annotations = data["probes"][0]["annotations"]
        model_name = probe_annotations["model_name"]
        manufacturer = probe_annotations["manufacturer"]
        assert manufacturer == manufacturer.lower()
        path_parts = file.split("/")
        assert model_name == path_parts[-1].replace(".json", "")
        assert model_name == path_parts[-2]
        assert manufacturer == path_parts[-3]