import { readFile } from "node:fs/promises";

import { BpmnModdle } from "bpmn-moddle";
import type { FrameLocator, Locator } from "playwright-core";
import { describe, expect, it } from "vitest";

import { diagramRendered, selectElement, settle, switchMode } from "./support/modeler";
import { fixtures, smokeSuite } from "./support/smokeSuite";
import { COMMAND_KEY } from "./vscodeSession";

const BPMN_FILE = "smoke.bpmn";
/** A process with a script task and two tasks whose element templates carry an icon. */
const TEMPLATED_FILE = "smoke-csp.bpmn";
const HTTPS_ICON = "https://icons.invalid/smoke-template.svg";
const TASK_ID = "Task_Check";
const ORIGINAL_TASK_NAME = "Check order";
const RENAMED_TASK_NAME = "Ship order";

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

async function diagramInView(webview: FrameLocator): Promise<boolean> {
    return webview.locator(".djs-container").evaluate((container) => {
        const view = container.getBoundingClientRect();
        return [...container.querySelectorAll(".djs-element.djs-shape")].every((shape) => {
            const box = shape.getBoundingClientRect();
            const onAnotherPlane = box.width === 0;
            return (
                onAnotherPlane ||
                (box.left >= view.left &&
                    box.right <= view.right &&
                    box.top >= view.top &&
                    box.bottom <= view.bottom)
            );
        });
    });
}

function canvasFocusMarked(container: Locator): Promise<boolean> {
    return container.locator(".fit-viewport-button[data-canvas-focused]").isVisible();
}

function templateIconOnCanvas(webview: FrameLocator, elementId: string): Promise<string | null> {
    return webview
        .locator(`.djs-shape[data-element-id="${elementId}"] .djs-visual image`)
        .first()
        .getAttribute("href");
}

const suite = smokeSuite({
    name: "bpmn-editor",
    workspace: fixtures(BPMN_FILE, TEMPLATED_FILE, ".camunda"),
});
const { vscode } = suite;

const openTemplatedDiagram = () =>
    suite.open(
        TEMPLATED_FILE,
        async (webview) => (await templateIconOnCanvas(webview, "Task_HttpsIcon")) !== null,
    );

describe("the BPMN editor of the packaged extension in a real VS Code", () => {
    it("opens a BPMN file in the BPMN custom editor and renders its diagram", async () => {
        const webview = await suite.open(BPMN_FILE, diagramRendered);

        expect(await taskLabel(webview)).toBe(ORIGINAL_TASK_NAME);
    });

    it("renames a task through direct editing, saves it and undoes the rename in the file", async () => {
        const file = suite.file(BPMN_FILE);
        const webview = await suite.open(BPMN_FILE, diagramRendered);
        await webview.locator(`.djs-shape[data-element-id="${TASK_ID}"] > .djs-hit`).dblclick();
        const textBox = webview.locator(".djs-direct-editing-content");
        await textBox.waitFor({ state: "visible" });
        await textBox.fill(RENAMED_TASK_NAME);
        await vscode().page.keyboard.press("Enter");
        await textBox.waitFor({ state: "hidden" });
        await expect.poll(() => taskLabel(webview)).toBe(RENAMED_TASK_NAME);
        await expect.poll(() => vscode().isActiveTabDirty()).toBe(true);

        await vscode().page.keyboard.press(`${COMMAND_KEY}+s`);

        await expect.poll(() => vscode().isActiveTabDirty()).toBe(false);
        await expect.poll(() => taskNameInFile(file)).toBe(RENAMED_TASK_NAME);

        await vscode().page.keyboard.press(`${COMMAND_KEY}+z`);

        await expect.poll(() => taskLabel(webview)).toBe(ORIGINAL_TASK_NAME);
        await expect.poll(() => vscode().isActiveTabDirty()).toBe(true);
        await vscode().page.keyboard.press(`${COMMAND_KEY}+s`);
        await expect.poll(() => taskNameInFile(file)).toBe(ORIGINAL_TASK_NAME);
    });

    it("fits the panned-away diagram back into view from the canvas button", async () => {
        const webview = await suite.open(BPMN_FILE, diagramRendered);
        const canvas = await webview.locator(".djs-container").boundingBox();
        if (!canvas) throw new Error("The canvas is not visible");
        await vscode().page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
        await vscode().page.mouse.wheel(2000, 1500);
        await expect.poll(() => diagramInView(webview)).toBe(false);
        await settle(webview);
        await suite.screenshot("bpmn-fit-before");

        await webview.getByRole("button", { name: "Fit diagram to view" }).click();

        await expect.poll(() => diagramInView(webview)).toBe(true);
        await settle(webview);
        await suite.screenshot("bpmn-fit-after");
    });

    it("marks the fit button once Escape hands the canvas the keyboard from the properties panel", async () => {
        const webview = await suite.open(BPMN_FILE, diagramRendered);
        const container = webview.locator(".bjs-container .djs-container");
        await webview
            .locator("#js-properties-panel .bio-properties-panel-group-header")
            .first()
            .click();
        expect(await canvasFocusMarked(container)).toBe(false);

        await vscode().page.keyboard.press("Escape");

        await expect.poll(() => canvasFocusMarked(container)).toBe(true);
        await settle(webview);
        await suite.screenshot("bpmn-canvas-focus");
    });

    it("renders data: and https: element-template icons", async () => {
        const webview = await openTemplatedDiagram();

        expect(await templateIconOnCanvas(webview, "Task_DataIcon")).toMatch(
            /^data:image\/svg\+xml/,
        );
        expect(await templateIconOnCanvas(webview, "Task_HttpsIcon")).toBe(HTTPS_ICON);
        await selectElement(webview, "Task_HttpsIcon");
        await webview
            .locator(`#js-properties-panel img[src="${HTTPS_ICON}"]`)
            .first()
            .waitFor({ state: "attached" });
    });

    it("switches between View, Design and Implement", async () => {
        const webview = await suite.open(BPMN_FILE, diagramRendered);

        for (const mode of ["view", "design", "implement"]) {
            await switchMode(webview, mode);
            expect(await diagramRendered(webview)).toBe(true);
        }
    });

    it("edits a script task's expression in the FEEL editor", async () => {
        const webview = await openTemplatedDiagram();
        await switchMode(webview, "implement");
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
    });

    it("copies the diagram as SVG from the command palette", async () => {
        await openTemplatedDiagram();

        await vscode().runCommand("Copy Diagram as SVG");

        await expect
            .poll(() => vscode().clipboardText())
            .toContain('data-element-id="Task_Script"');
    });

    // Proves the collector sees violations, so a test that reports none means something.
    it("reports a script the BPMN webview's policy blocks", async () => {
        const webview = await suite.open(BPMN_FILE, diagramRendered);

        await webview.locator("html").evaluate(() => {
            const injectedScript = document.createElement("script");
            injectedScript.textContent = "document.body.dataset.cspProbe = 'ran'";
            document.head.append(injectedScript);
        });

        await expect.poll(() => vscode().cspViolations.join("\n")).toContain("script-src");
        expect(await webview.locator("body").getAttribute("data-csp-probe")).toBeNull();
        // The suite fails a test that leaves a violation behind; this one made its own.
        vscode().takeCspViolations();
    });
});
