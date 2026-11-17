import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { FrameLocator } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { BpmnModdle } from "bpmn-moddle";

import { COMMAND_KEY, VsCodeSession, downloadVsCode, packExtension } from "./vscodeSession";

/**
 * The BPMN merge view in a real VS Code, asserted through the DOM only:
 * opened from a Merge Changes row for a merge, a rebase, a cherry-pick and a
 * stash pop, explained on a row it cannot open, offered by an editor that
 * opens a file with conflict markers, ended after a window reload, and
 * opened again live beside the ended tab, its panes marking what is open
 * and what was taken automatically, the user's picks, and the build into
 * the working file up to Git's continue. No editor association for
 * `*.bpmn`: the custom editor's own priority decides, as for a user.
 */

const runFile = promisify(execFile);
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DIST_DIRECTORY = join(REPOSITORY_ROOT, "dist/apps/vscode-plugin");
const RESULTS_DIRECTORY = join(REPOSITORY_ROOT, "test-results/vscode-smoke/merge-view");
const FIXTURES_DIRECTORY = fileURLToPath(new URL("./fixtures/", import.meta.url));
const TIMEOUT_MS = 30_000;
// VS Code's minimum editor width, which the merge bar fits on one line.
const NARROWEST_EDITOR_WIDTH = 220;
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

/** In the merge, main deleted the task with both of its flows while feature renamed it. */
const REMOVAL_FILE = "removed.bpmn";

function withoutCheckTask(base: string): string {
    return base
        .replace(/\s*<bpmn:task id="Task_Check"[\s\S]*?<\/bpmn:task>/, "")
        .replace(/\s*<bpmn:outgoing>Flow_To_Task<\/bpmn:outgoing>/, "")
        .replace(/\s*<bpmn:incoming>Flow_To_End<\/bpmn:incoming>/, "")
        .replace(/\s*<bpmn:sequenceFlow id="Flow_To_(Task|End)"[^>]*\/>/g, "")
        .replace(/\s*<bpmndi:BPMNShape id="Task_Check_di"[\s\S]*?<\/bpmndi:BPMNShape>/, "")
        .replace(/\s*<bpmndi:BPMNEdge id="Flow_To_(Task|End)_di"[\s\S]*?<\/bpmndi:BPMNEdge>/g, "");
}

