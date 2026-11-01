import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { BpmnModdle } from "bpmn-moddle";
import type { FrameLocator } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { COMMAND_KEY, VsCodeSession, downloadVsCode, packExtension } from "./vscodeSession";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DIST_DIRECTORY = join(REPOSITORY_ROOT, "dist/apps/vscode-plugin");
const RESULTS_DIRECTORY = join(REPOSITORY_ROOT, "test-results/vscode-smoke");
const FIXTURES_DIRECTORY = fileURLToPath(new URL("./fixtures/", import.meta.url));

const BPMN_FILE = "smoke.bpmn";
const DMN_FILE = "smoke.dmn";
const FORM_FILE = "smoke.form";
const CSP_FILE = "smoke-csp.bpmn";
const TEMPLATE_FILE = "smoke-template.json";
const TEMPLATE_NAME = "Smoke template";
const C8_TEMPLATE_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";
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
    await webview.locator(`.djs-shape[data-element-id="${elementId}"] > .djs-hit`).click();
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
        rootDirectory = await mkdtemp(join(tmpdir(), "bpmn-modeler-vscode-smoke-"));
        workspaceDirectory = join(rootDirectory, "workspace");
        await cp(FIXTURES_DIRECTORY, workspaceDirectory, { recursive: true });

        const manifest = JSON.parse(await readFile(join(DIST_DIRECTORY, "package.json"), "utf8"));
        const extensionPath = await packExtension(DIST_DIRECTORY, rootDirectory);
        const executablePath = await downloadVsCode(
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
        const file = join(workspaceDirectory, ".camunda", "element-templates", TEMPLATE_FILE);
        await vscode().runCommand("New Element Template");
        const name = page.locator(".quick-input-widget .quick-input-box input");
        await expect.poll(() => name.inputValue(), { timeout: TIMEOUT_MS }).toBe("new-template");
        await name.fill("smoke-template");
        await page.keyboard.press("Enter");

        await vscode().showInCustomEditor(TEMPLATE_FILE, (webview) =>
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
                $schema: C8_TEMPLATE_SCHEMA,
                name: TEMPLATE_NAME,
                id: "smoke-template",
                version: 1,
                appliesTo: ["bpmn:Task"],
                properties: [],
            });
        expectNoCspViolations();
    });

    it("edits the template in the builder and previews its property", async () => {
        const file = join(workspaceDirectory, ".camunda", "element-templates", TEMPLATE_FILE);
        const webview = vscode().webview();
        await webview
            .locator('[data-entry-id="template-description"]')
            .locator("input, textarea")
            .fill("Written by the smoke test");
        await webview.getByRole("tab", { name: /^Properties/ }).click();
        await webview.getByRole("button", { name: "Add property" }).click();
        const label = webview.locator('[data-entry-id="property-0-label"] input');
        await expect.poll(() => label.inputValue(), { timeout: TIMEOUT_MS }).toBe("New property");
        await label.fill("Order number");

        // The preview keeps the panel's collapsed groups, so the field is there but maybe folded.
        await webview
            .locator("#js-properties-panel")
            .getByText("Order number", { exact: true })
            .first()
            .waitFor({ state: "attached" });
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
        await vscode().page.keyboard.press("Escape");
        await webview.locator(".etc-modal").waitFor({ state: "detached" });
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
