from argparse import ArgumentParser
from pathlib import Path
import shutil


parser = ArgumentParser(description="Check for JSON changes in probes from manufacturer")

parser.add_argument(
    "old_dir",
    type=str,
    help="Path to the old probes directory",
)

parser.add_argument(
    "new_dir",
    type=str,
    help="Path to the new probes directory",
)

parser.add_argument(
    "--copy-figures",
    action="store_true",
    help="If set, copies figures as well when JSON files are different.",
)


if __name__ == "__main__":
    args = parser.parse_args()
    old_dir = Path(args.old_dir)
    new_dir = Path(args.new_dir)
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
                shutil.copy(f"{temp_probe_json_path}", old_dir / probe_name)
                if args.copy_figures:
                    temp_figure_path = temp_probe_directory / (probe_name + '.png')
                    shutil.copy(f"{temp_figure_path}", old_dir / probe_name)
                
                
                            
    