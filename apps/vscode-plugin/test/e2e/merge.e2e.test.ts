import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { join, resolve } from "node:path";

import * as vscode from "vscode";

/**
 * Opens the BPMN merge view on a real conflicted repository in a real VS
 * Code host, on the engines floor and on stable: the built-in Git extension
 * stays under `--disable-extensions`, our custom editor resolves both
 * `bpmn-merge:` sides, and the working file still opens as the editable
 * modeler while the merge tab is open.
 */

const EXTENSION_ID = "miragon-gmbh.vs-code-bpmn-modeler";
const COMMAND = "bpmn-modeler.openBpmnMergeView";
const BASE = readFileSync(resolve(__dirname, "..", "fixtures", "order.bpmn"), "utf8");
const FILE = "order.bpmn";

interface Caption {
    side: string;
    role: string;
    ref?: string;
    shortHash?: string;
    subject?: string;
}

interface TestApi {
    diff: {
        paneCountFor(uri: string): number;
    };
    merge: {
        sessionFor(fileUri: string):
            | {
                  origin: string | undefined;
                  paneCount: number;
                  tabCount: number;
                  captions: { current: Caption; incoming: Caption };
              }
            | undefined;
    };
}

interface GitApi {
    state: string;
    onDidChangeState(listener: (state: string) => void): vscode.Disposable;
    openRepository(root: vscode.Uri): Promise<unknown>;
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
    } catch (error) {
        // `git merge` and `git rebase` exit 1 on a conflict.
        return String((error as { stdout?: string }).stdout ?? "");
    }
}

const renamed = (name: string) => BASE.replace('name="Check order"', `name="${name}"`);

/**
 * A repository whose order.bpmn conflicts: both branches rename the task.
 * Each VS Code version gets its own folder, since both labels of the e2e
 * config share one workspace folder.
 */
function conflictedRepository(operation: "merge" | "rebase" | "merge-after-rebase"): string {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(folder, "no workspace folder");
    const repository = join(folder, `${operation}-${vscode.version}`);
    mkdirSync(repository, { recursive: true });
    const file = join(repository, FILE);
    writeFileSync(file, BASE);
    git(repository, "init", "-q");
    git(repository, "add", FILE);
    git(repository, "commit", "-q", "--no-verify", "-m", "Add the order process");
    git(repository, "checkout", "-q", "-b", "feature");
    writeFileSync(file, renamed("Check feature order"));
    git(repository, "commit", "-q", "-a", "--no-verify", "-m", "Rename the check on feature");
    git(repository, "checkout", "-q", "main");
    writeFileSync(file, renamed("Check main order"));
    git(repository, "commit", "-q", "-a", "--no-verify", "-m", "Rename the check on main");
    if (operation === "merge") {
        git(repository, "merge", "feature", "--no-edit");
    } else if (operation === "rebase") {
        git(repository, "checkout", "-q", "feature");
        git(repository, "rebase", "main");
    } else {
        // A finished rebase leaves REBASE_HEAD behind; only `--abort` deletes it.
        git(repository, "checkout", "-q", "feature");
        git(repository, "rebase", "main");
        writeFileSync(file, renamed("Check feature order"));
        git(repository, "add", FILE);
        git(repository, "-c", "core.editor=true", "rebase", "--continue");
        git(repository, "checkout", "-q", "main");
        writeFileSync(file, renamed("Check main order again"));
        git(repository, "commit", "-q", "-a", "--no-verify", "-m", "Rename the check on main again");
        git(repository, "merge", "feature", "--no-edit");
        assert.ok(git(repository, "rev-parse", "-q", "--verify", "REBASE_HEAD"), "no REBASE_HEAD left");
    }
    assert.ok(readFileSync(file, "utf8").includes("<<<<<<<"), `no ${operation} conflict`);
    return repository;
}

async function waitFor(predicate: () => boolean, describe: () => string): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((done) => setTimeout(done, 250));
    }
    assert.fail(describe());
}

/** `vscode.git` stays under `--disable-extensions`, but may still be starting. */
async function openInGit(repository: string): Promise<void> {
    const extension = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>("vscode.git");
    assert.ok(extension, "vscode.git is missing");
    const api = (await extension.activate()).getAPI(1);
    if (api.state !== "initialized") {
        await new Promise<void>((done) => {
            const subscription = api.onDidChangeState((state) => {
                if (state !== "initialized") return;
                subscription.dispose();
                done();
            });
        });
    }
    await api.openRepository(vscode.Uri.file(repository));
}

