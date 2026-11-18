import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { FrameLocator, Page } from "playwright-core";
import { describe, expect, it } from "vitest";

import {
    DIFF_LEGEND_SLOTS,
    compareFixtures,
    copyCompareFixture,
    expectMarked,
    legendSlots,
} from "./support/diff";
import { runGit } from "./support/git";
import { diagramRendered, selectElement, settle } from "./support/modeler";
import { smokeSuite } from "./support/smokeSuite";

const BEFORE_FILE = "example.bpmn";
const AFTER_FILE = "example-v2.bpmn";
/** A Camunda 8 process whose two tasks change only in their zeebe extension elements. */
const XML_DIFF_BEFORE_FILE = "invoice.bpmn";
const XML_DIFF_AFTER_FILE = "invoice-v2.bpmn";
const CHECK_INVOICE_TASK_ID = "Activity_check_invoice";
const APPROVE_INVOICE_TASK_ID = "Activity_approve_invoice";
const SHOW_XML_CHANGES_ENTRY = '.djs-context-pad [data-action="element-xml-changes"]';
/** Rounding of fractional zoom offsets apart, the two panes of a synchronised viewport place an element alike. */
const PANE_ALIGNMENT_TOLERANCE_PX = 2;
/** A Git repository in the workspace whose committed process has a change in the working tree. */
const SCM_REPOSITORY_FOLDER = "scm-repository";
const SCM_DIFF_FILE = "order.bpmn";
/** VS Code names a working-tree change in Source Control by its newer side only. */
const SCM_XML_DIFF_VERSIONS = `${SCM_DIFF_FILE} (Working Tree)`;

interface EditorGroupInWorkbench {
    top: number;
    bottom: number;
    tabs: string;
}

/** The workbench's editor groups from top to bottom, each with the text of its tabs. */
function editorGroupsTopToBottom(page: Page): Promise<EditorGroupInWorkbench[]> {
    return page.locator(".part.editor .editor-group-container").evaluateAll((groups) =>
        groups
            .map((group) => {
                const box = group.getBoundingClientRect();
                const tabs = [...group.querySelectorAll(".tabs-container .tab")];
                return {
                    top: box.top,
                    bottom: box.bottom,
                    tabs: tabs.map((tab) => tab.textContent ?? "").join(" | "),
                };
            })
            .sort((upper, lower) => upper.top - lower.top),
    );
}

interface ElementInPane {
    inView: boolean;
    left: number;
    top: number;
}

/** Where the element sits in the pane's canvas, relative to its top-left corner. */
function elementInPane(webview: FrameLocator, elementId: string): Promise<ElementInPane> {
    return webview.locator(".djs-container").evaluate((container, id) => {
        const view = container.getBoundingClientRect();
        const shape = container.querySelector(`.djs-shape[data-element-id="${id}"]`);
        if (!shape) throw new Error(`no shape ${id} on the canvas`);
        const box = shape.getBoundingClientRect();
        return {
            inView:
                box.left >= view.left &&
                box.right <= view.right &&
                box.top >= view.top &&
                box.bottom <= view.bottom,
            left: box.left - view.left,
            top: box.top - view.top,
        };
    }, elementId);
}

async function paneAlignment(
    before: FrameLocator,
    after: FrameLocator,
    elementId: string,
): Promise<{ inViewBefore: boolean; inViewAfter: boolean; aligned: boolean }> {
    const [inBefore, inAfter] = await Promise.all([
        elementInPane(before, elementId),
        elementInPane(after, elementId),
    ]);
    return {
        inViewBefore: inBefore.inView,
        inViewAfter: inAfter.inView,
        aligned:
            Math.abs(inBefore.left - inAfter.left) <= PANE_ALIGNMENT_TOLERANCE_PX &&
            Math.abs(inBefore.top - inAfter.top) <= PANE_ALIGNMENT_TOLERANCE_PX,
    };
}

