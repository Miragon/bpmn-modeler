import type { Locator } from "playwright-core";
import { describe, expect, it } from "vitest";

import { COLOR_THEMES, diagramRendered, settle } from "./support/modeler";
import { fixtures, smokeSuite } from "./support/smokeSuite";

const BPMN_FILE = "smoke.bpmn";
const TEMPLATE_FILE = "smoke-template.json";
const TEMPLATE_FIELD = "Recipient";
/** The Add-ons view's frame, which tells its page from the Deploy view's. */
const ADD_ONS_VIEW = 'main[aria-label="Add-ons"]';

type ColorTheme = (typeof COLOR_THEMES)[number];

const suite = smokeSuite({ name: "themes", workspace: fixtures(BPMN_FILE, TEMPLATE_FILE) });
const { vscode } = suite;

/** Switches VS Code's theme and waits until the workbench and the webview's page carry it. */
async function switchTheme(theme: ColorTheme, html: Locator): Promise<void> {
    // A focused canvas or field would show its focus mark in the screenshot.
    await html.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await vscode().setColorTheme(theme.name);
    await expect.poll(() => vscode().workbenchHasClass(theme.workbenchClass)).toBe(true);
    await expect
        .poll(() =>
            html.evaluate((_, name) => document.body.classList.contains(name), theme.bodyClass),
        )
        .toBe(true);
}

describe("VS Code's color themes in the packaged extension's webviews", () => {
    it.each(COLOR_THEMES)("shows the BPMN editor in the $name theme", async (theme) => {
        const webview = await suite.open(BPMN_FILE, diagramRendered);
        const html = webview.locator("html");

        await switchTheme(theme, html);

        await expect.poll(() => html.getAttribute("data-bpmn-theme")).toBe(theme.modelerTheme);
        expect(await diagramRendered(webview)).toBe(true);
        await settle(webview);
        await suite.screenshot(`bpmn-${theme.id}`);
    });

    it.each(COLOR_THEMES)("shows the element template editor in the $name theme", async (theme) => {
        await vscode().evaluate(async (api, file) => {
            await api.commands.executeCommand(
                "vscode.openWith",
                api.Uri.file(file),
                "bpmn-modeler.elementTemplateEditor",
            );
        }, suite.file(TEMPLATE_FILE));
        const webview = vscode().webview();
        // The preview beside the builder shows the template's field once both have rendered.
        await webview
            .locator("#js-properties-panel")
            .getByText(TEMPLATE_FIELD, { exact: true })
            .first()
            .waitFor();

        await switchTheme(theme, webview.locator("html"));

        await settle(webview);
        await suite.screenshot(`template-editor-${theme.id}`);
    });

    it("marks the Add-ons view with the brand mode of each theme", async () => {
        await vscode().executeCommand("bpmn-modeler.addOnsView.focus");
        const html = (await vscode().viewWebview(ADD_ONS_VIEW)).locator("html");

        for (const theme of COLOR_THEMES) {
            await vscode().setColorTheme(theme.name);
            await expect
                .poll(async () => ({
                    theme: await html.getAttribute("data-cd-theme"),
                    contrast: await html.getAttribute("data-cd-kontrast"),
                }))
                .toEqual(theme.brandMode);
        }
    });
});
