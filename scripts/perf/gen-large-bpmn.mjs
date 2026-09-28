#!/usr/bin/env node
// Usage: node scripts/perf/gen-large-bpmn.mjs <rows> <perRow> > out.bpmn   (rows × perRow flow nodes)
import { generateLargeC7Model } from "./largeBpmnModel.mjs";

const rows = Number(process.argv[2] ?? 20);
const perRow = Number(process.argv[3] ?? 25);

process.stdout.write(generateLargeC7Model({ rows, perRow }).xml);
