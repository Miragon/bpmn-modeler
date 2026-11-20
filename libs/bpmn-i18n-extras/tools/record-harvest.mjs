/*
 * Adds a browser drain's keys to its record, keeping the record's note, and
 * rewrites the record through harvestRecord. Pass the drained keys on stdin as
 * the drain leaves them: `copy(JSON.stringify([...window.__harvested]))` in the
 * page console, then
 *
 *   pbpaste | bun libs/bpmn-i18n-extras/tools/record-harvest.mjs harvested.json
 *
 * See tools/README.md.
 */
/* global console, process */
import { readFileSync, writeFileSync } from "node:fs";

import { harvestRecordPath } from "../src/harvestedKeys.ts";
import {
    HARVEST_FILES,
    harvestRecord,
    isHarvestFile,
    parseDrainedKeys,
    parseHarvestRecord,
} from "../src/harvestRecord.ts";

const file = process.argv[2] ?? "";
if (!isHarvestFile(file)) {
    console.error(`Usage: record-harvest.mjs <${HARVEST_FILES.join(" | ")}> < drained-keys.json`);
    process.exit(1);
}

const path = harvestRecordPath(file);
const record = parseHarvestRecord(readFileSync(path, "utf8"));
const drainedKeys = parseDrainedKeys(readFileSync(0, "utf8"));
writeFileSync(path, harvestRecord(record.note, [...record.keys, ...drainedKeys]));
console.log(`${file}: ${record.keys.length} keys before, ${drainedKeys.length} drained.`);
