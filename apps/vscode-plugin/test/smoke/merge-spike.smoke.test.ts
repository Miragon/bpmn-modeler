import { execFile } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { FrameLocator, Locator } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { VsCodeSession, downloadVsCode, packExtension } from "./vscodeSession";

/**
 * Spike only, never merged: screenshots of the redesigned merge view on a
 * real diagram. The stages are private and gitignored; the container sees
 * the host's working tree read-only at /repo.
 */

const runFile = promisify(execFile);
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DIST_DIRECTORY = join(REPOSITORY_ROOT, "dist/apps/vscode-plugin");
const RESULTS_DIRECTORY = join(REPOSITORY_ROOT, "test-results/vscode-smoke/merge-spike");
const FIXTURES_DIRECTORY = fileURLToPath(new URL("./fixtures/", import.meta.url));
const STAGE_DIRECTORIES = [
    join(REPOSITORY_ROOT, "test-results/merge-spike-stages"),
    "/repo/test-results/merge-spike-stages",
];
const TIMEOUT_MS = 30_000;
const COMMAND_TITLE = "Resolve in BPMN Merge View";
const FILE_NAME = "order.bpmn";
const WIDE_WINDOW = { width: 1920, height: 1080 };
const NARROW_PANE_WIDTH = 560;
const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

const TASK = "serviceTask_sendReminderMail";
const CALL_ACTIVITY = "callActivity_cancelBikeOrder";
const ERROR = "Error_BikeUnavailable";

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
        (error: { stdout?: string; stderr?: string; code?: number }) => ({
            stdout: `${error.stdout ?? ""}${error.stderr ?? ""}`,
            code: error.code ?? 1,
        }),
    );
}

async function stageDirectory(): Promise<string> {
    for (const directory of STAGE_DIRECTORIES) {
        if (
            await access(join(directory, "base.bpmn")).then(
                () => true,
                () => false,
            )
        )
            return directory;
    }
    throw new Error(`no merge spike stages in ${STAGE_DIRECTORIES.join(" or ")}`);
}

/** base on main, incoming on feature, current on main, then `git merge feature`. */
async function conflictedRepository(workspace: string): Promise<string> {
    const stages = await stageDirectory();
    const stage = (name: string) => readFile(join(stages, `${name}.bpmn`), "utf8");
    const repository = join(workspace, "order-repo");
    const file = join(repository, FILE_NAME);
    await mkdir(repository, { recursive: true });
    await writeFile(file, await stage("base"));
    await runGit(repository, "init", "-q");
    await runGit(repository, "add", FILE_NAME);
    await runGit(repository, "commit", "-q", "--no-verify", "-m", "Add the order process");
    await runGit(repository, "checkout", "-q", "-b", "feature");
    await writeFile(file, await stage("incoming"));
    await runGit(repository, "commit", "-q", "-a", "--no-verify", "-m", "Feature");
    await runGit(repository, "checkout", "-q", "main");
    await writeFile(file, await stage("current"));
    await runGit(repository, "commit", "-q", "-a", "--no-verify", "-m", "Main");
    const merged = await runGit(repository, "merge", "feature", "--no-edit");
    const unmerged = (await runGit(repository, "ls-files", "-u")).stdout;
    if (!unmerged.includes(FILE_NAME)) {
        throw new Error(`git merged ${FILE_NAME} without a conflict: ${merged.stdout}`);
    }
    return repository;
}

