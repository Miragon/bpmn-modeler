import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { LintResults } from "@miragon/bpmn-modeler-types";

import {
    generateLargeC7Model,
    largeModelPresets,
} from "../../../../../../../scripts/perf/largeBpmnModel.mjs";
import { NodeBpmnLinter } from "./NodeBpmnLinter";

// The snapshot was recorded on unpatched bpmnlint 11.14.0; the yarn patch that makes
// these rules sub-quadratic must reproduce it verbatim, report order included.

const CORE_RULES = ["no-overlapping-elements", "no-bpmndi"] as const;
const CONFIG = { rules: Object.fromEntries(CORE_RULES.map((rule) => [rule, "error"])) };
const FIXTURE_DIR = resolve(__dirname, "fixtures/core-rules");
const ANCHOR = resolve(__dirname, ".bpmnlintrc");
const LARGE_MODEL_TIMEOUT_MS = 60_000;

async function lintCoreRules(xml: string): Promise<Record<string, string[]>> {
    const { results, unresolved } = await new NodeBpmnLinter().lint(xml, ANCHOR, CONFIG);
    expect(unresolved).toEqual([]);
    return Object.fromEntries(CORE_RULES.map((rule) => [rule, toReportLines(results, rule)]));
}

function toReportLines(results: LintResults, rule: string): string[] {
    return (results[rule] ?? []).map((report) => `${report.id}: ${report.message}`);
}

describe("bpmnlint core rules keep their reports", () => {
    const fixtureFiles = readdirSync(FIXTURE_DIR)
        .filter((file) => file.endsWith(".bpmn"))
        .sort();

    it.each(fixtureFiles)("%s", async (file) => {
        const xml = readFileSync(resolve(FIXTURE_DIR, file), "utf8");

        expect(await lintCoreRules(xml)).toMatchSnapshot();
    });

    it(
        "5k model with every 7th shape overlapping its predecessor and every 11th DI missing",
        async () => {
            const { xml } = generateLargeC7Model({
                ...largeModelPresets[5000],
                overlapEvery: 7,
                omitDiEvery: 11,
            });

            const reports = await lintCoreRules(xml);

            expect(reports["no-overlapping-elements"].length).toBeGreaterThan(0);
            expect(reports["no-bpmndi"].length).toBeGreaterThan(0);
            expect(reports).toMatchSnapshot();
        },
        LARGE_MODEL_TIMEOUT_MS,
    );
});
