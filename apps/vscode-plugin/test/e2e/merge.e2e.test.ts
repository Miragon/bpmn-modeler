import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function git(repository: string, ...args: string[]): void {
    try {
        execFileSync(
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
            },
        );
    } catch {
        // `git merge` exits 1 on a conflict.
    }
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
        await vscode.commands.executeCommand("bpmn-modeler.openBpmnMergeView", fileUri);
        const current = vscode.Uri.from({
            scheme: "bpmn-merge",
            path: fileUri.path,
            query: "side=current&n=1",
        }).toString();
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
});