describe("merge view redesign spike", () => {
    let rootDirectory = "";
    let workspaceDirectory = "";
    let session: VsCodeSession | undefined;
    const observations: Record<string, unknown> = {};
    const vscode = (): VsCodeSession => {
        if (!session) throw new Error("VS Code did not start");
        return session;
    };

    async function shot(name: string): Promise<void> {
        await delay(800);
        await vscode().screenshot(join(RESULTS_DIRECTORY, `${name}.png`));
    }

    async function runFromSideBar(title: string): Promise<void> {
        await vscode().page.keyboard.press("Escape");
        await vscode().page.locator(".part.sidebar .composite.title").first().click();
        await vscode().runCommand(title);
    }

    async function sourceControlRow(fileName: string): Promise<Locator> {
        const row = vscode()
            .page.locator(".scm-view .monaco-list-row")
            .filter({ has: vscode().page.locator(".resource") })
            .filter({ hasText: fileName })
            .first();
        await row.waitFor({ state: "visible", timeout: TIMEOUT_MS });
        return row;
    }

    async function openMergeView(): Promise<void> {
        await runFromSideBar("Source Control: Focus on Changes View");
        const row = await sourceControlRow(FILE_NAME);
        await row.click({ button: "right" });
        const menu = vscode().page.locator(".context-view");
        await menu.locator(".action-label").first().waitFor({ timeout: TIMEOUT_MS });
        await delay(300);
        await menu.getByText(COMMAND_TITLE, { exact: true }).click();
        await vscode().page.mouse.move(0, 0);
    }

    async function mergePanes(): Promise<{ current: FrameLocator; incoming: FrameLocator }> {
        return {
            current: await vscode().editorWebview('body[data-diff-side="before"] .merge-bar'),
            incoming: await vscode().editorWebview('body[data-diff-side="after"] .merge-bar'),
        };
    }

    const position = (pane: FrameLocator) =>
        pane.locator(".merge-bar .diff-legend__position").innerText();

    const padEntry = (pane: FrameLocator, name: string) =>
        pane.locator(".djs-context-pad.open").getByRole("button", { name, exact: true });

    const padEntryNames = (pane: FrameLocator) =>
        pane
            .locator(".djs-context-pad.open .merge-pick-action")
            .evaluateAll((entries) =>
                entries.map((entry) => entry.getAttribute("aria-label") ?? ""),
            );

    const selectedIds = (pane: FrameLocator) =>
        pane
            .locator(".djs-element.selected")
            .evaluateAll((elements) =>
                elements.map((element) => element.getAttribute("data-element-id") ?? ""),
            );

    const badgeSides = (pane: FrameLocator, elementId: string) =>
        pane
            .locator(`.djs-overlays[data-container-id="${elementId}"] .merge-pick-badge__side`)
            .allInnerTexts();

    /** Rests the pointer on the canvas's corner, which hides a tooltip a click left behind. */
    async function restPointer(pane: FrameLocator): Promise<void> {
        await pane.locator(".djs-container").hover({ position: { x: 6, y: 6 }, force: true });
    }

    async function clickInPane(pane: FrameLocator, target: Locator): Promise<void> {
        await target.waitFor({ state: "visible", timeout: TIMEOUT_MS });
        await target.click();
        await restPointer(pane);
    }

    /**
     * Clicks a shape as a user does. Playwright found the canvas's container
     * over the shape in an earlier run, so a refused click is recorded with
     * what lies at the shape's centre and the mouse clicks there anyway.
     */
    async function clickShape(pane: FrameLocator, elementId: string): Promise<void> {
        const shape = pane.locator(`.djs-element[data-element-id="${elementId}"]`).first();
        await shape.waitFor({ state: "visible", timeout: TIMEOUT_MS });
        try {
            await shape.click({ timeout: 5_000 });
        } catch {
            observations[`click-${elementId}-${Date.now()}`] = await shape.evaluate((element) => {
                const box = element.getBoundingClientRect();
                const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
                const svg = element.closest("svg")?.getBoundingClientRect();
                const hit = document.elementFromPoint(centre.x, centre.y);
                return {
                    box: [box.x, box.y, box.width, box.height].map(Math.round),
                    svg: svg ? [svg.x, svg.y, svg.width, svg.height].map(Math.round) : null,
                    window: [window.innerWidth, window.innerHeight],
                    hit: hit?.outerHTML.slice(0, 160) ?? null,
                };
            });
            const box = await shape.boundingBox();
            if (!box) throw new Error(`${elementId} has no box`);
            await vscode().page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
        await restPointer(pane);
    }

    async function setWindowSize(size: { width: number; height: number }): Promise<void> {
        await vscode().app.evaluate(({ BrowserWindow }, { width, height }) => {
            BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
        }, size);
        await delay(1500);
    }

    async function paneWidths(): Promise<number[]> {
        const frames = vscode().editorFrames().filter({ visible: true });
        const widths: number[] = [];
        for (let index = 0; index < (await frames.count()); index++) {
            const box = await frames.nth(index).boundingBox();
            if (box) widths.push(Math.round(box.width));
        }
        return widths;
    }

    /** The bar's height and whether its row overflows, per pane. */
    async function barLayout(pane: FrameLocator) {
        return pane.locator(".merge-bar").evaluate((bar: HTMLElement) => {
            const row = bar.querySelector<HTMLElement>(".merge-bar__row");
            const labels = [...bar.querySelectorAll<HTMLElement>(".merge-bar__slot-label")];
            return {
                barHeight: bar.offsetHeight,
                rowHeight: row?.offsetHeight ?? 0,
                rowOverflows: row ? row.scrollWidth > row.clientWidth : false,
                pageWidth: document.documentElement.clientWidth,
                pageScrolls:
                    document.documentElement.scrollWidth > document.documentElement.clientWidth,
                labelsShown: labels.filter((label) => getComputedStyle(label).display !== "none")
                    .length,
                caption: bar.querySelector<HTMLElement>(".merge-bar__caption")?.innerText ?? "",
            };
        });
    }

    /** Where the canvas's svg sits in its container, and how far anything scrolled it. */
    async function canvasGeometry(pane: FrameLocator) {
        return pane.locator(".djs-container").evaluate((container: HTMLElement) => {
            const rect = (element: Element | null) => {
                const box = element?.getBoundingClientRect();
                return box ? [box.x, box.y, box.width, box.height].map(Math.round) : null;
            };
            const scrolled = [];
            for (
                let element: HTMLElement | null = container;
                element;
                element = element.parentElement
            ) {
                if (element.scrollLeft || element.scrollTop) {
                    scrolled.push({
                        element: `${element.tagName}.${element.className}`,
                        scrollLeft: element.scrollLeft,
                        scrollTop: element.scrollTop,
                    });
                }
            }
            return {
                container: rect(container),
                svg: rect(container.querySelector("svg")),
                overlays: rect(container.querySelector(".djs-overlay-container")),
                scrolled,
                window: [window.innerWidth, window.innerHeight],
            };
        });
    }

    async function noteLayout(name: string): Promise<void> {
        const { current, incoming } = await mergePanes();
        observations[name] = {
            paneWidths: await paneWidths(),
            current: await barLayout(current),
            incoming: await barLayout(incoming),
        };
    }

    async function setPadStyle(style: "words" | "icons"): Promise<void> {
        const { current, incoming } = await mergePanes();
        for (const pane of [current, incoming]) {
            await pane.locator("body").evaluate((body, padStyle) => {
                body.dataset.mergePadStyle = padStyle;
            }, style);
        }
    }

    /** Steps away and back, so both panes select the step again and their pads read the style anew. */
    async function reselectStep(expected: string): Promise<void> {
        const { incoming } = await mergePanes();
        await clickInPane(incoming, incoming.locator(".merge-bar .diff-legend__prev-btn"));
        await expect.poll(() => position(incoming), { timeout: TIMEOUT_MS }).not.toBe(expected);
        await clickInPane(incoming, incoming.locator(".merge-bar .diff-legend__next-btn"));
        await expect.poll(() => position(incoming), { timeout: TIMEOUT_MS }).toBe(expected);
    }

    async function openMenu(pane: FrameLocator): Promise<Locator> {
        const menu = pane.locator(".merge-menu");
        if (!(await menu.isVisible())) await pane.locator(".merge-bar__more").click();
        await menu.waitFor({ state: "visible", timeout: TIMEOUT_MS });
        return menu;
    }

    beforeAll(async () => {
        await rm(RESULTS_DIRECTORY, { recursive: true, force: true });
        await mkdir(RESULTS_DIRECTORY, { recursive: true });
        rootDirectory = await mkdtemp(join(tmpdir(), "bpmn-modeler-merge-spike-"));
        workspaceDirectory = join(rootDirectory, "workspace");
        await mkdir(workspaceDirectory, { recursive: true });
        await conflictedRepository(workspaceDirectory);
        await cp(join(FIXTURES_DIRECTORY, "smoke.bpmn"), join(workspaceDirectory, "clean.bpmn"));

        const manifest = JSON.parse(await readFile(join(DIST_DIRECTORY, "package.json"), "utf8"));
        const extensionPath = await packExtension(DIST_DIRECTORY, rootDirectory);
        const executablePath = await downloadVsCode(
            extensionPath,
            process.env.VSCODE_SMOKE_VERSION || undefined,
            (line) => console.log(`[merge-spike] ${line}`),
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
        await setWindowSize(WIDE_WINDOW);
    });

    afterEach(async ({ task }) => {
        if (task.result?.state !== "fail") return;
        const name = task.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        await session
            ?.screenshot(join(RESULTS_DIRECTORY, `failure-${name}.png`))
            .catch(() => undefined);
    });

    afterAll(async () => {
        await writeFile(
            join(RESULTS_DIRECTORY, "observations.json"),
            JSON.stringify(observations, null, 2),
        ).catch(() => undefined);
        if (session) {
            await cp(session.logsDirectory, join(RESULTS_DIRECTORY, "vscode-logs"), {
                recursive: true,
            }).catch(() => undefined);
        }
        await session?.close();
        if (rootDirectory) await rm(rootDirectory, { recursive: true, force: true });
    });

    it("01-overview", async () => {
        await runFromSideBar("View: Close All Editors");
        await openMergeView();
        const { current, incoming } = await mergePanes();
        await expect.poll(() => position(incoming), { timeout: TIMEOUT_MS }).toBe("–/3");
        for (const [pane, conflicts] of [
            [current, 1],
            [incoming, 2],
        ] as const) {
            await expect
                .poll(() => pane.locator(".merge-conflict-badge").count(), {
                    timeout: TIMEOUT_MS,
                })
                .toBe(conflicts);
        }
        await expect
            .poll(() => incoming.locator(".merge-bar__badge").innerText(), {
                timeout: TIMEOUT_MS,
            })
            .toBe("1");
        await vscode().page.mouse.move(0, 0);
        await noteLayout("01-overview");
        await shot("01-overview");
    });

    it("02-step-conflict-words", async () => {
        const { current, incoming } = await mergePanes();
        const next = incoming.locator(".merge-bar .diff-legend__next-btn");
        await clickInPane(incoming, next);
        await expect.poll(() => position(incoming), { timeout: TIMEOUT_MS }).toBe("1/3");
        await clickInPane(incoming, next);
        await expect.poll(() => position(incoming), { timeout: TIMEOUT_MS }).toBe("2/3");

        for (const pane of [current, incoming]) {
            await expect
                .poll(() => selectedIds(pane), { timeout: TIMEOUT_MS })
                .toEqual([CALL_ACTIVITY]);
        }
        await padEntry(current, "Keep current").waitFor({ timeout: TIMEOUT_MS });
        await padEntry(incoming, "Keep incoming").waitFor({ timeout: TIMEOUT_MS });
        observations["02-pad-entries"] = {
            current: await padEntryNames(current),
            incoming: await padEntryNames(incoming),
        };
        await shot("02-step-conflict-words");
    });

    it("03-step-conflict-icons", async () => {
        const { current, incoming } = await mergePanes();
        await setPadStyle("icons");
        await reselectStep("2/3");

        for (const pane of [current, incoming]) {
            await expect
                .poll(
                    () => pane.locator(".djs-context-pad.open .merge-pick-action--icons").count(),
                    {
                        timeout: TIMEOUT_MS,
                    },
                )
                .toBeGreaterThan(0);
        }
        await shot("03-step-conflict-icons");
    });

    it("04-pad-tooltip", async () => {
        const { incoming } = await mergePanes();
        await setPadStyle("words");
        await reselectStep("2/3");
        const keep = padEntry(incoming, "Keep incoming");
        await keep.waitFor({ state: "visible", timeout: TIMEOUT_MS });

        await keep.hover();

        const tooltip = incoming.locator("#merge-tooltip");
        await tooltip.waitFor({ state: "visible", timeout: TIMEOUT_MS });
        observations["04-tooltip"] = await tooltip.innerText();
        await shot("04-pad-tooltip");
    });

    it("05-kept-card", async () => {
        const { current, incoming } = await mergePanes();

        await clickInPane(incoming, padEntry(incoming, "Keep incoming"));

        await incoming
            .locator(".merge-outcome-card--applied")
            .waitFor({ state: "visible", timeout: TIMEOUT_MS });
        for (const pane of [current, incoming]) {
            await expect
                .poll(() => badgeSides(pane, CALL_ACTIVITY), { timeout: TIMEOUT_MS })
                .toEqual(["Incoming"]);
        }
        expect(await current.locator(".merge-outcome-card").count()).toBe(0);
        observations["05-card"] = await incoming.locator(".merge-outcome-card").innerText();
        await shot("05-kept-card");
    });

    it("06-one-pane-conflict", async () => {
        const { current, incoming } = await mergePanes();

        await clickInPane(incoming, incoming.locator(".merge-bar .diff-legend__prev-btn"));

        await expect.poll(() => position(incoming), { timeout: TIMEOUT_MS }).toBe("1/2");
        await expect.poll(() => selectedIds(incoming), { timeout: TIMEOUT_MS }).toEqual([TASK]);
        await padEntry(incoming, "Leave out").waitFor({ timeout: TIMEOUT_MS });
        await padEntry(incoming, "Keep incoming").waitFor({ timeout: TIMEOUT_MS });
        await expect.poll(() => selectedIds(current), { timeout: TIMEOUT_MS }).toEqual([]);
        expect(await current.locator(".djs-context-pad.open").count()).toBe(0);
        observations["06-pad-entries"] = await padEntryNames(incoming);
        await shot("06-one-pane-conflict");
    });

    it("07-restore-offer", async () => {
        const { incoming } = await mergePanes();

        await clickInPane(incoming, padEntry(incoming, "Keep incoming"));

        await incoming
            .locator(".merge-outcome-card .merge-outcome-card__offer")
            .waitFor({ state: "visible", timeout: TIMEOUT_MS });
        await padEntry(incoming, "Also keep its removed flows").waitFor({ timeout: TIMEOUT_MS });
        observations["07-card"] = await incoming.locator(".merge-outcome-card").innerText();
        observations["07-pad-entries"] = await padEntryNames(incoming);
        await shot("07-restore-offer");
    });

    it("08-refusal", async () => {
        const { incoming } = await mergePanes();
        await clickInPane(incoming, padEntry(incoming, "Also keep its removed flows"));
        await expect
            .poll(() => incoming.locator(".merge-pick-badge").count(), { timeout: TIMEOUT_MS })
            .toBe(4);

        await clickInPane(incoming, padEntry(incoming, "Leave out"));

        await incoming
            .locator(".merge-outcome-card--refused")
            .waitFor({ state: "visible", timeout: TIMEOUT_MS });
        await expect
            .poll(() => incoming.locator(".djs-element.merge-blocker").count(), {
                timeout: TIMEOUT_MS,
            })
            .toBe(2);
        observations["08-card"] = await incoming.locator(".merge-outcome-card").innerText();
        await shot("08-refusal");
    });

    it("09-shapeless-step", async () => {
        const { incoming } = await mergePanes();

        await clickInPane(incoming, incoming.locator(".merge-bar .diff-legend__next-btn"));

        await expect.poll(() => position(incoming), { timeout: TIMEOUT_MS }).toBe("1/1");
        const menu = incoming.locator(".merge-menu");
        await menu.waitFor({ state: "visible", timeout: TIMEOUT_MS });
        await menu
            .locator(`.merge-menu__row-step[data-element-id="${ERROR}"][aria-current="true"]`)
            .waitFor({ state: "visible", timeout: TIMEOUT_MS });
        expect(await incoming.locator(".merge-bar__badge").innerText()).toBe("1");
        await shot("09-shapeless-step");
    });

    it("10-build-tooltip", async () => {
        const { incoming } = await mergePanes();
        await incoming.locator(".merge-bar__more").click();
        await incoming.locator(".merge-menu").waitFor({ state: "hidden", timeout: TIMEOUT_MS });

        await incoming.locator(".merge-bar__build-wrap").hover();

        const tooltip = incoming.locator("#merge-tooltip");
        await expect
            .poll(() => tooltip.innerText(), { timeout: TIMEOUT_MS })
            .toBe("1 conflict left");
        await shot("10-build-tooltip");
    });

    it("11-review-notes", async () => {
        const { incoming } = await mergePanes();
        // Kept without the flows current removed with it, so the build notes it.
        await clickShape(incoming, TASK);
        await clickInPane(incoming, padEntry(incoming, "Undo pick"));
        await clickInPane(incoming, padEntry(incoming, "Keep incoming"));
        await incoming
            .locator(".merge-outcome-card .merge-outcome-card__offer")
            .waitFor({ state: "visible", timeout: TIMEOUT_MS });

        const menu = await openMenu(incoming);
        await menu
            .locator(`.merge-menu__row[data-row-for="${ERROR}"]`)
            .getByRole("button", { name: "Keep incoming", exact: true })
            .click();
        const build = incoming.locator(".merge-bar__build");
        await expect.poll(() => build.isEnabled(), { timeout: TIMEOUT_MS }).toBe(true);
        observations["11-row-outcome"] = await menu
            .locator(`.merge-menu__row[data-row-for="${ERROR}"] .merge-menu__outcome`)
            .innerText()
            .catch(() => "");
        await shot("11a-all-decided");

        await build.click();

        const mergeTab = vscode()
            .page.locator(".tabs-container .tab")
            .filter({ hasText: "(Merge: " })
            .filter({ hasText: FILE_NAME })
            .first();
        await expect
            .poll(
                async () =>
                    (await vscode().page.locator(".tabs-container .tab").count()) > 1 ||
                    !(
                        await readFile(join(workspaceDirectory, "order-repo", FILE_NAME), "utf8")
                    ).includes("<<<<<<<"),
                { timeout: TIMEOUT_MS },
            )
            .toBe(true);
        await delay(1500);
        await runFromSideBar("Notifications: Clear All Notifications");
        await mergeTab.click();
        const panes = await mergePanes();
        const builtMenu = await openMenu(panes.incoming);
        const review = builtMenu.getByRole("button", { name: /^Review notes/ });
        await expect.poll(() => review.innerText(), { timeout: TIMEOUT_MS }).toMatch(/\(\d+\)/);
        const reviewText = await review.innerText();
        observations["11-review-button"] = reviewText;
        if (reviewText.includes("(0)")) {
            observations["11-skipped"] = "the build gave no notes";
            return;
        }
        await review.click();
        const notes = panes.incoming.locator(".merge-notes");
        await notes.waitFor({ state: "visible", timeout: TIMEOUT_MS });
        observations["11-notes"] = await notes.innerText();
        await restPointer(panes.incoming);
        await shot("11-review-notes");
    });

    it("12-narrow", async () => {
        let { incoming } = await mergePanes();
        await incoming.locator("body").press("Escape");
        await restPointer(incoming);
        const menu = await openMenu(incoming);
        await menu.getByRole("radio", { name: "All merged elements" }).click();
        await incoming.locator(".merge-bar__more").click();

        observations["12-canvas-before-resize"] = await canvasGeometry(incoming);
        let width = WIDE_WINDOW.width;
        for (let attempt = 0; attempt < 3; attempt++) {
            const widths = await paneWidths();
            const widest = Math.max(...widths);
            if (Math.abs(widest - NARROW_PANE_WIDTH) <= 12) break;
            width -= 2 * (widest - NARROW_PANE_WIDTH);
            await setWindowSize({ width, height: WIDE_WINDOW.height });
        }
        ({ incoming } = await mergePanes());
        observations["12-canvas-after-resize"] = await canvasGeometry(incoming);
        // From the error, the last of all merged elements, Previous lands on the call activity.
        await clickInPane(incoming, incoming.locator(".merge-bar .diff-legend__prev-btn"));
        await expect.poll(() => position(incoming), { timeout: TIMEOUT_MS }).toBe("7/8");
        await expect
            .poll(() => selectedIds(incoming), { timeout: TIMEOUT_MS })
            .toEqual([CALL_ACTIVITY]);
        observations["12-canvas-after-step"] = await canvasGeometry(incoming);
        await noteLayout("12-narrow");
        observations["12-window-width"] = width;
        await shot("12-narrow");
    });
});
