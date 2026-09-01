import * as assert from "node:assert";
import { resolve } from "node:path";

import * as vscode from "vscode";

/**
 * Extension-Host smoke test — the only thing that runs the composition root
 * (`main.ts` + `composition/*`) end-to-end in a real VS Code instance. Unit
 * tests mock `vscode` away entirely, so a broken `activate()` or a custom-editor
 * that no longer resolves is invisible to them. These tests stay at the VS Code
 * API boundary; visual webview interaction belongs to the Playwright harness.
 */

// publisher + name from the manifest.
const EXTENSION_ID = "miragon-gmbh.vs-code-bpmn-modeler";

// Compiled to test/e2e/out, so fixtures sit one level up.
const FIXTURES = resolve(__dirname, "..", "fixtures");

function getExtension(): vscode.Extension<unknown> {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} not found in host`);
    return extension;
}

function supportsTextDiffRouting(): boolean {
    const [major, minor] = vscode.version.split(".").map(Number);
    return major > 1 || minor >= 129;
}

async function waitFor<T>(read: () => T | undefined, message: string): Promise<T> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const value = read();
        if (value !== undefined) return value;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(message);
}

suite("Extension activation smoke", () => {
    suiteTeardown(async () => {
        // Leave no editor open for whatever runs next in the same host.
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });

    test("activate() completes without throwing", async () => {
        const extension = getExtension();
        await extension.activate();
        assert.strictEqual(extension.isActive, true);
    });

    test("registers every command the manifest declares", async () => {
        const extension = getExtension();
        await extension.activate();

        const declared: string[] = extension.packageJSON.contributes.commands.map(
            (command: { command: string }) => command.command,
        );
        const registered = await vscode.commands.getCommands(true);

        const missing = declared.filter((id) => !registered.includes(id));
        assert.deepStrictEqual(missing, [], `commands not registered: ${missing.join(", ")}`);
    });

    test("resolves the BPMN custom editor for a .bpmn file", async () => {
        const uri = vscode.Uri.file(resolve(FIXTURES, "example.bpmn"));
        // Throws if no provider claims the viewType / resolution fails.
        await vscode.commands.executeCommand("vscode.openWith", uri, "bpmn-modeler.bpmn");
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    });

    test("resolves the DMN custom editor for a .dmn file", async () => {
        const uri = vscode.Uri.file(resolve(FIXTURES, "empty.dmn"));
        await vscode.commands.executeCommand("vscode.openWith", uri, "bpmn-modeler.dmn");
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    });

    test("opens a .form file in the form custom editor by default", async () => {
        const uri = vscode.Uri.file(resolve(FIXTURES, "example.form"));
        await vscode.commands.executeCommand("vscode.open", uri);

        const customEditor = await waitFor(() => {
            const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
            return input instanceof vscode.TabInputCustom ? input : undefined;
        }, "form custom editor did not open");
        assert.strictEqual(customEditor.viewType, "bpmn-modeler.form");
        assert.strictEqual(customEditor.uri.toString(), uri.toString());
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    });

    test("opens a form in the JSON text editor through the fallback command", async () => {
        const uri = vscode.Uri.file(resolve(FIXTURES, "example.form"));
        await vscode.commands.executeCommand("vscode.openWith", uri, "bpmn-modeler.form");

        const opened = await vscode.commands.executeCommand<boolean>(
            "bpmn-modeler.toggleTextEditor",
        );
        assert.strictEqual(opened, true);

        const textTab = await waitFor(
            () =>
                vscode.window.tabGroups.all
                    .flatMap((group) => group.tabs)
                    .find(
                        (tab) =>
                            tab.input instanceof vscode.TabInputText &&
                            tab.input.uri.toString() === uri.toString(),
                    ),
            "form text editor did not open",
        );
        assert.ok(textTab.input instanceof vscode.TabInputText);

        const document = await vscode.workspace.openTextDocument(uri);
        assert.strictEqual(document.languageId, "json");
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });

    test("reports form schema violations in the JSON text editor", async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder, "test workspace not found");

        const source = vscode.Uri.file(resolve(FIXTURES, "invalid.form"));
        const uri = vscode.Uri.joinPath(workspaceFolder.uri, "invalid.form");
        await vscode.workspace.fs.writeFile(uri, await vscode.workspace.fs.readFile(source));
        await vscode.commands.executeCommand("vscode.openWith", uri, "default");
        const document = await vscode.workspace.openTextDocument(uri);
        assert.strictEqual(document.languageId, "json");

        const edit = new vscode.WorkspaceEdit();
        edit.insert(uri, document.positionAt(document.getText().length), " ");
        assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

        const diagnostics = await waitFor(() => {
            const current = vscode.languages.getDiagnostics(uri);
            return current.length > 0 ? current : undefined;
        }, "form schema diagnostics did not arrive");
        assert.ok(
            diagnostics.some((diagnostic) => diagnostic.message.includes('Expected "array"')),
            `expected form schema violation, got: ${diagnostics
                .map((diagnostic) => diagnostic.message)
                .join("; ")}`,
        );
        await vscode.commands.executeCommand("workbench.action.files.revert");
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    });

    test("opens form comparisons in the standard JSON text diff", async function () {
        if (!supportsTextDiffRouting()) this.skip();

        const before = vscode.Uri.file(resolve(FIXTURES, "example.form"));
        const after = vscode.Uri.file(resolve(FIXTURES, "changed.form"));
        await vscode.commands.executeCommand("vscode.diff", before, after, "Form JSON diff");

        const diff = await waitFor(() => {
            const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
            return input instanceof vscode.TabInputTextDiff ? input : undefined;
        }, "form comparison did not open as a text diff");
        assert.strictEqual(diff.original.toString(), before.toString());
        assert.strictEqual(diff.modified.toString(), after.toString());
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    });
});
