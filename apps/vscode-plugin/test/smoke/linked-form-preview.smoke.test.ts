import { cp, readFile, rm, writeFile } from "node:fs/promises";

import type { FrameLocator } from "playwright-core";
import { beforeEach, describe, expect, it } from "vitest";

import {
    COLOR_THEMES,
    diagramRendered,
    selectElement,
    settle,
    switchMode,
} from "./support/modeler";
import { fixtures, smokeSuite } from "./support/smokeSuite";

const DIAGRAM_FILE = "linked-form.bpmn";
const FORM_FILE = "smoke.form";

const suite = smokeSuite({
    name: "linked-form-preview",
    workspace: fixtures(DIAGRAM_FILE, FORM_FILE),
});
const { vscode } = suite;

describe("the preview of a user task's linked form in a real VS Code", () => {
    let file: string;
    let original: string;
    let webview: FrameLocator;
    let scenario = 0;

    beforeEach(async () => {
        file = suite.file(FORM_FILE);
        original = await readFile(file, "utf8");
        // A fresh document isolates persisted selection and viewport between scenarios.
        const diagram = `linked-preview-${++scenario}.bpmn`;
        await cp(suite.file(DIAGRAM_FILE), suite.file(diagram));
        webview = await suite.open(diagram, diagramRendered);
        await switchMode(webview, "implement");
    });

    const previewAction = () => webview.locator('[data-action="preview-linked-form"]');
    const preview = () => webview.getByRole("region", { name: "Linked form preview" });
    it("automatically shows an adjacent preview in a dense diagram and reopens after dismissal", async () => {
        const source = await readFile(suite.file(DIAGRAM_FILE), "utf8");
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
            suite.file(diagram),
            source
                .replace("</bpmn:process>", `${tasks.join("")}</bpmn:process>`)
                .replace("</bpmndi:BPMNPlane>", `${shapes.join("")}</bpmndi:BPMNPlane>`),
        );
        webview = await suite.open(diagram, diagramRendered);
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
        await suite.screenshot("linked-form-dense-explicit");
        await vscode().page.keyboard.press("Escape");
        expect(await preview().count()).toBe(0);
        await previewAction().waitFor();
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
        expect(await indicator.getByRole("button", { name: closeLabel }).isVisible()).toBe(true);
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
            expect(await preview().evaluate((node) => node.contains(document.activeElement))).toBe(
                false,
            );
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
                    refreshBox!.y + refreshBox!.height / 2 - (closeBox!.y + closeBox!.height / 2),
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
            await suite.screenshot(`linked-form-${theme.id}`);
            await close.click();
            await previewAction().waitFor();
            expect(await preview().count()).toBe(0);
            await settle(webview);
            expect(await preview().count()).toBe(0);
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
                        measurements.push(JSON.stringify(node.getBoundingClientRect().toJSON()));
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
                        await webview.locator(".djs-container > svg").evaluate((node, motion) => {
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
                        const chrome = panel.getBoundingClientRect().height - content.clientHeight;
                        canvas.style.width = `${width}px`;
                        canvas.style.height = `${height || Math.max(task.bottom, pad.bottom) - canvas.getBoundingClientRect().top + 12 + chrome + 96 + 8}px`;
                    },
                    { width, height },
                );
            await settle(webview);
            await assertAnchored();
            const geometry = await preview().evaluate(async (node) => {
                const content = node.querySelector<HTMLElement>(".linked-form-preview-content")!;
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
        expect(await indicator.getByRole("button", { name: "Refresh", exact: true }).count()).toBe(
            0,
        );
        expect(await indicator.getByRole("button", { name: "Close form preview" }).count()).toBe(1);
        expect(await previewAction().count()).toBe(0);
        await assertIndicatorFits(
            "The linked form is missing or invalid. Check the form reference.",
            "Close form preview",
        );
        await dismissPreview();
        await selectElement(webview, "Task_Unlinked");
        expect(await preview().count()).toBe(0);
        expect(await indicator.count()).toBe(0);
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
            expect(await webview.locator("html").evaluate(() => window.location.href)).toBe(href);
            expect(await preview().isVisible()).toBe(true);
            await link.click();
            expect(await webview.locator("html").evaluate(() => window.location.href)).toBe(href);
        }
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
            .getByText("The saved form is invalid or unsupported. Open it in the form editor.", {
                exact: true,
            })
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
            .getByText("The saved form is invalid or unsupported. Open it in the form editor.", {
                exact: true,
            })
            .waitFor();
        expect(await preview().count()).toBe(0);
        expect(await previewAction().count()).toBe(0);
        await dismissPreview();
        await selectElement(webview, "Task_Unlinked");
        expect(await webview.locator(".linked-form-preview-indicator").count()).toBe(0);
        await writeFile(file, original);
        await selectLinked();
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
    });
});
