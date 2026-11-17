import type { FrameLocator } from "playwright-core";
import { describe, expect, it } from "vitest";

import { DIFF_LEGEND_SLOTS, compareFixtures, expectMarked, legendSlots } from "./support/diff";
import { settle } from "./support/modeler";
import { fixtures, smokeSuite } from "./support/smokeSuite";

const DMN_FILE = "smoke.dmn";
const BEFORE_FILE = "shipping.dmn";
const AFTER_FILE = "shipping-v2.dmn";
const DIFF_ADDED = "rgb(0, 230, 118)";
const DIFF_REMOVED = "rgb(205, 24, 57)";

/** The bar a DMN diff draws on the number cell of a rule. */
function ruleBar(webview: FrameLocator, ruleId: string): Promise<string> {
    return webview
        .locator(`td.rule-index[data-row-id="${ruleId}"]`)
        .evaluate((cell) => getComputedStyle(cell).boxShadow);
}

const suite = smokeSuite({
    name: "dmn",
    workspace: async (directory) => {
        await fixtures(DMN_FILE)(directory);
        await compareFixtures({ "shipping.dmn": BEFORE_FILE, "shipping-b.dmn": AFTER_FILE })(
            directory,
        );
    },
});
const { vscode } = suite;

describe("the DMN editor of the packaged extension in a real VS Code", () => {
    it("opens a DMN file in the DMN custom editor", async () => {
        const webview = await suite.open(DMN_FILE, (frame) =>
            frame.getByText("Decision 1").first().isVisible(),
        );

        await settle(webview);
        await suite.screenshot("dmn");
    });

    it("shows a DMN file's changes in the visual diff, down to its decision table", async () => {
        // Open before the context menu: a webview that loads takes the focus, which would close the menu.
        await suite.open(BEFORE_FILE, (frame) =>
            frame.getByText("Choose carrier").first().isVisible(),
        );
        await vscode().runExplorerCommand([BEFORE_FILE, AFTER_FILE], "Compare Selected (DMN)");
        const before = await vscode().editorWebview('body[data-diff-side="before"]');
        const after = await vscode().editorWebview('body[data-diff-side="after"]');

        await expect.poll(() => before.locator(".diff-side-label").textContent()).toBe(BEFORE_FILE);
        await expect.poll(() => after.locator(".diff-side-label").textContent()).toBe(AFTER_FILE);
        expect(await legendSlots(after)).toEqual(DIFF_LEGEND_SLOTS);
        await expectMarked(before, "Decision_Surcharge", "diff-removed");
        await expectMarked(before, "Decision_Shipping", "diff-changed");
        await expectMarked(after, "Input_Insured", "diff-added");
        await expectMarked(after, "Decision_Shipping", "diff-changed");
        await expect.poll(() => after.locator(".diff-legend").textContent()).toContain("Added 2");

        // Next in one pane outlines the same change in both.
        await after.locator(".diff-legend__next-btn").click();
        await expectMarked(after, "Source_Contracts", "diff-selected");
        await expectMarked(before, "Source_Contracts", "diff-selected");
        await settle(after);
        await suite.screenshot("dmn-diff");

        // Opening the decision's table in one pane opens it in the other.
        await after
            .locator(
                '.djs-overlays[data-container-id="Decision_Shipping"] .drill-down-overlay button',
            )
            .click();
        await expect.poll(() => ruleBar(after, "Rule_10")).toContain(DIFF_ADDED);
        await expect.poll(() => ruleBar(before, "Rule_6")).toContain(DIFF_REMOVED);
        await settle(after);
        await suite.screenshot("dmn-diff-table");
    });
});
