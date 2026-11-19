import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type { FrameLocator, Locator } from "playwright-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    FEATURE_INPUT_TARGET,
    HAND_MERGE_FILE,
    HAND_MERGE_REPOSITORY,
    handMergeRepository,
    MAIN_JOB_TYPE,
} from "./support/mergeConflicts";
import { settle } from "./support/modeler";
import { smokeSuite } from "./support/smokeSuite";
import { fileUri } from "./support/vscodeDriver";
import { COMMAND_KEY } from "./vscodeSession";

/**
 * Merge XML in a real VS Code: a picked element whose base, current and
 * incoming texts all differ opens in VS Code's own merge editor below the
 * merge view, which takes the one-sided edits itself. Accepting marks both
 * panes and the build holds both edits; closing without a save changes
 * nothing; a changed type is refused and Edit again reopens the refused
 * text; a pick that would drop the merge asks first; and an XML diff that
 * follows a step never takes the merge editor's place. The edit of the
 * result text goes through the driver: what the user does with the text is
 * under test, not the keystrokes.
 */

const OPEN_MERGE_VIEW = "bpmn-modeler.openBpmnMergeView";
const RESULT_SCHEME = "bpmn-merge-result";
const ACCEPT_TITLE = "Accept Element XML Merge";
const KEY_RETRY_INTERVAL_MS = 1_000;

const suite = smokeSuite({
    name: "merge-xml",
    async workspace(directory) {
        await handMergeRepository(directory);
    },
    // The docs' pictures of Merge XML are this suite's screenshots.
    colorTheme: "Default Light Modern",
    customEditors: {},
    git: true,
});
const { vscode } = suite;

const conflictedFile = () => suite.file(HAND_MERGE_REPOSITORY, HAND_MERGE_FILE);

interface MergePanes {
    current: FrameLocator;
    incoming: FrameLocator;
}

async function shot(name: string): Promise<void> {
    for (const { page } of await vscode().visibleEditors()) {
        if (
            (await page
                .locator(".djs-container")
                .count()
                .catch(() => 0)) > 0
        )
            await settle(page);
    }
    await settle(vscode().page);
    await suite.screenshot(name, { hideNotifications: true });
}

async function mergePanes(): Promise<MergePanes> {
    return {
        current: await vscode().editorWebview('body[data-diff-side="before"]'),
        incoming: await vscode().editorWebview('body[data-diff-side="after"]'),
    };
}

async function openCount(incoming: FrameLocator): Promise<string> {
    return (
        (await incoming.locator(".merge-bar__position").getAttribute("data-merge-tooltip")) ?? ""
    );
}

async function openMergeView(): Promise<MergePanes> {
    await vscode().executeCommand(OPEN_MERGE_VIEW, fileUri(conflictedFile()));
    const panes = await mergePanes();
    await expect.poll(() => openCount(panes.incoming)).toBe("2 open conflicts");
    return panes;
}

/** The keyboard's way: focus the button and press Enter, no click. */
async function press(pane: FrameLocator, name: string): Promise<void> {
    const target = pane.getByRole("button", { name, exact: true });
    await target.waitFor({ state: "visible" });
    await target.focus();
    await vscode().page.keyboard.press("Enter");
}

function padEntry(pane: FrameLocator, name: string): Locator {
    return pane.locator(".djs-context-pad").getByRole("button", { name, exact: true });
}

function outcomeCard(pane: FrameLocator): Locator {
    return pane.locator(".merge-outcome-card");
}

function badgeLabels(pane: FrameLocator): Promise<string[]> {
    return pane
        .locator(".merge-pick-badge")
        .evaluateAll((badges) =>
            badges
                .filter((badge) => badge.checkVisibility())
                .map((badge) => badge.getAttribute("aria-label") ?? ""),
        );
}

/** Steps to the first open conflict, Task_Check, and keeps incoming's version on its pad. */
async function keepCheckFromIncoming({ incoming }: MergePanes): Promise<void> {
    await press(incoming, "Next change");
    await padEntry(incoming, "Keep incoming").click();
    await expect.poll(() => openCount(incoming)).toBe("1 open conflict");
}

/** The labels of every tab, group by group. */
async function tabLabels(): Promise<string[]> {
    return (await vscode().tabsByGroup()).flat().map(({ label }) => label);
}

/** The merge editor's tabs, of one element or all: VS Code titles each after the result's path. */
async function mergeEditorTabs(elementId = ""): Promise<string[]> {
    return (await tabLabels()).filter(
        (label) => label.includes(`${elementId}.xml`) && !label.includes(" (XML): "),
    );
}

/** The text of the result VS Code's merge editor shows for an element, as edited. */
async function resultText(elementId: string): Promise<string | undefined> {
    const results = await vscode().documentTexts(RESULT_SCHEME);
    return results.find(({ path }) => path.endsWith(`/${elementId}.xml`))?.text;
}

async function openMergeXml(pane: FrameLocator, elementId: string): Promise<void> {
    await padEntry(pane, "Merge XML").click();
    await expect.poll(() => mergeEditorTabs(elementId)).toHaveLength(1);
    await expect.poll(() => resultText(elementId)).toBeDefined();
}

