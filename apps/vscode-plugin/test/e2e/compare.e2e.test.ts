import * as assert from "node:assert";
import { resolve } from "node:path";

import * as vscode from "vscode";

/**
 * Exercises the Explorer-context-menu compare commands end-to-end in a real
 * VS Code host. Catches the "titles shadow a built-in" regression that is
 * invisible to unit tests (which mock `vscode` entirely) and to the smoke
 * test (which never runs compare commands).
 */

const EXTENSION_ID = "miragon-gmbh.vs-code-bpmn-modeler";

const FIXTURES = resolve(__dirname, "..", "fixtures");
const FIXTURE_A = resolve(FIXTURES, "example.bpmn");
const FIXTURE_B = resolve(FIXTURES, "example-b.bpmn");

const DIFF_TAB_LABEL = "example.bpmn ↔ example-b.bpmn";

interface TestApi {
    diff: {
        sessionFor(uri: string): { origin: string; paneCount: number } | undefined;
    };
}

function getExtension(): vscode.Extension<TestApi> {
    const ext = vscode.extensions.getExtension<TestApi>(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} not found in host`);
    return ext;
}

/** Polls until `predicate` holds; fails with `describe()` on timeout. */
async function waitFor(
    predicate: () => boolean,
    describe: () => string,
    timeoutMs = 10_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) {
            return;
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    assert.fail(`${describe()} (waited ${timeoutMs}ms)`);
}

/** Polls `vscode.window.tabGroups` until a tab with the expected label appears. */
function waitForTab(label: string): Promise<void> {
    const tabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    return waitFor(
        () => tabs().some((t) => t.label === label),
        () =>
            `tab "${label}" did not appear — open tabs: ${tabs()
                .map((t) => t.label)
                .join(", ")}`,
    );
}

/**
 * The only observable that proves VS Code routed `vscode.diff` into *our*
 * custom editor: panes attach to the session solely from our resolve path.
 * A text diff (the fallback since VS Code 1.129 unless the manifest opts in
 * via `priority.diffEditor`) leaves the session registered but pane-less.
 */
function waitForBothPanes(api: TestApi, uri: string): Promise<void> {
    return waitFor(
        () => api.diff.sessionFor(uri)?.paneCount === 2,
        () =>
            `diff panes never attached — session: ${JSON.stringify(api.diff.sessionFor(uri))}; ` +
            `the diff likely opened in the text editor instead of the BPMN viewer`,
    );
}

suite("BPMN compare commands", () => {
    let api: TestApi;
    const uriA = vscode.Uri.file(FIXTURE_A);
    const uriB = vscode.Uri.file(FIXTURE_B);

    suiteSetup(async () => {
        const ext = getExtension();
        api = await ext.activate();
    });

    suiteTeardown(async () => {
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });

    teardown(async () => {
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });

    test("two-step flow opens the BPMN diff with both panes attached", async () => {
        await vscode.commands.executeCommand("bpmn-modeler.selectForCompare", uriA);
        await vscode.commands.executeCommand("bpmn-modeler.compareWithSelected", uriB);
        await waitForTab(DIFF_TAB_LABEL);
        await waitForBothPanes(api, uriA.toString());

        assert.strictEqual(api.diff.sessionFor(uriA.toString())?.origin, "compare-files");
    });

    test("single-step flow opens the BPMN diff with both panes attached", async () => {
        await vscode.commands.executeCommand("bpmn-modeler.compareSelected", uriA, [uriA, uriB]);
        await waitForTab(DIFF_TAB_LABEL);
        await waitForBothPanes(api, uriA.toString());
    });
});
