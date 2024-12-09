import glob
import json

import jsonschema
import pytest
import requests

schema_url = "https://raw.githubusercontent.com/SpikeInterface/probeinterface/main/resources/probe.json.schema"

response = requests.get(schema_url)
response.raise_for_status()

files = glob.glob("*/*/*.json")


@pytest.mark.parametrize("file", files)
def test_valid_probe_dict(file):
    with open(file) as f:
        data = json.load(f)
        jsonschema.validate(data, response.json())