import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { FrameLocator, Locator } from "playwright-core";
import { beforeEach, describe, expect, it } from "vitest";

import { BpmnModdle } from "bpmn-moddle";

import { WEBVIEW_FILES_AT_ONCE } from "../../../../vite.shared";
import { gitOutcome, runGit } from "./support/git";
import {
    CONFLICTED,
    NOTES_FILE,
    REMOVAL_FILE,
    conflictedRepositories,
    repositoryFolder,
    unmergedStages,
    type ConflictAsGitLeftIt,
    type GitOperation,
} from "./support/mergeConflicts";
import { diagramRendered, settle } from "./support/modeler";
import { smokeSuite } from "./support/smokeSuite";
import { fileUri } from "./support/vscodeDriver";
import { COMMAND_KEY } from "./vscodeSession";

/**
 * The BPMN merge view in a real VS Code, asserted through the DOM only:
 * opened from a Merge Changes row, explained on a row it cannot open, shown
 * for a merge, a rebase, a cherry-pick and a stash pop, offered by an editor
 * that opens a file with conflict markers, ended after a window reload and
 * opened again live beside the ended tab, its panes marking what is open and
 * what was taken automatically, the user's picks, by the pad and by the
 * keyboard commands' keys, and the build into the working file up to Git's
 * continue.
 */

const SMOKE_PROCESS = fileURLToPath(new URL("./fixtures/smoke.bpmn", import.meta.url));
const CLEAN_FILE = "clean.bpmn";
const TEXT_FILE = "readme.txt";
const UNMERGED_FILES = [...Object.values(CONFLICTED), REMOVAL_FILE, NOTES_FILE].sort();
// VS Code's minimum editor width, which the merge bar fits on one line.
const NARROWEST_EDITOR_WIDTH = 220;
const COMMAND_TITLE = "Resolve in BPMN Merge View";
const OPEN_MERGE_VIEW = "bpmn-modeler.openBpmnMergeView";
const KEY_RETRY_INTERVAL_MS = 1_000;

/** What the panes of the operations other than a merge say about their sides. */
const OTHER_OPERATIONS: readonly {
    name: string;
    operation: GitOperation;
    tab: string;
    current: RegExp;
    incoming: RegExp;
    picture?: string;
}[] = [
    {
        name: "a rebase, naming the user's own commit",
        operation: "rebase",
        tab: "rebased.bpmn (Merge: ",
        current: /^Current: other branch · [0-9a-f]{7}$/,
        incoming: /^Incoming: your commit · [0-9a-f]{7}$/,
        picture: "rebase-two-panes",
    },
    {
        name: "a cherry-pick",
        operation: "cherry-pick",
        tab: "picked.bpmn (Merge: main ↔ ",
        current: /^Current: your branch main · /,
        incoming: /^Incoming: other branch · [0-9a-f]{7}$/,
    },
    {
        name: "a stash pop",
        operation: "stash",
        tab: "stashed.bpmn (Merge: main ↔ ",
        current: /^Current: your branch main · /,
        incoming: /^Incoming: your stash$/,
    },
];

const conflictsAsGitLeftThem = {} as Record<GitOperation, ConflictAsGitLeftIt>;

const suite = smokeSuite({
    name: "merge-view",
    async workspace(directory) {
        const processXml = await readFile(SMOKE_PROCESS, "utf8");
        Object.assign(conflictsAsGitLeftThem, await conflictedRepositories(directory, processXml));
        await cp(SMOKE_PROCESS, join(directory, CLEAN_FILE));
        await writeFile(join(directory, TEXT_FILE), "not a diagram\n");
    },
    // The docs' pictures of the merge view are this suite's screenshots.
    colorTheme: "Default Light Modern",
    // No association for `*.bpmn`: the custom editor's own priority decides, as for a user.
    customEditors: {},
    git: true,
});
const { vscode } = suite;

const repositoryOf = (operation: GitOperation) => suite.file(repositoryFolder(operation));
const conflictedFile = (operation: GitOperation) =>
    join(repositoryOf(operation), CONFLICTED[operation]);
const removalFile = () => join(repositoryOf("merge"), REMOVAL_FILE);

interface MergePanes {
    current: FrameLocator;
    incoming: FrameLocator;
}

/** A picture for the docs and for review. A notice left by an earlier step would cover the editor's corner. */
async function shot(name: string, { withNotifications = false } = {}): Promise<void> {
    for (const { page } of await vscode().visibleEditors()) {
        // The page of an ended merge view runs no script, so it has no frame to wait for.
        if ((await countIn(page, ".djs-container")) > 0) await settle(page);
    }
    await settle(vscode().page);
    await suite.screenshot(name, { hideNotifications: !withNotifications });
}

/** A frame that VS Code replaces while a tab settles counts as showing nothing. */
function countIn(page: FrameLocator, selector: string): Promise<number> {
    return page
        .locator(selector)
        .count()
        .catch(() => 0);
}

