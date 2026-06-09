# Sidebar grouping

The probe sidebar turns a manufacturer's flat probe list into a hierarchy from
an explicit, hand-curated config. There are no rules and no inference: every
probe is placed by model id under a path of named nodes. A manufacturer with no
config (everything except IMEC today) renders as a flat list.

This replaced an earlier rule-based engine that derived the grouping by regex on
the part number and substring-matching the free-text description. Those rules
were fragile because the probe metadata does not carry the facts we group on
(generation, family, length), so we were reconstructing editorial decisions from
strings. The explicit file states those decisions directly instead.

## Format

JSON (`imec_neuropixels.json`), because Vite imports it with no extra
dependency. The config is `{ hierarchy }`, a tree of nodes. Each node has a
`label` and either `children` (more nodes) or `probes` (model ids, in display
order) at the leaves.

`collapsible` is a per-node property that **defaults to `true`**, so only the
exceptions need stating: the length bands set `collapsible: false`, while every
other node omits it. `true` is a foldable header with a caret; `false` is a
static, always-open divider.

The walker (`groupEntries.ts`) attaches each manifest entry to the node listing
its model, prunes empty branches, and collects anything not placed into a
trailing `Ungrouped` group. That bucket is the signal that a probe new to the
manifest needs a home in the config.

## Adding or moving a probe

Edit the relevant `probes` list. To add a new manufacturer, add its JSON file
and one line in `index.ts`. No engine changes. JSON has no comments, so if a
placement is non-obvious, record the rationale here or in a `note` field on the
node.
