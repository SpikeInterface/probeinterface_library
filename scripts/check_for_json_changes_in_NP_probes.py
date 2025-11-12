from pathlib import Path
import shutil

old_dir = Path('../imec')
new_dir = Path('./neuropixels_library_generated')

for temp_probe_directory in new_dir.iterdir():

    probe_name = str(temp_probe_directory.name)

    temp_probe_json_path = temp_probe_directory / (probe_name + '.json')
    old_probe_json_path = old_dir / probe_name / (probe_name + '.json')

    if old_probe_json_path.is_file():
        with open(temp_probe_json_path, 'r') as f1, open(old_probe_json_path, 'r') as f2:
            # Read in json files
            lines1 = f1.readlines()
            lines2 = f2.readlines()

        # We don't want to update the probes just because of a probeinterface version update.
        # The probeinterface version is stored on the 3rd line of the json file, so we only
        # compare the json files from line 3 and down.
        if lines1[3:] == lines2[3:]:
            continue
        else:
            shutil.copy(f"{temp_probe_json_path}", f"../imec/{probe_name}")