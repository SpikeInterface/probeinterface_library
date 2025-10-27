from pathlib import Path
import shutil

old_dir = Path('../imec')
new_dir = Path('../probeinterface/resources/neuropixels_library_generated')

existing_probes = list(probe_path.name for probe_path in old_dir.iterdir())

for temp_probe_path in new_dir.iterdir():
    if temp_probe_path.name not in existing_probes:
        shutil.copytree(f"{temp_probe_path}", f"../imec/{temp_probe_path.name}")