import { computeDiff } from "@miragon/bpmn-modeler/diff";
import { ALL_EXECUTION_PROPERTY_FIXTURES } from "../../../libs/bpmn-diff/src/__fixtures__/execution-properties";

declare global {
    interface Window {
        __DIFF_REGRESSION_RESULT__?: { passed: number; failed: string[] };
    }
}

const status = document.querySelector<HTMLElement>("#status")!;
const results = document.querySelector<HTMLOListElement>("#results")!;

async function run(): Promise<void> {
    const failed: string[] = [];
    for (const fixture of ALL_EXECUTION_PROPERTY_FIXTURES) {
        const actual = await computeDiff(fixture.before, fixture.after);
        const matches = JSON.stringify(actual) === JSON.stringify(fixture.expected);
        const item = document.createElement("li");
        item.textContent = `${matches ? "PASS" : "FAIL"}: ${fixture.name}`;
        results.append(item);
        if (!matches) failed.push(fixture.name);
    }

    const passed = ALL_EXECUTION_PROPERTY_FIXTURES.length - failed.length;
    window.__DIFF_REGRESSION_RESULT__ = { passed, failed };
    status.textContent =
        failed.length === 0 ? `${passed} fixtures passed` : `${failed.length} fixtures failed`;
    status.dataset.result = failed.length === 0 ? "passed" : "failed";

    if (failed.length > 0) throw new Error(`BPMN diff regressions failed: ${failed.join(", ")}`);
}

void run();
