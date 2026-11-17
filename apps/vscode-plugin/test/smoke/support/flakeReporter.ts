import { appendFileSync } from "node:fs";

import type { Reporter, TestCase } from "vitest/node";

/**
 * Names every test that passed only on its retry: in the log, as a warning on
 * the pull request and in the job summary. A retry must not hide a flaky test.
 */
export default class FlakeReporter implements Reporter {
    private readonly flakyTests: string[] = [];

    onTestCaseResult(testCase: TestCase): void {
        if (testCase.diagnostic()?.flaky) {
            this.flakyTests.push(`${testCase.module.relativeModuleId} > ${testCase.fullName}`);
        }
    }

    onTestRunEnd(): void {
        if (this.flakyTests.length === 0) return;
        console.log(`\n[vscode-smoke] ${this.flakyTests.length} flaky test(s) passed on a retry:`);
        for (const test of this.flakyTests) {
            console.log(`  - ${test}`);
            if (process.env.GITHUB_ACTIONS) {
                console.log(`::warning title=Flaky VS Code smoke test::${test} passed on a retry`);
            }
        }
        if (process.env.GITHUB_STEP_SUMMARY) {
            appendFileSync(
                process.env.GITHUB_STEP_SUMMARY,
                [
                    "### Flaky VS Code smoke tests",
                    "",
                    "These tests failed first and passed on their retry in a new window:",
                    "",
                    ...this.flakyTests.map((test) => `- ${test}`),
                    "",
                ].join("\n"),
            );
        }
    }
}
