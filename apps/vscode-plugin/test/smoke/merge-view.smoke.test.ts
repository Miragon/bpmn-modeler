import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { FrameLocator } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { COMMAND_KEY, VsCodeSession, downloadVsCode, packExtension } from "./vscodeSession";

/**
 * The BPMN merge view in a real VS Code, asserted through the DOM only:
 * opened from a Merge Changes row for a merge, a rebase, a cherry-pick and a
 * stash pop, explained on a row it cannot open, offered by an editor that
 * opens a file with conflict markers, ended after a window reload, and
 * opened again live beside the ended tab, and its panes marking what is
 * open and what was taken automatically. No editor association for
 * `*.bpmn`: the custom editor's own priority decides, as for a user.
 */

const runFile = promisify(execFile);
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DIST_DIRECTORY = join(REPOSITORY_ROOT, "dist/apps/vscode-plugin");
const RESULTS_DIRECTORY = join(REPOSITORY_ROOT, "test-results/vscode-smoke/merge-view");
const FIXTURES_DIRECTORY = fileURLToPath(new URL("./fixtures/", import.meta.url));
const TIMEOUT_MS = 30_000;
const COMMAND_TITLE = "Resolve in BPMN Merge View";
const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

type Operation = "merge" | "rebase" | "cherry-pick" | "stash";

/** Each operation conflicts its own file in its own repository, so the rows tell them apart. */
const CONFLICTED: Record<Operation, string> = {
    "merge": "merged.bpmn",
    "rebase": "rebased.bpmn",
    "cherry-pick": "picked.bpmn",
    "stash": "stashed.bpmn",
};

function runGit(repository: string, ...args: string[]): Promise<{ stdout: string; code: number }> {
    return runFile(
        "git",
        [
            "-c",
            "user.name=VS Code smoke",
            "-c",
            "user.email=vscode-smoke@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "init.defaultBranch=main",
            ...args,
        ],
        {
            cwd: repository,
            env: {
                ...Object.fromEntries(
                    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
                ),
                GIT_CONFIG_GLOBAL: devNull,
                GIT_CONFIG_NOSYSTEM: "1",
            },
        },
    ).then(
        ({ stdout }) => ({ stdout, code: 0 }),
        // A conflicting merge, rebase, cherry-pick or stash pop exits 1.
        (error: { stdout?: string; stderr?: string; code?: number }) => ({
            stdout: `${error.stdout ?? ""}${error.stderr ?? ""}`,
            code: error.code ?? 1,
        }),
    );
}

/**
 * A repository whose one file conflicts after `operation`: both sides rename
 * the task. In the merge, feature alone also renames the end event, which the
 * merge takes from feature without asking.
 */
async function conflictedRepository(
    workspace: string,
    operation: Operation,
    base: string,
): Promise<string> {
    const repository = join(workspace, `${operation}-repo`);
    const fileName = CONFLICTED[operation];
    const file = join(repository, fileName);
    const renamed = (name: string) => base.replace('name="Check order"', `name="${name}"`);
    const commitAll = (message: string) =>
        runGit(repository, "commit", "-q", "-a", "--no-verify", "-m", message);
    await mkdir(repository, { recursive: true });
    await writeFile(file, base);
    await runGit(repository, "init", "-q");
    await runGit(repository, "add", fileName);
    await runGit(repository, "commit", "-q", "--no-verify", "-m", "Add the order process");
    if (operation === "stash") {
        await writeFile(file, renamed("Check stashed order"));
        await runGit(repository, "stash", "push", "-q");
        await writeFile(file, renamed("Check main order"));
        await commitAll("Rename the check on main");
        await runGit(repository, "stash", "pop");
        return repository;
    }
    await runGit(repository, "checkout", "-q", "-b", "feature");
    const featureVersion = renamed("Check feature order");
    await writeFile(
        file,
        operation === "merge"
            ? featureVersion.replace('name="Order checked"', 'name="Order verified"')
            : featureVersion,
    );
    if (operation === "merge") await writeFile(join(repository, "notes.txt"), "feature\n");
    if (operation === "merge") await runGit(repository, "add", "notes.txt");
    await commitAll("Rename the check on feature");
    await runGit(repository, "checkout", "-q", "main");
    await writeFile(file, renamed("Check main order"));
    if (operation === "merge") await writeFile(join(repository, "notes.txt"), "main\n");
    if (operation === "merge") await runGit(repository, "add", "notes.txt");
    await commitAll("Rename the check on main");
    if (operation === "merge") await runGit(repository, "merge", "feature", "--no-edit");
    if (operation === "cherry-pick") await runGit(repository, "cherry-pick", "feature");
    if (operation === "rebase") {
        await runGit(repository, "checkout", "-q", "feature");
        await runGit(repository, "rebase", "main");
    }
    return repository;
}

