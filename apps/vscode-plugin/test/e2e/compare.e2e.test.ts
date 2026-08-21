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

/** Polls `vscode.window.tabGroups` until a tab with the expected label appears. */
async function waitForTab(label: string, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const found = vscode.window.tabGroups.all
            .flatMap((g) => g.tabs)
            .some((t) => t.label === label);
        if (found) {
            return;
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    const open = vscode.window.tabGroups.all.flatMap((g) => g.tabs).map((t) => t.label);
    assert.fail(
        `tab "${label}" did not appear within ${timeoutMs}ms — open tabs: ${open.join(", ")}`,
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

    test("two-step flow opens a diff tab", async () => {
        await vscode.commands.executeCommand("bpmn-modeler.selectForCompare", uriA);
        await vscode.commands.executeCommand("bpmn-modeler.compareWithSelected", uriB);
        await waitForTab(DIFF_TAB_LABEL);
    });

    test("single-step flow opens a diff tab", async () => {
        await vscode.commands.executeCommand("bpmn-modeler.compareSelected", uriA, [uriA, uriB]);
        await waitForTab(DIFF_TAB_LABEL);
    });

    test("two-step flow creates a compare-files session", async () => {
        await vscode.commands.executeCommand("bpmn-modeler.selectForCompare", uriA);
        await vscode.commands.executeCommand("bpmn-modeler.compareWithSelected", uriB);
        await waitForTab(DIFF_TAB_LABEL);

        const session = api.diff.sessionFor(uriA.toString());
        assert.ok(session, "no session found for the left-hand URI");
        assert.strictEqual(session.origin, "compare-files");
    });
});
