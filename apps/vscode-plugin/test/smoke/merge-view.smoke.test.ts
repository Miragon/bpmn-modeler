// SPIKE (epic #2459 step 3, phases A and B): the merge view on a real conflict, from `git merge`
// to `git merge --continue`. Answers 1.0.1-1.0.3 and, masked by the editor association, 1.0.5.
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { BpmnModdle } from "bpmn-moddle";
import type { FrameLocator } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { VsCodeSession, downloadVsCode, packExtension } from "./vscodeSession";

const runFile = promisify(execFile);
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DIST_DIRECTORY = join(REPOSITORY_ROOT, "dist/apps/vscode-plugin");
const RESULTS_DIRECTORY = join(REPOSITORY_ROOT, "test-results/vscode-smoke/merge-view");
const FIXTURES_DIRECTORY = fileURLToPath(new URL("./fixtures/", import.meta.url));
const TIMEOUT_MS = 30_000;
const MERGE_FILE = "order.bpmn";
const MERGE_TAB_TITLE = "order.bpmn (Current ↔ Incoming)";
const ROW_COMMAND = "Open in BPMN Merge View";
const TAKE_INCOMING_COMMAND = "Take incoming for every open conflict";
const TASK_ID = "Task_Check";
const INCOMING_ONLY_ID = "Task_Notify";

const facts: Record<string, unknown> = {};
const log = (line: string) => console.log(`[merge-view] ${line}`);
const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

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
        (error: { stdout?: string; stderr?: string; code?: number }) => {
            // `git merge` exits 1 on a conflict.
            return { stdout: `${error.stdout ?? ""}${error.stderr ?? ""}`, code: error.code ?? 1 };
        },
    );
}

/** Incoming renames the task and adds a task of its own, far from the rename. */
function incomingVersion(base: string): string {
    return base
        .replace('name="Check order"', 'name="Check incoming order"')
        .replace(
            "  </bpmn:process>",
            `    <bpmn:task id="${INCOMING_ONLY_ID}" name="Notify customer" />\n  </bpmn:process>`,
        )
        .replace(
            "    </bpmndi:BPMNPlane>",
            `      <bpmndi:BPMNShape id="${INCOMING_ONLY_ID}_di" bpmnElement="${INCOMING_ONLY_ID}">\n        <dc:Bounds x="240" y="220" width="100" height="80" />\n      </bpmndi:BPMNShape>\n    </bpmndi:BPMNPlane>`,
        );
}

async function markerOf(webview: FrameLocator, elementId: string): Promise<string> {
    return (
        (await webview
            .locator(`.djs-element[data-element-id="${elementId}"]`)
            .getAttribute("class", { timeout: 2000 })
            .catch(() => "")) ?? ""
    );
}

/** bpmn-js wraps a label into one `<tspan>` per line. */
function taskLabel(webview: FrameLocator): Promise<string> {
    return webview
        .locator(`.djs-shape[data-element-id="${TASK_ID}"] .djs-visual text`)
        .evaluate((text) =>
            [...text.querySelectorAll("tspan")]
                .map((line) => line.textContent?.trim())
                .join(" "),
        );
}

