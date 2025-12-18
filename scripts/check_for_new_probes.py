from argparse import ArgumentParser
from pathlib import Path
import shutil


parser = ArgumentParser(description="Check for new probes from manufacturer")
parser.add_argument(
    "old-dir",
    type=str,
    help="Path to the old probes directory",
)
parser.add_argument(
    "new-dir",
    type=str,
    help="Path to the new probes directory",
)

if __name__ == "__main__":
    args = parser.parse_args()
    old_dir = Path(args.old_dir)
    new_dir = Path(args.new_dir)

    existing_probes = list(probe_path.name for probe_path in old_dir.iterdir())

    for temp_probe_path in new_dir.iterdir():
        if temp_probe_path.name not in existing_probes:
            shutil.copytree(temp_probe_path, old_dir / temp_probe_path.name)