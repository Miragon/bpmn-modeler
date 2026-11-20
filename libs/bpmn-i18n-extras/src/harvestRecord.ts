// One file per harvest: the C7 modeler, the dmn-js views, the element template
// editor, the merge view and the diff panes request mostly disjoint strings, and all of them are needed.
export const HARVEST_FILES = [
    "harvested.json",
    "harvested-dmn.json",
    "harvested-template-editor.json",
    "harvested-merge.json",
    "harvested-diff.json",
    "harvested-dmn-diff.json",
] as const;

/** A record in `tools/` that `readHarvestedKeys` reads. */
export type HarvestFile = (typeof HARVEST_FILES)[number];

/** The text of a harvest record, in the one shape every `tools/harvested-*.json` is written in. */
export const harvestRecord = (note: string, keys: Iterable<string>): string => {
    const sortedKeys = [...new Set(keys)].sort();
    return `${JSON.stringify({ note, count: sortedKeys.length, keys: sortedKeys }, null, 4)}\n`;
};
