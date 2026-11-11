import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withBpmnTask } from "../fixtures/agentWrites";
import { BLANK_POINT, BPMN_DELETION } from "../fixtures/smokePoints";
import { EditorPage, fixture, launch } from "./orcaEditorPage";

const smoke = fixture("smoke.bpmn");
let browser: Browser;

beforeAll(async () => {
    browser = await launch();
});

afterAll(() => browser.close());

const open = (
    options: { text?: string; readOnly?: boolean; colorScheme?: "light" | "dark" } = {},
) => EditorPage.open(browser, { editor: "bpmn", text: smoke, ...options });

async function deletePlaceOrder(editor: EditorPage): Promise<void> {
    await editor.page.mouse.click(...BPMN_DELETION.at);
    await editor.page.keyboard.press("Delete");
}

describe("the BPMN editor in Orca", () => {
    it("opens under Orca's frame policy without an error and without writing", async () => {
        const editor = await open();
        await editor.settle();
        const state = await editor.stub();
        expect(state.cspViolations).toBe(0);
        expect(state.errors).toEqual([]);
        expect(state.edits).toBe(0);
        expect(state.dirty).toBe(false);
        expect(await editor.page.locator(".djs-palette").count()).toBe(1);
    });

    it("finds the smoke test's elements where it clicks", async () => {
        const editor = await open();
        expect(await editor.elementAt(BPMN_DELETION.at)).toBe(BPMN_DELETION.id);
        expect(await editor.elementAt(BLANK_POINT)).toMatch(/^Process_/);
    });

    it("saves a delete, and its undo", async () => {
        const editor = await open();
        await deletePlaceOrder(editor);
        await editor.settle();
        await editor.save();
        expect((await editor.stub()).disk).not.toContain(BPMN_DELETION.label);

        await editor.page.mouse.click(...BLANK_POINT);
        await editor.page.keyboard.press("ControlOrMeta+z");
        await editor.settle();
        await editor.save();
        expect((await editor.stub()).disk).toContain(BPMN_DELETION.label);
    });

    it("saves the name still typed into the properties panel", async () => {
        const editor = await open();
        await editor.page.mouse.click(...BPMN_DELETION.at);
        await editor.page
            .locator(".bio-properties-panel-group-header", { hasText: "General" })
            .click();
        const name = editor.page.locator("#bio-properties-panel-name");
        await name.fill("Order placed");
        await editor.save();
        expect((await editor.stub()).disk).toContain('name="Order placed"');
    });

    it("generates IDs from names from the properties panel, one or all", async () => {
        const editor = await open();
        await editor.page.mouse.click(...BPMN_DELETION.at);
        await editor.page
            .locator(".bio-properties-panel-group-header", { hasText: "General" })
            .click();

        await editor.page.getByRole("button", { name: "Generate from name" }).click();
        await editor.save();
        expect((await editor.stub()).disk).toContain(
            '<bpmn:serviceTask id="Activity_PlaceOrder" name="Place Order">',
        );

        await editor.page.getByRole("button", { name: "Review all IDs…" }).click();
        await editor.page.locator(".eid-primary").click();
        await editor.save();
        const state = await editor.stub();
        expect(state.disk).toContain(
            '<bpmn:serviceTask id="Activity_ShipOrder" name="Ship Order">',
        );
        expect(state.disk).toContain(
            'sourceRef="Event_OrderReceived" targetRef="Activity_PlaceOrder"',
        );
        expect(state.cspViolations).toBe(0);
        expect(state.errors).toEqual([]);
    });

    it("shows an agent's write to the clean tab", async () => {
        const editor = await open();
        await editor.replace(withBpmnTask(smoke, "Added by an agent"));
        await editor.page.locator('[data-element-id="Task_Agent"]').waitFor({ state: "visible" });
        await editor.settle();
        expect((await editor.stub()).edits).toBe(0);
    });

    it("copies and pastes an element inside the editor", async () => {
        const editor = await open();
        await editor.page.mouse.click(...BPMN_DELETION.at);
        await editor.page.keyboard.press("ControlOrMeta+c");
        await editor.page.mouse.move(...BLANK_POINT);
        await editor.page.keyboard.press("ControlOrMeta+v");
        await editor.page.mouse.click(...BLANK_POINT);
        await editor.settle();
        await editor.save();
        expect((await editor.stub()).disk.match(/name="Place Order"/g)).toHaveLength(2);
    });

    it("switches to View and back to Design, and saves an edit there", async () => {
        const editor = await open();
        const choose = async (mode: string) => {
            await editor.page.locator(".mode-chip").click();
            await editor.page.locator(".mode-menu-item", { hasText: mode }).click();
        };
        await choose("View");
        await editor.page.locator(".djs-palette").waitFor({ state: "detached" });
        await choose("Design");
        await editor.page.locator(".djs-palette").waitFor({ state: "visible" });
        await deletePlaceOrder(editor);
        await editor.settle();
        await editor.save();
        const disk = (await editor.stub()).disk;
        expect(disk).not.toContain(BPMN_DELETION.label);
        expect(disk).toContain("zeebe:taskDefinition");
    });

    it("follows Orca between dark and light", async () => {
        const editor = await open({ colorScheme: "dark" });
        const theme = () =>
            editor.page.evaluate(() => document.documentElement.getAttribute("data-bpmn-theme"));
        expect(await theme()).toBe("dark");
        await editor.setColorScheme("light");
        expect(await theme()).toBe("light");
    });

    it("only shows a read-only tab", async () => {
        const editor = await open({ readOnly: true });
        expect(await editor.page.locator(".djs-palette").count()).toBe(0);
        await deletePlaceOrder(editor);
        await editor.settle();
        expect(await editor.elementAt(BPMN_DELETION.at)).toBe(BPMN_DELETION.id);
        expect((await editor.stub()).edits).toBe(0);
    });

    it("draws no focus ring and selects no text on the canvas of a read-only tab", async () => {
        const editor = await open({ readOnly: true });
        expect(await editor.canvasSvgStyle()).toEqual({ outlineStyle: "none", userSelect: "none" });
    });

    it("closes and reopens the properties panel with Shift+P", async () => {
        const editor = await open();
        await editor.page.mouse.click(...BLANK_POINT);
        const panel = editor.page.locator("#js-properties-panel");

        await editor.page.keyboard.press("Shift+P");
        await expect.poll(() => panel.getAttribute("class")).toContain("collapsed");

        await editor.page.keyboard.press("Shift+P");
        await expect.poll(() => panel.getAttribute("class")).not.toContain("collapsed");
    });

    it("moves focus from the canvas into the properties panel with p", async () => {
        const editor = await open();
        await editor.page.mouse.click(...BLANK_POINT);

        await editor.page.keyboard.press("p");

        await expect.poll(() => editor.focusIsIn("#js-properties-panel-mount")).toBe(true);
    });

    it("starts an empty file with a new diagram and writes nothing until an edit", async () => {
        const editor = await open({ text: "" });
        await editor.settle();
        expect(await editor.page.locator(".djs-shape").count()).toBeGreaterThan(0);
        expect((await editor.stub()).edits).toBe(0);
    });
});
