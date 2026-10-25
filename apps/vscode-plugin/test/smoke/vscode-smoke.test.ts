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

describe("the packaged extension in a real VS Code", () => {
    let rootDirectory = "";
    let workspaceDirectory = "";
    let session: VsCodeSession | undefined;
    let failed = false;

    const vscode = (): VsCodeSession => {
        if (!session) throw new Error("VS Code did not start");
        return session;
    };

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

    it("opens a DMN file in the DMN custom editor", async () => {
        await vscode().openFromExplorer(DMN_FILE);
        await vscode().showInCustomEditor(DMN_FILE, (webview) =>
            webview.getByText("Decision 1").first().isVisible(),
        );
        await settle(vscode().webview());
        await vscode().screenshot(join(RESULTS_DIRECTORY, "dmn.png"));
    });

    it("opens a form file in the form editor", async () => {
        await vscode().openFromExplorer(FORM_FILE);
        await vscode().showInCustomEditor(FORM_FILE, (webview) =>
            webview.getByText("Customer name").first().isVisible(),
        );
        await settle(vscode().webview());
        await vscode().screenshot(join(RESULTS_DIRECTORY, "form.png"));
    });
});
