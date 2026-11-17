import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { FrameLocator, Locator } from "playwright-core";
import { describe, expect, it } from "vitest";

import { diagramRendered, expectAbsentFor, isFocused, settle } from "./support/modeler";
import { fixtures, smokeSuite } from "./support/smokeSuite";

/** Its own `.camunda/plugins`, so only diagrams below it are offered the plugin. */
const PLUGIN_FOLDER = "bpmn-plugin";
const PLUGIN_FILE = "plugin-smoke.bpmn";
const PLUGIN_DIAGRAM = join(PLUGIN_FOLDER, PLUGIN_FILE);
const PLUGIN_NAME = "Smoke trace";
const PLUGIN_NOTICE = "1 BPMN plugin in this workspace is not allowed yet.";
const PLUGIN_BADGE_COLOR = "rgb(255, 0, 255)";
/** The Add-ons view's frame, which tells its page from the Deploy view's. */
const ADD_ONS_VIEW = 'main[aria-label="Add-ons"]';
const REVIEW_FACTS = ["Folder", "Allowed in"];
// The editor opens before its plugin notice, so a notice may follow the render.
const NOTICE_WINDOW_MS = 3_000;

/** The class and the badge the fixture plugin's module adds when bpmn-js builds it. */
function pluginTraceOnCanvas(webview: FrameLocator): Promise<number> {
    return webview.locator(".djs-container.smoke-plugin-trace .smoke-plugin-badge").count();
}

async function diagramWithPluginRendered(webview: FrameLocator): Promise<boolean> {
    return (await diagramRendered(webview)) && (await pluginTraceOnCanvas(webview)) === 1;
}

async function diagramWithoutPluginRendered(webview: FrameLocator): Promise<boolean> {
    return (await diagramRendered(webview)) && (await pluginTraceOnCanvas(webview)) === 0;
}

/** The add-on's row in the Add-ons list; a click selects it and opens its details in the editor tab. */
function addOnRow(addOns: FrameLocator, name: string): Locator {
    return addOns.locator(".av-row", { has: addOns.locator(".av-row-title", { hasText: name }) });
}

/** The add-on's details in the editor tab "Add-on: …". */
function addOnDetail(detailPage: FrameLocator, name: string): Locator {
    return detailPage.getByRole("article", { name });
}

/** Whether the frame's own document holds the keyboard focus. */
function hasFocus(frame: FrameLocator): Promise<boolean> {
    return frame
        .locator("body")
        .evaluate(() => document.hasFocus())
        .catch(() => false);
}

async function cachedPluginScripts(globalStorageDirectory: string): Promise<string[]> {
    const files = await readdir(globalStorageDirectory, { recursive: true }).catch(
        (): string[] => [],
    );
    return files.filter((file) => /[\\/]bpmn-plugins[\\/][0-9a-f]+[\\/]plugin\.js$/.test(file));
}

// An allowance is stored for the user, so every test starts on a profile that holds none.
const suite = smokeSuite({
    name: "add-ons",
    workspace: fixtures(PLUGIN_FOLDER),
    freshProfile: true,
});
const { vscode } = suite;

const page = () => vscode().page;
const pluginNotice = () =>
    page().locator(".notifications-toasts .notification-toast").filter({ hasText: PLUGIN_NOTICE });

/** Review… marks the plugin in the Add-ons list and opens its details in an editor tab, with the review open. */
async function reviewPluginFromNotice() {
    await pluginNotice().getByRole("button", { name: "Review…" }).click();
    const addOns = await vscode().viewWebview(ADD_ONS_VIEW);
    const detailPage = await vscode().editorWebview(ADD_ONS_VIEW);
    const detail = addOnDetail(detailPage, PLUGIN_NAME);
    await detail.waitFor();
    return { addOns, detailPage, detail };
}

const allowButton = (detail: Locator) =>
    detail.locator(".av-review-end").getByRole("button", { name: "Allow", exact: true });

/**
 * A click on a details page that has just rendered can be lost, so it repeats
 * until the page reports the result. The button is gone once its action ran.
 */
