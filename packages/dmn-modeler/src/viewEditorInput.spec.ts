import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DmnModeler } from "./modeler";
import type { DmnViewType } from "./publicApi";

// Without diagram interchange dmn-js opens the decision table first, so the DRD
// canvas, which jsdom cannot lay out, is never rendered.
const DECISIONS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="Definitions_1" name="Definitions" namespace="http://camunda.org/schema/1.0/dmn">
  <decision id="Decision_Table" name="Check amount">
    <decisionTable id="DecisionTable_1">
      <input id="Input_1">
        <inputExpression id="InputExpression_1" typeRef="string"><text>amount</text></inputExpression>
      </input>
      <output id="Output_1" typeRef="string" />
      <rule id="Rule_1">
        <inputEntry id="InputEntry_1"><text>"low"</text></inputEntry>
        <outputEntry id="OutputEntry_1"><text>"approve"</text></outputEntry>
      </rule>
    </decisionTable>
  </decision>
  <decision id="Decision_Literal" name="Limit">
    <literalExpression id="LiteralExpression_1"><text>1000</text></literalExpression>
  </decision>
  <businessKnowledgeModel id="Knowledge_1" name="Discount">
    <encapsulatedLogic id="FunctionDefinition_1">
      <literalExpression id="LiteralExpression_2"><text>0.1</text></literalExpression>
    </encapsulatedLogic>
  </businessKnowledgeModel>
</definitions>`;

type DebounceInputService = <Args extends unknown[]>(
    apply: (...args: Args) => void,
) => (...args: Args) => void;

const innerTextDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerText");

let modeler: DmnModeler | undefined;

async function openDecisions(): Promise<DmnModeler> {
    const container = document.createElement("main");
    const panel = document.createElement("aside");
    document.body.append(container, panel);
    modeler = new DmnModeler(container, { propertiesPanel: { parent: panel } });
    await modeler.loadDiagram(DECISIONS_XML);
    return modeler;
}

async function openViewOfType(handle: DmnModeler, type: DmnViewType): Promise<void> {
    const view = handle.getViews().find((candidate) => candidate.type === type);
    if (!view) throw new Error(`no ${type} view`);
    await handle.openView(view);
}

function typeIntoActiveView(handle: DmnModeler, typed: string): string[] {
    const applied: string[] = [];
    const setValue = handle.getService<DebounceInputService>("debounceInput")((value: string) => {
        applied.push(value);
    });
    setValue(typed);
    return applied;
}

function typeAnnotation(text: string): void {
    const annotation = document.querySelector<HTMLElement>('[aria-label="Annotation"]');
    if (!annotation) throw new Error("no annotation cell");
    annotation.textContent = text;
    annotation.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("DmnModeler input a dmn-js view editor still holds in its debounce", () => {
    beforeAll(() => {
        // dmn-js's content-editable reads innerText, which jsdom does not implement.
        Object.defineProperty(HTMLElement.prototype, "innerText", {
            configurable: true,
            get(this: HTMLElement) {
                return this.textContent ?? "";
            },
            set(this: HTMLElement, value: string) {
                this.textContent = value;
            },
        });
    });

    afterAll(() => {
        if (innerTextDescriptor) {
            Object.defineProperty(HTMLElement.prototype, "innerText", innerTextDescriptor);
        } else {
            delete (HTMLElement.prototype as { innerText?: string }).innerText;
        }
    });

    afterEach(() => {
        vi.useRealTimers();
        modeler?.destroy();
        modeler = undefined;
        document.body.replaceChildren();
    });

    it("applies a typed decision-table annotation before the export", async () => {
        const handle = await openDecisions();

        typeAnnotation("Checks the amount");

        expect(handle.hasPendingInput()).toBe(true);
        handle.flushPendingInput();

        expect(handle.hasPendingInput()).toBe(false);
        expect(await handle.exportDiagram()).toContain("Checks the amount");
    });

    it.each<DmnViewType>(["decisionTable", "literalExpression", "boxedExpression"])(
        "reports and applies input waiting in the %s view",
        async (viewType) => {
            const handle = await openDecisions();
            await openViewOfType(handle, viewType);
            const applied = typeIntoActiveView(handle, "typed");

            expect(handle.hasPendingInput()).toBe(true);
            handle.flushPendingInput();

            expect(applied).toEqual(["typed"]);
            expect(handle.hasPendingInput()).toBe(false);
        },
    );

    it("applies input typed in the next view when a value left in the previous one fails", async () => {
        const handle = await openDecisions();
        vi.useFakeTimers();
        typeAnnotation("Checks the amount");
        await openViewOfType(handle, "literalExpression");
        const applied = typeIntoActiveView(handle, "typed");

        expect(() => handle.flushPendingInput()).toThrow();

        expect(applied).toEqual(["typed"]);
        expect(handle.hasPendingInput()).toBe(false);
        expect(await handle.exportDiagram()).toContain("Checks the amount");
    });

    it("keeps the dmn-js 300 ms input delay", async () => {
        const handle = await openDecisions();
        vi.useFakeTimers();
        const applied = typeIntoActiveView(handle, "typed");

        vi.advanceTimersByTime(299);
        expect(applied).toEqual([]);

        vi.advanceTimersByTime(1);
        expect(applied).toEqual(["typed"]);
        expect(handle.hasPendingInput()).toBe(false);
    });
});
