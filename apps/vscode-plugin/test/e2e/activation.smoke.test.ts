import * as assert from "node:assert";
import { resolve } from "node:path";

import * as vscode from "vscode";

/**
 * Extension-Host smoke test — the only thing that runs the composition root
 * (`main.ts` + `composition/*`) end-to-end in a real VS Code instance. Unit
 * tests mock `vscode` away entirely, so a broken `activate()` or a custom-editor
 * that no longer resolves is invisible to them; this guards that catastrophic
 * "extension won't activate" failure and nothing more (no webview interaction —
 * that stays on the Playwright harness).
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
});
