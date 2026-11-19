import { readFile, writeFile } from "node:fs/promises";

import type { FrameLocator } from "playwright-core";
import { describe, expect, it } from "vitest";

import { jsonInFile, settle } from "./support/modeler";
import { fixtures, smokeSuite } from "./support/smokeSuite";
import { COMMAND_KEY } from "./vscodeSession";

const FORM_FILE = "smoke.form";
const PLATFORMS = ["Camunda 7", "Camunda 8"];

const suite = smokeSuite({ name: "form", workspace: fixtures(FORM_FILE) });
const { vscode } = suite;

const formRendered = (webview: FrameLocator) =>
    webview.getByText("Customer name").first().isVisible();

const picker = () => vscode().page.locator(".quick-input-widget");
const pickerLabels = () => picker().locator(".monaco-list-row .label-name");
const pickerOption = (label: string) =>
    pickerLabels().filter({
        hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    });
const engineStatus = (text: string) =>
    vscode().page.locator(".statusbar-item").filter({ hasText: text });

async function expectChoices(expected: readonly string[]): Promise<void> {
    await expect
        .poll(async () => ({
            rows: await picker().locator(".monaco-list-row").count(),
            labels: await pickerLabels().allTextContents(),
        }))
        .toEqual({ rows: expected.length, labels: expected });
}

async function choosePlatform(label: string): Promise<void> {
    await vscode().runCommand("Change Engine Version");
    await expectChoices(PLATFORMS);
    await pickerOption(label).click();
}

async function save(): Promise<void> {
    await vscode().page.keyboard.press(`${COMMAND_KEY}+s`);
}