function selectedElementIds(webview: FrameLocator): Promise<string[]> {
    return webview
        .locator(".djs-shape.selected, .djs-connection.selected")
        .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("data-element-id") ?? ""),
        );
}

/** Monaco renders each space as a no-break space. */
async function textDiffLines(page: Page): Promise<string> {
    const sides = await page
        .locator(".part.editor .monaco-diff-editor .view-lines")
        .allTextContents();
    return sides.join("\n").replaceAll(" ", " ");
}

const suite = smokeSuite({
    name: "bpmn-diff",
    workspace: compareFixtures({
        "example.bpmn": BEFORE_FILE,
        "example-b.bpmn": AFTER_FILE,
        "invoice.bpmn": XML_DIFF_BEFORE_FILE,
        "invoice-b.bpmn": XML_DIFF_AFTER_FILE,
    }),
});
const { vscode } = suite;

/**
 * Compares two files from the Explorer's context menu, as a user does. The
 * first one is open by then: a webview that loads takes the focus, which
 * would close the menu.
 */
async function compareFromExplorer(beforeFile: string, afterFile: string) {
    await suite.open(beforeFile, diagramRendered);
    await vscode().runExplorerCommand([beforeFile, afterFile], "Compare Selected (BPMN)");
    return {
        before: await vscode().editorWebview('body[data-diff-side="before"]'),
        after: await vscode().editorWebview('body[data-diff-side="after"]'),
    };
}

