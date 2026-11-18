import * as assert from "node:assert";

import * as vscode from "vscode";

/**
 * Pins how VS Code's merge editor treats one element's XML on the engines
 * floor and on stable, before a service drives it: the result starts as Git's
 * conflict text without a base section, the editor merges the one-sided edits
 * itself, and the merge finishes when its tab closes with the last text the
 * editor wrote. Each test logs what it saw as one `[merge-xml-gate]` line.
 */

const EXTENSION_ID = "miragon-gmbh.vs-code-bpmn-modeler";
const OPEN_MERGE_EDITOR = "_open.mergeEditor";
const RESULT_SCHEME = "bpmn-merge-result";

interface MergeRequest {
    key: string;
    elementId: string;
    labels: { current: string; incoming: string };
    base: string;
    current: string;
    incoming: string;
    start: string;
}

interface TestApi {
    mergeXml: {
        open(request: MergeRequest): {
            opened: Promise<void>;
            finished: Promise<string | undefined>;
        };
        close(key: string): Promise<void>;
    };
}

const lines = (...text: string[]) => text.map((line) => `${line}\n`).join("");

// Three edits far enough apart that the line diff keeps them in separate ranges.
const BASE = lines(
    '<bpmn:serviceTask id="Task_Check" name="Check order">',
    "  <bpmn:documentation>Checks the order</bpmn:documentation>",
    "  <bpmn:extensionElements>",
    '    <zeebe:taskDefinition type="check" />',
    "    <zeebe:ioMapping>",
    '      <zeebe:input source="=order" target="order" />',
    "    </zeebe:ioMapping>",
    "  </bpmn:extensionElements>",
    "</bpmn:serviceTask>",
);
const CURRENT = BASE.replace('name="Check order"', 'name="Check main order"').replace(
    'type="check"',
    'type="check-v2"',
);
const INCOMING = BASE.replace('name="Check order"', 'name="Check feature order"').replace(
    'target="order"',
    'target="incomingOrder"',
);
// Base at the true conflict (the name), each side's one-sided edit taken.
const MERGED_BY_EDITOR = BASE.replace('type="check"', 'type="check-v2"').replace(
    'target="order"',
    'target="incomingOrder"',
);
// The shape `writeConflictMarkers` writes; libs/modeler-core's conflictMarkers.spec.ts pins it to this one.
const MARKER_TEXT = `<<<<<<< Current\n${CURRENT}=======\n${INCOMING}>>>>>>> Incoming\n`;

const TIMEOUT = Symbol("timeout");

function within<T>(promise: Promise<T>, milliseconds: number): Promise<T | typeof TIMEOUT> {
    return Promise.race([
        promise,
        new Promise<typeof TIMEOUT>((done) => setTimeout(() => done(TIMEOUT), milliseconds)),
    ]);
}

async function waitFor<T>(probe: () => T | undefined, describe: () => string): Promise<T> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        const value = probe();
        if (value !== undefined) return value;
        await new Promise((done) => setTimeout(done, 250));
    }
    assert.fail(describe());
}

function report(step: string, observed: Record<string, unknown>): void {
    console.log(
        `[merge-xml-gate] ${JSON.stringify({ vscode: vscode.version, step, ...observed })}`,
    );
}

const resultDocuments = () =>
    vscode.workspace.textDocuments.filter((document) => document.uri.scheme === RESULT_SCHEME);

const mergeResultOf = (tab: vscode.Tab): unknown => (tab.input as { result?: unknown })?.result;

function mergeTabsOf(resultPath: string): vscode.Tab[] {
    return vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter((tab) => {
            const result = mergeResultOf(tab);
            return result instanceof vscode.Uri && result.path === resultPath;
        });
}

function describeValue(value: unknown): unknown {
    if (value instanceof vscode.Uri) return value.toString();
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, inner]) => [key, describeValue(inner)]),
        );
    }
    return value;
}

