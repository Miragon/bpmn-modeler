import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { join, resolve } from "node:path";

import * as vscode from "vscode";

// SPIKE (epic #2459 step 3, question 1.0.4): does `--disable-extensions` keep the built-in
// Git extension, and can the merge command open both sides in our panes on 1.76.0 and stable?

const EXTENSION_ID = "miragon-gmbh.vs-code-bpmn-modeler";
const SMOKE_BPMN = resolve(__dirname, "..", "..", "smoke", "fixtures", "smoke.bpmn");

interface TestApi {
    diff: {
        sessionFor(uri: string): { origin: string; paneCount: number } | undefined;
    };
}

interface GitApiLike {
    state: string;
    onDidChangeState(listener: (state: string) => void): vscode.Disposable;
    openRepository(root: vscode.Uri): Promise<unknown>;
}

interface GitExtensionLike {
    enabled: boolean;
    getAPI(version: 1): GitApiLike;
}

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
    } catch {
        // `git merge` exits 1 on a conflict.
        return "";
    }
}

function activeTab(): string {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const input = tab?.input;
    if (input instanceof vscode.TabInputCustom) return `custom:${input.viewType}`;
    if (input instanceof vscode.TabInputText) return "text";
    return `other:${tab?.label ?? "none"}`;
}

async function waitForActiveTab(uri: vscode.Uri): Promise<string> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input as
            | { uri?: vscode.Uri }
            | undefined;
        if (input?.uri?.toString() === uri.toString()) return activeTab();
        await new Promise((done) => setTimeout(done, 200));
    }
    return `timeout (${activeTab()})`;
}

async function waitFor(predicate: () => boolean, describe: () => string): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((done) => setTimeout(done, 250));
    }
    assert.fail(describe());
}

suite("BPMN merge view spike", () => {
    test("keeps the built-in Git extension under --disable-extensions", async () => {
        const extension = vscode.extensions.getExtension<GitExtensionLike>("vscode.git");
        console.log(
            `[merge-spike-e2e] vscode ${vscode.version}: vscode.git present=${extension !== undefined} active=${extension?.isActive}`,
        );
        assert.ok(extension, "vscode.git is missing");
        const exports = await extension.activate();
        console.log(`[merge-spike-e2e] vscode ${vscode.version}: enabled=${exports.enabled}`);
        assert.ok(exports.enabled, "vscode.git is disabled");
        const api = exports.getAPI(1);
        console.log(`[merge-spike-e2e] vscode ${vscode.version}: state=${api.state}`);
    });

    test("opens current and incoming of a conflicted file in two panes", async () => {
        const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        assert.ok(folder, "no workspace folder");
        // Both labels of .vscode-test.mjs share one workspace folder.
        const repository = join(folder, `merge-repo-${vscode.version}`);
        mkdirSync(repository, { recursive: true });
        const base = readFileSync(SMOKE_BPMN, "utf8");
        const file = join(repository, "order.bpmn");
        writeFileSync(file, base);
        git(repository, "init", "-q");
        git(repository, "add", "order.bpmn");
        git(repository, "commit", "-q", "--no-verify", "-m", "base");
        git(repository, "checkout", "-q", "-b", "incoming");
        writeFileSync(file, base.replace('name="Check order"', 'name="Check incoming order"'));
        git(repository, "commit", "-q", "-a", "--no-verify", "-m", "incoming");
        git(repository, "checkout", "-q", "main");
        writeFileSync(file, base.replace('name="Check order"', 'name="Check current order"'));
        git(repository, "commit", "-q", "-a", "--no-verify", "-m", "current");
        git(repository, "merge", "incoming", "--no-edit");
        assert.ok(readFileSync(file, "utf8").includes("<<<<<<<"), "no conflict was made");

        const gitApi = (
            await vscode.extensions.getExtension<GitExtensionLike>("vscode.git")!.activate()
        ).getAPI(1);
        if (gitApi.state !== "initialized") {
            await new Promise<void>((done) =>
                gitApi.onDidChangeState((state) => state === "initialized" && done()),
            );
        }
        await gitApi.openRepository(vscode.Uri.file(repository));

        const ours = vscode.extensions.getExtension<TestApi>(EXTENSION_ID);
        assert.ok(ours);
        const api = await ours.activate();
        const fileUri = vscode.Uri.file(file);
        const opened = await vscode.commands.executeCommand<{ current: string } | undefined>(
            "bpmn-modeler.openBpmnMergeView",
            fileUri,
        );
        assert.ok(opened, "the merge view did not open");
        const current = opened.current;
        await waitFor(
            () => api.diff.sessionFor(current)?.paneCount === 2,
            () =>
                `merge panes never attached on ${vscode.version}: ${JSON.stringify(api.diff.sessionFor(current))}; tabs: ${vscode.window.tabGroups.all
                    .flatMap((group) => group.tabs)
                    .map((tab) => tab.label)
                    .join(", ")}`,
        );
        console.log(
            `[merge-spike-e2e] vscode ${vscode.version}: session ${JSON.stringify(api.diff.sessionFor(current))}`,
        );
        assert.ok(readFileSync(file, "utf8").includes("<<<<<<<"), "the working file changed");
    });

    test("builds incoming into the working file and leaves the index (phase B)", async () => {
        const folder = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
        const repository = join(folder, `merge-repo-${vscode.version}`);
        const file = join(repository, "order.bpmn");
        const stagesBefore = git(repository, "ls-files", "-u");
        await vscode.commands.executeCommand(
            "bpmn-modeler.spikeTakeIncomingForEveryConflict",
            vscode.Uri.file(file),
        );
        const built = readFileSync(file, "utf8");
        console.log(
            `[merge-spike-e2e] vscode ${vscode.version}: built markers=${built.includes("<<<<<<<")} incoming=${built.includes("Check incoming order")} stages=${git(repository, "ls-files", "-u").trim().split("\n").length} activeTab=${activeTab()}`,
        );
        assert.ok(!built.includes("<<<<<<<"), "the working file still holds conflict markers");
        assert.ok(built.includes('name="Check incoming order"'), "incoming was not taken");
        assert.strictEqual(git(repository, "ls-files", "-u"), stagesBefore, "the index changed");
        assert.strictEqual(activeTab(), "custom:bpmn-modeler.bpmn");
    });

    test("opens a written .bpmn with vscode.open (1.0.5)", async () => {
        const folder = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
        const fresh = vscode.Uri.file(join(folder, `fresh-${vscode.version}.bpmn`));
        copyFileSync(SMOKE_BPMN, fresh.fsPath);
        await vscode.commands.executeCommand("vscode.open", fresh, { preview: false });
        const freshTab = await waitForActiveTab(fresh);

        const shownAsText = vscode.Uri.file(join(folder, `as-text-${vscode.version}.bpmn`));
        copyFileSync(SMOKE_BPMN, shownAsText.fsPath);
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(shownAsText), {
            preview: false,
        });
        const textFirst = await waitForActiveTab(shownAsText);
        await vscode.commands.executeCommand("vscode.open", shownAsText, { preview: false });
        const openAfterText = await waitForActiveTab(shownAsText);
        await vscode.commands.executeCommand("vscode.openWith", shownAsText, "bpmn-modeler.bpmn");
        const openWithAfterText = await waitForActiveTab(shownAsText);
        console.log(
            `[merge-spike-e2e] vscode ${vscode.version}: 1.0.5 fresh=${freshTab} textFirst=${textFirst} openAfterText=${openAfterText} openWithAfterText=${openWithAfterText}`,
        );
        assert.strictEqual(freshTab, "custom:bpmn-modeler.bpmn");
    });
});
