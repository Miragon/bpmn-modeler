import { mkdir, readFile, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { diagramRendered, jsonInFile, selectElement, settle, switchMode } from "./support/modeler";
import { fixtures, smokeSuite } from "./support/smokeSuite";
import { COMMAND_KEY } from "./vscodeSession";

const BPMN_FILE = "smoke.bpmn";
const TASK_ID = "Task_Check";
const TEMPLATE_FILE = "smoke-template.json";
const UPPER_CASE_TEMPLATE_FILE = "smoke-upper-case.JSON";
const INVALID_TEMPLATE_FILE = "smoke-template-invalid.json";
const INVALID_TEMPLATE_ERROR = 'Incorrect type. Expected "integer".';
const PINNED_TEMPLATE_FILE = "smoke-template-pinned.json";
const TEMPLATE_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";
const PINNED_TEMPLATE_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema@0.9.0/resources/schema.json";
const TEMPLATES_FOLDER = [".camunda", "element-templates"];
const NEW_TEMPLATE_FILE = "new-smoke-template.json";
const NEW_TEMPLATE_ID = "new-smoke-template";
const NEW_TEMPLATE_NAME = "Smoke template";

const suite = smokeSuite({
    name: "element-templates",
    workspace: fixtures(
        BPMN_FILE,
        TEMPLATE_FILE,
        UPPER_CASE_TEMPLATE_FILE,
        INVALID_TEMPLATE_FILE,
        PINNED_TEMPLATE_FILE,
        ".camunda",
    ),
});
const { vscode } = suite;

const openTemplateEditorButton = () =>
    vscode().page.getByRole("button", { name: "Open in Element Template Editor" });

/** Opens the template editor from the button its JSON's editor title offers, and waits for the preview. */
async function openTemplateEditorFromJson(): Promise<void> {
    await expect.poll(() => openTemplateEditorButton().count()).toBeGreaterThan(0);
    await openTemplateEditorButton().first().click();
    const customProperties = vscode()
        .webview()
        .locator(
            '[data-group-id="group-ElementTemplates__CustomProperties-input"] .bio-properties-panel-group-header',
        );
    // The preview opens the template's groups, so its fields are there to see.
    await expect
        .poll(() => customProperties.getAttribute("class").catch(() => ""))
        .toContain("open");
    await settle(vscode().webview());
}

describe("element templates in the packaged extension in a real VS Code", () => {
    it("creates an element template through New Element Template and edits it in the builder", async () => {
        const page = vscode().page;
        const file = suite.file(...TEMPLATES_FOLDER, NEW_TEMPLATE_FILE);

        await vscode().runCommand("New Element Template");
        const name = page.locator(".quick-input-widget .quick-input-box input");
        await expect.poll(() => name.inputValue()).toBe("new-template");
        await name.fill(NEW_TEMPLATE_ID);
        await name.press("Enter");
        const webview = vscode().webview();
        await webview.locator(".template-editor__wizard").waitFor();
        await webview.locator(".template-editor__wizard-element-type").selectOption("bpmn:Task");
        await webview.locator(".template-editor__wizard-name").fill(NEW_TEMPLATE_NAME);
        await webview.getByRole("button", { name: "Create template" }).click();
        await webview.locator(".etb-heading__title", { hasText: NEW_TEMPLATE_NAME }).waitFor();
        await expect.poll(() => vscode().isActiveTabDirty()).toBe(true);
        await page.keyboard.press(`${COMMAND_KEY}+s`);

        await expect
            .poll(() => jsonInFile(file))
            .toMatchObject({
                $schema: TEMPLATE_SCHEMA,
                name: NEW_TEMPLATE_NAME,
                id: NEW_TEMPLATE_ID,
                version: 1,
                appliesTo: ["bpmn:Task"],
                properties: [],
            });

        await webview
            .locator('[data-entry-id="template-description"]')
            .locator("input, textarea")
            .fill("Written by the smoke test");
        await webview.getByRole("tab", { name: /^Properties/ }).click();
        await webview.getByRole("button", { name: "Add Property" }).click();
        const label = webview.locator('[data-entry-id="property-0-label"] input');
        await expect.poll(() => label.inputValue()).toBe("New property");
        await label.fill("Order number");

        // The preview opens the template's groups, so the field is there to see.
        await webview
            .locator("#js-properties-panel")
            .getByText("Order number", { exact: true })
            .first()
            .waitFor();
        await page.keyboard.press(`${COMMAND_KEY}+s`);
        await expect
            .poll(() => jsonInFile(file))
            .toMatchObject({
                description: "Written by the smoke test",
                properties: [{ label: "Order number" }],
            });
        await expect.poll(() => vscode().isActiveTabDirty()).toBe(false);

        // Playwright's text matching treats Monaco's no-break spaces as spaces.
        const json = page
            .locator(".monaco-editor .view-lines")
            .filter({ hasText: '"label": "Order number"' });
        await vscode().runCommand("Toggle JSON Editor");
        await json.waitFor();
        // The command acts on the template editor, so the focus goes back to its group first.
        await vscode().executeCommand("workbench.action.focusFirstEditorGroup");
        await vscode().runCommand("Toggle JSON Editor");
        await json.waitFor({ state: "detached" });
    });

    it("offers a template saved to the workspace in an open BPMN modeler's template chooser", async () => {
        const webview = await suite.open(BPMN_FILE, diagramRendered);
        await mkdir(suite.file(...TEMPLATES_FOLDER), { recursive: true });

        await writeFile(
            suite.file(...TEMPLATES_FOLDER, NEW_TEMPLATE_FILE),
            JSON.stringify({
                $schema: TEMPLATE_SCHEMA,
                name: NEW_TEMPLATE_NAME,
                id: NEW_TEMPLATE_ID,
                version: 1,
                appliesTo: ["bpmn:Task"],
                properties: [],
            }),
        );

        await switchMode(webview, "implement");
        await selectElement(webview, TASK_ID);
        const chooser = webview.locator(".etc-modal");
        const offered = chooser.locator(".etc-card-name", { hasText: NEW_TEMPLATE_NAME });
        const openChooser = async () => {
            await webview.locator(".bio-properties-panel-select-template-button").click();
            await chooser.waitFor();
            // The overlay starts listening for keys when it takes the focus, just after it shows.
            await expect
                .poll(() =>
                    webview
                        .locator("html")
                        .evaluate(() => Boolean(document.activeElement?.closest(".etc-modal"))),
                )
                .toBe(true);
        };
        const closeChooser = async () => {
            await vscode().page.keyboard.press("Escape");
            await chooser.waitFor({ state: "detached" });
        };

        // The open editor learns of the new file from a watcher, so the chooser opens until it lists it.
        await expect
            .poll(
                async () => {
                    await openChooser();
                    const isOffered = (await offered.count()) > 0;
                    await closeChooser();
                    return isOffered;
                },
                { interval: 500 },
            )
            .toBe(true);
        expect(await vscode().extensionLog()).not.toContain(
            "A problem occurred while loading element templates",
        );
    });

    // Only a schema that loaded can report the deliberate violation, so this holds
    // however the two files' diagnostics are ordered.
    it("trusts the published template schemas, and only those", async () => {
        await vscode().openFile(suite.file(INVALID_TEMPLATE_FILE));
        await vscode().openFile(suite.file(PINNED_TEMPLATE_FILE));
        await vscode().executeCommand("workbench.actions.view.problems");

        const problems = vscode().page.locator(".markers-panel");
        const reported = () => problems.innerText().catch(() => "");
        await expect.poll(reported).toContain(`${PINNED_TEMPLATE_SCHEMA} is untrusted`);
        await expect.poll(reported).toContain(INVALID_TEMPLATE_ERROR);
        expect(await reported()).not.toContain(TEMPLATE_SCHEMA);
    });

    it("offers the editor on a template's JSON and previews it with its groups open", async () => {
        await vscode().openFile(suite.file(TEMPLATE_FILE));

        await openTemplateEditorFromJson();

        // Beside the template editor, the JSON has no reason to offer it again.
        const json = vscode()
            .page.locator(".monaco-editor .view-lines")
            .filter({ hasText: '"name": "Smoke Template"' });
        await vscode().runCommand("Toggle JSON Editor");
        await json.waitFor({ state: "detached" });
        await vscode().runCommand("Toggle JSON Editor");
        await json.waitFor();
        await expect.poll(() => openTemplateEditorButton().count()).toBe(0);
        await settle(vscode().webview());
        await suite.screenshot("template-preview");
    });

    it("previews a template saved with an upper-case extension", async () => {
        const file = suite.file(UPPER_CASE_TEMPLATE_FILE);
        await vscode().openFile(file);
        await openTemplateEditorFromJson();

        await writeFile(file, (await readFile(file, "utf8")).replace("Recipient", "Addressee"));

        await vscode()
            .webview()
            .locator("#js-properties-panel")
            .getByText("Addressee", { exact: true })
            .first()
            .waitFor();
    });
});
