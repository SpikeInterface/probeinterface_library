from pathlib import Path
import probeinterface as pi

test_folder = None

root_folder = Path(__file__).parents[1]

for probe_path in root_folder.glob("**/*.json"):
    probegroup = pi.read_probeinterface(probe_path)
    fix = False
    for probe in probegroup.probes:
        shank_ids = probe.shank_ids
        if shank_ids is None:
            fix = True
            break
    if fix:
        # save probe with default shank ids
        print(f"Cleaning probe {probe_path.name} with no shank ids")
        if test_folder is not None:
            save_path = test_folder / probe_path.parent.name / probe_path.name
            save_path.parent.mkdir(parents=True, exist_ok=True)
        else:
            save_path = probe_path
        pi.write_probeinterface(save_path, probegroup)
        