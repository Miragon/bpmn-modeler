import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { HARVEST_FILES, parseHarvestRecord, type HarvestFile } from "./harvestRecord";

const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "tools");

export const harvestRecordPath = (file: HarvestFile): string => join(TOOLS_DIR, file);

const readHarvestFile = (file: HarvestFile): string[] =>
    parseHarvestRecord(readFileSync(harvestRecordPath(file), "utf8")).keys;

/** Every key a harvest recorded the running modeler passing to translate(). */
export const readHarvestedKeys = (): string[] => [
    ...new Set(HARVEST_FILES.flatMap(readHarvestFile)),
];
