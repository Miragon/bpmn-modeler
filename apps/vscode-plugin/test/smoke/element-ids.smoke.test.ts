import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { diagramRendered } from "./support/modeler";
import { fixtures, smokeSuite } from "./support/smokeSuite";
import { COMMAND_KEY } from "./vscodeSession";

const BPMN_FILE = "smoke.bpmn";
const CHECKBOX_RETRY_MS = 500;

const suite = smokeSuite({ name: "element-ids", workspace: fixtures(BPMN_FILE) });
const { vscode } = suite;

describe("element IDs from names in a real VS Code", () => {
    // The review opens in its own Panel tab beside Problems and Output, a native checkbox tree.
    // The process row starts unticked, so 3 of the 4 changing IDs are renamed.
    it("generates IDs from names, keeps an unticked one, saves them and undoes them in one step", async () => {
        const file = suite.file(BPMN_FILE);
        await suite.open(BPMN_FILE, diagramRendered);
        const workbench = vscode().page;

        await vscode().runCommand("Generate IDs from Names");
        const review = workbench.locator(".part.panel");
        await expect.poll(() => review.getByText(/3 of 4 IDs will change\./).count()).toBe(1);
        await suite.screenshot("element-ids");

        // A click on a row the tree has just rendered can be lost, so it repeats while the box is ticked.
        const endEventCheckbox = review
            .locator('.monaco-list-row[aria-label^="Order checked:"]')
            .locator(".custom-view-tree-node-item-checkbox");
        await expect
            .poll(
                async () => {
                    if ((await review.getByText(/2 of 4 IDs will change\./).count()) === 1) {
                        return "unticked";
                    }
                    if ((await endEventCheckbox.getAttribute("aria-checked")) === "true") {
                        await endEventCheckbox.click();
                    }
                    return "ticked";
                },
                { interval: CHECKBOX_RETRY_MS },
            )
            .toBe("unticked");
        await workbench.getByRole("button", { name: "Apply ID Changes" }).click();
        await expect.poll(() => review.getByText(/IDs will change/).count()).toBe(0);
        await vscode().executeCommand("workbench.action.focusActiveEditorGroup");
        await workbench.keyboard.press(`${COMMAND_KEY}+s`);

        await expect
            .poll(() => readFile(file, "utf8"))
            .toContain('<bpmn:task id="task_checkOrder" name="Check order">');
        const renamed = await readFile(file, "utf8");
        expect(renamed).toContain('<bpmn:endEvent id="End_Order" name="Order checked">');
        expect(renamed).toContain(
            'sourceRef="startEvent_orderReceived" targetRef="task_checkOrder"',
        );
        expect(renamed).toContain(
            '<bpmndi:BPMNShape id="task_checkOrder_di" bpmnElement="task_checkOrder">',
        );

        await workbench.keyboard.press(`${COMMAND_KEY}+z`);
        await workbench.keyboard.press(`${COMMAND_KEY}+s`);

        await expect
            .poll(() => readFile(file, "utf8"))
            .toContain('<bpmn:task id="Task_Check" name="Check order">');
        expect(await readFile(file, "utf8")).toContain(
            'sourceRef="Start_Order" targetRef="Task_Check"',
        );
    });
});
