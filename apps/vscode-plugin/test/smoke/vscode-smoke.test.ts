import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { BpmnModdle } from "bpmn-moddle";
import type { FrameLocator } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

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
const CSP_FILE = "smoke-csp.bpmn";
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

    it("automatically anchors linked saved forms without blocking the canvas and keeps manual reopen", async () => {
        const file = join(workspaceDirectory, FORM_FILE);
        const original = await readFile(file, "utf8");
        await vscode().openFromExplorer("linked-form.bpmn");
        await vscode().showInCustomEditor("linked-form.bpmn", diagramRendered);
        let webview = vscode().webview();
        await switchMode(webview, "implement");
        const previewAction = () => webview.locator('[data-action="preview-linked-form"]');
        const preview = () => webview.getByRole("region", { name: "Linked form preview" });
        const selectLinked = async () => {
            await selectElement(webview, "Task_Missing");
            await selectElement(webview, "Task_Linked");
            await preview().waitFor();
        };
        const assertAnchored = async () => {
            const box = await preview().boundingBox();
            const canvas = await webview.locator("#js-canvas .djs-container").boundingBox();
            const task = await webview
                .locator('.djs-shape[data-element-id="Task_Linked"]')
                .boundingBox();
            const pad = await webview.locator(".djs-context-pad.open").boundingBox();
            expect(box).not.toBeNull();
            expect(canvas).not.toBeNull();
            expect(task).not.toBeNull();
            expect(pad).not.toBeNull();
            expect(box!.x).toBeGreaterThanOrEqual(canvas!.x);
            expect(box!.y).toBeGreaterThanOrEqual(canvas!.y);
            expect(box!.x + box!.width).toBeLessThanOrEqual(canvas!.x + canvas!.width + 1);
            expect(box!.y + box!.height).toBeLessThanOrEqual(canvas!.y + canvas!.height + 1);
            const overlaps = (a: NonNullable<typeof box>, b: NonNullable<typeof box>) =>
                a.x < b.x + b.width &&
                a.x + a.width > b.x &&
                a.y < b.y + b.height &&
                a.y + a.height > b.y;
            expect(overlaps(box!, task!)).toBe(false);
            expect(overlaps(box!, pad!)).toBe(false);
            const gapX = Math.min(
                Math.abs(box!.x - task!.x - task!.width),
                Math.abs(task!.x - box!.x - box!.width),
            );
            const gapY = Math.min(
                Math.abs(box!.y - task!.y - task!.height),
                Math.abs(task!.y - box!.y - box!.height),
            );
            expect(Math.min(gapX, gapY)).toBeLessThan(200);
        };
        try {
            for (const theme of COLOR_THEMES) {
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
                const panelBox = await preview().boundingBox();
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
            }
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
            await selectElement(webview, "Task_Missing");
            await expect.poll(() => preview().count()).toBe(0);
            expect(await previewAction().count()).toBe(0);
            await selectElement(webview, "Task_Unlinked");
            expect(await preview().count()).toBe(0);
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
            }
            await writeFile(file, original.replace("Customer name", "Saved updated name"));
            await webview.getByRole("button", { name: "Refresh", exact: true }).click();
            await webview.getByRole("textbox", { name: "Saved updated name" }).waitFor();
            expect(await readFile(file, "utf8")).toBe(
                original.replace("Customer name", "Saved updated name"),
            );
            expect(await vscode().isActiveTabDirty()).toBe(false);
            await writeFile(file, original.replace('"textfield"', '"iframe"'));
            await webview.getByRole("button", { name: "Refresh", exact: true }).click();
            await expect.poll(() => preview().count()).toBe(0);
            await previewAction().waitFor();
            await writeFile(file, "invalid JSON");
            await selectElement(webview, "Task_Missing");
            expect(await previewAction().count()).toBe(0);
            await selectElement(webview, "Task_Linked");
            await settle(webview);
            expect(await preview().count()).toBe(0);
            await writeFile(file, original);
            await selectLinked();
            await webview.getByRole("textbox", { name: "Customer name" }).waitFor();
            await preview().getByRole("button", { name: "Close form preview" }).click();
            await webview.locator('[data-action="navigate-to-referenced-model"]').click();
            await vscode().showInCustomEditor(FORM_FILE, (frame) =>
                frame.getByText("Customer name").first().isVisible(),
            );
            webview = vscode().webview();
            expect(await webview.locator("#form-editor").isVisible()).toBe(true);
            expectNoCspViolations();
        } finally {
            await writeFile(file, original);
        }
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