describe("the BPMN merge view", () => {
    let rootDirectory = "";
    let workspaceDirectory = "";
    const repositories = {} as Record<Operation, string>;
    const untouched = {} as Record<Operation, { workingFile: string; stages: string }>;
    let session: VsCodeSession | undefined;
    const vscode = (): VsCodeSession => {
        if (!session) throw new Error("VS Code did not start");
        return session;
    };

    async function shot(name: string): Promise<void> {
        await delay(800);
        await vscode().screenshot(join(RESULTS_DIRECTORY, `${name}.png`));
    }

    /** A focused webview can swallow F1, so the focus moves to the side bar first. */
    async function runFromSideBar(title: string): Promise<void> {
        await vscode().page.keyboard.press("Escape");
        await vscode().page.locator(".part.sidebar .composite.title").first().click();
        await vscode().runCommand(title);
    }

    /** The Source Control list renders only the rows in sight, so it is scrolled to the row first. */
    async function sourceControlRow(fileName: string) {
        const list = vscode().page.locator(".scm-view .monaco-list").first();
        const row = vscode()
            .page.locator(".scm-view .monaco-list-row")
            .filter({ has: vscode().page.locator(".resource") })
            .filter({ hasText: fileName })
            .first();
        const deadline = Date.now() + TIMEOUT_MS;
        while (!(await row.isVisible()) && Date.now() < deadline) {
            await list.hover();
            await vscode().page.mouse.wheel(0, -100_000);
            for (let scrolls = 0; scrolls < 20 && !(await row.isVisible()); scrolls++) {
                await vscode().page.mouse.wheel(0, 150);
                await delay(100);
            }
            if (!(await row.isVisible())) await delay(500);
        }
        // A group's sticky header can cover the row it scrolled to.
        const sticky = vscode().page.locator(".scm-view .monaco-tree-sticky-container").first();
        for (let nudges = 0; nudges < 10; nudges++) {
            const rowBox = await row.boundingBox();
            const stickyBox = await sticky.boundingBox().catch(() => null);
            if (!rowBox || !stickyBox || rowBox.y >= stickyBox.y + stickyBox.height) break;
            await list.hover();
            await vscode().page.mouse.wheel(0, -44);
            await delay(100);
        }
        return row;
    }

    /** The conflicted files sit in their repositories' folders, which the Explorer shows collapsed. */
    async function openWithQuickOpen(fileName: string): Promise<void> {
        await vscode().page.keyboard.press("Escape");
        await vscode().page.locator(".part.sidebar .composite.title").first().click();
        await vscode().page.keyboard.press(`${COMMAND_KEY}+p`);
        const input = vscode().page.locator(".quick-input-widget .quick-input-box input");
        await input.fill(fileName);
        await vscode()
            .page.locator(".quick-input-widget .monaco-list-row.focused")
            .filter({ hasText: fileName })
            .waitFor({ timeout: TIMEOUT_MS });
        await vscode().page.keyboard.press("Enter");
        await vscode().page.mouse.move(0, 0);
    }

    /** Right-clicks a Merge Changes row and returns the menu's labels, running `command` if given. */
    async function rowMenu(fileName: string, command?: string): Promise<string[]> {
        await runFromSideBar("Source Control: Focus on Changes View");
        const row = await sourceControlRow(fileName);
        await row.waitFor({ state: "visible", timeout: TIMEOUT_MS });
        await row.click({ button: "right" });
        const labels = vscode().page.locator(".context-view .action-label");
        await labels.first().waitFor({ timeout: TIMEOUT_MS });
        // A menu item listens for the mouse only 100 ms after it renders.
        await delay(300);
        const items = (await labels.allTextContents()).map((label) => label.trim());
        if (command) {
            await vscode()
                .page.locator(".context-view")
                .getByText(command, { exact: true })
                .click();
            await vscode().page.mouse.move(0, 0);
        } else {
            await vscode().page.keyboard.press("Escape");
        }
        return items;
    }

    async function tabLabels(): Promise<string[]> {
        return vscode()
            .page.locator(".tabs-container .tab")
            .evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute("aria-label") ?? ""));
    }

    async function activeTabLabel(): Promise<string> {
        return (
            (await vscode()
                .page.locator(".editor-group-container.active .tabs-container .tab.active")
                .first()
                .getAttribute("aria-label")) ?? ""
        );
    }

    function sideLabel(webview: FrameLocator): Promise<string> {
        return webview.locator(".diff-side-label").innerText({ timeout: TIMEOUT_MS });
    }

    /** The side labels of both panes of the visible merge view, once both painted their caption. */
    async function captions(): Promise<{ current: string; incoming: string }> {
        const current = await vscode().editorWebview('body[data-diff-side="before"]');
        const incoming = await vscode().editorWebview('body[data-diff-side="after"]');
        await expect.poll(() => sideLabel(current), { timeout: TIMEOUT_MS }).toMatch(/^Current/);
        return { current: await sideLabel(current), incoming: await sideLabel(incoming) };
    }

    /** What every visible editor webview of the extension shows. */
    async function visiblePanes(): Promise<
        { ended: boolean; canvas: boolean; palette: boolean }[]
    > {
        const frames = vscode().editorFrames().filter({ visible: true });
        const panes = [];
        for (let index = 0; index < (await frames.count()); index++) {
            const page = frames
                .nth(index)
                .contentFrame()
                .locator("iframe#active-frame")
                .contentFrame();
            const count = (selector: string) =>
                page
                    .locator(selector)
                    .count()
                    .catch(() => 0);
            panes.push({
                ended: (await count("[data-merge-view-ended]")) > 0,
                canvas: (await count(".djs-container")) > 0,
                palette: (await count(".djs-palette")) > 0,
            });
        }
        return panes;
    }

    /** The editable modeler, not a diff pane that never paired: it has a palette and a properties panel. */
    async function editableModelerShows(): Promise<boolean> {
        const modeler = await vscode().editorWebview(".djs-palette");
        return (await modeler.locator("#js-properties-panel").count()) > 0;
    }

    async function notification(text: string) {
        const toast = vscode()
            .page.locator(".notifications-toasts .notification-toast")
            .filter({ hasText: text })
            .first();
        await toast.waitFor({ state: "visible", timeout: TIMEOUT_MS });
        return toast;
    }

    async function expectUntouched(operation: Operation): Promise<void> {
        const repository = repositories[operation];
        expect(await readFile(join(repository, CONFLICTED[operation]), "utf8")).toBe(
            untouched[operation].workingFile,
        );
        expect((await runGit(repository, "ls-files", "-u")).stdout).toBe(
            untouched[operation].stages,
        );
    }

    beforeAll(async () => {
        await rm(RESULTS_DIRECTORY, { recursive: true, force: true });
        await mkdir(RESULTS_DIRECTORY, { recursive: true });
        rootDirectory = await mkdtemp(join(tmpdir(), "bpmn-modeler-merge-view-"));
        workspaceDirectory = join(rootDirectory, "workspace");
        await mkdir(workspaceDirectory, { recursive: true });
        const base = await readFile(join(FIXTURES_DIRECTORY, "smoke.bpmn"), "utf8");
        for (const operation of Object.keys(CONFLICTED) as Operation[]) {
            const repository = await conflictedRepository(workspaceDirectory, operation, base);
            repositories[operation] = repository;
            untouched[operation] = {
                workingFile: await readFile(join(repository, CONFLICTED[operation]), "utf8"),
                stages: (await runGit(repository, "ls-files", "-u")).stdout,
            };
        }
        await cp(join(FIXTURES_DIRECTORY, "smoke.bpmn"), join(workspaceDirectory, "clean.bpmn"));
        await writeFile(join(workspaceDirectory, "readme.txt"), "not a diagram\n");

        const manifest = JSON.parse(await readFile(join(DIST_DIRECTORY, "package.json"), "utf8"));
        const extensionPath = await packExtension(DIST_DIRECTORY, rootDirectory);
        const executablePath = await downloadVsCode(
            extensionPath,
            process.env.VSCODE_SMOKE_VERSION || undefined,
            (line) => console.log(`[merge-view] ${line}`),
        );
        session = await VsCodeSession.launch({
            executablePath,
            extensionPath,
            extensionId: `${manifest.publisher}.${manifest.name}`.toLowerCase(),
            rootDirectory,
            workspaceDirectory,
            fileToOpen: join(workspaceDirectory, "clean.bpmn"),
            customEditors: {},
            colorTheme: "Default Light Modern",
            timeoutMs: TIMEOUT_MS,
        });
        await session.showInCustomEditor("clean.bpmn", async (webview) => {
            return (await webview.locator(".djs-container .djs-element.djs-shape").count()) >= 3;
        });
        await session.setGitEnabled(true);
    });

    afterEach(async ({ task }) => {
        if (task.result?.state !== "fail") return;
        const name = task.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        await session
            ?.screenshot(join(RESULTS_DIRECTORY, `failure-${name}.png`))
            .catch(() => undefined);
    });

    afterAll(async () => {
        if (session) {
            await cp(session.logsDirectory, join(RESULTS_DIRECTORY, "vscode-logs"), {
                recursive: true,
            }).catch(() => undefined);
        }
        await session?.close();
        if (rootDirectory) await rm(rootDirectory, { recursive: true, force: true });
    });

    describe("open", () => {
        it("offers the merge view on a Merge Changes row while a text file is the active editor", async () => {
            await runFromSideBar("View: Show Explorer");
            await vscode().openFromExplorer("readme.txt");
            await expect.poll(activeTabLabel, { timeout: TIMEOUT_MS }).toContain("readme.txt");

            const items = await rowMenu(CONFLICTED.merge, COMMAND_TITLE);

            expect(items).toContain(COMMAND_TITLE);
            await expect
                .poll(tabLabels, { timeout: TIMEOUT_MS })
                .toContainEqual(expect.stringContaining("merged.bpmn (Merge: main ↔ feature)"));
            const { current, incoming } = await captions();
            expect(current).toMatch(/^Current: your branch main · [0-9a-f]{7}$/);
            expect(incoming).toMatch(/^Incoming: other branch feature · [0-9a-f]{7}$/);
            await expectUntouched("merge");
            await shot("merge-two-panes");
        });

        it("explains a Merge Changes row it cannot open", async () => {
            const items = await rowMenu("notes.txt", COMMAND_TITLE);

            expect(items).toContain(COMMAND_TITLE);
            await notification(
                "notes.txt is not a BPMN file. The BPMN merge view opens conflicted .bpmn files only.",
            );
        });

        it("opens both sides of a rebase and names the user's own commit", async () => {
            await rowMenu(CONFLICTED.rebase, COMMAND_TITLE);

            await expect
                .poll(activeTabLabel, { timeout: TIMEOUT_MS })
                .toContain("rebased.bpmn (Merge: ");
            const { current, incoming } = await captions();
            expect(current).toMatch(/^Current: other branch · [0-9a-f]{7}$/);
            expect(incoming).toMatch(/^Incoming: your commit · [0-9a-f]{7}$/);
            await expectUntouched("rebase");
            await shot("rebase-two-panes");
        });

        it("opens both sides of a cherry-pick", async () => {
            await rowMenu(CONFLICTED["cherry-pick"], COMMAND_TITLE);

            await expect
                .poll(activeTabLabel, { timeout: TIMEOUT_MS })
                .toContain("picked.bpmn (Merge: main ↔ ");
            const { current, incoming } = await captions();
            expect(current).toMatch(/^Current: your branch main · /);
            expect(incoming).toMatch(/^Incoming: other branch · [0-9a-f]{7}$/);
            await expectUntouched("cherry-pick");
        });

        it("opens both sides of a stash pop", async () => {
            await rowMenu(CONFLICTED.stash, COMMAND_TITLE);

            await expect
                .poll(activeTabLabel, { timeout: TIMEOUT_MS })
                .toContain("stashed.bpmn (Merge: main ↔ ");
            const { current, incoming } = await captions();
            expect(current).toMatch(/^Current: your branch main · /);
            expect(incoming).toBe("Incoming: your stash");
            await expectUntouched("stash");
        });

        it("opens the working file as the editable modeler beside its merge tab and offers the merge view", async () => {
            await openWithQuickOpen(CONFLICTED.merge);

            await expect.poll(editableModelerShows, { timeout: TIMEOUT_MS }).toBe(true);
            const notice = await notification(
                "merged.bpmn holds Git conflict markers, so the modeler cannot show it.",
            );
            await shot("conflict-marker-notice");
            await notice.getByRole("button", { name: COMMAND_TITLE }).click();

            await expect
                .poll(activeTabLabel, { timeout: TIMEOUT_MS })
                .toContain("merged.bpmn (Merge: main ↔ feature)");
        });

        it("shows that the merge view ended in both restored panes after a window reload", async () => {
            await runFromSideBar("Developer: Reload Window");
            await delay(3000);
            await vscode().page.waitForSelector(".monaco-workbench", { timeout: TIMEOUT_MS });

            await expect
                .poll(
                    async () => {
                        const panes = await visiblePanes();
                        return panes.length >= 2 && panes.every((pane) => pane.ended);
                    },
                    { timeout: TIMEOUT_MS },
                )
                .toBe(true);
            expect((await visiblePanes()).some((pane) => pane.canvas)).toBe(false);
            await shot("merge-view-after-reload");
        });

        it("opens the working file as the editable modeler beside the restored ended tab", async () => {
            await openWithQuickOpen(CONFLICTED.merge);

            await expect.poll(editableModelerShows, { timeout: TIMEOUT_MS }).toBe(true);
        });

        it("opens live panes again beside the restored ended tab", async () => {
            await rowMenu(CONFLICTED.merge, COMMAND_TITLE);

            await expect
                .poll(
                    async () => {
                        const panes = await visiblePanes();
                        return (
                            panes.length >= 2 && panes.every((pane) => pane.canvas && !pane.ended)
                        );
                    },
                    { timeout: TIMEOUT_MS },
                )
                .toBe(true);
            const { current } = await captions();
            expect(current).toMatch(/^Current: your branch main/);
            await shot("merge-view-reopened");
        });
    });

    describe("marks", () => {
        /** The class list of an element of a pane's canvas, once the pane painted its marks. */
        function classesOf(pane: FrameLocator, elementId: string): Promise<string> {
            return pane
                .locator(`.djs-element[data-element-id="${elementId}"]`)
                .first()
                .getAttribute("class", { timeout: TIMEOUT_MS })
                .then((classes) => classes ?? "");
        }

        it("counts the open conflict and marks the task both sides renamed on both panes", async () => {
            await rowMenu(CONFLICTED.merge, COMMAND_TITLE);
            const current = await vscode().editorWebview('body[data-diff-side="before"]');
            const incoming = await vscode().editorWebview('body[data-diff-side="after"]');

            for (const pane of [current, incoming]) {
                await expect
                    .poll(() => pane.locator(".merge-legend__open").innerText(), {
                        timeout: TIMEOUT_MS,
                    })
                    .toBe("1 open conflict");
                expect(await classesOf(pane, "Task_Check")).toContain("merge-conflict");
                expect(await pane.locator(".merge-conflict-badge").count()).toBe(1);
            }
            await shot("marks-both-panes");
        });

        it("marks the end event only feature renamed as taken from the incoming side", async () => {
            const current = await vscode().editorWebview('body[data-diff-side="before"]');
            const incoming = await vscode().editorWebview('body[data-diff-side="after"]');

            await expect
                .poll(() => classesOf(incoming, "End_Order"), { timeout: TIMEOUT_MS })
                .toContain("merge-taken-from-this-side");
            expect(await classesOf(current, "End_Order")).toContain("merge-taken-from-other-side");
            expect(await classesOf(current, "Start_Order")).not.toMatch(/merge-/);
            await expectUntouched("merge");
        });
    });
});
