import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { HARVEST_FILES, type HarvestFile } from "./harvestRecord";

const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "tools");

const readHarvestFile = (file: HarvestFile): string[] =>
    (JSON.parse(readFileSync(join(TOOLS_DIR, file), "utf8")) as { keys: string[] }).keys;

/** Every key a harvest recorded the running modeler passing to translate(). */
export const readHarvestedKeys = (): string[] => [
    ...new Set(HARVEST_FILES.flatMap(readHarvestFile)),
];
