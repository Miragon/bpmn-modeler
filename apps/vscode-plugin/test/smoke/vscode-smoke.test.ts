import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { BpmnModdle } from "bpmn-moddle";
import type { FrameLocator } from "playwright-core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
    COMMAND_KEY,
    VsCodeSession,
    downloadVsCode,
    flatpakVSCodium,
    packExtension,
} from "./vscodeSession";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DIST_DIRECTORY = join(REPOSITORY_ROOT, "dist/apps/vscode-plugin");
const RESULTS_DIRECTORY = join(REPOSITORY_ROOT, "test-results/vscode-smoke");
const FIXTURES_DIRECTORY = fileURLToPath(new URL("./fixtures/", import.meta.url));

const BPMN_FILE = "smoke.bpmn";
const DMN_FILE = "smoke.dmn";
const FORM_FILE = "smoke.form";
const TEMPLATE_FILE = "smoke-template.json";
const UPPER_CASE_TEMPLATE_FILE = "smoke-upper-case.JSON";
const INVALID_TEMPLATE_FILE = "smoke-template-invalid.json";
const INVALID_TEMPLATE_ERROR = 'Incorrect type. Expected "integer".';
const PINNED_TEMPLATE_FILE = "smoke-template-pinned.json";
const TEMPLATE_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";
const PINNED_TEMPLATE_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema@0.9.0/resources/schema.json";
const CSP_FILE = "smoke-csp.bpmn";
const NEW_TEMPLATE_FILE = "new-smoke-template.json";
const NEW_TEMPLATE_ID = "new-smoke-template";
const TEMPLATE_NAME = "Smoke template";
const HTTPS_ICON = "https://icons.invalid/smoke-template.svg";
const TASK_ID = "Task_Check";
const ORIGINAL_TASK_NAME = "Check order";
const RENAMED_TASK_NAME = "Ship order";
const TIMEOUT_MS = 30_000;

/** `Default Light+`/`Dark+` exist in every VS Code down to the engines floor; the `Modern` themes do not. */
const COLOR_THEMES = [
    {
        id: "light",
        name: "Default Light+",
        workbenchClass: "vs",
        bodyClass: "vscode-light",
        modelerTheme: "light",
    },
    {
        id: "dark",
        name: "Default Dark+",
        workbenchClass: "vs-dark",
        bodyClass: "vscode-dark",
        modelerTheme: "dark",
    },
    {
        id: "high-contrast",
        name: "Default High Contrast",
        workbenchClass: "hc-black",
        bodyClass: "vscode-high-contrast",
        modelerTheme: "dark",
    },
] as const;

const log = (line: string) => console.log(`[vscode-smoke] ${line}`);

async function taskNameInFile(file: string): Promise<string | undefined> {
    try {
        const { elementsById } = await BpmnModdle().fromXML(await readFile(file, "utf8"));
        return elementsById[TASK_ID]?.name as string | undefined;
    } catch {
        // VS Code may be halfway through writing the file.
        return undefined;
    }
}

/** bpmn-js wraps a label into one `<tspan>` per line. */
function taskLabel(webview: FrameLocator): Promise<string> {
    return webview
        .locator(`.djs-shape[data-element-id="${TASK_ID}"] .djs-visual text`)
        .evaluate((text) =>
            [...text.querySelectorAll("tspan")].map((line) => line.textContent).join(" "),
        );
}

async function diagramRendered(webview: FrameLocator): Promise<boolean> {
    const shapes = await webview.locator(".djs-container .djs-element.djs-shape").count();
    const connections = await webview.locator(".djs-container .djs-element.djs-connection").count();
    return shapes >= 3 && connections >= 2;
}

/** Repaints after a DOM change, so a screenshot shows the settled frame. */
async function settle(webview: FrameLocator): Promise<void> {
    await webview
        .locator("html")
        .evaluate(
            () =>
                new Promise<void>((done) =>
                    requestAnimationFrame(() => requestAnimationFrame(() => done())),
                ),
        );
}

function templateIconOnCanvas(webview: FrameLocator, elementId: string): Promise<string | null> {
    return webview
        .locator(`.djs-shape[data-element-id="${elementId}"] .djs-visual image`)
        .first()
        .getAttribute("href");
}

async function selectElement(webview: FrameLocator, elementId: string): Promise<void> {
    const shape = webview.locator(`.djs-shape[data-element-id="${elementId}"]`);
    // diagram-js toggles an already selected element off on a second click.
    if (!(await shape.evaluate((node) => node.classList.contains("selected")))) {
        await shape.locator(":scope > .djs-hit").click();
    }
    await expect
        .poll(() => shape.evaluate((node) => node.classList.contains("selected")))
        .toBe(true);
}

async function jsonInFile(file: string): Promise<Record<string, unknown> | undefined> {
    try {
        return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    } catch {
        // Not written yet, or VS Code is halfway through writing it.
        return undefined;
    }
}