async function clickUntilReported(
    button: Locator,
    detailPage: FrameLocator,
    result: string,
): Promise<void> {
    const reported = () =>
        detailPage
            .getByRole("status")
            .textContent({ timeout: 1_000 })
            .catch(() => null);
    await expect
        .poll(
            async () => {
                if ((await reported()) === result) return result;
                await button.click({ timeout: 1_000 }).catch(() => undefined);
                return reported();
            },
            { interval: 500 },
        )
        .toBe(result);
}

describe("workspace bpmn-js plugins and the Add-ons view in a real VS Code", () => {
    it("opens a diagram without its workspace plugin until the plugin is allowed, then reloads with it", async () => {
        const webview = await suite.open(PLUGIN_DIAGRAM, diagramRendered);
        expect(await pluginTraceOnCanvas(webview)).toBe(0);

        const { addOns, detailPage, detail } = await reviewPluginFromNotice();

        expect(
            await page()
                .locator(".tab", { hasText: `Add-on: ${PLUGIN_NAME}` })
                .count(),
        ).toBe(1);
        expect(await addOns.locator(".av-back").isVisible()).toBe(false);
        await expect.poll(() => hasFocus(detailPage)).toBe(true);
        expect(await addOnRow(addOns, PLUGIN_NAME).getAttribute("aria-current")).toBe("true");
        expect(await page().locator(".quick-input-widget").isVisible()).toBe(false);
        expect(await detail.locator(".av-state-line").textContent()).toContain("Not allowed yet");
        expect(await addOnRow(addOns, PLUGIN_NAME).locator(".av-status-word").textContent()).toBe(
            "Waiting",
        );
        expect(await detail.locator(".av-facts dt").allTextContents()).toEqual(
            expect.arrayContaining(REVIEW_FACTS),
        );

        // Allow ends the review, so Tab reaches it within the tab's page.
        const allow = allowButton(detail);
        for (let presses = 0; presses < 10 && !(await isFocused(allow)); presses++) {
            await page().keyboard.press("Tab");
        }
        expect(await isFocused(allow)).toBe(true);
        await page().keyboard.press("Enter");
        await expect
            .poll(() => detailPage.getByRole("status").textContent())
            .toBe(`Allowed ${PLUGIN_NAME}. Open editors reload with it.`);
        // The tab's page has no row, so focus goes to the heading of its details.
        await expect.poll(() => isFocused(detail.locator(".av-detail-name"))).toBe(true);

        // The details tab sits in the diagram's group, in front of it.
        await vscode().closeEditorTab(/^Add-on: /);
        await vscode().showInCustomEditor(PLUGIN_FILE, diagramWithPluginRendered);
        const reloaded = vscode().webview();
        expect(
            await reloaded
                .locator(".smoke-plugin-badge")
                .evaluate((badge) => getComputedStyle(badge).backgroundColor),
        ).toBe(PLUGIN_BADGE_COLOR);
        // The webview loads the approved copy from global storage, never the workspace file.
        const scriptUrls = await reloaded
            .locator("script[src]")
            .evaluateAll((scripts) => scripts.map((script) => script.getAttribute("src")));
        const pluginScriptUrls = scriptUrls.filter((url) => url?.includes("/bpmn-plugins/"));
        expect(pluginScriptUrls).toHaveLength(1);
        expect(pluginScriptUrls[0]).toContain("/globalStorage/");
        expect(pluginScriptUrls[0]).not.toContain(suite.file());
        expect(
            await cachedPluginScripts(
                join(suite.rootDirectory(), "user-data", "User", "globalStorage"),
            ),
        ).toHaveLength(1);
        await expect.poll(() => pluginNotice().count()).toBe(0);
        await settle(reloaded);
        await suite.screenshot("bpmn-plugin");
    });

    it("revokes an allowed plugin from the Add-ons view and reloads the diagram without it", async () => {
        await suite.open(PLUGIN_DIAGRAM, diagramRendered);
        const review = await reviewPluginFromNotice();
        await clickUntilReported(
            allowButton(review.detail),
            review.detailPage,
            `Allowed ${PLUGIN_NAME}. Open editors reload with it.`,
        );
        await vscode().closeEditorTab(/^Add-on: /);
        await vscode().showInCustomEditor(PLUGIN_FILE, diagramWithPluginRendered);

        await vscode().executeCommand("bpmn-modeler.addOnsView.focus");
        const addOns = await vscode().viewWebview(ADD_ONS_VIEW);
        await addOnRow(addOns, PLUGIN_NAME).click();
        const detailPage = await vscode().editorWebview(ADD_ONS_VIEW);
        const detail = addOnDetail(detailPage, PLUGIN_NAME);
        await detail.waitFor();
        await clickUntilReported(
            detail.getByRole("button", { name: "Revoke" }),
            detailPage,
            `Revoked ${PLUGIN_NAME}. Open editors reload without it.`,
        );

        await settle(detailPage);
        await suite.screenshot("add-ons-view");
        await vscode().closeEditorTab(/^Add-on: /);
        await vscode().showInCustomEditor(PLUGIN_FILE, diagramWithoutPluginRendered);
        // A revoke from the view is an answer: no notice asks about the plugin again.
        await expectAbsentFor(pluginNotice(), NOTICE_WINDOW_MS);
    });

    it("opens the Add-ons view on what needs review from Review Add-ons", async () => {
        const searchOf = (addOns: FrameLocator) =>
            addOns.getByRole("searchbox", { name: "Search add-ons" });
        const allKindsOf = (addOns: FrameLocator) => addOns.getByRole("radio", { name: /^All,/ });
        await suite.open(PLUGIN_DIAGRAM, diagramRendered);
        await vscode().executeCommand("bpmn-modeler.addOnsView.focus");
        const filtered = await vscode().viewWebview(ADD_ONS_VIEW);
        await filtered.getByRole("button", { name: "Search add-ons" }).click();
        await searchOf(filtered).fill("zzz");
        await filtered.getByRole("radio", { name: /^Templates,/ }).click();
        await vscode().executeCommand("workbench.view.explorer");

        await vscode().runCommand("Review Add-ons");

        const addOns = await vscode().viewWebview(ADD_ONS_VIEW);
        await expect
            .poll(async () => ({
                allKinds: await allKindsOf(addOns).getAttribute("aria-checked"),
                // The field may be closed by now; its value is what counts.
                search: await addOns.locator('input[type="search"]').inputValue(),
                attention: await addOns
                    .locator(".av-attention")
                    .getByRole("button", { name: new RegExp(PLUGIN_NAME) })
                    .count(),
                current: await addOnRow(addOns, PLUGIN_NAME).getAttribute("aria-current"),
            }))
            .toEqual({ allKinds: "true", search: "", attention: 1, current: "true" });
        await expect.poll(() => isFocused(addOnRow(addOns, PLUGIN_NAME))).toBe(true);
        await expect
            .poll(() => addOns.locator('.av-vh[aria-live="polite"]').textContent())
            .toMatch(/needs? review/);
        await settle(addOns);
        await suite.screenshot("add-ons-review");
        // The view is the answer: no toast says what needs review.
        expect(
            await page()
                .locator(".notifications-toasts .notification-toast")
                .filter({ hasText: /needs? review/i })
                .count(),
        ).toBe(0);
    });

    it("loads the Add-ons view's Geist fonts within its policy", async () => {
        await vscode().executeCommand("bpmn-modeler.addOnsView.focus");
        const addOns = await vscode().viewWebview(ADD_ONS_VIEW);

        // The text shows in Geist; Geist Mono only shows in a review's hash, so it is asked for.
        const faces = await addOns.locator("html").evaluate(async () => {
            await document.fonts.load('13px "Geist Mono Variable"', "0");
            await document.fonts.ready;
            return [...document.fonts]
                .filter(({ status }) => status === "loaded")
                .map(({ family }) => family.replace(/"/g, ""));
        });

        expect(faces).toEqual(expect.arrayContaining(["Geist Variable", "Geist Mono Variable"]));
    });
});
