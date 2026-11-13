import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// One file per harvest driver: the C7 modeler, the dmn-js views and the element
// template editor request mostly disjoint strings, and all of them are needed.
const HARVEST_FILES = [
    "harvested.json",
    "harvested-dmn.json",
    "harvested-template-editor.json",
] as const;

const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "tools");

const readHarvestFile = (file: string): string[] =>
    (JSON.parse(readFileSync(join(TOOLS_DIR, file), "utf8")) as { keys: string[] }).keys;

/** Every key a harvest recorded the running modeler passing to translate(). */
export const readHarvestedKeys = (): string[] => [
    ...new Set(HARVEST_FILES.flatMap(readHarvestFile)),
];