describe("the BPMN merge view (spike)", () => {
    let rootDirectory = "";
    let workspaceDirectory = "";
    let repository = "";
    let session: VsCodeSession | undefined;
    const vscode = (): VsCodeSession => {
        if (!session) throw new Error("VS Code did not start");
        return session;
    };

    async function shot(name: string): Promise<void> {
        await delay(800);
        await vscode().screenshot(join(RESULTS_DIRECTORY, `${name}.png`));
    }

    function mergeRow() {
        return vscode()
            .page.locator(".scm-view .monaco-list-row")
            .filter({ has: vscode().page.locator(".resource") })
            .filter({ hasText: MERGE_FILE })
            .first();
    }

    /** A focused merge pane can swallow F1, so the palette is opened from the side bar. */
    async function runFromSideBar(title: string): Promise<void> {
        await vscode().page.keyboard.press("Escape");
        await vscode().page.locator(".part.sidebar .composite.title").first().click();
        await vscode().runCommand(title);
    }

    async function openFromMergeRow(): Promise<void> {
        await runFromSideBar("Source Control: Focus on Changes View");
        await mergeRow().waitFor({ state: "visible", timeout: TIMEOUT_MS });
        await mergeRow().click({ button: "right" });
        const item = vscode().page.locator(".context-view").getByText(ROW_COMMAND, { exact: true });
        await item.waitFor({ timeout: TIMEOUT_MS });
        // A menu item listens for the mouse only 100 ms after it renders.
        await delay(150);
        await item.click();
        await vscode().page.mouse.move(0, 0);
    }

    /** The labels of the Merge Changes row's context menu, closed again afterwards. */
    async function rowMenuItems(): Promise<string[]> {
        await runFromSideBar("Source Control: Focus on Changes View");
        await mergeRow().waitFor({ state: "visible", timeout: TIMEOUT_MS });
        await mergeRow().click({ button: "right" });
        await vscode()
            .page.locator(".context-view .action-label")
            .first()
            .waitFor({ timeout: TIMEOUT_MS });
        await delay(300);
        const labels = await vscode().page.locator(".context-view .action-label").allTextContents();
        await vscode().page.keyboard.press("Escape");
        return labels.map((label) => label.trim()).filter(Boolean);
    }

    async function activeTabLabel(): Promise<string | null> {
        return vscode().page.locator(".tabs-container .tab.active").first().getAttribute("aria-label");
    }

    /** Both panes of a live merge view: a diagram on each side, not the ended page. */
    async function liveMergePanes(timeoutMs: number): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const panes = await visiblePanes();
            if (panes.length >= 2 && panes.every((pane) => pane.canvas && !pane.ended)) return true;
            await delay(500);
        }
        return false;
    }

    async function spikeLog(): Promise<string[]> {
        return (await vscode().extensionLog())
            .split("\n")
            .filter((line) => line.includes("[merge-spike]"));
    }

    async function tabLabels(): Promise<(string | null)[]> {
        return vscode()
            .page.locator(".tabs-container .tab")
            .evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute("aria-label")));
    }

    /** The texts and canvases of every visible editor webview of the extension. */
    async function visiblePanes(): Promise<{ ended: boolean; canvas: boolean; text: string }[]> {
        const frames = vscode().editorFrames().filter({ visible: true });
        const count = await frames.count();
        const panes = [];
        for (let index = 0; index < count; index++) {
            const page = frames
                .nth(index)
                .contentFrame()
                .locator("iframe#active-frame")
                .contentFrame();
            panes.push({
                ended: (await page.locator("[data-merge-view-ended]").count().catch(() => 0)) > 0,
                canvas: (await page.locator(".djs-container").count().catch(() => 0)) > 0,
                text: (
                    await page
                        .locator("body")
                        .innerText({ timeout: 2000 })
                        .catch(() => "")
                ).slice(0, 200),
            });
        }
        return panes;
    }

    beforeAll(async () => {
        await rm(RESULTS_DIRECTORY, { recursive: true, force: true });
        await mkdir(RESULTS_DIRECTORY, { recursive: true });
        rootDirectory = await mkdtemp(join(tmpdir(), "bpmn-modeler-merge-view-"));
        workspaceDirectory = join(rootDirectory, "workspace");
        repository = join(workspaceDirectory, "merge-repo");
        await mkdir(repository, { recursive: true });
        const base = await readFile(join(FIXTURES_DIRECTORY, "smoke.bpmn"), "utf8");
        const file = join(repository, MERGE_FILE);
        await writeFile(file, base);
        await runGit(repository, "init", "-q");
        await runGit(repository, "add", MERGE_FILE);
        await runGit(repository, "commit", "-q", "--no-verify", "-m", "base");
        await runGit(repository, "checkout", "-q", "-b", "incoming");
        await writeFile(file, incomingVersion(base));
        await runGit(repository, "commit", "-q", "-a", "--no-verify", "-m", "incoming");
        await runGit(repository, "checkout", "-q", "main");
        await writeFile(file, base.replace('name="Check order"', 'name="Check current order"'));
        await runGit(repository, "commit", "-q", "-a", "--no-verify", "-m", "current");
        facts.merge = (await runGit(repository, "merge", "incoming", "--no-edit")).stdout;
        facts.gitStatus = (await runGit(repository, "status", "--porcelain=v1")).stdout;
        facts.gitStages = (await runGit(repository, "ls-files", "-u")).stdout;
        facts.workingFile = await readFile(file, "utf8");
        log(JSON.stringify({ status: facts.gitStatus, stages: facts.gitStages }));
        await cp(join(FIXTURES_DIRECTORY, "smoke.bpmn"), join(workspaceDirectory, "clean.bpmn"));
        await writeFile(join(workspaceDirectory, "notes.txt"), "not a diagram\n");

        const manifest = JSON.parse(await readFile(join(DIST_DIRECTORY, "package.json"), "utf8"));
        const extensionPath = await packExtension(DIST_DIRECTORY, rootDirectory);
        const executablePath = await downloadVsCode(
            extensionPath,
            process.env.VSCODE_SMOKE_VERSION || undefined,
            (line) => {
                facts.vscodeVersionLine = line;
                log(line);
            },
        );
        session = await VsCodeSession.launch({
            executablePath,
            extensionPath,
            extensionId: `${manifest.publisher}.${manifest.name}`.toLowerCase(),
            rootDirectory,
            workspaceDirectory,
            fileToOpen: join(workspaceDirectory, "clean.bpmn"),
            customEditors: { "*.bpmn": "bpmn-modeler.bpmn" },
            colorTheme: "Default Light Modern",
            timeoutMs: TIMEOUT_MS,
        });
        facts.vscodeVersion = await session.app.evaluate(({ app }) => app.getVersion());
    });

    afterEach(async ({ task }) => {
        if (task.result?.state !== "fail") return;
        const name = task.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        await session
            ?.screenshot(join(RESULTS_DIRECTORY, `failure-${name}.png`))
            .catch(() => undefined);
    });

    afterAll(async () => {
        try {
            facts.spikeLog = session ? await spikeLog() : [];
        } catch {
            // The profile may be gone.
        }
        await writeFile(join(RESULTS_DIRECTORY, "facts.json"), JSON.stringify(facts, null, 2));
        if (session) {
            await cp(session.logsDirectory, join(RESULTS_DIRECTORY, "vscode-logs"), {
                recursive: true,
            }).catch(() => undefined);
        }
        await session?.close();
        if (rootDirectory) await rm(rootDirectory, { recursive: true, force: true });
    });

    it("starts with a conflicted order.bpmn", async () => {
        expect(facts.gitStatus).toContain(`UU ${MERGE_FILE}`);
        expect(String(facts.gitStages).trim().split("\n")).toHaveLength(3);
        await vscode().showInCustomEditor("clean.bpmn", async (webview) => {
            return (await webview.locator(".djs-container .djs-element.djs-shape").count()) >= 3;
        });
    });

    it("offers the merge view on the Merge Changes row", async () => {
        await vscode().setGitEnabled(true);
        await vscode().runCommand("Source Control: Focus on Changes View");
        await mergeRow().waitFor({ state: "visible", timeout: TIMEOUT_MS });
        await mergeRow().hover();
        await delay(500);
        facts.inlineActions = await mergeRow()
            .locator(".actions .action-label")
            .evaluateAll((labels) =>
                labels.map((label) => label.getAttribute("aria-label") ?? label.getAttribute("title")),
            );
        await shot("merge-row-inline");
        await mergeRow().click({ button: "right" });
        const item = vscode().page.locator(".context-view").getByText(ROW_COMMAND, { exact: true });
        await item.waitFor({ timeout: TIMEOUT_MS });
        facts.rowMenu = await vscode().page.locator(".context-view .action-label").allTextContents();
        await shot("merge-row-menu");
        expect(facts.inlineActions).toContain(ROW_COMMAND);
        // A menu item listens for the mouse only 100 ms after it renders.
        await delay(150);
        await item.click();
        await vscode().page.mouse.move(0, 0);
    });

    it("opens current and incoming in two panes with today's diff highlights", async () => {
        const before = await vscode().editorWebview('body[data-diff-side="before"]');
        const after = await vscode().editorWebview('body[data-diff-side="after"]');
        await expect
            .poll(() => markerOf(after, INCOMING_ONLY_ID), { timeout: TIMEOUT_MS })
            .toContain("diff-added");
        expect(await markerOf(before, TASK_ID)).toContain("diff-changed");
        expect(await markerOf(after, TASK_ID)).toContain("diff-changed");
        expect(await taskLabel(before)).toBe("Check current order");
        expect(await taskLabel(after)).toBe("Check incoming order");
        expect(await before.locator(`[data-element-id="${INCOMING_ONLY_ID}"]`).count()).toBe(0);
        facts.tabsAfterOpen = await tabLabels();
        expect((facts.tabsAfterOpen as string[]).some((label) => label?.includes(MERGE_TAB_TITLE))).toBe(true);
        facts.legendAfter = await after.locator(".diff-legend").textContent();
        await shot("merge-view-two-panes");
        // The working file and the index stay as Git left them.
        expect(await readFile(join(repository, MERGE_FILE), "utf8")).toBe(facts.workingFile);
        expect((await runGit(repository, "ls-files", "-u")).stdout).toBe(facts.gitStages);
    });

    it("resolves both panes under the URIs it registered (1.0.1, 1.0.2)", async () => {
        const lines = await spikeLog();
        facts.spikeLogAfterOpen = lines;
        const registered = lines
            .map((line) => /registered (?:current|incoming)=(\S+)/.exec(line)?.[1])
            .filter((uri): uri is string => uri !== undefined);
        const resolved = lines
            .map((line) => /resolve bpmn-merge pane uri=(\S+) registered=(\w+)/.exec(line))
            .filter((match): match is RegExpExecArray => match !== null)
            .map((match) => ({ uri: match[1], registered: match[2] }));
        facts.registeredUris = registered;
        facts.resolvedUris = resolved;
        expect(registered).toHaveLength(2);
        expect(resolved.map((pane) => pane.uri).sort()).toEqual([...registered].sort());
        expect(resolved.every((pane) => pane.registered === "true")).toBe(true);
    });

    it("shows the ended page in both restored panes after a window reload (1.0.3)", async () => {
        const page = vscode().page;
        await runFromSideBar("Developer: Reload Window");
        await delay(3000);
        await page.waitForSelector(".monaco-workbench", { timeout: TIMEOUT_MS });
        let panes: Awaited<ReturnType<typeof visiblePanes>> = [];
        const deadline = Date.now() + TIMEOUT_MS;
        while (Date.now() < deadline) {
            panes = await visiblePanes();
            if (panes.length >= 2 && panes.every((pane) => pane.ended)) break;
            await delay(500);
        }
        facts.tabsAfterReload = await tabLabels();
        facts.panesAfterReload = panes;
        facts.spikeLogAfterReload = await spikeLog();
        await shot("merge-view-after-reload");
        expect(panes.filter((pane) => pane.ended)).toHaveLength(2);
        expect(panes.some((pane) => pane.canvas)).toBe(false);
    });

    it("shows the row entry only while a .bpmn editor is active (resourceExtname is global)", async () => {
        const probes: Record<string, unknown>[] = [];
        // After the reload the restored merge diff is the active editor.
        probes.push({ active: await activeTabLabel(), menu: await rowMenuItems() });
        await runFromSideBar("View: Show Explorer");
        await vscode().openFromExplorer("notes.txt");
        await delay(800);
        probes.push({ active: await activeTabLabel(), menu: await rowMenuItems() });
        await shot("row-menu-probe-after-txt");
        await runFromSideBar("View: Show Explorer");
        await vscode().openFromExplorer("clean.bpmn");
        await vscode().showInCustomEditor("clean.bpmn", async (webview) => {
            return (await webview.locator(".djs-container .djs-element.djs-shape").count()) >= 3;
        });
        probes.push({ active: await activeTabLabel(), menu: await rowMenuItems() });
        facts.rowMenuByActiveEditor = probes;
        log(JSON.stringify(probes));
        const shown = probes.map((probe) => (probe.menu as string[]).includes(ROW_COMMAND));
        expect(shown).toEqual([false, false, true]);
    });

    it("opens the merge view again from the row after the reload", async () => {
        // The restored tab still holds the ended panes, and the opening counter restarted with
        // the extension host, so the new opening may reuse their URIs. clean.bpmn is active, so
        // the row shows the entry.
        await openFromMergeRow();
        facts.reopenedOverRestoredTab = await liveMergePanes(10_000);
        facts.panesAfterReopenOverRestoredTab = await visiblePanes();
        facts.tabsAfterReopenOverRestoredTab = await tabLabels();
        await shot("merge-view-reopened-over-restored-tab");
        if (!facts.reopenedOverRestoredTab) {
            await vscode().closeEditorTab(/order\.bpmn ↔ order\.bpmn|Current ↔ Incoming/);
            await runFromSideBar("View: Show Explorer");
            await vscode().openFromExplorer("clean.bpmn");
            await delay(800);
            await openFromMergeRow();
        }
        expect(await liveMergePanes(TIMEOUT_MS)).toBe(true);
        const after = await vscode().editorWebview('body[data-diff-side="after"]');
        await expect
            .poll(() => markerOf(after, INCOMING_ONLY_ID), { timeout: TIMEOUT_MS })
            .toContain("diff-added");
        facts.tabsAfterReopen = await tabLabels();
        await shot("merge-view-two-panes-reopened");
    });

    it("builds incoming over the working file, which parses, has no markers and stays UU (B2-B3)", async () => {
        const file = join(repository, MERGE_FILE);
        await runFromSideBar(TAKE_INCOMING_COMMAND);
        await expect
            .poll(async () => (await readFile(file, "utf8")).includes("<<<<<<<"), {
                timeout: TIMEOUT_MS,
            })
            .toBe(false);
        const built = await readFile(file, "utf8");
        facts.builtFile = built;
        const { elementsById } = await BpmnModdle().fromXML(built);
        expect(elementsById[TASK_ID]?.name).toBe("Check incoming order");
        expect(elementsById[INCOMING_ONLY_ID]?.name).toBe("Notify customer");
        expect(elementsById[`${INCOMING_ONLY_ID}_di`]).toBeDefined();
        expect(built).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m);
        facts.gitStatusAfterBuild = (await runGit(repository, "status", "--porcelain=v1")).stdout;
        facts.gitStagesAfterBuild = (await runGit(repository, "ls-files", "-u")).stdout;
        expect(facts.gitStatusAfterBuild).toContain(`UU ${MERGE_FILE}`);
        expect(facts.gitStagesAfterBuild).toBe(facts.gitStages);
    });

    it("shows the built file in the modeler (1.0.5, with the *.bpmn editor association)", async () => {
        const modeler = await vscode().editorWebview(
            `body:not([data-diff-side]) .djs-element[data-element-id="${INCOMING_ONLY_ID}"]`,
        );
        expect(await taskLabel(modeler)).toBe("Check incoming order");
        facts.tabsAfterBuild = await tabLabels();
        facts.activeTabAfterBuild = await vscode()
            .page.locator(".tabs-container .tab.active")
            .first()
            .getAttribute("aria-label");
        const lines = await spikeLog();
        facts.buildLog = lines.filter((line) => /take incoming|built |wrote |opened /.test(line));
        expect(lines.some((line) => line.includes("active tab custom viewType=bpmn-modeler.bpmn"))).toBe(
            true,
        );
        await shot("built-file-in-modeler");
    });

    it("lets git conclude the merge once the built file is staged", async () => {
        expect(await readFile(join(repository, MERGE_FILE), "utf8")).not.toContain("<<<<<<<");
        await runGit(repository, "add", MERGE_FILE);
        facts.gitStatusAfterAdd = (await runGit(repository, "status", "--porcelain=v1")).stdout;
        const conclude = await runGit(repository, "-c", "core.editor=true", "merge", "--continue");
        facts.mergeContinue = conclude;
        expect(conclude.code).toBe(0);
        const parents = (await runGit(repository, "log", "-1", "--format=%P")).stdout.trim().split(" ");
        facts.mergeCommitParents = parents;
        expect(parents).toHaveLength(2);
        expect((await runGit(repository, "status", "--porcelain=v1")).stdout.trim()).toBe("");
        await delay(1500);
        await shot("after-merge-continue");
    });
});