describe("the form editor of the packaged extension in a real VS Code", () => {
    it("opens a form file in the form editor", async () => {
        const webview = await suite.open(FORM_FILE, formRendered);

        await settle(webview);
        await suite.screenshot("form");
    });

    it("offers the engine's platforms and versions natively and leaves the file alone until one is chosen", async () => {
        const file = suite.file(FORM_FILE);
        const original = await readFile(file, "utf8");
        await suite.open(FORM_FILE, formRendered);
        await engineStatus("Camunda 8 (8.8.0)").waitFor();

        await engineStatus("Camunda 8 (8.8.0)").click();
        await expectChoices(PLATFORMS);
        await vscode().page.keyboard.press("Escape");
        await choosePlatform("Camunda 7");
        await expectChoices(["7"]);
        await vscode().page.keyboard.press("Escape");

        await expect.poll(() => picker().isVisible()).toBe(false);
        expect(await vscode().isActiveTabDirty()).toBe(false);
        expect(await readFile(file, "utf8")).toBe(original);
    });

    it("changes the engine in the form's source, saves it and shows it after a reopen", async () => {
        const file = suite.file(FORM_FILE);
        const original = await readFile(file, "utf8");
        await suite.open(FORM_FILE, formRendered);

        await choosePlatform("Camunda 7");
        await expectChoices(["7"]);
        await pickerOption("7").click();

        await engineStatus("Camunda 7 (7)").waitFor();
        await expect.poll(() => vscode().isActiveTabDirty()).toBe(true);
        expect(await readFile(file, "utf8")).toBe(original);
        await save();
        // Only the two engine values change; the rest of the source stays as written.
        await expect
            .poll(() => readFile(file, "utf8"))
            .toBe(
                original.replace('"Camunda Cloud"', '"Camunda Platform"').replace('"8.8.0"', '"7"'),
            );
        await expect.poll(() => vscode().isActiveTabDirty()).toBe(false);

        await vscode().executeCommand("workbench.action.closeActiveEditor");
        await suite.open(FORM_FILE, formRendered);
        await engineStatus("Camunda 7 (7)").waitFor();

        await choosePlatform("Camunda 8");
        await expectChoices(["8.10.0", "8.9.0", "8.8.0"]);
        await pickerOption("8.10.0").click();

        await engineStatus("Camunda 8 (8.10.0)").waitFor();
        await save();
        await expect
            .poll(() => jsonInFile(file))
            .toMatchObject({
                executionPlatform: "Camunda Cloud",
                executionPlatformVersion: "8.10.0",
                schemaVersion: 18,
            });
        await expect.poll(() => vscode().isActiveTabDirty()).toBe(false);
    });

    it("follows a change of the source on disk and keeps an unsaved edit while the engine is chosen", async () => {
        const file = suite.file(FORM_FILE);
        const webview = await suite.open(FORM_FILE, formRendered);
        const changedOnDisk = (await readFile(file, "utf8"))
            .replace('"8.8.0"', '"8.9.0"')
            .replace("Customer name", "Customer on disk");

        await writeFile(file, changedOnDisk);

        await engineStatus("Camunda 8 (8.9.0)").waitFor();
        // The status bar follows the host's document; the editor imports the change a moment
        // later, and an edit typed before that is replaced by the import.
        await webview.getByText("Customer on disk").first().waitFor();
        await webview.locator('.fjs-element[data-id="Field_Name"]').click();
        const label = webview.locator("#bio-properties-panel-label");
        if (!(await label.isVisible())) {
            await webview
                .locator('[data-group-id="group-general"]')
                .getByRole("button", { name: "Toggle section", exact: true })
                .click();
        }
        await label.waitFor({ state: "visible" });
        // Not Ctrl/Cmd+A: in a webview that is a VS Code command, which selects a moment
        // later and would take the first typed characters with it.
        await label.selectText();
        await label.pressSequentially("Name after engine reload");
        await engineStatus("Camunda 8 (8.9.0)").click();
        await expectChoices(PLATFORMS);
        // The properties panel syncs its debounced edit while the native picker stays open.
        await expect.poll(() => vscode().isActiveTabDirty()).toBe(true);
        expect(await picker().isVisible()).toBe(true);
        await pickerOption("Camunda 7").click();
        await expectChoices(["7"]);
        await pickerOption("7").click();

        await engineStatus("Camunda 7 (7)").waitFor();
        expect(await readFile(file, "utf8")).toBe(changedOnDisk);
        await save();
        await expect
            .poll(() => jsonInFile(file))
            .toMatchObject({
                executionPlatform: "Camunda Platform",
                executionPlatformVersion: "7",
                components: [{ label: "Name after engine reload" }],
            });
        await expect.poll(() => vscode().isActiveTabDirty()).toBe(false);
    });

    it("closes the input values a window reload restored, without asking to save them", async () => {
        const tabLabels = async () =>
            (await vscode().tabsByGroup()).flat().map(({ label }) => label);
        await suite.open(FORM_FILE, formRendered);
        await vscode().executeCommand("bpmn-modeler.toggleFormInputValues");
        await expect.poll(tabLabels).toContain("smoke.input.json");
        await vscode().replaceInDocuments("bpmn-form-input-values", "{}", '{ "a": 1 }');

        await vscode().reloadWindow();

        await expect.poll(tabLabels).toEqual(["smoke.form"]);
        expect(await vscode().page.locator(".monaco-dialog-box").isVisible()).toBe(false);
    });

    it("names a platform it does not know and leaves its source untouched", async () => {
        const file = suite.file(FORM_FILE);
        await suite.open(FORM_FILE, formRendered);
        const unsupported = (await readFile(file, "utf8"))
            .replace('"Camunda Cloud"', '"Other platform"')
            .replace('"8.8.0"', '"99"');

        await writeFile(file, unsupported);

        await engineStatus("Other platform (99)").waitFor();
        await vscode().runCommand("Change Engine Version");
        await expectChoices(PLATFORMS);
        await vscode().page.keyboard.press("Escape");
        await expect.poll(() => picker().isVisible()).toBe(false);
        expect(await vscode().isActiveTabDirty()).toBe(false);
        expect(await readFile(file, "utf8")).toBe(unsupported);
    });
});