describe("the packaged extension in a real VS Code", () => {
    let rootDirectory = "";
    let workspaceDirectory = "";
    let session: VsCodeSession | undefined;
    let failed = false;

    const vscode = (): VsCodeSession => {
        if (!session) throw new Error("VS Code did not start");
        return session;
    };

    const expectNoCspViolations = () => expect(vscode().cspViolations).toEqual([]);

    async function switchMode(webview: FrameLocator, mode: string): Promise<void> {
        const panelHost = webview.locator("#js-properties-panel");
        await webview.locator(".mode-chip").click();
        await webview.locator(`.mode-menu-item[data-mode="${mode}"]`).click();
        await expect
            .poll(() => panelHost.getAttribute("data-surface-mode"), { timeout: TIMEOUT_MS })
            .toBe(mode);
        await expect
            .poll(() => panelHost.getAttribute("aria-busy"), { timeout: TIMEOUT_MS })
            .toBe("false");
    }

    beforeAll(async () => {
        await rm(RESULTS_DIRECTORY, { recursive: true, force: true });
        await mkdir(RESULTS_DIRECTORY, { recursive: true });
        // Flatpak owns its /tmp; put its explicitly shared profile under the host home.
        const temporaryRoot =
            process.env.VSCODE_SMOKE_FLATPAK === "1" ? join(homedir(), ".cache") : tmpdir();
        await mkdir(temporaryRoot, { recursive: true });
        rootDirectory = await mkdtemp(join(temporaryRoot, "bpmn-modeler-vscode-smoke-"));
        workspaceDirectory = join(rootDirectory, "workspace");
        await cp(FIXTURES_DIRECTORY, workspaceDirectory, { recursive: true });

        const manifest = JSON.parse(await readFile(join(DIST_DIRECTORY, "package.json"), "utf8"));
        const extensionPath = await packExtension(DIST_DIRECTORY, rootDirectory);
        const executablePath =
            process.env.VSCODE_SMOKE_FLATPAK === "1"
                ? await flatpakVSCodium(rootDirectory)
                : await downloadVsCode(
                      extensionPath,
                      process.env.VSCODE_SMOKE_VERSION || undefined,
                      log,
                  );
        session = await VsCodeSession.launch({
            executablePath,
            extensionPath,
            extensionId: `${manifest.publisher}.${manifest.name}`.toLowerCase(),
            rootDirectory,
            workspaceDirectory,
            fileToOpen: join(workspaceDirectory, BPMN_FILE),
            customEditors: {
                "*.bpmn": "bpmn-modeler.bpmn",
                "*.dmn": "bpmn-modeler.dmn",
                "*.form": "bpmn-modeler.form",
            },
            colorTheme: COLOR_THEMES[0].name,
            timeoutMs: TIMEOUT_MS,
        });
    });

    afterEach(async ({ task }) => {
        if (task.result?.state !== "fail") return;
        failed = true;
        const name = task.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        await session
            ?.screenshot(join(RESULTS_DIRECTORY, `failure-${name}.png`))
            .catch(() => undefined);
    });

    afterAll(async () => {
        await session?.close();
        if (failed && session) {
            await cp(session.logsDirectory, join(RESULTS_DIRECTORY, "vscode-logs"), {
                recursive: true,
            }).catch(() => undefined);
        }
        if (rootDirectory) await rm(rootDirectory, { recursive: true, force: true });
    });

    it("opens the BPMN file in the BPMN custom editor and renders its diagram", async () => {
        await vscode().showInCustomEditor(BPMN_FILE, diagramRendered);
        expect(await taskLabel(vscode().webview())).toBe(ORIGINAL_TASK_NAME);
        expectNoCspViolations();
    });

    it("renames the task through direct editing and marks the tab dirty", async () => {
        const webview = vscode().webview();
        await webview.locator(`.djs-shape[data-element-id="${TASK_ID}"] > .djs-hit`).dblclick();
        const textBox = webview.locator(".djs-direct-editing-content");
        await textBox.waitFor({ state: "visible" });
        await textBox.fill(RENAMED_TASK_NAME);
        await vscode().page.keyboard.press("Enter");
        await textBox.waitFor({ state: "hidden" });

        await expect.poll(() => taskLabel(webview)).toBe(RENAMED_TASK_NAME);
        await expect.poll(() => vscode().isActiveTabDirty(), { timeout: TIMEOUT_MS }).toBe(true);
    });

    it("saves the rename to disk as valid BPMN", async () => {
        const file = join(workspaceDirectory, BPMN_FILE);
        await vscode().page.keyboard.press(`${COMMAND_KEY}+s`);

        await expect.poll(() => vscode().isActiveTabDirty(), { timeout: TIMEOUT_MS }).toBe(false);
        await expect
            .poll(() => taskNameInFile(file), { timeout: TIMEOUT_MS })
            .toBe(RENAMED_TASK_NAME);
    });

    it("undoes the rename on the canvas and in the saved file", async () => {
        const file = join(workspaceDirectory, BPMN_FILE);
        await vscode().page.keyboard.press(`${COMMAND_KEY}+z`);

        await expect
            .poll(() => taskLabel(vscode().webview()), { timeout: TIMEOUT_MS })
            .toBe(ORIGINAL_TASK_NAME);
        await expect.poll(() => vscode().isActiveTabDirty(), { timeout: TIMEOUT_MS }).toBe(true);
        await vscode().page.keyboard.press(`${COMMAND_KEY}+s`);
        await expect
            .poll(() => taskNameInFile(file), { timeout: TIMEOUT_MS })
            .toBe(ORIGINAL_TASK_NAME);
    });

    it.each(COLOR_THEMES)("follows VS Code's $name theme", async (theme) => {
        const webview = vscode().webview();
        const html = webview.locator("html");
        // The edit left the canvas focused; its focus ring would show in every screenshot.
        await html.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

        await vscode().setColorTheme(theme.name);
        await expect
            .poll(() => vscode().workbenchHasClass(theme.workbenchClass), { timeout: TIMEOUT_MS })
            .toBe(true);
        await expect
            .poll(
                () =>
                    html.evaluate(
                        (_, name) => document.body.classList.contains(name),
                        theme.bodyClass,
                    ),
                {
                    timeout: TIMEOUT_MS,
                },
            )
            .toBe(true);
        await expect
            .poll(() => html.getAttribute("data-bpmn-theme"), { timeout: TIMEOUT_MS })
            .toBe(theme.modelerTheme);
        expect(await diagramRendered(webview)).toBe(true);

        await settle(webview);
        await vscode().screenshot(join(RESULTS_DIRECTORY, `bpmn-${theme.id}.png`));
    });

    it("renders data: and https: element-template icons", async () => {
        await vscode().openFromExplorer(CSP_FILE);
        await vscode().showInCustomEditor(
            CSP_FILE,
            async (webview) => (await templateIconOnCanvas(webview, "Task_HttpsIcon")) !== null,
        );
        const webview = vscode().webview();

        expect(await templateIconOnCanvas(webview, "Task_DataIcon")).toMatch(
            /^data:image\/svg\+xml/,
        );
        expect(await templateIconOnCanvas(webview, "Task_HttpsIcon")).toBe(HTTPS_ICON);
        await selectElement(webview, "Task_HttpsIcon");
        await webview
            .locator(`#js-properties-panel img[src="${HTTPS_ICON}"]`)
            .first()
            .waitFor({ state: "attached" });
        expectNoCspViolations();
    });

    it("switches between View, Design and Implement", async () => {
        const webview = vscode().webview();
        for (const mode of ["view", "design", "implement"]) {
            await switchMode(webview, mode);
            expect(await diagramRendered(webview)).toBe(true);
        }
        expectNoCspViolations();
    });

    it("edits a script task's expression in the FEEL editor", async () => {
        const webview = vscode().webview();
        await selectElement(webview, "Task_Script");
        const expression = webview.locator('[data-entry-id="scriptExpression"] .cm-content');
        if (!(await expression.isVisible())) {
            await webview
                .locator('[data-group-id="group-script"] .bio-properties-panel-group-header')
                .click();
        }
        await expression.click();
        await vscode().page.keyboard.press("Control+Space");
        await vscode().page.keyboard.press("Escape");

        expect(await expression.textContent()).toContain("1 + 1");
        expectNoCspViolations();
    });

    it("copies the diagram as SVG", async () => {
        await vscode().runCommand("Copy Diagram as SVG");

        await expect
            .poll(() => vscode().clipboardText(), { timeout: TIMEOUT_MS })
            .toContain('data-element-id="Task_Script"');
        expectNoCspViolations();
    });

    it("opens a DMN file in the DMN custom editor", async () => {
        await vscode().openFromExplorer(DMN_FILE);
        await vscode().showInCustomEditor(DMN_FILE, (webview) =>
            webview.getByText("Decision 1").first().isVisible(),
        );
        await settle(vscode().webview());
        await vscode().screenshot(join(RESULTS_DIRECTORY, "dmn.png"));
        expectNoCspViolations();
    });

    it("opens a form file in the form editor", async () => {
        await vscode().openFromExplorer(FORM_FILE);
        await vscode().showInCustomEditor(FORM_FILE, (webview) =>
            webview.getByText("Customer name").first().isVisible(),
        );
        await settle(vscode().webview());
        await vscode().screenshot(join(RESULTS_DIRECTORY, "form.png"));
        expectNoCspViolations();
    });

    it("creates an element template through New Element Template", async () => {
        const page = vscode().page;
        const file = join(workspaceDirectory, ".camunda", "element-templates", NEW_TEMPLATE_FILE);
        await vscode().runCommand("New Element Template");
        const name = page.locator(".quick-input-widget .quick-input-box input");
        await expect.poll(() => name.inputValue(), { timeout: TIMEOUT_MS }).toBe("new-template");
        await name.fill(NEW_TEMPLATE_ID);
        await page.keyboard.press("Enter");

        await vscode().showInCustomEditor(NEW_TEMPLATE_FILE, (webview) =>
            webview.locator(".template-editor__wizard").isVisible(),
        );
        const webview = vscode().webview();
        // The smoke diagram's task, so the BPMN step below can apply the template.
        await webview.locator(".template-editor__wizard-element-type").selectOption("bpmn:Task");
        await webview.locator(".template-editor__wizard-name").fill(TEMPLATE_NAME);
        await webview.getByRole("button", { name: "Create template" }).click();
        await webview.locator(".etb-heading__title", { hasText: TEMPLATE_NAME }).waitFor();
        await expect.poll(() => vscode().isActiveTabDirty(), { timeout: TIMEOUT_MS }).toBe(true);
        await page.keyboard.press(`${COMMAND_KEY}+s`);

        await expect
            .poll(() => jsonInFile(file), { timeout: TIMEOUT_MS })
            .toMatchObject({
                $schema: TEMPLATE_SCHEMA,
                name: TEMPLATE_NAME,
                id: NEW_TEMPLATE_ID,
                version: 1,
                appliesTo: ["bpmn:Task"],
                properties: [],
            });
        expectNoCspViolations();
    });

    it("edits the template in the builder and previews its property", async () => {
        const file = join(workspaceDirectory, ".camunda", "element-templates", NEW_TEMPLATE_FILE);
        const webview = vscode().webview();
        await webview
            .locator('[data-entry-id="template-description"]')
            .locator("input, textarea")
            .fill("Written by the smoke test");
        await webview.getByRole("tab", { name: /^Properties/ }).click();
        await webview.getByRole("button", { name: "Add Property" }).click();
        const label = webview.locator('[data-entry-id="property-0-label"] input');
        await expect.poll(() => label.inputValue(), { timeout: TIMEOUT_MS }).toBe("New property");
        await label.fill("Order number");

        // The preview opens the template's groups, so the field is there to see.
        await webview
            .locator("#js-properties-panel")
            .getByText("Order number", { exact: true })
            .first()
            .waitFor();
        await vscode().page.keyboard.press(`${COMMAND_KEY}+s`);
        await expect
            .poll(() => jsonInFile(file), { timeout: TIMEOUT_MS })
            .toMatchObject({
                description: "Written by the smoke test",
                properties: [{ label: "Order number" }],
            });
        await expect.poll(() => vscode().isActiveTabDirty(), { timeout: TIMEOUT_MS }).toBe(false);
        expectNoCspViolations();
    });

    it("toggles the template's JSON beside the builder", async () => {
        // Playwright's text matching treats Monaco's no-break spaces as spaces.
        const json = vscode()
            .page.locator(".monaco-editor .view-lines")
            .filter({ hasText: '"label": "Order number"' });
        await vscode().runCommand("Toggle JSON Editor");
        await json.waitFor();

        // The command acts on the template editor, so the focus goes back to its group first.
        await vscode().page.keyboard.press(`${COMMAND_KEY}+1`);
        await vscode().runCommand("Toggle JSON Editor");
        await json.waitFor({ state: "detached" });
    });

    it.each(COLOR_THEMES)("shows the template editor in VS Code's $name theme", async (theme) => {
        const webview = vscode().webview();
        const html = webview.locator("html");
        await html.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

        await vscode().setColorTheme(theme.name);
        await expect
            .poll(() => vscode().workbenchHasClass(theme.workbenchClass), { timeout: TIMEOUT_MS })
            .toBe(true);
        await expect
            .poll(
                () =>
                    html.evaluate(
                        (_, name) => document.body.classList.contains(name),
                        theme.bodyClass,
                    ),
                { timeout: TIMEOUT_MS },
            )
            .toBe(true);

        await settle(webview);
        await vscode().screenshot(join(RESULTS_DIRECTORY, `template-editor-${theme.id}.png`));
    });

    it("offers the new template in the BPMN modeler's template chooser", async () => {
        await vscode().openFromExplorer(BPMN_FILE);
        await vscode().showInCustomEditor(BPMN_FILE, diagramRendered);
        // Saving the template refreshed this editor while it was hidden.
        expect(await vscode().extensionLog()).not.toContain(
            "A problem occurred while loading element templates",
        );
        const webview = vscode().webview();
        await switchMode(webview, "implement");
        await selectElement(webview, TASK_ID);
        await webview.locator(".bio-properties-panel-select-template-button").click();

        await webview.locator(".etc-modal .etc-card-name", { hasText: TEMPLATE_NAME }).waitFor();
        // The overlay takes the focus just after it shows, so a first Escape can come too early.
        await expect
            .poll(
                async () => {
                    await vscode().page.keyboard.press("Escape");
                    return webview.locator(".etc-modal").count();
                },
                { timeout: TIMEOUT_MS },
            )
            .toBe(0);
    });

    // Only a schema that loaded can report the deliberate violation, so this holds
    // however the two files' diagnostics are ordered.
    it("trusts the published template schemas, and only those", async () => {
        await vscode().keepOpenFromExplorer(INVALID_TEMPLATE_FILE);
        await vscode().keepOpenFromExplorer(PINNED_TEMPLATE_FILE);
        await vscode().page.keyboard.press(`${COMMAND_KEY}+Shift+M`);

        const problems = vscode().page.locator(".markers-panel");
        const reported = () => problems.innerText().catch(() => "");
        await expect
            .poll(reported, { timeout: TIMEOUT_MS })
            .toContain(`${PINNED_TEMPLATE_SCHEMA} is untrusted`);
        await expect.poll(reported, { timeout: TIMEOUT_MS }).toContain(INVALID_TEMPLATE_ERROR);
        expect(await reported()).not.toContain(TEMPLATE_SCHEMA);
    });

    const openTemplateEditorButton = () =>
        vscode().page.getByRole("button", { name: "Open in Element Template Editor" });

    const openTemplateEditorFromJson = async () => {
        await expect
            .poll(() => openTemplateEditorButton().count(), { timeout: TIMEOUT_MS })
            .toBeGreaterThan(0);
        await openTemplateEditorButton().first().click();
        const group = vscode()
            .webview()
            .locator(
                '[data-group-id="group-ElementTemplates__CustomProperties-input"] .bio-properties-panel-group-header',
            );
        await expect
            .poll(() => group.getAttribute("class").catch(() => ""), { timeout: TIMEOUT_MS })
            .toContain("open");
        await settle(vscode().webview());
    };

    it("offers the editor on a template's JSON and previews it with its groups open", async () => {
        await vscode().openFromExplorer(TEMPLATE_FILE);
        await openTemplateEditorFromJson();

        // Beside the template editor, the JSON has no reason to offer it again.
        const json = vscode()
            .page.locator(".monaco-editor .view-lines")
            .filter({ hasText: '"name": "Smoke Template"' });
        await vscode().runCommand("Toggle JSON Editor");
        await json.waitFor({ state: "detached" });
        await vscode().runCommand("Toggle JSON Editor");
        await json.waitFor();
        await expect
            .poll(() => openTemplateEditorButton().count(), { timeout: TIMEOUT_MS })
            .toBe(0);
        await settle(vscode().webview());
        await vscode().screenshot(join(RESULTS_DIRECTORY, "template-preview.png"));
        expectNoCspViolations();
    });

    // Closes the other template first, whose title button would pass for this file's. An
    // editor left visible would pass for the next step's webview, so the cleanup also runs
    // when this one fails.
    it("previews a template saved with an upper-case extension", async ({ onTestFinished }) => {
        onTestFinished(() => vscode().runCommand("View: Close All Editors"));
        await vscode().runCommand("View: Close All Editors");
        await vscode().keepOpenFromExplorer(UPPER_CASE_TEMPLATE_FILE);

        await openTemplateEditorFromJson();
        const file = join(workspaceDirectory, UPPER_CASE_TEMPLATE_FILE);
        await writeFile(file, (await readFile(file, "utf8")).replace("Recipient", "Addressee"));
        await vscode()
            .webview()
            .locator("#js-properties-panel")
            .getByText("Addressee", { exact: true })
            .first()
            .waitFor();
        expectNoCspViolations();
    });

    describe("linked saved form preview", () => {
        let file: string;
        let original: string;
        let webview: FrameLocator;
        let scenario = 0;
        beforeEach(async () => {
            file = join(workspaceDirectory, FORM_FILE);
            original = await readFile(join(FIXTURES_DIRECTORY, FORM_FILE), "utf8");
            await writeFile(file, original);
            await vscode().setColorTheme(COLOR_THEMES[0].name);
            // A fresh document isolates persisted selection and viewport between scenarios.
            const diagram = `linked-preview-${++scenario}.bpmn`;
            await cp(
                join(FIXTURES_DIRECTORY, "linked-form.bpmn"),
                join(workspaceDirectory, diagram),
            );
            await vscode().page.locator('.explorer-folders-view [role="tree"]').focus();
            await vscode().runCommand("Refresh Explorer");
            await vscode().openFromExplorer(diagram);
            await vscode().showInCustomEditor(diagram, diagramRendered);
            webview = vscode().webview();
            await switchMode(webview, "implement");
        });
        afterEach(async () => {
            await writeFile(file, original);
            await vscode().setColorTheme(COLOR_THEMES[0].name);
        });
        const previewAction = () => webview.locator('[data-action="preview-linked-form"]');
        const preview = () => webview.getByRole("region", { name: "Linked form preview" });
        it("automatically shows an adjacent preview in a dense diagram and reopens after dismissal", async () => {
            const source = await readFile(join(FIXTURES_DIRECTORY, "linked-form.bpmn"), "utf8");
            const tasks: string[] = [];
            const shapes: string[] = [];
            for (let row = 0; row < 14; row++) {
                for (let column = 0; column < 18; column++) {
                    const x = -500 + column * 120;
                    const y = -500 + row * 120;
                    if (y === 100 && x >= 100 && x <= 500) continue;
                    const id = `Dense_${row}_${column}`;
                    tasks.push(`<bpmn:task id="${id}" />`);
                    shapes.push(
                        `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${x}" y="${y}" width="100" height="100" /></bpmndi:BPMNShape>`,
                    );
                }
            }
            const diagram = `dense-preview-${scenario}.bpmn`;
            await writeFile(
                join(workspaceDirectory, diagram),
                source
                    .replace("</bpmn:process>", `${tasks.join("")}</bpmn:process>`)
                    .replace("</bpmndi:BPMNPlane>", `${shapes.join("")}</bpmndi:BPMNPlane>`),
            );
            await vscode().page.locator('.explorer-folders-view [role="tree"]').focus();
            await vscode().runCommand("Refresh Explorer");
            await vscode().openFromExplorer(diagram);
            await vscode().showInCustomEditor(diagram, diagramRendered);
            webview = vscode().webview();
            await switchMode(webview, "implement");
            await webview.getByTitle("Toggle linting overlays", { exact: true }).click();
            await selectElement(webview, "Task_Linked");
            await webview
                .getByText("Saved form loaded.", { exact: true })
                .waitFor({ state: "attached" });
            await settle(webview);
            expect(await preview().isVisible()).toBe(true);
            await assertAnchored();
            await preview().getByRole("button", { name: "Close form preview" }).click();
            await previewAction().waitFor();
            await previewAction().focus();
            await vscode().page.keyboard.press("Enter");
            await preview().waitFor();
            const close = preview().getByRole("button", { name: "Close form preview" });
            await expect
                .poll(() => close.evaluate((node) => node === document.activeElement))
                .toBe(true);
            const geometry = await close.evaluate((node) => {
                const box = node.getBoundingClientRect();
                return {
                    left: box.left,
                    top: box.top,
                    right: box.right,
                    bottom: box.bottom,
                    width: innerWidth,
                    height: innerHeight,
                };
            });
            expect(geometry.left).toBeGreaterThanOrEqual(0);
            expect(geometry.top).toBeGreaterThanOrEqual(0);
            expect(geometry.right).toBeLessThanOrEqual(geometry.width);
            expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
            await vscode().screenshot(join(RESULTS_DIRECTORY, "linked-form-dense-explicit.png"));
            await vscode().page.keyboard.press("Escape");
            expect(await preview().count()).toBe(0);
            await previewAction().waitFor();
            expectNoCspViolations();
        });
        const assertIndicatorFits = async (message: string, closeLabel: string) => {
            const indicator = webview.locator(".linked-form-preview-indicator");
            const status = indicator.getByRole("status");
            await status.getByText(message, { exact: true }).waitFor();
            await settle(webview);
            const geometry = await indicator.evaluate((node) => {
                const status = node.querySelector<HTMLElement>('[role="status"]')!;
                const close = node.querySelector<HTMLElement>("[data-close]")!;
                const box = node.getBoundingClientRect();
                const range = document.createRange();
                range.selectNodeContents(status);
                const inside = (rect: DOMRect) =>
                    rect.width > 0 &&
                    rect.height > 0 &&
                    rect.left >= box.left &&
                    rect.right <= box.right &&
                    rect.top >= box.top &&
                    rect.bottom <= box.bottom;
                return {
                    width: box.width,
                    panelFitsX: node.scrollWidth <= node.clientWidth,
                    panelFitsY: node.scrollHeight <= node.clientHeight,
                    statusFitsX: status.scrollWidth <= status.clientWidth,
                    statusFitsY: status.scrollHeight <= status.clientHeight,
                    textInside: [...range.getClientRects()].every(inside),
                    closeInside: inside(close.getBoundingClientRect()),
                };
            });
            expect(geometry.width).toBeGreaterThan(250);
            expect(geometry.width).toBeLessThanOrEqual(340);
            expect(geometry).toMatchObject({
                panelFitsX: true,
                panelFitsY: true,
                statusFitsX: true,
                statusFitsY: true,
                textInside: true,
                closeInside: true,
            });
            expect(await indicator.getByRole("button", { name: closeLabel }).isVisible()).toBe(
                true,
            );
        };
        const dismissPreview = async () => {
            const close = webview.locator(".linked-form-preview [data-close]");
            if (await close.count()) await close.click();
        };
        const selectLinked = async () => {
            await dismissPreview();
            await selectElement(webview, "Task_Missing");
            await selectElement(webview, "Task_Linked");
            await preview().waitFor();
        };
        const assertAnchored = async () => {
            await settle(webview);
            // SVG boundingBox() can differ from DOM geometry in a scaled host iframe.
            const { box, canvas, task, pad, maxHeight } = await preview().evaluate((node) => {
                const rect = (element: Element | null) => {
                    if (!element) return null;
                    const { x, y, width, height } = element.getBoundingClientRect();
                    return { x, y, width, height };
                };
                return {
                    box: rect(node),
                    canvas: rect(document.querySelector("#js-canvas .djs-container")),
                    task: rect(
                        document.querySelector(
                            '.djs-shape[data-element-id="Task_Linked"] .djs-visual > rect',
                        ),
                    ),
                    pad: rect(document.querySelector(".djs-context-pad.open")),
                    maxHeight: parseFloat((node as HTMLElement).style.maxHeight),
                };
            });
            expect(box).not.toBeNull();
            expect(canvas).not.toBeNull();
            expect(task).not.toBeNull();
            expect(pad).not.toBeNull();
            expect(box!.x).toBeGreaterThanOrEqual(canvas!.x);
            expect(box!.y).toBeGreaterThanOrEqual(canvas!.y);
            expect(box!.x + box!.width).toBeLessThanOrEqual(canvas!.x + canvas!.width + 1);
            expect(box!.y + box!.height).toBeLessThanOrEqual(canvas!.y + canvas!.height + 1);
            const edge = Math.min(8, canvas!.width / 4, canvas!.height / 4);
            const desiredLeft = Math.max(task!.x + task!.width, pad!.x + pad!.width) + 12;
            const expectedLeft = Math.max(
                canvas!.x + edge,
                Math.min(desiredLeft, canvas!.x + canvas!.width - edge - box!.width),
            );
            expect(box!.x).toBeCloseTo(expectedLeft, 0);
            const expectedTop = Math.max(
                canvas!.y + edge,
                Math.min(task!.y, canvas!.y + canvas!.height - edge - maxHeight),
            );
            expect(box!.y).toBeCloseTo(expectedTop, 0);
            expect(
                await preview()
                    .locator(".linked-form-preview-content")
                    .evaluate((node) => node.clientHeight),
            ).toBeGreaterThan(0);
        };
        it.each(COLOR_THEMES)(
            "anchors read-only content and aligned controls in $id",
            async (theme) => {
                await vscode().setColorTheme(theme.name);
                await expect
                    .poll(() => webview.locator("body").getAttribute("class"))
                    .toContain(theme.bodyClass);
                await selectLinked();
                await webview.getByText("Saved form loaded.", { exact: true }).waitFor();
                await assertAnchored();
                expect(await previewAction().count()).toBe(0);
                expect(
                    await webview.locator('[data-action="navigate-to-referenced-model"]').count(),
                ).toBe(1);
                expect(
                    await preview().evaluate((node) => node.contains(document.activeElement)),
                ).toBe(false);
                const close = preview().getByRole("button", { name: "Close form preview" });
                const closeBox = await close.boundingBox();
                const refreshBox = await preview()
                    .getByRole("button", { name: "Refresh", exact: true })
                    .boundingBox();
                const panelBox = await preview().boundingBox();
                expect(closeBox).not.toBeNull();
                expect(refreshBox).not.toBeNull();
                expect(
                    Math.abs(
                        refreshBox!.y +
                            refreshBox!.height / 2 -
                            (closeBox!.y + closeBox!.height / 2),
                    ),
                ).toBeLessThanOrEqual(1);
                expect(closeBox!.x - (refreshBox!.x + refreshBox!.width)).toBeCloseTo(8, 0);
                expect(closeBox!.x + closeBox!.width).toBeGreaterThan(
                    panelBox!.x + panelBox!.width - 16,
                );
                expect(closeBox!.y).toBeLessThan(panelBox!.y + 16);
                const input = webview.getByRole("textbox", { name: "Customer name" });
                expect(await input.getAttribute("readonly")).not.toBeNull();
                const colors = await input.evaluate((node) => ({
                    background: getComputedStyle(node).backgroundColor,
                    color: getComputedStyle(node).color,
                }));
                expect(colors.background).not.toBe(colors.color);
                if (theme.id !== "light") expect(colors.background).not.toBe("rgb(255, 255, 255)");
                await vscode().screenshot(join(RESULTS_DIRECTORY, `linked-form-${theme.id}.png`));
                await close.click();
                await previewAction().waitFor();
                expect(await preview().count()).toBe(0);
                await settle(webview);
                expect(await preview().count()).toBe(0);
                expectNoCspViolations();
            },
        );

        it("reopens by keyboard after dismissal and restores canvas focus on Escape", async () => {
            await selectLinked();
            await preview().getByRole("button", { name: "Close form preview" }).click();
            await previewAction().waitFor();
            await previewAction().focus();
            await vscode().page.keyboard.press("Enter");
            await preview().waitFor();
            await preview().getByRole("button", { name: "Close form preview" }).focus();
            await vscode().page.keyboard.press("Escape");
            await previewAction().waitFor();
            expect(
                await webview
                    .locator(".djs-container > svg")
                    .evaluate((node) => node === document.activeElement),
            ).toBe(true);
            expectNoCspViolations();
        });

        it("converges across repeated loaded selections and missing indicators without resize errors", async () => {
            await webview.locator("body").evaluate(() => {
                const errors: string[] = [];
                Object.assign(window, { previewResizeErrors: errors });
                window.addEventListener("error", (event) => {
                    if (event.message.includes("ResizeObserver")) errors.push(event.message);
                });
            });
            for (const theme of COLOR_THEMES) {
                await vscode().setColorTheme(theme.name);
                for (const id of ["Task_Missing", "Task_Unlinked", "Task_Missing"]) {
                    await selectLinked();
                    await assertAnchored();
                    const loadedStable = await preview().evaluate(async (node) => {
                        const measurements: string[] = [];
                        for (let frame = 0; frame < 12; frame++) {
                            await new Promise(requestAnimationFrame);
                            measurements.push(
                                JSON.stringify(node.getBoundingClientRect().toJSON()),
                            );
                        }
                        return new Set(measurements.slice(4)).size;
                    });
                    expect(loadedStable).toBe(1);
                    // Adjacent previews may cover neighbors; dismiss before selecting one.
                    await preview().getByRole("button", { name: "Close form preview" }).click();
                    await selectElement(webview, id);
                    await webview.locator(`.djs-shape.selected[data-element-id="${id}"]`).waitFor();
                    if (id === "Task_Missing") {
                        const indicator = webview.locator(".linked-form-preview-indicator");
                        await indicator.waitFor();
                        for (const motion of [
                            { deltaX: 20, deltaY: 0, ctrlKey: false },
                            { deltaX: 0, deltaY: -100, ctrlKey: true },
                            { deltaX: 0, deltaY: 100, ctrlKey: true },
                            { deltaX: -20, deltaY: 0, ctrlKey: false },
                        ]) {
                            await webview
                                .locator(".djs-container > svg")
                                .evaluate((node, motion) => {
                                    const box = node.getBoundingClientRect();
                                    node.dispatchEvent(
                                        new WheelEvent("wheel", {
                                            bubbles: true,
                                            cancelable: true,
                                            clientX: box.x + box.width / 2,
                                            clientY: box.y + box.height / 2,
                                            ...motion,
                                        }),
                                    );
                                }, motion);
                            await settle(webview);
                        }
                        const stable = await indicator.evaluate(async (node) => {
                            const measurements: string[] = [];
                            for (let frame = 0; frame < 12; frame++) {
                                await new Promise(requestAnimationFrame);
                                measurements.push(
                                    JSON.stringify(node.getBoundingClientRect().toJSON()),
                                );
                            }
                            return new Set(measurements.slice(4)).size;
                        });
                        expect(stable).toBe(1);
                    }
                }
            }
            expect(
                await webview
                    .locator("body")
                    .evaluate(
                        () =>
                            (window as unknown as { previewResizeErrors: string[] })
                                .previewResizeErrors,
                    ),
            ).toEqual([]);
        });

        it.each([
            { width: 280, height: 0, wrapped: false },
            { width: 200, height: 240, wrapped: true },
        ])(
            "keeps a usable scrolling form and reachable controls at width=$width height=$height",
            async ({ width, height, wrapped }) => {
                const schema = JSON.parse(original);
                schema.components = Array.from({ length: 12 }, (_, index) => ({
                    ...schema.components[0],
                    id: `Field_${index}`,
                    key: `field${index}`,
                    layout: { row: `Row_${index}`, columns: null },
                }));
                await writeFile(file, JSON.stringify(schema));
                await webview.locator("body").evaluate(() => {
                    const errors: string[] = [];
                    Object.assign(window, { previewResizeErrors: errors });
                    window.addEventListener("error", (event) => {
                        if (event.message.includes("ResizeObserver")) errors.push(event.message);
                    });
                });
                await selectLinked();
                await preview()
                    .locator(".linked-form-preview-content")
                    .evaluate(
                        (content, { width, height }) => {
                            const panel = content.closest<HTMLElement>(".linked-form-preview")!;
                            const canvas = document.querySelector<HTMLElement>(
                                "#js-canvas .djs-container",
                            )!;
                            const task = document
                                .querySelector('[data-element-id="Task_Linked"]')!
                                .getBoundingClientRect();
                            const pad = document
                                .querySelector(".djs-context-pad.open")!
                                .getBoundingClientRect();
                            const chrome =
                                panel.getBoundingClientRect().height - content.clientHeight;
                            canvas.style.width = `${width}px`;
                            canvas.style.height = `${height || Math.max(task.bottom, pad.bottom) - canvas.getBoundingClientRect().top + 12 + chrome + 96 + 8}px`;
                        },
                        { width, height },
                    );
                await settle(webview);
                await assertAnchored();
                const geometry = await preview().evaluate(async (node) => {
                    const content = node.querySelector<HTMLElement>(
                        ".linked-form-preview-content",
                    )!;
                    const measurements: string[] = [];
                    for (let frame = 0; frame < 16; frame++) {
                        await new Promise(requestAnimationFrame);
                        measurements.push(
                            JSON.stringify({
                                box: node.getBoundingClientRect().toJSON(),
                                height: content.clientHeight,
                            }),
                        );
                    }
                    content.scrollTop = content.scrollHeight;
                    const close = node.querySelector<HTMLElement>("[data-close]")!;
                    const header = node.querySelector<HTMLElement>("header")!;
                    content.scrollIntoView({ block: "nearest" });
                    const panelBox = node.getBoundingClientRect();
                    const contentBox = content.getBoundingClientRect();
                    close.scrollIntoView({ block: "nearest" });
                    const closeBox = close.getBoundingClientRect();
                    return {
                        usableHeight: content.clientHeight,
                        scrollHeight: content.scrollHeight,
                        scrolled: content.scrollTop > 0,
                        contentInside:
                            contentBox.top >= panelBox.top && contentBox.bottom <= panelBox.bottom,
                        wrapped:
                            header.getBoundingClientRect().height >
                            Math.max(
                                ...Array.from(
                                    header.children,
                                    (child) => child.getBoundingClientRect().height,
                                ),
                            ) +
                                1,
                        closeInside:
                            closeBox.left >= panelBox.left &&
                            closeBox.right <= panelBox.right &&
                            closeBox.top >= panelBox.top &&
                            closeBox.bottom <= panelBox.bottom,
                        stable: new Set(measurements.slice(6)).size,
                        errors: (window as unknown as { previewResizeErrors: string[] })
                            .previewResizeErrors,
                    };
                });
                expect(geometry.usableHeight).toBeGreaterThanOrEqual(64);
                expect(geometry.scrollHeight).toBeGreaterThan(geometry.usableHeight);
                expect(geometry.scrolled).toBe(true);
                expect(geometry.contentInside).toBe(true);
                expect(geometry.closeInside).toBe(true);
                expect(geometry.wrapped).toBe(wrapped);
                expect(geometry.stable).toBe(1);
                expect(geometry.errors).toEqual([]);
            },
        );

        it("follows pan and zoom at the clamped adjacent position", async () => {
            await selectLinked();
            const shape = webview.locator('.djs-shape[data-element-id="Task_Linked"]');
            const svg = webview.locator(".djs-container > svg");
            const svgBox = await svg.boundingBox();
            await svg.hover({ position: { x: 8, y: svgBox!.height - 20 } });
            const beforePan = await shape.boundingBox();
            await svg.evaluate((node) =>
                node.dispatchEvent(
                    new WheelEvent("wheel", {
                        bubbles: true,
                        cancelable: true,
                        deltaX: 40,
                        deltaY: 0,
                    }),
                ),
            );
            await expect.poll(async () => (await shape.boundingBox())!.x).not.toBe(beforePan!.x);
            await settle(webview);
            await assertAnchored();
            const beforeZoom = await shape.boundingBox();
            await svg.evaluate((node) => {
                const box = node.getBoundingClientRect();
                node.dispatchEvent(
                    new WheelEvent("wheel", {
                        bubbles: true,
                        cancelable: true,
                        ctrlKey: true,
                        deltaY: -100,
                        clientX: box.x + box.width / 2,
                        clientY: box.y + box.height / 2,
                    }),
                );
            });
            await expect
                .poll(async () => (await shape.boundingBox())!.width)
                .not.toBe(beforeZoom!.width);
            await settle(webview);
            await assertAnchored();
            // Restore the viewport before clicking tasks that zooming moved under the palette.
            await svg.evaluate((node) => {
                const box = node.getBoundingClientRect();
                node.dispatchEvent(
                    new WheelEvent("wheel", {
                        bubbles: true,
                        cancelable: true,
                        ctrlKey: true,
                        deltaY: 100,
                        clientX: box.x + box.width / 2,
                        clientY: box.y + box.height / 2,
                    }),
                );
                node.dispatchEvent(
                    new WheelEvent("wheel", {
                        bubbles: true,
                        cancelable: true,
                        deltaX: -40,
                        deltaY: 0,
                    }),
                );
            });
            await settle(webview);
            await assertAnchored();
            expectNoCspViolations();
        });

        it("indicates missing references but stays quiet for unlinked automatic selections", async () => {
            await selectLinked();
            await dismissPreview();
            await selectElement(webview, "Task_Missing");
            await expect.poll(() => preview().count()).toBe(0);
            const indicator = webview.locator(".linked-form-preview-indicator");
            await indicator
                .getByRole("status")
                .getByText("The linked form is missing or invalid. Check the form reference.", {
                    exact: true,
                })
                .waitFor();
            expect(
                await indicator.getByRole("button", { name: "Refresh", exact: true }).count(),
            ).toBe(0);
            expect(
                await indicator.getByRole("button", { name: "Close form preview" }).count(),
            ).toBe(1);
            expect(await previewAction().count()).toBe(0);
            await assertIndicatorFits(
                "The linked form is missing or invalid. Check the form reference.",
                "Close form preview",
            );
            await dismissPreview();
            await selectElement(webview, "Task_Unlinked");
            expect(await preview().count()).toBe(0);
            expect(await indicator.count()).toBe(0);
            expectNoCspViolations();
        });

        it("wraps the full longer localized indicator without clipping its close button", async () => {
            await selectElement(webview, "Task_Missing");
            const changeLanguage = async (label: string) => {
                await vscode().runCommand("Change Modeler Language");
                await vscode()
                    .page.locator(".quick-input-widget")
                    .getByText(label, { exact: true })
                    .click();
            };
            try {
                await changeLanguage("Deutsch");
                await assertIndicatorFits(
                    "Das verknüpfte Formular fehlt oder ist ungültig. Prüfen Sie den Formularverweis.",
                    "Formularvorschau schließen",
                );
                expect(await previewAction().count()).toBe(0);
                expectNoCspViolations();
            } finally {
                await changeLanguage("English");
                await webview
                    .getByRole("status")
                    .getByText("The linked form is missing or invalid. Check the form reference.", {
                        exact: true,
                    })
                    .waitFor();
            }
        });

        it("blocks primary and auxiliary form links without widening CSP", async () => {
            await selectLinked();
            const withLinks = JSON.parse(original);
            withLinks.components.push(
                {
                    type: "text",
                    id: "Markdown_Link",
                    text: "[Markdown preview link](https://preview.invalid/markdown)",
                },
                {
                    type: "html",
                    id: "Html_Link",
                    content: '<a href="https://preview.invalid/html">HTML preview link</a>',
                },
            );
            await writeFile(file, JSON.stringify(withLinks));
            await webview.getByRole("button", { name: "Refresh", exact: true }).click();
            for (const name of ["Markdown preview link", "HTML preview link"]) {
                const link = webview.getByRole("link", { name, exact: true });
                await link.waitFor();
                const href = await webview.locator("html").evaluate(() => window.location.href);
                await webview.locator("body").evaluate((body) => {
                    delete body.dataset.previewAuxPrevented;
                    window.addEventListener(
                        "auxclick",
                        (event) => {
                            // Native events can run microtasks between capture listeners.
                            setTimeout(() => {
                                body.dataset.previewAuxPrevented = String(event.defaultPrevented);
                            }, 0);
                        },
                        { capture: true, once: true },
                    );
                });
                await link.click({ button: "middle" });
                await expect
                    .poll(() => webview.locator("body").getAttribute("data-preview-aux-prevented"))
                    .toBe("true");
                expect(await webview.locator("html").evaluate(() => window.location.href)).toBe(
                    href,
                );
                expect(await preview().isVisible()).toBe(true);
                await link.click();
                expect(await webview.locator("html").evaluate(() => window.location.href)).toBe(
                    href,
                );
            }
            expectNoCspViolations();
        });

        it("refreshes saved content and recovers explicit errors without changing the form", async () => {
            await selectLinked();
            await writeFile(file, original.replace("Customer name", "Saved updated name"));
            await webview.getByRole("button", { name: "Refresh", exact: true }).click();
            await webview.getByRole("textbox", { name: "Saved updated name" }).waitFor();
            expect(await readFile(file, "utf8")).toBe(
                original.replace("Customer name", "Saved updated name"),
            );
            expect(await vscode().isActiveTabDirty()).toBe(false);
            await writeFile(file, original.replace('"textfield"', '"iframe"'));
            await webview.getByRole("button", { name: "Refresh", exact: true }).click();
            await preview()
                .getByRole("status")
                .getByText(
                    "The saved form is invalid or unsupported. Open it in the form editor.",
                    { exact: true },
                )
                .waitFor();
            expect(await preview().getByRole("textbox").count()).toBe(0);
            await writeFile(file, original);
            await webview.getByRole("button", { name: "Refresh", exact: true }).click();
            await preview().getByRole("textbox", { name: "Customer name" }).waitFor();
            await rm(file);
            await webview.getByRole("button", { name: "Refresh", exact: true }).click();
            await preview()
                .getByRole("status")
                .getByText("No saved local form matches this reference. Refresh to try again.", {
                    exact: true,
                })
                .waitFor();
            await settle(webview);
            expect(await preview().getByRole("textbox").count()).toBe(0);
            await writeFile(file, original);
            await webview.getByRole("button", { name: "Refresh", exact: true }).click();
            await preview().getByRole("textbox", { name: "Customer name" }).waitFor();
            expectNoCspViolations();
        });

        it("indicates initially malformed JSON with a hidden action and recovers on resolution", async () => {
            await selectLinked();
            await dismissPreview();
            await selectElement(webview, "Task_Missing");
            await webview.locator("html").evaluate((node, formId) => {
                const receive = (event: MessageEvent) => {
                    if (
                        event.data?.type === "FormReferenceStatusQuery" &&
                        !event.data.formIds.includes(formId)
                    ) {
                        node.setAttribute("data-form-unavailable", "true");
                        window.removeEventListener("message", receive);
                    }
                };
                window.addEventListener("message", receive);
            }, JSON.parse(original).id);
            await writeFile(file, "invalid JSON");
            await expect
                .poll(() => webview.locator("html").getAttribute("data-form-unavailable"))
                .toBe("true");
            await selectElement(webview, "Task_Missing");
            expect(await previewAction().count()).toBe(0);
            await selectElement(webview, "Task_Linked");
            await settle(webview);
            expect(await preview().count()).toBe(0);
            await webview
                .locator(".linked-form-preview-indicator")
                .getByRole("status")
                .getByText("The linked form is missing or invalid. Check the form reference.", {
                    exact: true,
                })
                .waitFor();
            expect(await previewAction().count()).toBe(0);
            await writeFile(file, original);
            await webview.getByRole("textbox", { name: "Customer name" }).waitFor();
            expect(await webview.locator(".linked-form-preview-indicator").count()).toBe(0);
            expectNoCspViolations();
        });

        it("indicates invalid automatic schema without a broken preview panel", async () => {
            await selectLinked();
            await dismissPreview();
            await selectElement(webview, "Task_Unlinked");
            await writeFile(file, original.replace('"textfield"', '"iframe"'));
            await selectElement(webview, "Task_Linked");
            await webview
                .locator(".linked-form-preview-indicator")
                .getByRole("status")
                .getByText(
                    "The saved form is invalid or unsupported. Open it in the form editor.",
                    { exact: true },
                )
                .waitFor();
            expect(await preview().count()).toBe(0);
            expect(await previewAction().count()).toBe(0);
            await dismissPreview();
            await selectElement(webview, "Task_Unlinked");
            expect(await webview.locator(".linked-form-preview-indicator").count()).toBe(0);
            await writeFile(file, original);
            await selectLinked();
            expectNoCspViolations();
        });

        it("retains the independent form editor action", async () => {
            await selectLinked();
            await preview().getByRole("button", { name: "Close form preview" }).click();
            await webview.locator('[data-action="navigate-to-referenced-model"]').click();
            await vscode().showInCustomEditor(FORM_FILE, (frame) =>
                frame.getByText("Customer name").first().isVisible(),
            );
            webview = vscode().webview();
            expect(await webview.locator("#form-editor").isVisible()).toBe(true);
            expectNoCspViolations();
        });
    });

    // Runs last: proves the collector sees violations, so the empty lists above mean something.
    it("reports a script the BPMN webview's policy blocks", async () => {
        await vscode().openFromExplorer(BPMN_FILE);
        await vscode().showInCustomEditor(BPMN_FILE, diagramRendered);
        await vscode()
            .webview()
            .locator("html")
            .evaluate(() => {
                const injectedScript = document.createElement("script");
                injectedScript.textContent = "document.body.dataset.cspProbe = 'ran'";
                document.head.append(injectedScript);
            });

        await expect
            .poll(() => vscode().cspViolations.join("\n"), { timeout: TIMEOUT_MS })
            .toContain("script-src");
        expect(await vscode().webview().locator("body").getAttribute("data-csp-probe")).toBeNull();
    });
});
