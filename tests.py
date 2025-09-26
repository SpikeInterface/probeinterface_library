import glob
import json

import jsonschema
import pytest
import requests

schema_url = "https://raw.githubusercontent.com/SpikeInterface/probeinterface/main/src/probeinterface/schema/probe.json.schema"

response = requests.get(schema_url)
response.raise_for_status()

files = glob.glob("*/*/*.json")


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
        model_name = data["annotations"]["model_name"]
        manufacturer = data["annotations"]["manufacturer"]
        assert model_name == model_name.lower()
        assert manufacturer == manufacturer.lower()
        path_parts = file.split("/")
        assert model_name == path_parts[-1].replace(".json", "")
        assert manufacturer == path_parts[-2]