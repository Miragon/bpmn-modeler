#!/usr/bin/env node
// Per-rule bpmnlint timing in Node on generated large models.
// Manual only (not CI-gated): numbers depend on the machine. See
// docs/vscode/contributing/development.md ("Performance harness").
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { BpmnModdle } from "bpmn-moddle";

import { generateLargeC7Model, largeModelPresets } from "./largeBpmnModel.mjs";

const require = createRequire(import.meta.url);
const { Linter } = require("bpmnlint");
const NodeResolver = require("bpmnlint/lib/resolver/node-resolver");
const camundaModdleDescriptor = require("camunda-bpmn-moddle/resources/camunda.json");

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..");

const { values: options } = parseArgs({
    options: {
        sizes: { type: "string", default: "500,2000,5000" },
        rules: { type: "string", default: "no-overlapping-elements,no-bpmndi" },
        runs: { type: "string", default: "5" },
        warmup: { type: "string", default: "1" },
        json: { type: "string" },
    },
});

const sizes = options.sizes.split(",").map(Number);
const rules = options.rules.split(",");
const runsPerCell = Number(options.runs);
const warmupRuns = Number(options.warmup);

for (const size of sizes) {
    if (!largeModelPresets[size]) {
        fail(`Unknown size ${size}; available: ${Object.keys(largeModelPresets).join(", ")}`);
    }
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

// A fresh Linter per run: bpmnlint rules keep per-run state in their closures.
async function timeRule(rule, moddleRoot) {
    const linter = new Linter({
        config: { rules: { [rule]: "error" } },
        resolver: new NodeResolver(),
    });
    const startedAt = performance.now();
    await linter.lint(moddleRoot);
    return performance.now() - startedAt;
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatMilliseconds(milliseconds) {
    return milliseconds < 10
        ? milliseconds.toFixed(1)
        : Math.round(milliseconds).toLocaleString("en");
}

function formatSamples(samples) {
    return `${formatMilliseconds(median(samples))} ms (${formatMilliseconds(Math.min(...samples))}–${formatMilliseconds(Math.max(...samples))})`;
}

function currentCommit() {
    try {
        return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot })
            .toString()
            .trim();
    } catch {
        return "unknown";
    }
}

const environment = {
    commit: currentCommit(),
    cpu: cpus()[0]?.model ?? "unknown",
    cores: cpus().length,
    node: process.version,
    runsPerCell,
};
const moddle = new BpmnModdle({ camunda: camundaModdleDescriptor });
const results = [];

for (const size of sizes) {
    const { rootElement } = await moddle.fromXML(generateLargeC7Model(largeModelPresets[size]).xml);
    for (const rule of rules) {
        const label = `${size} nodes / ${rule}`;
        for (let warmup = 0; warmup < warmupRuns; warmup++) {
            process.stderr.write(`warm-up ${label}\n`);
            await timeRule(rule, rootElement);
        }
        const samples = [];
        for (let run = 1; run <= runsPerCell; run++) {
            process.stderr.write(`run ${run}/${runsPerCell} ${label}\n`);
            samples.push(await timeRule(rule, rootElement));
        }
        results.push({ size, rule, samples });
    }
}

console.log(
    `Commit ${environment.commit} · ${environment.cpu} (${environment.cores} cores) · Node ${environment.node} · median (min–max) of ${runsPerCell} runs\n`,
);
console.log(`| Rule | ${sizes.map((size) => `${size} nodes`).join(" | ")} |`);
console.log(`|---|${sizes.map(() => "---").join("|")}|`);
for (const rule of rules) {
    const cells = sizes.map((size) =>
        formatSamples(
            results.find((result) => result.rule === rule && result.size === size).samples,
        ),
    );
    console.log(`| \`${rule}\` | ${cells.join(" | ")} |`);
}

if (options.json) {
    writeFileSync(options.json, JSON.stringify({ environment, results }, null, 2));
}