/**
 * A repository whose one file conflicts after `operation`: both sides rename
 * the task. In the merge, feature alone also renames the end event, which the
 * merge takes from feature without asking, and a second file conflicts on a
 * task main deleted and feature renamed.
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
    if (operation === "merge") await writeFile(join(repository, REMOVAL_FILE), base);
    await runGit(repository, "init", "-q");
    await runGit(repository, "add", fileName);
    if (operation === "merge") await runGit(repository, "add", REMOVAL_FILE);
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
    if (operation === "merge") {
        await writeFile(join(repository, REMOVAL_FILE), renamed("Check feature order"));
    }
    if (operation === "merge") await writeFile(join(repository, "notes.txt"), "feature\n");
    if (operation === "merge") await runGit(repository, "add", "notes.txt");
    await commitAll("Rename the check on feature");
    await runGit(repository, "checkout", "-q", "main");
    await writeFile(file, renamed("Check main order"));
    if (operation === "merge")
        await writeFile(join(repository, REMOVAL_FILE), withoutCheckTask(base));
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
        // The list scrolls a bounded distance per wheel event, so it walks up, then down, looking.
        while (!(await row.isVisible()) && Date.now() < deadline) {
            await list.hover();
            for (let scrolls = 0; scrolls < 20 && !(await row.isVisible()); scrolls++) {
                await vscode().page.mouse.wheel(0, -300);
                await delay(100);
            }
            for (let scrolls = 0; scrolls < 40 && !(await row.isVisible()); scrolls++) {
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
    async function openWithQuickOpen(
        fileName: string,
        { toTheSide = false }: { toTheSide?: boolean } = {},
    ): Promise<void> {
        await vscode().page.keyboard.press("Escape");
        await vscode().page.locator(".part.sidebar .composite.title").first().click();
        await vscode().page.keyboard.press(`${COMMAND_KEY}+p`);
        const input = vscode().page.locator(".quick-input-widget .quick-input-box input");
        await input.fill(fileName);
        // Recently opened merge tabs are listed too, and the list may still change while it fills,
        // so the file is picked by its row, not by moving the focus.
        const row = vscode()
            .page.locator(".quick-input-widget .quick-input-list .monaco-list-row")
            .filter({ hasText: fileName })
            .filter({ hasNotText: "(Merge: " })
            .first();
        await row.waitFor({ timeout: TIMEOUT_MS });
        if (toTheSide) {
            await row.hover();
            await row.getByRole("button", { name: /to the Side/i }).click();
        } else {
            await row.click();
        }
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

    /** A pane's caption in its bar, in full: a narrow bar hides the branch and commit, not the text. */
    async function sideLabel(webview: FrameLocator): Promise<string> {
        return (
            (await webview.locator(".merge-bar__caption").textContent({ timeout: TIMEOUT_MS })) ??
            ""
        );
    }

    /** The captions of both panes of the visible merge view, once both painted theirs. */
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

    /** The keyboard's way: focus the legend's button and press Enter, no click. */
    async function press(pane: FrameLocator, name: string): Promise<void> {
        const target = pane.getByRole("button", { name, exact: true });
        for (let attempt = 1; ; attempt++) {
            try {
                await target.waitFor({ state: "visible", timeout: TIMEOUT_MS });
                await target.focus();
                break;
            } catch (error) {
                // VS Code can replace a webview's frame while a newly opened tab settles.
                if (attempt === 3 || !String(error).includes("has been closed")) throw error;
            }
        }
        await vscode().page.keyboard.press("Enter");
    }

    /** The mouse's way: an entry of the context pad a step or a click opened, by its label. */
    function padEntry(pane: FrameLocator, name: string | RegExp) {
        return pane
            .locator(".djs-context-pad")
            .getByRole("button", { name, exact: typeof name === "string" });
    }

    async function decideInPad(pane: FrameLocator, name: string | RegExp): Promise<void> {
        const entry = padEntry(pane, name);
        await entry.waitFor({ state: "visible", timeout: TIMEOUT_MS });
        await entry.click();
    }

    async function mergePanes(): Promise<{ current: FrameLocator; incoming: FrameLocator }> {
        return {
            current: await vscode().editorWebview('body[data-diff-side="before"]'),
            incoming: await vscode().editorWebview('body[data-diff-side="after"]'),
        };
    }

    /** The open conflicts, as the incoming pane's ‹ n/N › names them in its tooltip. */
    async function openCount(incoming: FrameLocator): Promise<string> {
        return (
            (await incoming
                .locator(".merge-bar__position")
                .getAttribute("data-merge-tooltip", { timeout: TIMEOUT_MS })) ?? ""
        );
    }

    /** Opens the incoming pane's "…" menu the keyboard's way, unless it is open. */
    async function openMenu(incoming: FrameLocator): Promise<void> {
        const shown = incoming.locator(".merge-menu:not([hidden])");
        if ((await shown.count()) > 0) return;
        const more = incoming.locator(".merge-bar__more");
        await more.waitFor({ state: "visible", timeout: TIMEOUT_MS });
        await more.focus();
        await vscode().page.keyboard.press("Enter");
        await shown.waitFor({ state: "visible", timeout: TIMEOUT_MS });
    }

    /** Switches the step list in the menu and closes it with Escape, which gives the focus back to "…". */
    async function chooseStepList(incoming: FrameLocator, name: string): Promise<void> {
        await openMenu(incoming);
        await incoming.getByRole("radio", { name, exact: true }).focus();
        await vscode().page.keyboard.press("Enter");
        await expect
            .poll(
                () =>
                    incoming.getByRole("radio", { name, exact: true }).getAttribute("aria-checked"),
                {
                    timeout: TIMEOUT_MS,
                },
            )
            .toBe("true");
        await vscode().page.keyboard.press("Escape");
        await incoming.locator(".merge-menu").waitFor({ state: "hidden", timeout: TIMEOUT_MS });
    }

    /** The menu's way: opens "…" and presses one of its entries. */
    async function pressInMenu(incoming: FrameLocator, name: string): Promise<void> {
        await openMenu(incoming);
        await press(incoming, name);
    }

    /**
     * Build where the bar has room for it, else the first item of the "…"
     * menu. A pane that reloaded after a tab switch refits its bar once its
     * states arrive, so Build gets a moment to show on the bar first.
     */
    async function pressBuild(incoming: FrameLocator): Promise<void> {
        const onBar = await incoming
            .locator(".merge-bar__build")
            .waitFor({ state: "visible", timeout: 5_000 })
            .then(() => true)
            .catch(() => false);
        if (onBar) {
            await press(incoming, "Build");
            return;
        }
        await openMenu(incoming);
        const inMenu = incoming.locator(".merge-menu").getByRole("button", {
            name: "Build",
            exact: true,
        });
        await inMenu.waitFor({ state: "visible", timeout: TIMEOUT_MS });
        await inMenu.focus();
        await vscode().page.keyboard.press("Enter");
    }

    /**
     * One line each, level with each other, and nothing cut off: the bars'
     * layout across a pane's width. A part cut off or an ellipsized caption
     * overflows its box.
     */
    async function barLayout(pane: FrameLocator) {
        return pane.locator(".merge-bar").evaluate((bar) => {
            const parts = [".merge-bar__row", ".merge-bar__caption", ".merge-bar__counts"].map(
                (selector) => bar.querySelector<HTMLElement>(selector),
            );
            return {
                height: (bar as HTMLElement).offsetHeight,
                clipped: parts.some((part) => part === null || part.scrollWidth > part.clientWidth),
            };
        });
    }

    /** Both bars have one height and cut nothing off, so the two diagrams stay level. */
    async function expectBarsLevel(current: FrameLocator, incoming: FrameLocator): Promise<void> {
        await expect
            .poll(
                async () => {
                    const [left, right] = [await barLayout(current), await barLayout(incoming)];
                    return {
                        level: left.height > 0 && left.height === right.height,
                        clipped: [left.clipped, right.clipped],
                    };
                },
                { timeout: TIMEOUT_MS },
            )
            .toEqual({ level: true, clipped: [false, false] });
    }

    /**
     * Widens a pane's bar until it says everything, then narrows it step by
     * step down to VS Code's narrowest editor, as a narrowing pane would, and
     * gives back its layout at each width and the menu's first item at the
     * narrowest; the bar gets its width back afterwards.
     */
    async function narrowBar(pane: FrameLocator) {
        return pane.locator(".merge-bar").evaluate(async (element, narrowest) => {
            const bar = element as HTMLElement;
            const parts = [".merge-bar__row", ".merge-bar__caption", ".merge-bar__counts"].map(
                (selector) => bar.querySelector<HTMLElement>(selector),
            );
            // The bar refits in its ResizeObserver, which runs before the next frame paints.
            const nextFrame = () =>
                new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                );
            const widths: { width: number; fit?: string; height: number; clipped: boolean }[] = [];
            for (let width = 1600; width >= narrowest; width -= 10) {
                bar.style.width = `${width}px`;
                await nextFrame();
                widths.push({
                    width,
                    fit: bar.dataset.fit,
                    height: bar.offsetHeight,
                    clipped: parts.some(
                        (part) => part === null || part.scrollWidth > part.clientWidth,
                    ),
                });
            }
            const more = bar.querySelector<HTMLButtonElement>(".merge-bar__more");
            more?.click();
            const first = bar.querySelector<HTMLButtonElement>(".merge-menu button");
            const menuFirst = first && {
                text: first.textContent,
                disabled: first.disabled,
                reason: first.ownerDocument.getElementById(
                    first.getAttribute("aria-describedby") ?? "",
                )?.textContent,
                tooltip: first.parentElement?.getAttribute("data-merge-tooltip"),
            };
            more?.click();
            bar.style.removeProperty("width");
            await nextFrame();
            return { widths, menuFirst };
        }, NARROWEST_EDITOR_WIDTH);
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

            await expect
                .poll(() => openCount(incoming), { timeout: TIMEOUT_MS })
                .toBe("1 open conflict");
            for (const pane of [current, incoming]) {
                await expect
                    .poll(
                        () =>
                            pane
                                .locator(".diff-legend__slot--merge-conflict")
                                .textContent()
                                .then((text) => text?.replace(/\s+/g, " ").trim()),
                        { timeout: TIMEOUT_MS },
                    )
                    .toBe("Conflict 1");
                // Until the new tab shows, the pane locator can still reach the earlier tab's pane.
                await expect
                    .poll(() => classesOf(pane, "Task_Check"), { timeout: TIMEOUT_MS })
                    .toContain("merge-conflict");
                await expect
                    .poll(() => pane.locator(".merge-conflict-badge").count(), {
                        timeout: TIMEOUT_MS,
                    })
                    .toBe(1);
            }
            await expectBarsLevel(current, incoming);
            await shot("marks-both-panes");
        });

        it("keeps the bar on one line of one height down to the narrowest editor with the conflict open, dropping the caption's branch and commit, then the counts' labels, then moving Build into the menu", async () => {
            const { current, incoming } = await mergePanes();
            const { height } = await barLayout(incoming);

            const { widths, menuFirst } = await narrowBar(incoming);

            const fits = widths
                .map(({ fit }) => fit)
                .filter((fit, index, all) => fit !== all[index - 1]);
            expect(fits).toEqual([
                "full",
                "withoutDetail",
                "withoutLabels",
                "withoutBuild",
                "compact",
            ]);
            expect(widths.at(-1)?.width).toBe(NARROWEST_EDITOR_WIDTH);
            expect(widths.filter(({ clipped }) => clipped)).toEqual([]);
            expect(widths.filter((width) => width.height !== height)).toEqual([]);
            expect(menuFirst).toEqual({
                text: "Build",
                disabled: true,
                reason: "1 conflict left",
                tooltip: "1 conflict left",
            });
            await expectBarsLevel(current, incoming);
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

        it("switches the step list in the incoming pane's menu, which the host keeps for the tab", async () => {
            const { current, incoming } = await mergePanes();
            const position = () => incoming.locator(".merge-bar__position").innerText();
            await expect.poll(position, { timeout: TIMEOUT_MS }).toBe("–/1");
            expect(await current.locator(".merge-bar__more:visible").count()).toBe(0);
            await openMenu(incoming);
            const allSteps = incoming.getByRole("radio", {
                name: "All merged elements",
                exact: true,
            });

            await allSteps.focus();
            await vscode().page.keyboard.press("Enter");

            await expect
                .poll(() => allSteps.getAttribute("aria-checked"), { timeout: TIMEOUT_MS })
                .toBe("true");
            await expect.poll(position, { timeout: TIMEOUT_MS }).not.toBe("–/1");
            await shot("marks-step-list-shared");
            await vscode().page.keyboard.press("Escape");
            await incoming.locator(".merge-menu").waitFor({ state: "hidden", timeout: TIMEOUT_MS });
        });
    });

    describe("pick", () => {
        // A shape carries a worded badge and a check for small zoom; one of them shows.
        function badgeLabels(pane: FrameLocator): Promise<string[]> {
            return pane
                .locator(".merge-pick-badge")
                .evaluateAll((badges) =>
                    badges
                        .filter((badge) => badge.checkVisibility())
                        .map((badge) => badge.getAttribute("aria-label") ?? ""),
                );
        }

        /** The outcome card, which only the pane that sent the decision shows. */
        function outcomeCard(pane: FrameLocator) {
            return pane.locator(".merge-outcome-card");
        }

        function badgeTexts(pane: FrameLocator): Promise<string[]> {
            return pane
                .locator(".merge-pick-badge")
                .evaluateAll((badges) =>
                    badges
                        .filter((badge) => badge.checkVisibility())
                        .map((badge) => (badge as HTMLElement).innerText.trim()),
                );
        }

        it("keeps incoming's version of the conflict from the pad a step opens and badges it on both panes", async () => {
            const { current, incoming } = await mergePanes();
            await chooseStepList(incoming, "Open conflicts");
            await press(incoming, "Next change");

            // The step selects the conflict on both panes, so each opens its pad, and shows no tooltip.
            for (const pane of [current, incoming]) {
                await pane
                    .locator(".djs-context-pad .merge-pick-action")
                    .first()
                    .waitFor({ state: "visible", timeout: TIMEOUT_MS });
                expect(await pane.locator(".merge-tooltip:not([hidden])").count()).toBe(0);
            }
            await decideInPad(incoming, "Keep incoming");

            await expect
                .poll(() => openCount(incoming), { timeout: TIMEOUT_MS })
                .toBe("No open conflicts");
            for (const pane of [current, incoming]) {
                await expect
                    .poll(() => badgeLabels(pane), { timeout: TIMEOUT_MS })
                    .toEqual(["Kept from incoming, your pick"]);
            }
            await expectBarsLevel(current, incoming);
            expect(await badgeTexts(incoming)).toEqual(["Incoming"]);
            await expect
                .poll(() => outcomeCard(incoming).innerText(), { timeout: TIMEOUT_MS })
                .toContain("Kept from incoming: Check feature order");
            expect(await outcomeCard(current).count()).toBe(0);
            await shot("pick-badges-both-panes");
        });

        it("undoes the pick on the pad, then overrides an automatic resolution of all merged elements", async () => {
            const { current, incoming } = await mergePanes();
            await chooseStepList(incoming, "All merged elements");
            await expectBarsLevel(current, incoming);

            await decideInPad(incoming, "Undo pick");

            await expect
                .poll(() => openCount(incoming), { timeout: TIMEOUT_MS })
                .toBe("1 open conflict");
            expect(await badgeLabels(current)).toEqual([]);
            expect(await badgeLabels(incoming)).toEqual([]);

            await press(incoming, "Next change");
            await decideInPad(current, "Keep current");

            await expect
                .poll(() => badgeLabels(incoming), { timeout: TIMEOUT_MS })
                .toEqual(["Kept from current, your pick"]);
            expect(
                await current
                    .locator('.djs-element[data-element-id="End_Order"]')
                    .first()
                    .getAttribute("class"),
            ).toContain("merge-taken-from-this-side");
            await expectUntouched("merge");
        });

        it("keeps the badge after a switch to another tab and back", async () => {
            await openWithQuickOpen("clean.bpmn");
            await vscode().editorWebview(".djs-palette");
            await vscode()
                .page.locator(".tabs-container .tab")
                .filter({ hasText: "(Merge: " })
                .filter({ hasText: CONFLICTED.merge })
                .first()
                .click();

            const { current, incoming } = await mergePanes();
            for (const pane of [current, incoming]) {
                await expect
                    .poll(() => badgeLabels(pane), { timeout: TIMEOUT_MS })
                    .toEqual(["Kept from current, your pick"]);
            }
        });

        it("offers the flows main removed with a task feature kept, and keeps them on request", async () => {
            // Alone in the group, the new tab's panes are not swapped with an earlier tab's while they settle.
            await vscode().runCommand("View: Close All Editors");
            await rowMenu(REMOVAL_FILE, COMMAND_TITLE);
            const { current, incoming } = await mergePanes();
            await expect
                .poll(() => openCount(incoming), { timeout: TIMEOUT_MS })
                .toBe("1 open conflict");
            await press(incoming, "Next change");

            await decideInPad(incoming, "Keep incoming");

            const offer = "Also keep the 2 flows current removed with it";
            await outcomeCard(incoming)
                .getByRole("button", { name: offer })
                .waitFor({ state: "visible", timeout: TIMEOUT_MS });
            expect(await outcomeCard(incoming).innerText()).toContain(
                "Kept from incoming: Check feature order",
            );
            expect(await current.getByRole("button", { name: offer }).count()).toBe(0);
            expect(await outcomeCard(current).count()).toBe(0);
            await padEntry(incoming, "Also keep its removed flows").hover();
            await expect
                .poll(() => incoming.locator(".merge-tooltip:not([hidden])").innerText(), {
                    timeout: TIMEOUT_MS,
                })
                .toBe(`Also keep its removed flows: ${offer}`);
            await shot("pick-restore-offer");

            await decideInPad(incoming, "Also keep its removed flows");

            await expect
                .poll(() => badgeLabels(incoming).then((labels) => labels.length), {
                    timeout: TIMEOUT_MS,
                })
                .toBe(3);
            // The current pane lacks what incoming kept, so it draws no badge for it and lists none.
            expect(await badgeLabels(current)).toEqual([]);
            await shot("pick-kept-with-flows");
        });

        it("names the flows that block leaving out the task main removed", async () => {
            const { current, incoming } = await mergePanes();
            // diagram-js deselects on a click on the element already selected alone, so it starts from none.
            const canvas = incoming.locator(".djs-container");
            const height = (await canvas.boundingBox())?.height ?? 0;
            await canvas.click({ position: { x: 30, y: height - 30 } });
            await incoming.locator('.djs-element[data-element-id="Task_Check"]').first().click();

            await decideInPad(incoming, /^Leave out: Leave it out, as current removed it$/);

            const card = outcomeCard(incoming);
            await expect
                .poll(() => card.innerText(), { timeout: TIMEOUT_MS })
                .toContain("Can't leave out Check feature order");
            expect(await card.innerText()).toMatch(/Your pick .+ needs it/);
            expect(await incoming.locator(".djs-element.merge-blocker").count()).toBeGreaterThan(0);
            expect(await outcomeCard(current).count()).toBe(0);
            // The left pane has no menu whose rows could say it.
            expect(await current.locator(".merge-menu:not([hidden])").count()).toBe(0);
            await shot("pick-blocked-reason");
        });

        it("shows the decisions on the context pad as icons with a tooltip and no native title", async () => {
            const { incoming } = await mergePanes();
            const task = incoming.locator('.djs-element[data-element-id="Task_Check"]').first();
            // diagram-js deselects on a click on the element already selected alone, so it starts from none.
            const canvas = incoming.locator(".djs-container");
            const height = (await canvas.boundingBox())?.height ?? 0;
            await canvas.click({ position: { x: 30, y: height - 30 } });
            await expect
                .poll(() => incoming.locator(".djs-context-pad .merge-pick-action").count(), {
                    timeout: TIMEOUT_MS,
                })
                .toBe(0);
            expect(await outcomeCard(incoming).count()).toBe(0);
            await task.click();

            // Selected again, the task shows its latest outcome again.
            await expect
                .poll(() => outcomeCard(incoming).innerText(), { timeout: TIMEOUT_MS })
                .toContain("Can't leave out Check feature order");

            const entries = incoming.locator(".djs-context-pad .merge-pick-action");
            await entries.first().waitFor({ state: "visible", timeout: TIMEOUT_MS });
            expect(
                await entries.evaluateAll((buttons) =>
                    buttons.map((button) => ({
                        label: button.getAttribute("aria-label"),
                        title: button.getAttribute("title"),
                    })),
                ),
            ).toEqual([
                { label: "Leave out: Leave it out, as current removed it", title: null },
                { label: "Undo pick", title: null },
            ]);
            await padEntry(incoming, "Undo pick").hover();
            await expect
                .poll(() => incoming.locator(".merge-tooltip:not([hidden])").innerText(), {
                    timeout: TIMEOUT_MS,
                })
                .toBe("Undo pick: Go back to what the merge decided by itself");
            await shot("pick-context-pad");
        });
    });

    describe("build", () => {
        const dialog = () => vscode().page.locator(".monaco-dialog-box");

        function mergeTab(fileName: string) {
            return vscode()
                .page.locator(".tabs-container .tab")
                .filter({ hasText: "(Merge: " })
                .filter({ hasText: fileName })
                .first();
        }

        /** The tab of the working file in the modeler, not a merge or comparison tab. */
        function workingFileTab(fileName: string) {
            return vscode()
                .page.locator(".tabs-container .tab")
                .filter({ hasText: fileName })
                .filter({ hasNotText: "(Merge: " })
                .first();
        }

        /** Visible modelers that draw a diagram: a palette and the process's shapes. */
        async function modelersShowingDiagram(): Promise<number> {
            const frames = vscode().editorFrames().filter({ visible: true });
            let showing = 0;
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
                if (
                    (await count(".djs-palette")) > 0 &&
                    (await count(".djs-shape[data-element-id]")) >= 3
                ) {
                    showing += 1;
                }
            }
            return showing;
        }

        /**
         * What the visible webviews inside the active editor group, or inside
         * the others, show. VS Code lays webviews over their group outside its
         * DOM, so a frame belongs to the group its centre lies in.
         */
        async function modelersIn(groups: "active" | "others") {
            const active = await vscode()
                .page.locator(".editor-group-container.active")
                .boundingBox();
            const frames = vscode().editorFrames().filter({ visible: true });
            const shown = [];
            for (let index = 0; index < (await frames.count()); index++) {
                const box = await frames.nth(index).boundingBox();
                if (!box || !active) continue;
                const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
                const inActive =
                    centre.x >= active.x &&
                    centre.x <= active.x + active.width &&
                    centre.y >= active.y &&
                    centre.y <= active.y + active.height;
                if (inActive !== (groups === "active")) continue;
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
                shown.push({
                    editable:
                        (await count(".djs-palette")) > 0 &&
                        (await count("#js-properties-panel")) > 0,
                    diagram: (await count(".djs-shape[data-element-id]")) >= 3,
                });
            }
            return shown;
        }

        async function workingFileText(operation: Operation): Promise<string> {
            return readFile(join(repositories[operation], CONFLICTED[operation]), "utf8");
        }

        async function taskName(xml: string): Promise<unknown> {
            const { elementsById } = await BpmnModdle().fromXML(xml);
            return elementsById.Task_Check?.name;
        }

        /** The working file holds the built BPMN, while Git still lists it unmerged with its stages as before. */
        async function expectBuiltButUnmerged(operation: Operation, name: string): Promise<void> {
            await expect
                .poll(() => workingFileText(operation), { timeout: TIMEOUT_MS })
                .not.toContain("<<<<<<<");
            expect(await taskName(await workingFileText(operation))).toBe(name);
            const repository = repositories[operation];
            expect(
                (await runGit(repository, "status", "--porcelain", CONFLICTED[operation])).stdout,
            ).toMatch(/^UU /);
            expect((await runGit(repository, "ls-files", "-u")).stdout).toBe(
                untouched[operation].stages,
            );
        }

        /** Renames the task in the visible modeler through direct editing. */
        async function renameTask(name: string): Promise<void> {
            const modeler = await vscode().editorWebview(".djs-palette");
            // The palette sits over the canvas's left edge, so the task is hit at its right end.
            await modeler
                .locator('.djs-shape[data-element-id="Task_Check"] > .djs-hit')
                .dblclick({ position: { x: 90, y: 40 } });
            const textBox = modeler.locator(".djs-direct-editing-content");
            await textBox.waitFor({ state: "visible", timeout: TIMEOUT_MS });
            await textBox.fill(name);
            await vscode().page.keyboard.press("Enter");
            await textBox.waitFor({ state: "hidden", timeout: TIMEOUT_MS });
        }

        async function cancelDialog(text: string): Promise<void> {
            await dialog().waitFor({ state: "visible", timeout: TIMEOUT_MS });
            expect(await dialog().innerText()).toContain(text);
            await dialog().getByRole("button", { name: "Cancel" }).click();
            await dialog().waitFor({ state: "hidden", timeout: TIMEOUT_MS });
        }

        it("builds the decided merge into the working file, which Git still lists unmerged", async () => {
            await runFromSideBar("View: Close All Editors");
            await rowMenu(CONFLICTED.merge, COMMAND_TITLE);
            await expect
                .poll(activeTabLabel, { timeout: TIMEOUT_MS })
                .toContain(`${CONFLICTED.merge} (Merge: main ↔ feature)`);
            // A modeler already open on the conflicted file beside the merge tab, in a second group.
            await openWithQuickOpen(CONFLICTED.merge, { toTheSide: true });
            await expect
                .poll(() => vscode().page.locator(".editor-group-container").count(), {
                    timeout: TIMEOUT_MS,
                })
                .toBe(2);
            await mergeTab(CONFLICTED.merge).click();
            await runFromSideBar("Notifications: Clear All Notifications");
            const { current, incoming } = await mergePanes();
            await expect
                .poll(() => openCount(incoming), { timeout: TIMEOUT_MS })
                .toBe("1 open conflict");
            // Two groups leave each pane too narrow for Build on the bar, so it is the menu's first item.
            await expectBarsLevel(current, incoming);
            expect(await incoming.locator(".merge-bar__build").isVisible()).toBe(false);
            await openMenu(incoming);
            const build = incoming.getByRole("button", { name: "Build", exact: true });
            expect(await build.isDisabled()).toBe(true);
            expect(
                await incoming
                    .locator(".merge-menu__build-wrap")
                    .getAttribute("data-merge-tooltip"),
            ).toBe("1 conflict left");
            expect(
                await build.evaluate(
                    (button) =>
                        button.ownerDocument.getElementById(
                            button.getAttribute("aria-describedby") ?? "",
                        )?.textContent,
                ),
            ).toBe("1 conflict left");
            expect(await current.getByRole("button", { name: "Build", exact: true }).count()).toBe(
                0,
            );
            await shot("build-disabled");
            await vscode().page.keyboard.press("Escape");

            await press(incoming, "Next change");
            await decideInPad(incoming, "Keep incoming");
            await expect
                .poll(() => openCount(incoming), { timeout: TIMEOUT_MS })
                .toBe("No open conflicts");
            await pressBuild(incoming);

            await expectBuiltButUnmerged("merge", "Check feature order");
        });

        it("opens the built file as the editable modeler beside the open merge tab, and the modeler open before shows it too", async () => {
            await expect.poll(activeTabLabel, { timeout: TIMEOUT_MS }).toContain(CONFLICTED.merge);
            expect(await activeTabLabel()).not.toContain("(Merge: ");
            // A diff pane that never paired would show no palette and no properties panel.
            await expect
                .poll(() => modelersIn("active"), { timeout: TIMEOUT_MS })
                .toStrictEqual([{ editable: true, diagram: true }]);
            expect(await tabLabels()).toContainEqual(
                expect.stringContaining(`${CONFLICTED.merge} (Merge: main ↔ feature)`),
            );
            // Whether Build opened a second modeler or revealed the one open before, every modeler shows the result.
            await expect
                .poll(
                    async () =>
                        [...(await modelersIn("active")), ...(await modelersIn("others"))]
                            .filter(({ editable }) => editable)
                            .every(({ diagram }) => diagram),
                    { timeout: TIMEOUT_MS },
                )
                .toBe(true);
            await notification("Built merged.bpmn from your decisions.");
        });

        it("builds again without asking while the file is untouched", async () => {
            await runFromSideBar("Notifications: Clear All Notifications");
            await mergeTab(CONFLICTED.merge).click();
            const { incoming } = await mergePanes();

            await pressBuild(incoming);

            await notification("Built merged.bpmn from your decisions.");
            expect(await dialog().count()).toBe(0);
        });

        it("asks before it builds over a saved edit and leaves the file on Cancel", async () => {
            // One group, so the modeler gets the whole width.
            await runFromSideBar("View: Join All Editor Groups");
            await workingFileTab(CONFLICTED.merge).click();
            await expect.poll(modelersShowingDiagram, { timeout: TIMEOUT_MS }).toBe(1);
            await shot("build-opened-modeler");
            await renameTask("Check edited order");
            await expect
                .poll(() => vscode().isActiveTabDirty(), { timeout: TIMEOUT_MS })
                .toBe(true);
            await vscode().page.keyboard.press(`${COMMAND_KEY}+s`);
            await expect
                .poll(async () => taskName(await workingFileText("merge")), {
                    timeout: TIMEOUT_MS,
                })
                .toBe("Check edited order");
            await mergeTab(CONFLICTED.merge).click();
            const { incoming } = await mergePanes();

            await pressBuild(incoming);

            await cancelDialog("merged.bpmn changed since the last build. Build over it?");
            expect(await taskName(await workingFileText("merge"))).toBe("Check edited order");
        });

        it("asks before it builds over unsaved changes", async () => {
            await workingFileTab(CONFLICTED.merge).click();
            await renameTask("Check unsaved order");
            await expect
                .poll(() => vscode().isActiveTabDirty(), { timeout: TIMEOUT_MS })
                .toBe(true);
            await mergeTab(CONFLICTED.merge).click();
            const { incoming } = await mergePanes();

            await pressBuild(incoming);

            await cancelDialog("merged.bpmn has unsaved changes. Build over them?");
            expect(await taskName(await workingFileText("merge"))).toBe("Check edited order");
            await workingFileTab(CONFLICTED.merge).click();
            await runFromSideBar("File: Revert File");
            await expect
                .poll(() => vscode().isActiveTabDirty(), { timeout: TIMEOUT_MS })
                .toBe(false);
        });

        it("compares the result with incoming and switches the comparison to current", async () => {
            await mergeTab(CONFLICTED.merge).click();
            const { incoming } = await mergePanes();

            await pressInMenu(incoming, "Compare with incoming");

            await expect
                .poll(activeTabLabel, { timeout: TIMEOUT_MS })
                .toContain(`${CONFLICTED.merge} (Merge: Incoming ↔ Result)`);
            const result = await vscode().editorWebview(
                'body[data-diff-side="after"] .diff-legend__comparison-switch',
            );
            await expect
                .poll(() => result.locator(".diff-legend__comparison").innerText(), {
                    timeout: TIMEOUT_MS,
                })
                .toBe("Result against incoming");
            await shot("build-compare-incoming");

            await press(result, "Compare with current");

            await expect
                .poll(activeTabLabel, { timeout: TIMEOUT_MS })
                .toContain(`${CONFLICTED.merge} (Merge: Current ↔ Result)`);
            // The switch opens the other comparison first, so the one it replaces closes after.
            await expect
                .poll(tabLabels, { timeout: TIMEOUT_MS })
                .not.toContainEqual(expect.stringContaining("(Merge: Incoming ↔ Result)"));
        });

        it("lists the notes of a build that kept a task without the flows removed with it", async () => {
            await rowMenu(REMOVAL_FILE, COMMAND_TITLE);
            const { incoming } = await mergePanes();
            await expect
                .poll(() => openCount(incoming), { timeout: TIMEOUT_MS })
                .toBe("1 open conflict");
            await press(incoming, "Next change");
            await decideInPad(incoming, "Keep incoming");
            await expect
                .poll(() => openCount(incoming), { timeout: TIMEOUT_MS })
                .toBe("No open conflicts");
            await pressBuild(incoming);
            await expect
                .poll(() => readFile(join(repositories.merge, REMOVAL_FILE), "utf8"), {
                    timeout: TIMEOUT_MS,
                })
                .not.toContain("<<<<<<<");
            await mergeTab(REMOVAL_FILE).click();
            const panes = await mergePanes();
            await expectBarsLevel(panes.current, panes.incoming);

            await pressInMenu(panes.incoming, "Review notes (1)");

            await expect
                .poll(() => panes.incoming.locator(".merge-notes__list").innerText(), {
                    timeout: TIMEOUT_MS,
                })
                .toContain(
                    "Check feature order is kept without the flows the other side removed with it",
                );
            await shot("build-notes");
        });

        it("opens the built file as the editable modeler beside the restored tabs after a reload", async () => {
            await runFromSideBar("Developer: Reload Window");
            await delay(3000);
            await vscode().page.waitForSelector(".monaco-workbench", { timeout: TIMEOUT_MS });

            // The comparison's tab is restored in the background, where VS Code does not resolve it.
            expect(await tabLabels()).toContainEqual(
                expect.stringContaining(`${CONFLICTED.merge} (Merge: Current ↔ Result)`),
            );
            expect(await activeTabLabel()).not.toContain("Result)");

            await openWithQuickOpen(CONFLICTED.merge);

            await expect
                .poll(() => modelersIn("active"), { timeout: TIMEOUT_MS })
                .toStrictEqual([{ editable: true, diagram: true }]);
        });

        it("lets Git continue the merge once the user staged the built files", async () => {
            const repository = repositories.merge;
            await writeFile(join(repository, "notes.txt"), "main and feature\n");
            await runGit(repository, "add", CONFLICTED.merge, REMOVAL_FILE, "notes.txt");

            const continued = await runGit(
                repository,
                "-c",
                "core.editor=true",
                "merge",
                "--continue",
            );

            expect(continued.code, continued.stdout).toBe(0);
            const parents = (await runGit(repository, "log", "-1", "--format=%P")).stdout.trim();
            expect(parents.split(" ")).toHaveLength(2);
        });

        it("builds a rebase conflict and lets Git continue the rebase once it is staged", async () => {
            await runFromSideBar("View: Close All Editors");
            await rowMenu(CONFLICTED.rebase, COMMAND_TITLE);
            const { incoming } = await mergePanes();
            await expect
                .poll(() => openCount(incoming), { timeout: TIMEOUT_MS })
                .toBe("1 open conflict");
            await press(incoming, "Next change");
            await decideInPad(incoming, "Keep incoming");
            await expect
                .poll(() => openCount(incoming), { timeout: TIMEOUT_MS })
                .toBe("No open conflicts");

            await pressBuild(incoming);

            await expectBuiltButUnmerged("rebase", "Check feature order");
            await expect.poll(editableModelerShows, { timeout: TIMEOUT_MS }).toBe(true);
            const repository = repositories.rebase;
            await runGit(repository, "add", CONFLICTED.rebase);
            const continued = await runGit(
                repository,
                "-c",
                "core.editor=true",
                "rebase",
                "--continue",
            );
            expect(continued.code, continued.stdout).toBe(0);
        });
    });
});
