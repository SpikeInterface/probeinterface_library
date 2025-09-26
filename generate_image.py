import argparse
import numpy as np
from pathlib import Path
from probeinterface import Probe, read_probeinterface
from probeinterface.plotting import plot_probe

import matplotlib.pyplot as plt

def load_probegroup_from_json(manufacturer, model_name):
    """Load probegroup from JSON file based on manufacturer and model name."""
    json_file = Path(__file__).parent / manufacturer / model_name / f"{model_name}.json"

    # Create probe from JSON data
    probegroup = read_probeinterface(json_file)
    return probegroup

def plot_and_save_probegroup(
    probegroup, 
    manufacturer, 
    model_name,
    with_contact_id=True,
    title_fontsize=10, 
    label_fontsize=5, 
    contact_id_fontsize=5,
    save_figure=False,
    zoom_on_tip=False,
    dpi=300,
    figsize=(15, 15)
):
    """Plot probegroup and optionally save to file."""
    probe = probegroup.probes[0]
    if zoom_on_tip:
        ncols = 2
    else:
        ncols = 1
    fig, axs = plt.subplots(figsize=figsize, ncols=ncols)
    if zoom_on_tip:
        ax_full, ax_tip = axs
    else:
        ax_full = axs
    plot_probe(probe, with_contact_id=with_contact_id, ax=ax_full)
    for txt in ax_full.texts:
        txt.set_fontsize(contact_id_fontsize)

    title = f"{manufacturer} - {model_name}"
    if probe.description:
        title += f"\n{probe.description}"
    title += f"\n{probe.get_contact_count()}ch {probe.get_shank_count()}shank(s)"
    ax_full.set_ylabel("Y (µm)", fontsize=label_fontsize)
    ax_full.tick_params(axis='both', which='major', labelsize=label_fontsize)

    if zoom_on_tip:
        ax_full.spines[['top', 'right']].set_visible(False)
        ax_full.set_title("")
        ax_full.set_xlabel("")
        ax_tip.spines[['top', 'right']].set_visible(False)
        plot_probe(probe, with_contact_id=with_contact_id, ax=ax_tip)
        shank_tip_y = np.min(probe.probe_planar_contour[:, 1])
        shank_left = np.min(probe.probe_planar_contour[:, 0])
        shank_right = np.max(probe.probe_planar_contour[:, 0])
        shank_width = shank_right - shank_left
        ax_tip.set_xlim(shank_left - 0.5*shank_width, shank_right + 0.5*shank_width)
        ax_tip.set_ylim(shank_tip_y - 20, 200)
        ax_tip.set_title("")
        fig.suptitle(title, fontsize=title_fontsize)
    else:
        ax_full.set_title(title, fontsize=title_fontsize)
        ax_full.set_xlabel("X (µm)", fontsize=label_fontsize)

    if save_figure:
        save_dir = Path(__file__).parent / manufacturer / model_name
        save_dir.mkdir(parents=True, exist_ok=True)
        output_file = save_dir / f"{model_name}.png"
        fig.savefig(output_file, dpi=dpi)
        print(f"Image saved to: {output_file}")
    else:
        plt.show()
    
    plt.close(fig)

def main():
    parser = argparse.ArgumentParser(description="Generate probe images from JSON files")
    parser.add_argument("manufacturer", help="Probe manufacturer name")
    parser.add_argument("--model-name", help="Probe model name")
    parser.add_argument("--with-ids", "-ids", action="store_true", help="Display contact IDs")
    parser.add_argument("--save-figure", "-s", action="store_true", help="Save the figure to a file")
    parser.add_argument("--zoom-on-tip", "-z", action="store_true", help="Zoom in on the probe tip")
    parser.add_argument("--dpi", type=int, default=600, help="DPI for saved figure")
    parser.add_argument("--title-fontsize", "-t", type=int, default=15, help="Font size for the title")
    parser.add_argument("--label-fontsize", "-l", type=int, default=10, help="Font size for the labels")
    parser.add_argument("--contact-id-fontsize", "-c", type=int, default=2, help="Font size for contact IDs")

    args = parser.parse_args()
    
    try:
        if args.model_name is None:
            # find model names
            manufacturer_dir = Path(__file__).parent / args.manufacturer
            if not manufacturer_dir.exists() or not manufacturer_dir.is_dir():
                raise FileNotFoundError(f"Manufacturer directory not found: {manufacturer_dir}")
            model_names = [d.name for d in manufacturer_dir.iterdir() if d.is_dir()]
        else:
            model_names = [args.model_name]
        for model_name in model_names:
            # Load probegroup from JSON
            probegroup = load_probegroup_from_json(args.manufacturer, model_name)

            # Plot and save
            plot_and_save_probegroup(
                probegroup=probegroup,
                manufacturer=args.manufacturer,
                model_name=model_name,
                save_figure=args.save_figure,
                zoom_on_tip=args.zoom_on_tip,
                with_contact_id=args.with_ids,
                title_fontsize=args.title_fontsize,
                label_fontsize=args.label_fontsize,
                contact_id_fontsize=args.contact_id_fontsize,
                dpi=args.dpi
            )

    except FileNotFoundError as e:
        print(f"Error: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")

if __name__ == "__main__":
    main()