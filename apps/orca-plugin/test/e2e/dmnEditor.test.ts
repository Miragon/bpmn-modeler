import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withDmnDecision } from "../fixtures/agentWrites";
import { BLANK_POINT, DMN_DELETION, DMN_DRILL_DOWN } from "../fixtures/smokePoints";
import { EditorPage, fixture, launch } from "./orcaEditorPage";

const smoke = fixture("smoke.dmn");
let browser: Browser;

beforeAll(async () => {
    browser = await launch();
});

afterAll(() => browser.close());

const open = (
    options: { text?: string; readOnly?: boolean; colorScheme?: "light" | "dark" } = {},
) => EditorPage.open(browser, { editor: "dmn", text: smoke, ...options });

async function deleteCheckCredit(editor: EditorPage): Promise<void> {
    await editor.page.mouse.click(...DMN_DELETION.at);
    await editor.page.keyboard.press("Delete");
}

async function openApproveOrderTable(editor: EditorPage): Promise<void> {
    await editor.page.mouse.click(...DMN_DRILL_DOWN);
    await editor.page.locator(".tjs-table").waitFor({ state: "visible" });
}

describe("the DMN editor in Orca", () => {
    it("opens under Orca's frame policy without an error and without writing", async () => {
        const editor = await open();
        await editor.settle();
        const state = await editor.stub();
        expect(state.cspViolations).toBe(0);
        expect(state.errors).toEqual([]);
        expect(state.edits).toBe(0);
        expect(await editor.page.locator(".djs-palette").count()).toBe(1);
        expect(await editor.page.locator(".bio-properties-panel").isVisible()).toBe(true);
    });

    it("finds the smoke test's elements where it clicks", async () => {
        const editor = await open();
        expect(await editor.elementAt(DMN_DELETION.at)).toBe(DMN_DELETION.id);
        expect(await editor.elementAt(BLANK_POINT)).toBe("Definitions_Smoke");
    });

    it("saves a delete, and its undo", async () => {
        const editor = await open();
        await deleteCheckCredit(editor);
        await editor.settle();
        await editor.save();
        expect((await editor.stub()).disk).not.toContain(DMN_DELETION.label);

        await editor.page.mouse.click(...BLANK_POINT);
        await editor.page.keyboard.press("ControlOrMeta+z");
        await editor.settle();
        await editor.save();
        expect((await editor.stub()).disk).toContain(DMN_DELETION.label);
    });

    it("saves a rule still typed into a decision table", async () => {
        const editor = await open();
        await openApproveOrderTable(editor);
        const cell = editor.page.locator('td[data-element-id="InputEntry_Good"] .content-editable');
        await cell.click();
        await editor.page.keyboard.press("ControlOrMeta+a");
        await editor.page.keyboard.type('"excellent"');
        await editor.save();
        expect((await editor.stub()).disk).toContain('<text>"excellent"</text>');
    });

    it("keeps the decision table open across an agent's write", async () => {
        const editor = await open();
        await openApproveOrderTable(editor);
        await editor.replace(smoke.replace("<text>true</text>", "<text>false</text>"));
        await editor.page
            .locator('td[data-element-id="OutputEntry_Good"]', { hasText: "false" })
            .waitFor({ state: "visible" });
        expect((await editor.stub()).edits).toBe(0);
    });

    it("shows an agent's new decision", async () => {
        const editor = await open();
        await editor.replace(withDmnDecision(smoke, "Added by an agent"));
        await editor.page
            .locator('[data-element-id="Decision_Agent"]')
            .waitFor({ state: "visible" });
        await editor.settle();
        expect((await editor.stub()).edits).toBe(0);
    });

    it("follows Orca between dark and light", async () => {
        const editor = await open({ colorScheme: "dark" });
        const theme = () =>
            editor.page.evaluate(() => document.documentElement.getAttribute("data-dmn-theme"));
        expect(await theme()).toBe("dark");
        await editor.setColorScheme("light");
        expect(await theme()).toBe("light");
    });

    it("shows a read-only tab without taking input", async () => {
        const editor = await open({ readOnly: true });
        expect(await editor.page.locator(".orca-read-only-notice").isVisible()).toBe(true);
        await deleteCheckCredit(editor);
        await editor.settle();
        expect(await editor.page.locator('[data-element-id="Decision_Credit"]').count()).toBe(1);
        expect((await editor.stub()).edits).toBe(0);
    });

    it("starts an empty file with a new decision and writes nothing until an edit", async () => {
        const editor = await open({ text: "" });
        await editor.settle();
        expect(await editor.page.getByText("Decision 1").count()).toBeGreaterThan(0);
        expect((await editor.stub()).edits).toBe(0);
    });
});
