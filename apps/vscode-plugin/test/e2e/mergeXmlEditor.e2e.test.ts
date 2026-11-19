import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { join } from "node:path";

import * as vscode from "vscode";

/**
 * Pins how VS Code's merge editor treats one element's XML on the engines
 * floor and on stable, driven through the core as a merge pane drives it: on
 * a picked element of a real merge view, the result starts as the conflict
 * text without a base section, the editor merges the one-sided edits itself,
 * and the merge finishes when its tab closes with the text the user last
 * saved by hand. Each test logs what it saw as one `[merge-xml-gate]` line.
 */

const EXTENSION_ID = "miragon-gmbh.vs-code-bpmn-modeler";
const OPEN_MERGE_VIEW = "bpmn-modeler.openBpmnMergeView";
const OPEN_MERGE_EDITOR = "_open.mergeEditor";
const RESULT_SCHEME = "bpmn-merge-result";
const FILE = "order.bpmn";

interface TestApi {
    merge: {
        sessionFor(fileUri: string): { paneCount: number } | undefined;
        pick(fileUri: string, elementId: string, side: "current" | "incoming"): boolean;
    };
    mergeXml: {
        open(
            fileUri: string,
            elementId: string,
        ): { opened: Promise<void>; finished: Promise<string | undefined> };
        handMergeOf(fileUri: string, elementId: string): string | undefined;
    };
}

interface GitApi {
    state: string;
    onDidChangeState(listener: (state: string) => void): vscode.Disposable;
    openRepository(root: vscode.Uri): Promise<unknown>;
}

// One element per test, so no test starts from another's hand merge.
const TASKS = [
    "Task_Merge",
    "Task_Revert",
    "Task_SaveRevert",
    "Task_Input",
    "Task_AutoSave",
    "Task_Focus",
    "Task_CloseFromCode",
];

interface TaskVersion {
    readonly name: string;
    readonly type: string;
    readonly target: string;
}

const BASE_TASK: TaskVersion = { name: "Check order", type: "check", target: "order" };
// Three edits far enough apart that the line diff keeps them in separate ranges: the
// name is the true conflict, the type current's one-sided edit, the target incoming's.
const CURRENT_TASK: TaskVersion = { ...BASE_TASK, name: "Check main order", type: "check-v2" };
const INCOMING_TASK: TaskVersion = {
    ...BASE_TASK,
    name: "Check feature order",
    target: "incomingOrder",
};