describe("the BPMN visual diff in a real VS Code", () => {
    it("shows a BPMN file's changes in the visual diff under the shared legend", async () => {
        const { before, after } = await compareFromExplorer(BEFORE_FILE, AFTER_FILE);

        await expectMarked(after, "Activity_review", "diff-added");
        await expect.poll(() => after.locator(".diff-legend").textContent()).toContain("Added 2");
        await expect.poll(() => before.locator(".diff-side-label").textContent()).toBe(BEFORE_FILE);
        await expect.poll(() => after.locator(".diff-side-label").textContent()).toBe(AFTER_FILE);
        expect(await legendSlots(after)).toEqual(DIFF_LEGEND_SLOTS);
        expect(await after.locator(".diff-legend__swap-btn").isVisible()).toBe(true);

        // Next in one pane outlines the same change in both.
        await after.locator(".diff-legend__next-btn").click();
        await expect
            .poll(() => after.locator(".djs-element.diff-selected").count())
            .toBeGreaterThan(0);
        await settle(after);
        await suite.screenshot("bpmn-diff");
    });

    it("shows an element's XML changes in a text diff below the BPMN diff that follows the selection", async () => {
        const page = vscode().page;
        const { before, after } = await compareFromExplorer(
            XML_DIFF_BEFORE_FILE,
            XML_DIFF_AFTER_FILE,
        );
        await expectMarked(after, CHECK_INVOICE_TASK_ID, "diff-changed");
        await expectMarked(after, APPROVE_INVOICE_TASK_ID, "diff-changed");
        expect(await editorGroupsTopToBottom(page)).toHaveLength(1);

        await selectElement(after, CHECK_INVOICE_TASK_ID);
        await after.locator(SHOW_XML_CHANGES_ENTRY).click();

        await expect
            .poll(async () => (await editorGroupsTopToBottom(page))[1]?.tabs ?? "")
            .toContain(CHECK_INVOICE_TASK_ID);
        const [diagramGroup, xmlGroup] = await editorGroupsTopToBottom(page);
        expect(diagramGroup.tabs).toContain(XML_DIFF_BEFORE_FILE);
        expect(diagramGroup.tabs).not.toContain(CHECK_INVOICE_TASK_ID);
        expect(xmlGroup.top).toBeGreaterThanOrEqual(diagramGroup.bottom - 1);
        await expect.poll(() => textDiffLines(page)).toContain("=invoice.totalAmount");
        const checkInvoiceDiff = await textDiffLines(page);
        expect(checkInvoiceDiff).toContain("=invoice.amount");
        expect(checkInvoiceDiff).toContain("rejectionReason");
        expect(checkInvoiceDiff).not.toContain("candidateGroups");
        // The group below shrinks both diagram panes; the selection stays in sight in both, alike.
        await expect
            .poll(() => paneAlignment(before, after, CHECK_INVOICE_TASK_ID))
            .toEqual({ inViewBefore: true, inViewAfter: true, aligned: true });
        await settle(after);
        await settle(page);
        await suite.screenshot("bpmn-diff-element-xml");

        await selectElement(after, APPROVE_INVOICE_TASK_ID);

        await expect
            .poll(async () => (await editorGroupsTopToBottom(page))[1]?.tabs ?? "")
            .toContain(APPROVE_INVOICE_TASK_ID);
        await expect.poll(() => textDiffLines(page)).toContain("accounting, management");
        expect(await textDiffLines(page)).not.toContain("=invoice.totalAmount");
        const groups = await editorGroupsTopToBottom(page);
        expect(groups).toHaveLength(2);
        expect(groups[1].tabs).not.toContain(CHECK_INVOICE_TASK_ID);
        await settle(after);
        await settle(page);
        await suite.screenshot("bpmn-diff-element-xml-follow");

        // A step selects the first change, Check invoice, in both panes, and the text diff follows it.
        await after.locator(".diff-legend__next-btn").click();

        await expect
            .poll(async () => (await editorGroupsTopToBottom(page))[1]?.tabs ?? "")
            .toContain(CHECK_INVOICE_TASK_ID);
        await expect.poll(() => textDiffLines(page)).toContain("=invoice.totalAmount");
        for (const pane of [before, after]) {
            await expect.poll(() => selectedElementIds(pane)).toEqual([CHECK_INVOICE_TASK_ID]);
        }
        expect(await after.locator(SHOW_XML_CHANGES_ENTRY).isVisible()).toBe(true);
        expect(await editorGroupsTopToBottom(page)).toHaveLength(2);
    });

    it("shows an element's XML changes from a Source Control diff under a title that names both versions", async () => {
        const page = vscode().page;
        const repository = suite.file(SCM_REPOSITORY_FOLDER);
        await mkdir(repository);
        await copyCompareFixture("invoice.bpmn", join(repository, SCM_DIFF_FILE));
        await runGit(repository, "init", "-q");
        await runGit(repository, "add", SCM_DIFF_FILE);
        await runGit(repository, "commit", "-q", "--no-verify", "-m", "Add the order process");
        await copyCompareFixture("invoice-b.bpmn", join(repository, SCM_DIFF_FILE));

        await vscode().setGitEnabled(true);
        await vscode().openSourceControlChange(SCM_DIFF_FILE);
        const after = await vscode().editorWebview('body[data-diff-side="after"]');
        await expectMarked(after, CHECK_INVOICE_TASK_ID, "diff-changed");

        await selectElement(after, CHECK_INVOICE_TASK_ID);
        await after.locator(SHOW_XML_CHANGES_ENTRY).click();

        await expect
            .poll(async () => (await editorGroupsTopToBottom(page))[1]?.tabs ?? "")
            .toContain(CHECK_INVOICE_TASK_ID);
        const [diagramGroup, xmlGroup] = await editorGroupsTopToBottom(page);
        expect(diagramGroup.tabs).toContain(SCM_DIFF_FILE);
        expect(xmlGroup.tabs).toContain("(XML)");
        expect(xmlGroup.tabs).toContain(SCM_DIFF_FILE);
        expect(xmlGroup.tabs).toContain(SCM_XML_DIFF_VERSIONS);
        await expect.poll(() => textDiffLines(page)).toContain("=invoice.totalAmount");
        expect(await textDiffLines(page)).toContain("=invoice.amount");
        await settle(after);
        await settle(page);
        await suite.screenshot("bpmn-scm-diff-element-xml");
    });
});
