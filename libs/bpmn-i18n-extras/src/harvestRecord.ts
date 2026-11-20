// One file per harvest: the C7 modeler, the dmn-js views, the element template
// editor, the merge view, the diff panes, the modeler's features no driver
// reaches and the linked form preview request mostly disjoint strings, and all of them are needed.
export const HARVEST_FILES = [
    "harvested.json",
    "harvested-dmn.json",
    "harvested-template-editor.json",
    "harvested-merge.json",
    "harvested-diff.json",
    "harvested-dmn-diff.json",
    "harvested-modeler-features.json",
    "harvested-form-preview.json",
] as const;

/** A record in `tools/` that `readHarvestedKeys` reads. */
export type HarvestFile = (typeof HARVEST_FILES)[number];

export const isHarvestFile = (name: string): name is HarvestFile =>
    (HARVEST_FILES as readonly string[]).includes(name);

/** The text of a harvest record, in the one shape every `tools/harvested-*.json` is written in. */
export const harvestRecord = (note: string, keys: Iterable<string>): string => {
    const sortedKeys = [...new Set(keys)].sort();
    return `${JSON.stringify({ note, count: sortedKeys.length, keys: sortedKeys }, null, 4)}\n`;
};

export const parseHarvestRecord = (text: string): { note: string; keys: string[] } => {
    const { note, keys } = JSON.parse(text) as { note: string; keys: string[] };
    return { note, keys };
};

/** The keys a browser drain left in `window.__harvested`, passed on as `JSON.stringify([...window.__harvested])`. */
export const parseDrainedKeys = (text: string): string[] => {
    const keys: unknown = JSON.parse(text);
    if (!Array.isArray(keys) || !keys.every((key) => typeof key === "string")) {
        throw new Error("Expected the drained keys as a JSON array of strings.");
    }
    return keys;
};