/** Both panes of the visible merge view or result comparison. A tab switch replaces them, so they are looked up again after one. */
async function mergePanes(): Promise<MergePanes> {
    return {
        current: await vscode().editorWebview('body[data-diff-side="before"]'),
        incoming: await vscode().editorWebview('body[data-diff-side="after"]'),
    };
}

/** The open conflicts, as the incoming pane's ‹ n/N › names them in its tooltip. */
async function openCount(incoming: FrameLocator): Promise<string> {
    return (
        (await incoming.locator(".merge-bar__position").getAttribute("data-merge-tooltip")) ?? ""
    );
}

/**
 * Opens a conflicted file's merge view by the command's id, where the way in
 * is not under test, and returns its panes once the incoming one counts the
 * file's one conflict.
 */
async function openMergeView(file: string): Promise<MergePanes> {
    await vscode().executeCommand(OPEN_MERGE_VIEW, fileUri(file));
    const panes = await mergePanes();
    await expect.poll(() => openCount(panes.incoming)).toBe("1 open conflict");
    return panes;
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

function mergeTab(fileName: string): Locator {
    return vscode()
        .page.locator(".tabs-container .tab")
        .filter({ hasText: "(Merge: " })
        .filter({ hasText: fileName })
        .first();
}

/** A pane's caption in its bar, in full: a narrow bar hides the branch and commit, not the text. */
async function sideLabel(pane: FrameLocator): Promise<string> {
    return (await pane.locator(".merge-bar__caption").textContent()) ?? "";
}

/** The captions of both panes of the visible merge view, once both painted theirs. */
async function captions(): Promise<{ current: string; incoming: string }> {
    const { current, incoming } = await mergePanes();
    await expect.poll(() => sideLabel(current)).toMatch(/^Current/);
    await expect.poll(() => sideLabel(incoming)).toMatch(/^Incoming/);
    return { current: await sideLabel(current), incoming: await sideLabel(incoming) };
}

/** The most resource loads the page had in flight at one time, from its resource timing. */
function mostLoadsAtOnce(page: FrameLocator): Promise<number> {
    return page.locator("html").evaluate(() => {
        const edges = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
            .flatMap(({ startTime, responseEnd }) => [
                { at: startTime, change: 1 },
                { at: responseEnd, change: -1 },
            ])
            .sort((one, other) => one.at - other.at || one.change - other.change);
        let inFlight = 0;
        let most = 0;
        for (const { change } of edges) {
            inFlight += change;
            most = Math.max(most, inFlight);
        }
        return most;
    });
}

/** What every visible editor webview of the extension shows. */
async function visiblePanes(): Promise<{ ended: boolean; canvas: boolean }[]> {
    const panes = [];
    for (const { page } of await vscode().visibleEditors()) {
        panes.push({
            ended: (await countIn(page, "[data-merge-view-ended]")) > 0,
            canvas: (await countIn(page, ".djs-container")) > 0,
        });
    }
    return panes;
}

/** The editable modeler, not a diff pane that never paired: it has a palette and a properties panel. */
async function editableModelerShows(): Promise<boolean> {
    const modeler = await vscode().editorWebview(".djs-palette");
    return (await modeler.locator("#js-properties-panel").count()) > 0;
}

const notifications = () => vscode().page.locator(".notifications-toasts .notification-toast");

async function notification(text: string): Promise<Locator> {
    const toast = notifications().filter({ hasText: text }).first();
    await toast.waitFor({ state: "visible" });
    return toast;
}

/** The keyboard's way: focus the button and press Enter, no click. */
async function press(pane: FrameLocator, name: string): Promise<void> {
    const target = pane.getByRole("button", { name, exact: true });
    for (let attempt = 1; ; attempt++) {
        try {
            await target.waitFor({ state: "visible" });
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
function padEntry(pane: FrameLocator, name: string | RegExp): Locator {
    return pane
        .locator(".djs-context-pad")
        .getByRole("button", { name, exact: typeof name === "string" });
}

async function decideInPad(pane: FrameLocator, name: string | RegExp): Promise<void> {
    await padEntry(pane, name).click();
}

/** Steps to the file's one conflict and keeps incoming's version of it on the pad the step opens. */
async function keepIncoming(incoming: FrameLocator): Promise<void> {
    await press(incoming, "Next change");
    await decideInPad(incoming, "Keep incoming");
    await expect.poll(() => openCount(incoming)).toBe("No open conflicts");
}

/**
 * A click on the canvas's empty corner gives the pane the focus and selects
 * nothing. The corner below the bar: a notice can cover the one at the bottom.
 */
async function clickEmptyCanvas(pane: FrameLocator): Promise<void> {
    const barHeight = (await pane.locator(".merge-bar").boundingBox())?.height ?? 0;
    await pane.locator(".djs-container").click({ position: { x: 30, y: barHeight + 30 } });
}

/** Opens the incoming pane's "…" menu the keyboard's way, unless it is open. */
async function openMenu(incoming: FrameLocator): Promise<void> {
    const shown = incoming.locator(".merge-menu:not([hidden])");
    if ((await shown.count()) > 0) return;
    await incoming.locator(".merge-bar__more").focus();
    await vscode().page.keyboard.press("Enter");
    await shown.waitFor({ state: "visible" });
}

/** Closes the menu with Escape, which gives the focus back to "…". */
async function closeMenu(incoming: FrameLocator): Promise<void> {
    await vscode().page.keyboard.press("Escape");
    await incoming.locator(".merge-menu").waitFor({ state: "hidden" });
}

async function chooseStepList(incoming: FrameLocator, name: string): Promise<void> {
    await openMenu(incoming);
    const stepList = incoming.getByRole("radio", { name, exact: true });
    await stepList.focus();
    await vscode().page.keyboard.press("Enter");
    await expect.poll(() => stepList.getAttribute("aria-checked")).toBe("true");
    await closeMenu(incoming);
}

/** The menu's way: opens "…" and presses one of its entries. */
async function pressInMenu(incoming: FrameLocator, name: string): Promise<void> {
    await openMenu(incoming);
    await press(incoming, name);
}

/**
 * Build where the bar has room for it, else the first item of the "…" menu.
 * A pane fits its bar once its states arrived, which a tab switch back to
 * it makes it wait for again.
 */
async function pressBuild(incoming: FrameLocator): Promise<void> {
    const onBar = incoming.locator(".merge-bar__build:enabled");
    const inMenu = incoming.locator(
        ".merge-menu__section:not([hidden]) .merge-menu__build:enabled",
    );
    await expect
        .poll(async () => (await onBar.isVisible()) || (await inMenu.count()) > 0)
        .toBe(true);
    if (await onBar.isVisible()) await press(incoming, "Build");
    else await pressInMenu(incoming, "Build");
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
async function expectBarsLevel({ current, incoming }: MergePanes): Promise<void> {
    await expect
        .poll(async () => {
            const [left, right] = [await barLayout(current), await barLayout(incoming)];
            return {
                level: left.height > 0 && left.height === right.height,
                clipped: [left.clipped, right.clipped],
            };
        })
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
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const widths: { width: number; fit?: string; height: number; clipped: boolean }[] = [];
        for (let width = 1600; width >= narrowest; width -= 10) {
            bar.style.width = `${width}px`;
            await nextFrame();
            widths.push({
                width,
                fit: bar.dataset.fit,
                height: bar.offsetHeight,
                clipped: parts.some((part) => part === null || part.scrollWidth > part.clientWidth),
            });
        }
        const more = bar.querySelector<HTMLButtonElement>(".merge-bar__more");
        more?.click();
        const first = bar.querySelector<HTMLButtonElement>(".merge-menu button");
        const menuFirst = first && {
            text: first.textContent,
            disabled: first.disabled,
            reason: first.ownerDocument.getElementById(first.getAttribute("aria-describedby") ?? "")
                ?.textContent,
            tooltip: first.parentElement?.getAttribute("data-merge-tooltip"),
        };
        more?.click();
        bar.style.removeProperty("width");
        await nextFrame();
        return { widths, menuFirst };
    }, NARROWEST_EDITOR_WIDTH);
}

/** The view never writes: the working file and the index stay as Git left them. */
async function expectUntouched(operation: GitOperation): Promise<void> {
    expect(await readFile(conflictedFile(operation), "utf8")).toBe(
        conflictsAsGitLeftThem[operation].workingFile,
    );
    expect(await unmergedStages(repositoryOf(operation))).toBe(
        conflictsAsGitLeftThem[operation].stages,
    );
}

beforeEach(async () => {
    // Git lists the conflicts once it has scanned the repositories, and the extension reads them from it.
    await expect
        .poll(async () => (await vscode().unmergedFiles()).map((file) => basename(file)).sort())
        .toEqual(UNMERGED_FILES);
    // Where a user in a merge looks, and what the docs' pictures show beside the view.
    await vscode().executeCommand("workbench.view.scm");
});

describe("the BPMN merge view", () => {
    describe("open", () => {
        it("offers the merge view on a Merge Changes row while a text file is the active editor", async () => {
            await vscode().openFile(suite.file(TEXT_FILE));
            await expect.poll(activeTabLabel).toContain(TEXT_FILE);

            await vscode().runSourceControlCommand(CONFLICTED.merge, COMMAND_TITLE);

            await expect
                .poll(tabLabels)
                .toContainEqual(expect.stringContaining("merged.bpmn (Merge: main ↔ feature)"));
            const { current, incoming } = await captions();
            expect(current).toMatch(/^Current: your branch main · [0-9a-f]{7}$/);
            expect(incoming).toMatch(/^Incoming: other branch feature · [0-9a-f]{7}$/);
            await expectUntouched("merge");
            await shot("merge-two-panes");
        });

        it("explains a Merge Changes row it cannot open", async () => {
            await vscode().runSourceControlCommand(NOTES_FILE, COMMAND_TITLE);

            await notification(
                "notes.txt is not a BPMN file. The BPMN merge view opens conflicted .bpmn files only.",
            );
        });

        it.each(OTHER_OPERATIONS)("opens both sides of $name", async (sides) => {
            await openMergeView(conflictedFile(sides.operation));

            await expect.poll(activeTabLabel).toContain(sides.tab);
            const { current, incoming } = await captions();
            expect(current).toMatch(sides.current);
            expect(incoming).toMatch(sides.incoming);
            await expectUntouched(sides.operation);
            if (sides.picture) await shot(sides.picture);
        });

        it("opens the working file as the editable modeler beside its merge tab and offers the merge view", async () => {
            await openMergeView(conflictedFile("merge"));

            await vscode().openFile(conflictedFile("merge"));

            await expect.poll(editableModelerShows).toBe(true);
            const notice = await notification(
                "merged.bpmn holds Git conflict markers, so the modeler cannot show it.",
            );
            await shot("conflict-marker-notice", { withNotifications: true });
            await notice.getByRole("button", { name: COMMAND_TITLE }).click();

            await expect.poll(activeTabLabel).toContain("merged.bpmn (Merge: main ↔ feature)");
        });

        it("shows that the merge view ended in both panes a window reload restored, beside which the working file opens as the modeler and the row opens live panes again", async () => {
            await openMergeView(conflictedFile("merge"));
            await vscode().reloadWindow();

            await expect
                .poll(async () => {
                    const panes = await visiblePanes();
                    return panes.length >= 2 && panes.every((pane) => pane.ended);
                })
                .toBe(true);
            expect((await visiblePanes()).some((pane) => pane.canvas)).toBe(false);
            await shot("merge-view-after-reload");

            await vscode().openFile(conflictedFile("merge"));

            await expect.poll(editableModelerShows).toBe(true);

            await vscode().runSourceControlCommand(CONFLICTED.merge, COMMAND_TITLE);

            await expect
                .poll(async () => {
                    const panes = await visiblePanes();
                    return panes.length >= 2 && panes.every((pane) => pane.canvas && !pane.ended);
                })
                .toBe(true);
            const { current } = await captions();
            expect(current).toMatch(/^Current: your branch main/);
            await shot("merge-view-reopened");
        });

        it(`loads at most ${WEBVIEW_FILES_AT_ONCE} files at once in each pane, so that one closed while it loads leaves VS Code's resource slots to the next`, async () => {
            await openMergeView(conflictedFile("merge"));
            await vscode().webviewsLoaded();

            const panes = await vscode().visibleEditors();
            expect(panes).toHaveLength(2);
            for (const { page } of panes) {
                expect(await mostLoadsAtOnce(page)).toBeLessThanOrEqual(WEBVIEW_FILES_AT_ONCE);
            }
        });
    });

    describe("marks", () => {
        /** The class list of an element of a pane's canvas, once the pane painted its marks. */
        function classesOf(pane: FrameLocator, elementId: string): Promise<string> {
            return pane
                .locator(`.djs-element[data-element-id="${elementId}"]`)
                .first()
                .getAttribute("class")
                .then((classes) => classes ?? "");
        }

        it("counts the open conflict, marks the task both sides renamed on both panes and the end event only feature renamed as taken from incoming", async () => {
            const panes = await openMergeView(conflictedFile("merge"));
            const { current, incoming } = panes;

            for (const pane of [current, incoming]) {
                await expect
                    .poll(() =>
                        pane
                            .locator(".diff-legend__slot--merge-conflict")
                            .textContent()
                            .then((text) => text?.replace(/\s+/g, " ").trim()),
                    )
                    .toBe("Conflict 1");
                await expect.poll(() => classesOf(pane, "Task_Check")).toContain("merge-conflict");
                await expect.poll(() => pane.locator(".merge-conflict-badge").count()).toBe(1);
            }
            await expect
                .poll(() => classesOf(incoming, "End_Order"))
                .toContain("merge-taken-from-this-side");
            expect(await classesOf(current, "End_Order")).toContain("merge-taken-from-other-side");
            expect(await classesOf(current, "Start_Order")).not.toMatch(/merge-/);
            await expectBarsLevel(panes);
            await expectUntouched("merge");
            await shot("marks-both-panes");
        });

        it("keeps the bar on one line of one height down to the narrowest editor with the conflict open, dropping the caption's branch and commit, then the counts' labels, then moving Build into the menu", async () => {
            const panes = await openMergeView(conflictedFile("merge"));
            await expectBarsLevel(panes);
            const { height } = await barLayout(panes.incoming);

            const { widths, menuFirst } = await narrowBar(panes.incoming);

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
            await expectBarsLevel(panes);
        });

        it("switches the step list in the incoming pane's menu, which the host keeps for the tab", async () => {
            const { current, incoming } = await openMergeView(conflictedFile("merge"));
            const position = () => incoming.locator(".merge-bar__position").innerText();
            await expect.poll(position).toBe("–/1");
            expect(await current.locator(".merge-bar__more:visible").count()).toBe(0);
            await openMenu(incoming);
            const allSteps = incoming.getByRole("radio", {
                name: "All merged elements",
                exact: true,
            });

            await allSteps.focus();
            await vscode().page.keyboard.press("Enter");

            await expect.poll(() => allSteps.getAttribute("aria-checked")).toBe("true");
            await expect.poll(position).not.toBe("–/1");
            await shot("marks-step-list-shared");
            await closeMenu(incoming);
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

        function badgeTexts(pane: FrameLocator): Promise<string[]> {
            return pane
                .locator(".merge-pick-badge")
                .evaluateAll((badges) =>
                    badges
                        .filter((badge) => badge.checkVisibility())
                        .map((badge) => (badge as HTMLElement).innerText.trim()),
                );
        }

        /** The outcome card, which only the pane that sent the decision shows. */
        function outcomeCard(pane: FrameLocator): Locator {
            return pane.locator(".merge-outcome-card");
        }

        const tooltipText = (pane: FrameLocator) =>
            pane.locator(".merge-tooltip:not([hidden])").innerText();

        it("keeps incoming's version of the conflict from the pad a step opens and badges it on both panes", async () => {
            const panes = await openMergeView(conflictedFile("merge"));
            const { current, incoming } = panes;

            await press(incoming, "Next change");

            // The step selects the conflict on both panes, so each opens its pad, and shows no tooltip.
            for (const pane of [current, incoming]) {
                await pane
                    .locator(".djs-context-pad .merge-pick-action")
                    .first()
                    .waitFor({ state: "visible" });
                expect(await pane.locator(".merge-tooltip:not([hidden])").count()).toBe(0);
            }

            await decideInPad(incoming, "Keep incoming");

            await expect.poll(() => openCount(incoming)).toBe("No open conflicts");
            for (const pane of [current, incoming]) {
                await expect
                    .poll(() => badgeLabels(pane))
                    .toEqual(["Kept from incoming, your pick"]);
            }
            await expectBarsLevel(panes);
            expect(await badgeTexts(incoming)).toEqual(["Incoming"]);
            await expect
                .poll(() => outcomeCard(incoming).innerText())
                .toContain("Kept from incoming: Check feature order");
            expect(await outcomeCard(current).count()).toBe(0);
            await shot("pick-badges-both-panes");
        });

        it("steps to the conflict and keeps it by the commands' keys, leaving the focus in the pane", async () => {
            const { current, incoming } = await openMergeView(conflictedFile("merge"));
            await clickEmptyCanvas(incoming);
            const position = () => incoming.locator(".merge-bar__position").innerText();

            // The host sets the keys' context once the pane reported its focus and commands,
            // so a key pressed before then goes nowhere and is pressed again.
            await expect
                .poll(
                    async () => {
                        await vscode().page.keyboard.press("Alt+F5");
                        return position();
                    },
                    { interval: KEY_RETRY_INTERVAL_MS },
                )
                .toBe("1/1");
            await padEntry(incoming, "Keep incoming").waitFor({ state: "visible" });
            await expect
                .poll(
                    async () => {
                        // Only while the conflict is open: after the keep the chord names no command.
                        if ((await openCount(incoming)) === "1 open conflict") {
                            await vscode().page.keyboard.press(`${COMMAND_KEY}+k`);
                            await vscode().page.keyboard.press("k");
                        }
                        return openCount(incoming);
                    },
                    { interval: KEY_RETRY_INTERVAL_MS },
                )
                .toBe("No open conflicts");

            for (const pane of [current, incoming]) {
                await expect
                    .poll(() => badgeLabels(pane))
                    .toEqual(["Kept from incoming, your pick"]);
            }
            await expect
                .poll(() => outcomeCard(incoming).innerText())
                .toContain("Kept from incoming: Check feature order");
            expect(await incoming.locator("body").evaluate(() => document.hasFocus())).toBe(true);
            await expectUntouched("merge");
        });

        it("undoes the pick on the pad, then overrides an automatic resolution of all merged elements", async () => {
            const panes = await openMergeView(conflictedFile("merge"));
            const { current, incoming } = panes;
            await keepIncoming(incoming);
            await chooseStepList(incoming, "All merged elements");
            await expectBarsLevel(panes);

            await decideInPad(incoming, "Undo pick");

            await expect.poll(() => openCount(incoming)).toBe("1 open conflict");
            expect(await badgeLabels(current)).toEqual([]);
            expect(await badgeLabels(incoming)).toEqual([]);

            await press(incoming, "Next change");
            await decideInPad(current, "Keep current");

            await expect
                .poll(() => badgeLabels(incoming))
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
            const { incoming } = await openMergeView(conflictedFile("merge"));
            await keepIncoming(incoming);

            await suite.open(CLEAN_FILE, diagramRendered);
            await mergeTab(CONFLICTED.merge).click();

            const { current, incoming: restored } = await mergePanes();
            for (const pane of [current, restored]) {
                await expect
                    .poll(() => badgeLabels(pane))
                    .toEqual(["Kept from incoming, your pick"]);
            }
        });

        it("offers the flows main removed with a task feature kept, and keeps them on request", async () => {
            const { current, incoming } = await openMergeView(removalFile());
            await press(incoming, "Next change");

            await decideInPad(incoming, "Keep incoming");

            const offer = "Also keep the 2 flows current removed with it";
            await outcomeCard(incoming).getByRole("button", { name: offer }).waitFor();
            expect(await outcomeCard(incoming).innerText()).toContain(
                "Kept from incoming: Check feature order",
            );
            expect(await current.getByRole("button", { name: offer }).count()).toBe(0);
            expect(await outcomeCard(current).count()).toBe(0);
            await padEntry(incoming, "Also keep its removed flows").hover();
            await expect
                .poll(() => tooltipText(incoming))
                .toBe(`Also keep its removed flows: ${offer}`);
            await shot("pick-restore-offer");

            await decideInPad(incoming, "Also keep its removed flows");

            await expect.poll(() => badgeLabels(incoming).then((labels) => labels.length)).toBe(3);
            // The current pane lacks what incoming kept, so it draws no badge for it and lists none.
            expect(await badgeLabels(current)).toEqual([]);
            await shot("pick-kept-with-flows");
        });

        it("names the flows that block leaving out the task main removed, and shows the reason and the pad's icons again once the task is selected again", async () => {
            const { current, incoming } = await openMergeView(removalFile());
            await keepIncoming(incoming);
            await decideInPad(incoming, "Also keep its removed flows");
            await expect.poll(() => badgeLabels(incoming).then((labels) => labels.length)).toBe(3);
            const task = incoming.locator('.djs-element[data-element-id="Task_Check"]').first();
            const entries = incoming.locator(".djs-context-pad .merge-pick-action");
            // diagram-js deselects on a click on the element already selected alone, so it starts from none.
            await clickEmptyCanvas(incoming);
            await task.click();

            await decideInPad(incoming, /^Leave out: Leave it out, as current removed it$/);

            const card = outcomeCard(incoming);
            await expect
                .poll(() => card.innerText())
                .toContain("Can't leave out Check feature order");
            expect(await card.innerText()).toMatch(/Your pick .+ needs it/);
            expect(await incoming.locator(".djs-element.merge-blocker").count()).toBeGreaterThan(0);
            expect(await outcomeCard(current).count()).toBe(0);
            // The left pane has no menu whose rows could say it.
            expect(await current.locator(".merge-menu:not([hidden])").count()).toBe(0);
            await shot("pick-blocked-reason");

            await clickEmptyCanvas(incoming);
            await expect.poll(() => entries.count()).toBe(0);
            expect(await card.count()).toBe(0);
            await task.click();

            // Selected again, the task shows its latest outcome again.
            await expect
                .poll(() => card.innerText())
                .toContain("Can't leave out Check feature order");
            await entries.first().waitFor({ state: "visible" });
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
                .poll(() => tooltipText(incoming))
                .toBe("Undo pick: Go back to what the merge decided by itself");
            await shot("pick-context-pad");
        });
    });

    describe("build", () => {
        const dialog = () => vscode().page.locator(".monaco-dialog-box");

        /** The tab of the working file in the modeler, not a merge or comparison tab. */
        function workingFileTab(fileName: string): Locator {
            return vscode()
                .page.locator(".tabs-container .tab")
                .filter({ hasText: fileName })
                .filter({ hasNotText: "(Merge: " })
                .first();
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
            const shown = [];
            for (const { frame, page } of await vscode().visibleEditors()) {
                const box = await frame.boundingBox();
                if (!box || !active) continue;
                const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
                const inActive =
                    centre.x >= active.x &&
                    centre.x <= active.x + active.width &&
                    centre.y >= active.y &&
                    centre.y <= active.y + active.height;
                if (inActive !== (groups === "active")) continue;
                shown.push({
                    editable:
                        (await countIn(page, ".djs-palette")) > 0 &&
                        (await countIn(page, "#js-properties-panel")) > 0,
                    diagram: (await countIn(page, ".djs-shape[data-element-id]")) >= 3,
                });
            }
            return shown;
        }

        /** Visible modelers that draw a diagram: a palette and the process's shapes. */
        async function modelersShowingDiagram(): Promise<number> {
            const modelers = [...(await modelersIn("active")), ...(await modelersIn("others"))];
            return modelers.filter(({ editable, diagram }) => editable && diagram).length;
        }

        async function taskName(file: string): Promise<unknown> {
            const { elementsById } = await BpmnModdle().fromXML(await readFile(file, "utf8"));
            return elementsById.Task_Check?.name;
        }

        async function expectBuilt(file: string): Promise<void> {
            await expect.poll(() => readFile(file, "utf8")).not.toContain("<<<<<<<");
        }

        /** The working file holds the built BPMN, while Git still lists it unmerged with its stages as before. */
        async function expectBuiltButUnmerged(
            operation: GitOperation,
            name: string,
        ): Promise<void> {
            await expectBuilt(conflictedFile(operation));
            expect(await taskName(conflictedFile(operation))).toBe(name);
            expect(
                await runGit(
                    repositoryOf(operation),
                    "status",
                    "--porcelain",
                    CONFLICTED[operation],
                ),
            ).toMatch(/^UU /);
            expect(await unmergedStages(repositoryOf(operation))).toBe(
                conflictsAsGitLeftThem[operation].stages,
            );
        }

        /**
         * Opens a file's merge view, keeps incoming's version of its conflict
         * and builds the result into the working file. Build then opens the
         * file in the modeler in front of the merge tab, which would cover a
         * step taken before it has.
         */
        async function build(file: string): Promise<void> {
            const { incoming } = await openMergeView(file);
            await keepIncoming(incoming);
            await pressBuild(incoming);
            await expectBuilt(file);
            await expect.poll(activeTabLabel).not.toContain("(Merge: ");
            await expect.poll(modelersShowingDiagram).toBe(1);
        }

        async function buildMerge(): Promise<void> {
            await build(conflictedFile("merge"));
            await notification("Built merged.bpmn from your decisions.");
        }

        /** Goes back from the built file's modeler to its merge tab. */
        async function backToMergeView(): Promise<MergePanes> {
            await vscode().webviewsLoaded();
            await mergeTab(CONFLICTED.merge).click();
            return mergePanes();
        }

        /** Renames the task in the visible modeler through direct editing. */
        async function renameTask(name: string): Promise<void> {
            const modeler = await vscode().editorWebview(".djs-palette");
            // The palette sits over the canvas's left edge, so the task is hit at its right end.
            await modeler
                .locator('.djs-shape[data-element-id="Task_Check"] > .djs-hit')
                .dblclick({ position: { x: 90, y: 40 } });
            const textBox = modeler.locator(".djs-direct-editing-content");
            await textBox.fill(name);
            await vscode().page.keyboard.press("Enter");
            await textBox.waitFor({ state: "hidden" });
            await expect.poll(() => vscode().isActiveTabDirty()).toBe(true);
        }

        async function cancelDialog(text: string): Promise<void> {
            await dialog().waitFor({ state: "visible" });
            expect(await dialog().innerText()).toContain(text);
            await dialog().getByRole("button", { name: "Cancel" }).click();
            await dialog().waitFor({ state: "hidden" });
        }

        /**
         * A copy of the repository as the build left it, where a test stages
         * and continues: every test finds the window's repositories stopped
         * at their conflict, and Git watches them.
         */
        async function repositoryCopy(operation: GitOperation): Promise<string> {
            const copy = join(suite.rootDirectory(), `continued-${repositoryFolder(operation)}`);
            await rm(copy, { recursive: true, force: true });
            await cp(repositoryOf(operation), copy, { recursive: true });
            return copy;
        }

        it("builds the decided merge into the working file, which Git still lists unmerged, and shows it in a modeler beside the merge tab and in the one open before", async () => {
            await openMergeView(conflictedFile("merge"));
            // A modeler already open on the conflicted file beside the merge tab, in a second group.
            await vscode().openFile(conflictedFile("merge"), { toTheSide: true });
            await expect
                .poll(() => vscode().page.locator(".editor-group-container").count())
                .toBe(2);
            const panes = await backToMergeView();
            const { current, incoming } = panes;
            await expect.poll(() => openCount(incoming)).toBe("1 open conflict");
            // Two groups leave each pane too narrow for Build on the bar, so it is the menu's first item.
            await expectBarsLevel(panes);
            expect(await incoming.locator(".merge-bar__build").isVisible()).toBe(false);
            await openMenu(incoming);
            const buildButton = incoming.getByRole("button", { name: "Build", exact: true });
            expect(await buildButton.isDisabled()).toBe(true);
            expect(
                await incoming
                    .locator(".merge-menu__build-wrap")
                    .getAttribute("data-merge-tooltip"),
            ).toBe("1 conflict left");
            expect(
                await buildButton.evaluate(
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
            await closeMenu(incoming);
            await keepIncoming(incoming);

            await pressBuild(incoming);

            await expectBuiltButUnmerged("merge", "Check feature order");
            await expect.poll(activeTabLabel).toContain(CONFLICTED.merge);
            expect(await activeTabLabel()).not.toContain("(Merge: ");
            // A diff pane that never paired would show no palette and no properties panel.
            await expect
                .poll(() => modelersIn("active"))
                .toStrictEqual([{ editable: true, diagram: true }]);
            expect(await tabLabels()).toContainEqual(
                expect.stringContaining(`${CONFLICTED.merge} (Merge: main ↔ feature)`),
            );
            // Whether Build opened a second modeler or revealed the one open before, every modeler shows the result.
            await expect
                .poll(async () =>
                    [...(await modelersIn("active")), ...(await modelersIn("others"))]
                        .filter(({ editable }) => editable)
                        .every(({ diagram }) => diagram),
                )
                .toBe(true);
            await notification("Built merged.bpmn from your decisions.");
        });

        it("builds again without asking while the file is untouched", async () => {
            await buildMerge();
            await vscode().executeCommand("notifications.clearAll");
            await expect.poll(() => notifications().count()).toBe(0);
            const { incoming } = await backToMergeView();

            await pressBuild(incoming);

            await notification("Built merged.bpmn from your decisions.");
            expect(await dialog().count()).toBe(0);
        });

        it("asks before it builds over a saved edit and leaves the file on Cancel", async () => {
            await buildMerge();
            await shot("build-opened-modeler");
            await renameTask("Check edited order");
            await vscode().executeCommand("workbench.action.files.save");
            await expect.poll(() => taskName(conflictedFile("merge"))).toBe("Check edited order");
            const { incoming } = await backToMergeView();

            await pressBuild(incoming);

            await cancelDialog("merged.bpmn changed since the last build. Build over it?");
            expect(await taskName(conflictedFile("merge"))).toBe("Check edited order");
        });

        it("asks before it builds over unsaved changes and leaves them on Cancel", async () => {
            await buildMerge();
            await renameTask("Check unsaved order");
            const { incoming } = await backToMergeView();

            await pressBuild(incoming);

            await cancelDialog("merged.bpmn has unsaved changes. Build over them?");
            expect(await taskName(conflictedFile("merge"))).toBe("Check feature order");
            await workingFileTab(CONFLICTED.merge).click();
            expect(await vscode().isActiveTabDirty()).toBe(true);
        });

        it("compares the result with incoming and switches the comparison to current", async () => {
            await buildMerge();
            const { incoming } = await backToMergeView();

            await pressInMenu(incoming, "Compare with incoming");

            await expect
                .poll(activeTabLabel)
                .toContain(`${CONFLICTED.merge} (Merge: Incoming ↔ Result)`);
            const result = await vscode().editorWebview(
                'body[data-diff-side="after"] .diff-legend__comparison-switch',
            );
            await expect
                .poll(() => result.locator(".diff-legend__comparison").innerText())
                .toBe("Result against incoming");
            await shot("build-compare-incoming");

            await press(result, "Compare with current");

            await expect
                .poll(activeTabLabel)
                .toContain(`${CONFLICTED.merge} (Merge: Current ↔ Result)`);
            // The switch opens the other comparison first, so the one it replaces closes after.
            await expect
                .poll(tabLabels)
                .not.toContainEqual(expect.stringContaining("(Merge: Incoming ↔ Result)"));
        });

        it("opens the built file as the editable modeler beside the tabs a window reload restored", async () => {
            await buildMerge();
            await pressInMenu((await backToMergeView()).incoming, "Compare with current");
            await expect
                .poll(activeTabLabel)
                .toContain(`${CONFLICTED.merge} (Merge: Current ↔ Result)`);
            await backToMergeView();

            await vscode().reloadWindow();

            // The comparison's tab is restored in the background, where VS Code does not resolve it.
            await expect
                .poll(tabLabels)
                .toContainEqual(
                    expect.stringContaining(`${CONFLICTED.merge} (Merge: Current ↔ Result)`),
                );
            expect(await activeTabLabel()).not.toContain("Result)");

            await vscode().openFile(conflictedFile("merge"));

            await expect
                .poll(() => modelersIn("active"))
                .toStrictEqual([{ editable: true, diagram: true }]);
        });

        it("lists the notes of a build that kept a task without the flows removed with it", async () => {
            await build(removalFile());
            await vscode().webviewsLoaded();
            await mergeTab(REMOVAL_FILE).click();
            const panes = await mergePanes();
            await expectBarsLevel(panes);

            await pressInMenu(panes.incoming, "Review notes (1)");

            await expect
                .poll(() => panes.incoming.locator(".merge-notes__list").innerText())
                .toContain(
                    "Check feature order is kept without the flows the other side removed with it",
                );
            await shot("build-notes");
        });

        it("lets Git continue the merge once the user staged the built files", async () => {
            await build(conflictedFile("merge"));
            await build(removalFile());
            const repository = await repositoryCopy("merge");
            await writeFile(join(repository, NOTES_FILE), "main and feature\n");
            await runGit(repository, "add", CONFLICTED.merge, REMOVAL_FILE, NOTES_FILE);

            const continued = await gitOutcome(
                repository,
                "-c",
                "core.editor=true",
                "merge",
                "--continue",
            );

            expect(continued.code, continued.output).toBe(0);
            const parents = (await runGit(repository, "log", "-1", "--format=%P")).trim();
            expect(parents.split(" ")).toHaveLength(2);
        });

        it("builds a rebase conflict and lets Git continue the rebase once it is staged", async () => {
            await build(conflictedFile("rebase"));

            await expectBuiltButUnmerged("rebase", "Check feature order");
            await expect.poll(editableModelerShows).toBe(true);
            const repository = await repositoryCopy("rebase");
            await runGit(repository, "add", CONFLICTED.rebase);
            const continued = await gitOutcome(
                repository,
                "-c",
                "core.editor=true",
                "rebase",
                "--continue",
            );
            expect(continued.code, continued.output).toBe(0);
        });
    });
});
