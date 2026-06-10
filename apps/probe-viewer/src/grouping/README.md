# Sidebar grouping

The probe sidebar turns a manufacturer's flat probe list into a hierarchy from
an explicit, hand-curated config. The goal is a more human-friendly menu: users
may not know the probes' SKUs and instead recognize the marketing names and
categories. There are no rules and no inference: every
probe is placed by model id under a path of named nodes. A manufacturer with no
config (everything except IMEC today) renders as a flat list.

## Format

JSON (`imec_neuropixels.json`), because Vite imports it with no extra
dependency. The config is `{ hierarchy }`, a tree of nodes. Each node has a
`label` and either `children` (more nodes) or `probes` (model ids, in display
order) at the leaves.

`collapsible` is a per-node property that **defaults to `true`**, so only the
exceptions need stating: the length bands set `collapsible: false`, while every
other node omits it. `true` is a foldable header with a caret; `false` is a
static, always-open divider. This is useful for divisions worth mentioning but
not worth occluding, usually the finer levels, like the length bands of the
non-human-primate (NHP) probes in Neuropixels.

The walker (`groupEntries.ts`) attaches each manifest entry to the node listing
its model, prunes empty branches, and collects anything not placed into a
trailing `Ungrouped` group. That bucket is the signal that a probe new to the
manifest needs a home in the config.

## Adding or moving a probe

Edit the relevant `probes` list. To add a new manufacturer, add its JSON file
and one line in `index.ts`. No engine changes. JSON has no comments, so if a
placement is non-obvious, record the rationale in a `note` field on the node
(documentation only, not rendered). For example, the Neuropixels NXT node:

```json
{ "label": "Neuropixels NXT",
  "note": "NP3023/NP3024 describe themselves as 'Neuropixels 3.0' but belong to the NXT generation.",
  "children": [ ... ] }
```