function describeTab(tab: vscode.Tab | undefined): Record<string, unknown> {
    const input: unknown = tab?.input;
    return {
        label: tab?.label,
        isDirty: tab?.isDirty,
        inputType: input === null ? "null" : typeof input,
        inputConstructor: (input as object | undefined)?.constructor?.name,
        input: describeValue(input),
        isTabInputText: input instanceof vscode.TabInputText,
        isTabInputTextDiff: input instanceof vscode.TabInputTextDiff,
        isTabInputCustom: input instanceof vscode.TabInputCustom,
        tabInputTextMergeExported:
            typeof (vscode as unknown as Record<string, unknown>).TabInputTextMerge === "function",
    };
}

let opened = 0;

suite("Element XML merge editor", () => {
    let api: TestApi;

    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension<TestApi>(EXTENSION_ID);
        assert.ok(extension, `extension ${EXTENSION_ID} not found in host`);
        api = await extension.activate();
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });

    /** Opens a merge with the marker text and waits until the editor has merged it into a dirty result. */
    async function openMerge(): Promise<{
        key: string;
        finished: Promise<string | undefined>;
        result: vscode.TextDocument;
        tabShownWhenOpenReturned: boolean;
    }> {
        opened += 1;
        const key = `merge-${opened}`;
        const merge = api.mergeXml.open({
            key,
            elementId: `Task_Check_${opened}`,
            labels: { current: "Current", incoming: "Incoming" },
            base: BASE,
            current: CURRENT,
            incoming: INCOMING,
            start: MARKER_TEXT,
        });
        await merge.opened;
        const tabShownWhenOpenReturned = mergeTabsOf(`/Task_Check_${opened}.xml`).length > 0;
        const result = await waitFor(
            () =>
                resultDocuments().find(
                    (document) =>
                        document.uri.path === `/Task_Check_${opened}.xml` &&
                        !document.getText().includes("<<<<<<<"),
                ),
            () =>
                `the editor never merged the marker text: ${JSON.stringify(
                    resultDocuments().map((document) => document.getText()),
                )}`,
        );
        return { key, finished: merge.finished, result, tabShownWhenOpenReturned };
    }

    async function closeActiveEditor(): Promise<"closed" | "prompted"> {
        const closing = vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        return (await within(Promise.resolve(closing), 5_000)) === TIMEOUT ? "prompted" : "closed";
    }

    test("1. merges the one-sided edits itself and leaves base at the true conflict", async () => {
        const { finished, result } = await openMerge();
        const shownBeforeSave = result.getText();
        const documentDirtyBeforeSave = result.isDirty;
        const tabDirtyBeforeSave = vscode.window.tabGroups.activeTabGroup.activeTab?.isDirty;

        await vscode.commands.executeCommand("workbench.action.files.save");
        const documentDirtyAfterSave = result.isDirty;
        const close = await closeActiveEditor();
        const written = await within(finished, 10_000);

        report("1-marker-text", {
            documentDirtyBeforeSave,
            tabDirtyBeforeSave,
            documentDirtyAfterSave,
            shownBeforeSave,
            close,
            written: written === TIMEOUT ? "never finished" : written,
            asExpected: written === MERGED_BY_EDITOR,
        });
        assert.strictEqual(written, MERGED_BY_EDITOR);
    });

    test("2. a revert then a close finishes without a text", async () => {
        const { finished } = await openMerge();

        await vscode.commands.executeCommand("workbench.action.files.revert");
        const close = await closeActiveEditor();
        const written = await within(finished, 10_000);

        report("2-revert-close", {
            close,
            written: written === TIMEOUT ? "never finished" : (written ?? null),
        });
        assert.strictEqual(written, undefined);
    });

    test("2b. a save, a revert and a close reads as the save", async () => {
        const { finished } = await openMerge();

        await vscode.commands.executeCommand("workbench.action.files.save");
        await vscode.commands.executeCommand("workbench.action.files.revert");
        const close = await closeActiveEditor();
        const written = await within(finished, 10_000);

        report("2b-save-revert-close", {
            close,
            written: written === TIMEOUT ? "never finished" : (written ?? null),
            sameAsSaveThenClose: written === MERGED_BY_EDITOR,
        });
        assert.strictEqual(written, MERGED_BY_EDITOR);
    });

    test("3. a merge tab's input names the result", async () => {
        const { finished, result, tabShownWhenOpenReturned } = await openMerge();
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;

        report("3-tab-input", { tabShownWhenOpenReturned, ...describeTab(activeTab) });

        await vscode.commands.executeCommand("workbench.action.files.revert");
        await closeActiveEditor();
        await within(finished, 10_000);
        const input = activeTab?.input as { result?: unknown } | undefined;
        assert.ok(input?.result instanceof vscode.Uri, "the merge tab's input has no result URI");
        assert.strictEqual(input.result.toString(), result.uri.toString());
    });

    test("4. only the unfiltered command list holds the merge editor command", async () => {
        const all = await vscode.commands.getCommands(false);
        const filtered = await vscode.commands.getCommands(true);

        report("4-commands", {
            unfiltered: all.includes(OPEN_MERGE_EDITOR),
            filtered: filtered.includes(OPEN_MERGE_EDITOR),
            acceptMerge: all.includes("mergeEditor.acceptMerge"),
        });
        assert.ok(all.includes(OPEN_MERGE_EDITOR));
        assert.ok(!filtered.includes(OPEN_MERGE_EDITOR));
    });

    // A refused save prompt rejects the close on 1.76 but is only logged on stable, so the
    // proof that nothing could ask is the tab being clean when it closed.
    test("5. closes a dirty result from code without asking to save", async () => {
        const { key, finished, result } = await openMerge();
        const prompts: string[] = [];
        const tabBefore = vscode.window.tabGroups.activeTabGroup.activeTab;
        const tabDirtyBeforeClose = tabBefore?.isDirty;
        const closedTabsDirty: boolean[] = [];
        const listener = vscode.window.tabGroups.onDidChangeTabs((event) =>
            closedTabsDirty.push(
                ...event.closed
                    .filter((tab) => mergeResultOf(tab)?.toString() === result.uri.toString())
                    .map((tab) => tab.isDirty),
            ),
        );

        const close = await within(
            api.mergeXml.close(key).catch((error: unknown) => {
                prompts.push(String(error));
            }),
            5_000,
        );
        const written = await within(finished, 5_000);
        listener.dispose();

        report("5-close-dirty-from-code", {
            tabDirtyBeforeClose,
            close: close === TIMEOUT ? "hung" : "returned",
            prompts,
            closedTabsDirty,
            written: written === TIMEOUT ? "never finished" : (written ?? null),
        });
        assert.strictEqual(
            tabDirtyBeforeClose,
            true,
            "the result was not dirty, so nothing could ask",
        );
        assert.deepStrictEqual(prompts, []);
        assert.deepStrictEqual(closedTabsDirty, [false], "the merge tab closed while dirty");
        assert.strictEqual(written, undefined);
        assert.ok(
            !vscode.window.tabGroups.all.some((group) =>
                group.tabs.some((tab) => tab.label === tabBefore?.label),
            ),
            "the merge tab is still open",
        );
    });

    test("6. an auto-save of the result is no answer", async () => {
        const files = vscode.workspace.getConfiguration("files");
        await files.update("autoSaveDelay", 100, vscode.ConfigurationTarget.Global);
        await files.update("autoSave", "afterDelay", vscode.ConfigurationTarget.Global);
        const saveReasons: vscode.TextDocumentSaveReason[] = [];
        const listener = vscode.workspace.onWillSaveTextDocument((event) => {
            if (event.document.uri.scheme === RESULT_SCHEME) saveReasons.push(event.reason);
        });
        try {
            const { finished } = await openMerge();
            await new Promise((done) => setTimeout(done, 2_000));
            const tabDirtyAfterDelay = vscode.window.tabGroups.activeTabGroup.activeTab?.isDirty;

            await vscode.commands.executeCommand("workbench.action.files.revert");
            const close = await closeActiveEditor();
            const written = await within(finished, 10_000);

            report("6-auto-save", {
                tabDirtyAfterDelay,
                saveReasons,
                close,
                written: written === TIMEOUT ? "never finished" : (written ?? null),
            });
            assert.strictEqual(written, undefined);
        } finally {
            listener.dispose();
            await files.update("autoSave", undefined, vscode.ConfigurationTarget.Global);
            await files.update("autoSaveDelay", undefined, vscode.ConfigurationTarget.Global);
        }
    });
});
