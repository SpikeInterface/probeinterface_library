import glob
import jsonschema
import json
import requests

schema_url = "https://raw.githubusercontent.com/SpikeInterface/probeinterface/main/resources/probe.json.schema"

response = requests.get(schema_url)
response.raise_for_status()

files = glob.glob("*/*/*.json")

print("Validating the following files:")
for file in files:
    print(file)
    with open(file) as f:
        data = json.load(f)
        jsonschema.validate(data, response.json())