function processXml(version: TaskVersion): string {
    const tasks = TASKS.map(
        (id) => `    <bpmn:serviceTask id="${id}" name="${version.name}">
      <bpmn:documentation>Checks the order</bpmn:documentation>
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="${version.type}" />
        <zeebe:ioMapping>
          <zeebe:input source="=order" target="${version.target}" />
        </zeebe:ioMapping>
      </bpmn:extensionElements>
    </bpmn:serviceTask>`,
    ).join("\n");
    const shapes = TASKS.map(
        (id, index) => `      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}">
        <dc:Bounds x="${160 + index * 140}" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>`,
    ).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_MergeXml" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Cloud" modeler:executionPlatformVersion="8.8.0">
  <bpmn:process id="Process_MergeXml" isExecutable="true">
${tasks}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_MergeXml">
    <bpmndi:BPMNPlane id="Plane_MergeXml" bpmnElement="Process_MergeXml">
${shapes}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

/** What the editor writes on a save before anyone edits: base at the true conflict, both one-sided edits taken. */
const mergedByEditor = (base: string) =>
    base
        .replace(`type="${BASE_TASK.type}"`, `type="${CURRENT_TASK.type}"`)
        .replace(`target="${BASE_TASK.target}"`, `target="${INCOMING_TASK.target}"`);

function git(repository: string, ...args: string[]): string {
    try {
        return execFileSync(
            "git",
            [
                "-c",
                "user.name=e2e",
                "-c",
                "user.email=e2e@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "-c",
                "init.defaultBranch=main",
                ...args,
            ],
            {
                cwd: repository,
                env: { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: "1" },
                stdio: "pipe",
                encoding: "utf8",
            },
        );
    } catch (error) {
        // `git merge` exits 1 on a conflict.
        return String((error as { stdout?: string }).stdout ?? "");
    }
}

/** A repository whose order.bpmn conflicts on every task; each VS Code version gets its own. */
function conflictedRepository(): string {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(folder, "no workspace folder");
    const repository = join(folder, `merge-xml-${vscode.version}`);
    mkdirSync(repository, { recursive: true });
    const file = join(repository, FILE);
    writeFileSync(file, processXml(BASE_TASK));
    git(repository, "init", "-q");
    git(repository, "add", FILE);
    git(repository, "commit", "-q", "--no-verify", "-m", "Add the order process");
    git(repository, "checkout", "-q", "-b", "feature");
    writeFileSync(file, processXml(INCOMING_TASK));
    git(repository, "commit", "-q", "-a", "--no-verify", "-m", "Map the order on feature");
    git(repository, "checkout", "-q", "main");
    writeFileSync(file, processXml(CURRENT_TASK));
    git(repository, "commit", "-q", "-a", "--no-verify", "-m", "Check the order on main");
    git(repository, "merge", "feature", "--no-edit");
    assert.ok(readFileSync(file, "utf8").includes("<<<<<<<"), "no merge conflict");
    return repository;
}

/** `vscode.git` stays under `--disable-extensions`, but may still be starting. */
async function openInGit(repository: string): Promise<void> {
    const extension = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>("vscode.git");
    assert.ok(extension, "vscode.git is missing");
    const gitApi = (await extension.activate()).getAPI(1);
    if (gitApi.state !== "initialized") {
        await new Promise<void>((done) => {
            const subscription = gitApi.onDidChangeState((state) => {
                if (state !== "initialized") return;
                subscription.dispose();
                done();
            });
        });
    }
    await gitApi.openRepository(vscode.Uri.file(repository));
}

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

const mergeInputOf = (tab: vscode.Tab) =>
    tab.input as { base?: unknown; result?: unknown } | undefined;

const allTabs = () => vscode.window.tabGroups.all.flatMap((group) => group.tabs);

function mergeTabsOf(resultPath: string): vscode.Tab[] {
    return allTabs().filter((tab) => {
        const result = mergeInputOf(tab)?.result;
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

/** Every tab but the element XML merges: the merge view's own tabs. */
function mergeViewTabs(): vscode.Tab[] {
    return allTabs().filter((tab) => !(mergeInputOf(tab)?.result instanceof vscode.Uri));
}

suite("Element XML merge editor", () => {
    let api: TestApi;
    let fileUri = "";

    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension<TestApi>(EXTENSION_ID);
        assert.ok(extension, `extension ${EXTENSION_ID} not found in host`);
        api = await extension.activate();
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        const repository = conflictedRepository();
        const file = vscode.Uri.file(join(repository, FILE));
        fileUri = file.toString();
        await openInGit(repository);
        await vscode.commands.executeCommand(OPEN_MERGE_VIEW, file);
        await waitFor(
            () => (api.merge.sessionFor(fileUri)?.paneCount === 2 ? true : undefined),
            () => `merge panes never attached: ${JSON.stringify(api.merge.sessionFor(fileUri))}`,
        );
        for (const task of TASKS) {
            assert.ok(api.merge.pick(fileUri, task, "current"), `${task} could not be picked`);
        }
    });

    suiteTeardown(async () => {
        // A failed test may leave a dirty result, which would ask to save on every later close.
        for (const document of resultDocuments()) if (document.isDirty) await document.save();
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });

    /** Opens the merge of `elementId` and waits until the editor has merged the marker text into a dirty result. */
    async function openMerge(elementId: string): Promise<{
        finished: Promise<string | undefined>;
        result: vscode.TextDocument;
        base: string;
        tabShownWhenOpenReturned: boolean;
    }> {
        const merge = api.mergeXml.open(fileUri, elementId);
        await merge.opened;
        const resultPath = `/${elementId}.xml`;
        const tabShownWhenOpenReturned = mergeTabsOf(resultPath).length > 0;
        const result = await waitFor(
            () =>
                resultDocuments().find(
                    (document) =>
                        document.uri.path === resultPath && !document.getText().includes("<<<<<<<"),
                ),
            () =>
                `the editor never merged the marker text: ${JSON.stringify(
                    resultDocuments().map((document) => document.getText()),
                )}`,
        );
        const baseUri = mergeInputOf(mergeTabsOf(resultPath)[0])?.base;
        assert.ok(baseUri instanceof vscode.Uri, "the merge tab names no base");
        const base = (await vscode.workspace.openTextDocument(baseUri)).getText();
        return { finished: merge.finished, result, base, tabShownWhenOpenReturned };
    }

    async function closeActiveEditor(): Promise<"closed" | "prompted"> {
        const closing = vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        return (await within(Promise.resolve(closing), 5_000)) === TIMEOUT ? "prompted" : "closed";
    }

    test("1. merges the one-sided edits itself and takes the saved text as the element's version", async () => {
        const { finished, result, base } = await openMerge("Task_Merge");
        const shownBeforeSave = result.getText();
        const documentDirtyBeforeSave = result.isDirty;
        const tabDirtyBeforeSave = vscode.window.tabGroups.activeTabGroup.activeTab?.isDirty;

        await vscode.commands.executeCommand("workbench.action.files.save");
        const documentDirtyAfterSave = result.isDirty;
        const close = await closeActiveEditor();
        const written = await within(finished, 10_000);
        const handMerged = api.mergeXml.handMergeOf(fileUri, "Task_Merge");

        report("1-marker-text", {
            documentDirtyBeforeSave,
            tabDirtyBeforeSave,
            documentDirtyAfterSave,
            base,
            shownBeforeSave,
            close,
            written: written === TIMEOUT ? "never finished" : written,
            asExpected: written === mergedByEditor(base),
            handMerged: handMerged ?? null,
        });
        assert.strictEqual(written, mergedByEditor(base));
        assert.ok(handMerged, "the core did not take the saved text");
        assert.ok(handMerged.includes(`name="${BASE_TASK.name}"`), handMerged);
        assert.ok(handMerged.includes(`type="${CURRENT_TASK.type}"`), handMerged);
        assert.ok(handMerged.includes(`target="${INCOMING_TASK.target}"`), handMerged);
    });

    test("2. a revert then a close finishes without a text", async () => {
        const { finished } = await openMerge("Task_Revert");

        await vscode.commands.executeCommand("workbench.action.files.revert");
        const close = await closeActiveEditor();
        const written = await within(finished, 10_000);

        report("2-revert-close", {
            close,
            written: written === TIMEOUT ? "never finished" : (written ?? null),
        });
        assert.strictEqual(written, undefined);
        assert.strictEqual(api.mergeXml.handMergeOf(fileUri, "Task_Revert"), undefined);
    });

    test("2b. a save, a revert and a close reads as the save", async () => {
        const { finished, base } = await openMerge("Task_SaveRevert");

        await vscode.commands.executeCommand("workbench.action.files.save");
        await vscode.commands.executeCommand("workbench.action.files.revert");
        const close = await closeActiveEditor();
        const written = await within(finished, 10_000);

        report("2b-save-revert-close", {
            close,
            written: written === TIMEOUT ? "never finished" : (written ?? null),
            sameAsSaveThenClose: written === mergedByEditor(base),
        });
        assert.strictEqual(written, mergedByEditor(base));
    });

    test("3. a merge tab's input names the result", async () => {
        const { finished, result, tabShownWhenOpenReturned } = await openMerge("Task_Input");
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;

        report("3-tab-input", { tabShownWhenOpenReturned, ...describeTab(activeTab) });

        await vscode.commands.executeCommand("workbench.action.files.revert");
        await closeActiveEditor();
        await within(finished, 10_000);
        const tabResult = activeTab && mergeInputOf(activeTab)?.result;
        assert.ok(tabResult instanceof vscode.Uri, "the merge tab's input has no result URI");
        assert.strictEqual(tabResult.toString(), result.uri.toString());
    });

    test("4. only the unfiltered command list holds the merge editor command", async () => {
        const all = await vscode.commands.getCommands(false);
        const filtered = await vscode.commands.getCommands(true);

        report("4-commands", {
            unfiltered: all.includes(OPEN_MERGE_EDITOR),
            filtered: filtered.includes(OPEN_MERGE_EDITOR),
            acceptMerge: all.includes("mergeEditor.acceptMerge"),
            appName: vscode.env.appName,
            uriScheme: vscode.env.uriScheme,
            appHost: vscode.env.appHost,
        });
        assert.ok(all.includes(OPEN_MERGE_EDITOR));
        assert.ok(!filtered.includes(OPEN_MERGE_EDITOR));
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
            const { finished } = await openMerge("Task_AutoSave");
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
            assert.strictEqual(api.mergeXml.handMergeOf(fileUri, "Task_AutoSave"), undefined);
        } finally {
            listener.dispose();
            await files.update("autoSave", undefined, vscode.ConfigurationTarget.Global);
            await files.update("autoSaveDelay", undefined, vscode.ConfigurationTarget.Global);
        }
    });

    test("7. a second open brings the open merge to the front from the diagrams' group", async () => {
        const { finished } = await openMerge("Task_Focus");
        const resultPath = "/Task_Focus.xml";
        const groupsWithMerge = vscode.window.tabGroups.all.length;
        await vscode.commands.executeCommand("workbench.action.focusAboveGroup");
        const activeBeforeFocus = vscode.window.tabGroups.activeTabGroup.activeTab?.label;

        await api.mergeXml.open(fileUri, "Task_Focus").opened;

        const tabs = mergeTabsOf(resultPath);
        const activeAfterFocus = vscode.window.tabGroups.activeTabGroup.activeTab;
        report("7-focus", {
            groupsWithMerge,
            groupsAfterFocus: vscode.window.tabGroups.all.length,
            activeBeforeFocus,
            activeAfterFocus: activeAfterFocus?.label,
            mergeTabs: tabs.length,
        });
        assert.strictEqual(tabs.length, 1, "the second open showed the merge twice");
        assert.ok(
            activeAfterFocus && mergeTabsOf(resultPath).includes(activeAfterFocus),
            `the merge is not in front: ${String(activeAfterFocus?.label)}`,
        );

        await vscode.commands.executeCommand("workbench.action.files.revert");
        await closeActiveEditor();
        await within(finished, 10_000);
    });

    // Last: it ends the merge view. A refused save prompt rejects the close on 1.76 but is
    // only logged on stable, so the proof that nothing could ask is the tab closing clean.
    test("5. closing the merge view closes a dirty merge without asking to save", async () => {
        const { finished, result } = await openMerge("Task_CloseFromCode");
        const tabDirtyBeforeClose = mergeTabsOf("/Task_CloseFromCode.xml")[0]?.isDirty;
        const closedTabsDirty: boolean[] = [];
        const listener = vscode.window.tabGroups.onDidChangeTabs((event) =>
            closedTabsDirty.push(
                ...event.closed
                    .filter(
                        (tab) => describeValue(mergeInputOf(tab)?.result) === result.uri.toString(),
                    )
                    .map((tab) => tab.isDirty),
            ),
        );

        const viewTabs = mergeViewTabs();
        const close = await within(Promise.resolve(vscode.window.tabGroups.close(viewTabs)), 5_000);
        const written = await within(finished, 10_000);
        const mergeTabClosed = await within(
            waitFor(
                () => (mergeTabsOf("/Task_CloseFromCode.xml").length === 0 ? true : undefined),
                () => "the merge tab is still open",
            ).catch(() => false),
            25_000,
        );
        listener.dispose();

        report("5-close-dirty-from-code", {
            mergeViewTabs: viewTabs.map(describeTab),
            sessionAfterClose: api.merge.sessionFor(fileUri) ?? null,
            tabDirtyBeforeClose,
            close: close === TIMEOUT ? "hung" : "returned",
            closedTabsDirty,
            mergeTabClosed,
            written: written === TIMEOUT ? "never finished" : (written ?? null),
            tabsLeft: allTabs().map((tab) => tab.label),
        });
        assert.ok(viewTabs.length > 0, "found no merge view tab to close");
        assert.strictEqual(mergeTabClosed, true, "the merge tab is still open");
        assert.strictEqual(
            tabDirtyBeforeClose,
            true,
            "the result was not dirty, so nothing could ask",
        );
        assert.deepStrictEqual(closedTabsDirty, [false], "the merge tab closed while dirty");
        assert.strictEqual(written, undefined);
    });
});