suite("BPMN merge view", () => {
    let api: TestApi;

    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension<TestApi>(EXTENSION_ID);
        assert.ok(extension, `extension ${EXTENSION_ID} not found in host`);
        api = await extension.activate();
    });

    suiteTeardown(async () => {
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });

    suite("on a merge conflict", () => {
        let repository = "";
        let fileUri: vscode.Uri;
        let workingFile = "";
        let stages = "";

        suiteSetup(async () => {
            repository = conflictedRepository("merge");
            fileUri = vscode.Uri.file(join(repository, FILE));
            workingFile = readFileSync(fileUri.fsPath, "utf8");
            stages = git(repository, "ls-files", "-u");
            await openInGit(repository);
        });

        test("opens current and incoming as a merge session with Git's captions", async () => {
            await vscode.commands.executeCommand(COMMAND, fileUri);

            await waitFor(
                () => api.merge.sessionFor(fileUri.toString())?.paneCount === 2,
                () =>
                    `merge panes never attached: ${JSON.stringify(api.merge.sessionFor(fileUri.toString()))}`,
            );
            const session = api.merge.sessionFor(fileUri.toString());
            assert.strictEqual(session?.origin, "merge");
            assert.deepStrictEqual(
                [session.captions.current.role, session.captions.current.ref],
                ["branch", "main"],
            );
            assert.deepStrictEqual(
                [session.captions.incoming.role, session.captions.incoming.ref],
                ["upstream", "feature"],
            );
            assert.strictEqual(session.captions.incoming.subject, "Rename the check on feature");
        });

        test("writes nothing: the working file and the index stay as Git left them", () => {
            assert.strictEqual(readFileSync(fileUri.fsPath, "utf8"), workingFile);
            assert.strictEqual(git(repository, "ls-files", "-u"), stages);
        });

        test("focuses the open merge view instead of opening a second one", async () => {
            await vscode.commands.executeCommand(COMMAND, fileUri);
            await new Promise((done) => setTimeout(done, 1_000));

            const session = api.merge.sessionFor(fileUri.toString());
            assert.deepStrictEqual([session?.tabCount, session?.paneCount], [1, 2]);
        });

        test("opens the working file as the editable modeler while the merge tab is open", async () => {
            await vscode.commands.executeCommand("vscode.open", fileUri);

            await waitFor(
                () => {
                    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
                    return (
                        input instanceof vscode.TabInputCustom &&
                        input.uri.toString() === fileUri.toString()
                    );
                },
                () => `the working file did not open in the custom editor`,
            );
            // A viewType cannot tell the modeler from a diff pane: only a pane count can.
            await new Promise((done) => setTimeout(done, 1_000));
            assert.strictEqual(api.diff.paneCountFor(fileUri.toString()), 0);
            assert.strictEqual(api.merge.sessionFor(fileUri.toString())?.paneCount, 2);
        });
    });

    suite("on a merge after an earlier rebase", () => {
        test("names the sides of the merge, not of the finished rebase", async () => {
            const repository = conflictedRepository("merge-after-rebase");
            const fileUri = vscode.Uri.file(join(repository, FILE));
            await openInGit(repository);

            await vscode.commands.executeCommand(COMMAND, fileUri);

            await waitFor(
                () => api.merge.sessionFor(fileUri.toString())?.paneCount === 2,
                () =>
                    `merge panes never attached: ${JSON.stringify(api.merge.sessionFor(fileUri.toString()))}`,
            );
            const captions = api.merge.sessionFor(fileUri.toString())?.captions;
            assert.deepStrictEqual(
                [captions?.current.role, captions?.current.ref, captions?.incoming.role],
                ["branch", "main", "upstream"],
            );
        });
    });

    suite("on a rebase conflict", () => {
        test("tells the user's own commit apart", async () => {
            const repository = conflictedRepository("rebase");
            const fileUri = vscode.Uri.file(join(repository, FILE));
            await openInGit(repository);

            await vscode.commands.executeCommand(COMMAND, fileUri);

            await waitFor(
                () => api.merge.sessionFor(fileUri.toString())?.paneCount === 2,
                () =>
                    `merge panes never attached: ${JSON.stringify(api.merge.sessionFor(fileUri.toString()))}`,
            );
            const captions = api.merge.sessionFor(fileUri.toString())?.captions;
            assert.deepStrictEqual(
                [captions?.current.role, captions?.incoming.role],
                ["upstream", "yourCommit"],
            );
            assert.strictEqual(captions?.incoming.subject, "Rename the check on feature");
        });
    });
});