function editorGroupOf(tabText: string): Locator {
    return vscode()
        .page.locator(".editor-group-container")
        .filter({ has: vscode().page.locator(".tabs-container .tab", { hasText: tabText }) })
        .first();
}

function acceptButton(): Locator {
    return vscode()
        .page.locator(".editor-group-container.active .editor-actions")
        .locator(`[aria-label^="${ACCEPT_TITLE}"]`)
        .first();
}

/** The title button: VS Code's merge editor saves the result and closes, which finishes the merge. */
async function acceptInTitle(elementId: string): Promise<void> {
    await editorGroupOf(`${elementId}.xml`).locator(".tabs-container .tab").first().click();
    await acceptButton().click();
    await expect.poll(() => mergeEditorTabs(elementId)).toHaveLength(0);
}

const dialog = () => vscode().page.locator(".monaco-dialog-box");

/** Closes the element's merge editor by its tab, answering a save prompt with Don't Save. */
async function closeWithoutSaving(elementId: string): Promise<void> {
    const tab = vscode()
        .page.locator(".tabs-container .tab")
        .filter({ hasText: `${elementId}.xml` })
        .first();
    await tab.hover();
    await tab.locator(".tab-actions .action-label").first().click();
    await expect
        .poll(async () => {
            if (await dialog().isVisible()) {
                await dialog()
                    .getByRole("button", { name: /Don't Save|Discard/ })
                    .first()
                    .click();
            }
            return mergeEditorTabs(elementId);
        })
        .toHaveLength(0);
}

// The reset closes editors without answering a merge editor's save prompt, so each test closes its own.
afterEach(async () => {
    for (const label of await mergeEditorTabs()) {
        await closeWithoutSaving(label.replace(/^.*?(\w+)\.xml.*$/, "$1"));
    }
});

beforeEach(async () => {
    await expect
        .poll(async () => (await vscode().unmergedFiles()).map((file) => basename(file)))
        .toEqual([HAND_MERGE_FILE]);
    await vscode().executeCommand("workbench.view.scm");
});

describe("Merge XML", () => {
    it("offers Merge XML on the pad of a picked element whose three texts differ, on both panes", async () => {
        const panes = await openMergeView();
        await press(panes.incoming, "Next change");
        await padEntry(panes.incoming, "Keep incoming").waitFor({ state: "visible" });
        expect(await padEntry(panes.incoming, "Merge XML").count()).toBe(0);

        await padEntry(panes.incoming, "Keep incoming").click();

        for (const pane of [panes.current, panes.incoming]) {
            await padEntry(pane, "Merge XML").waitFor({ state: "visible" });
        }
        // Merge XML takes Keep incoming's place under the resting pointer, and the tooltip
        // shows only once the pointer moves, so it moves off the pad first.
        await expect
            .poll(async () => {
                await panes.incoming.locator(".merge-bar__caption").hover();
                await padEntry(panes.incoming, "Merge XML").hover();
                return panes.incoming
                    .locator(".merge-tooltip:not([hidden])")
                    .innerText({ timeout: 1_000 })
                    .catch(() => "");
            })
            .toBe("Merge XML: Merge both sides' changes to its XML by hand in a merge editor");
        await shot("merge-xml-pad-entry");
    });

    it("opens the XML below the diagrams, with both one-sided edits taken and the true conflict left at base", async () => {
        const panes = await openMergeView();
        await keepCheckFromIncoming(panes);
        await press(panes.incoming, "Next change");
        await padEntry(panes.incoming, "Keep incoming").click();
        await expect.poll(() => openCount(panes.incoming)).toBe("No open conflicts");

        await openMergeXml(panes.incoming, "Task_Ship");

        const result = (await resultText("Task_Ship")) ?? "";
        expect(result).toContain(`type="${MAIN_JOB_TYPE}"`);
        expect(result).toContain(`target="${FEATURE_INPUT_TARGET}"`);
        expect(result).toContain('name="Ship order"');
        expect(result).not.toContain("<<<<<<<");
        const mergeView = await editorGroupOf("(Merge: ").boundingBox();
        const mergeEditor = await editorGroupOf("Task_Ship.xml").boundingBox();
        expect(mergeEditor!.y).toBeGreaterThanOrEqual(mergeView!.y + mergeView!.height - 1);
        await acceptButton().waitFor({ state: "visible" });
        await shot("merge-xml-editor");
    });

    it("opens the selected element's merge editor by its key", async () => {
        const panes = await openMergeView();
        await keepCheckFromIncoming(panes);
        await padEntry(panes.incoming, "Merge XML").waitFor({ state: "visible" });

        await expect
            .poll(
                async () => {
                    if ((await mergeEditorTabs("Task_Check")).length === 0) {
                        await vscode().page.keyboard.press(`${COMMAND_KEY}+k`);
                        await vscode().page.keyboard.press("x");
                    }
                    return mergeEditorTabs("Task_Check");
                },
                { interval: KEY_RETRY_INTERVAL_MS },
            )
            .toHaveLength(1);
    });

    it("marks a merge accepted in the title on both panes, and the build holds both edits", async () => {
        const panes = await openMergeView();
        await keepCheckFromIncoming(panes);
        await openMergeXml(panes.incoming, "Task_Check");

        await acceptInTitle("Task_Check");

        for (const pane of [panes.current, panes.incoming]) {
            await expect
                .poll(() => badgeLabels(pane))
                .toEqual(["Kept from incoming and merged by hand, your pick"]);
        }
        expect(await panes.incoming.locator(".merge-pick-badge__by-hand:visible").count()).toBe(1);
        await expect
            .poll(() => outcomeCard(panes.incoming).innerText())
            .toContain("Merged by hand: Check order");
        await padEntry(panes.incoming, "Edit merged XML").waitFor({ state: "visible" });
        await shot("merge-xml-badge");

        await press(panes.incoming, "Next change");
        await padEntry(panes.incoming, "Keep incoming").click();
        await expect.poll(() => openCount(panes.incoming)).toBe("No open conflicts");
        await press(panes.incoming, "Build");

        await expect.poll(() => readFile(conflictedFile(), "utf8")).not.toContain("<<<<<<<");
        const built = await readFile(conflictedFile(), "utf8");
        const check = built.slice(
            built.indexOf('id="Task_Check"'),
            built.indexOf('id="Task_Ship"'),
        );
        expect(check).toContain(`type="${MAIN_JOB_TYPE}"`);
        expect(check).toContain(`target="${FEATURE_INPUT_TARGET}"`);
    });

    it("changes nothing when the merge editor closes without a save", async () => {
        const panes = await openMergeView();
        await keepCheckFromIncoming(panes);
        await openMergeXml(panes.incoming, "Task_Check");

        await closeWithoutSaving("Task_Check");

        await expect
            .poll(() => outcomeCard(panes.incoming).innerText())
            .toContain("Closed without saving: Check order is unchanged");
        expect(await badgeLabels(panes.incoming)).toEqual(["Kept from incoming, your pick"]);
    });

    it("refuses a changed type, and Edit again reopens the refused text", async () => {
        const panes = await openMergeView();
        await keepCheckFromIncoming(panes);
        await openMergeXml(panes.incoming, "Task_Check");

        await vscode().replaceInDocuments(RESULT_SCHEME, "<bpmn:serviceTask", "<bpmn:userTask");
        await vscode().replaceInDocuments(RESULT_SCHEME, "</bpmn:serviceTask>", "</bpmn:userTask>");
        await acceptInTitle("Task_Check");

        const card = outcomeCard(panes.incoming);
        await expect
            .poll(() => card.innerText())
            .toContain("The XML of Check order changes its type");
        expect(await card.innerText()).toContain(
            "It is a bpmn:UserTask now; keep it a bpmn:ServiceTask.",
        );
        expect(await badgeLabels(panes.incoming)).toEqual(["Kept from incoming, your pick"]);
        await card.getByRole("button", { name: "Keep incoming's version" }).waitFor();
        await shot("merge-xml-refused");

        await card.getByRole("button", { name: "Edit again" }).click();

        await expect.poll(() => mergeEditorTabs("Task_Check")).toHaveLength(1);
        await expect.poll(() => resultText("Task_Check")).toContain("<bpmn:userTask");
    });

    it("asks before a pick of the other side drops the XML merged by hand, and drops it on request", async () => {
        const panes = await openMergeView();
        await keepCheckFromIncoming(panes);
        await openMergeXml(panes.incoming, "Task_Check");
        await acceptInTitle("Task_Check");
        await expect
            .poll(() => badgeLabels(panes.current))
            .toEqual(["Kept from incoming and merged by hand, your pick"]);

        await padEntry(panes.current, "Keep current").click();

        const card = outcomeCard(panes.current);
        await expect
            .poll(() => card.innerText())
            .toContain("This drops the XML you merged by hand for Check order");
        expect(await badgeLabels(panes.current)).toEqual([
            "Kept from incoming and merged by hand, your pick",
        ]);
        await card.getByRole("button", { name: "Drop it and pick" }).click();

        await expect
            .poll(() => badgeLabels(panes.current))
            .toEqual(["Kept from current, your pick"]);
    });

    it("moves an open XML diff with a step and leaves the merge editor where it is", async () => {
        const panes = await openMergeView();
        await keepCheckFromIncoming(panes);
        await padEntry(panes.incoming, "Show XML changes").click();
        await expect
            .poll(async () => (await tabLabels()).some((label) => label.includes(" (XML): ")))
            .toBe(true);
        await openMergeXml(panes.incoming, "Task_Check");
        const xmlDiffOf = async () =>
            (await tabLabels()).filter((label) => label.includes(" (XML): "));
        const before = await xmlDiffOf();

        await press(panes.incoming, "Next change");

        await expect.poll(() => xmlDiffOf()).not.toEqual(before);
        expect(await xmlDiffOf()).toHaveLength(1);
        expect(await mergeEditorTabs("Task_Check")).toHaveLength(1);
        expect(await resultText("Task_Check")).toBeDefined();
    });
});
