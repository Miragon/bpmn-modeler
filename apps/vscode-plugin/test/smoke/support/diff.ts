import { cp } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { FrameLocator } from "playwright-core";
import { expect } from "vitest";

/** Two versions each of processes and of a decision model, shared with the e2e compare tests. */
const COMPARE_FIXTURES = fileURLToPath(new URL("../../e2e/fixtures/", import.meta.url));

/** The count slots of the legend both diffs share, in their order. */
export const DIFF_LEGEND_SLOTS = [
    "diff-legend__slot diff-legend__slot--added",
    "diff-legend__slot diff-legend__slot--removed",
    "diff-legend__slot diff-legend__slot--changed",
    "diff-legend__slot diff-legend__slot--layout",
];

/** Copies a compare fixture under the name a test opens it by. */
export function copyCompareFixture(fixture: string, to: string): Promise<void> {
    return cp(join(COMPARE_FIXTURES, fixture), to);
}

/** A workspace of compare fixtures, each under the name the suite opens it by. */
export function compareFixtures(
    namesByFixture: Readonly<Record<string, string>>,
): (directory: string) => Promise<void> {
    return async (directory) => {
        for (const [fixture, name] of Object.entries(namesByFixture)) {
            await copyCompareFixture(fixture, join(directory, name));
        }
    };
}

export async function expectMarked(
    webview: FrameLocator,
    elementId: string,
    marker: string,
): Promise<void> {
    await expect
        .poll(() =>
            webview.locator(`.djs-element[data-element-id="${elementId}"]`).getAttribute("class"),
        )
        .toContain(marker);
}

export function legendSlots(webview: FrameLocator): Promise<(string | null)[]> {
    return webview
        .locator(".diff-legend__slot")
        .evaluateAll((slots) => slots.map((slot) => slot.getAttribute("class")));
}
