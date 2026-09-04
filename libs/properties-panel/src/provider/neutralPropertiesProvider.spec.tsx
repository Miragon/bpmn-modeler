/** @jsxImportSource @bpmn-io/properties-panel/preact */
import { describe, it, expect, vi } from "vitest";
import { render } from "@bpmn-io/properties-panel/preact";

import NeutralPropertiesProvider from "./NeutralPropertiesProvider";
import { NameProps } from "./properties/NameProps";
import { PropertiesPanelContext } from "../context/PropertiesPanelContext";

// A moddle-ish business object whose `$instanceOf` is driven by an explicit type
// list — enough for `is()`/`isAny()` without standing up bpmn-moddle.
function businessObject(types: string[], props: Record<string, any> = {}): any {
    const store: Record<string, any> = { ...props };
    return {
        ...store,
        $instanceOf: (t: string) => types.includes(t),
        get: (key: string) => store[key],
    };
}

function element(types: string[], props: Record<string, any> = {}): any {
    return { id: props.id ?? "el", type: types[0], businessObject: businessObject(types, props) };
}

function injectorStub(): any {
    return { get: (name: string) => (name === "translate" ? (text: string) => text : undefined) };
}

function groupsFor(el: any): any[] {
    const panel = { registerProvider: vi.fn() };
    const provider = new NeutralPropertiesProvider(panel as any, injectorStub());
    return provider.getGroups(el)([]);
}

function ids(items: any[]): string[] {
    return items.map((i) => i.id);
}

describe("NeutralPropertiesProvider", () => {
    it("registers itself with the panel on construction", () => {
        const panel = { registerProvider: vi.fn() };
        const provider = new NeutralPropertiesProvider(panel as any, injectorStub());
        expect(panel.registerProvider).toHaveBeenCalledWith(provider);
    });

    it("builds general + documentation for a Process, with the neutral entry ids", () => {
        const groups = groupsFor(
            element(["bpmn:Process", "bpmn:FlowElementsContainer"], {
                isExecutable: true,
            }),
        );

        expect(ids(groups)).toEqual(["general", "documentation"]);
        const general = groups.find((g) => g.id === "general");
        expect(ids(general.entries)).toEqual(["name", "id", "isExecutable"]);
    });

    it("emits an error group with errorRef for a StartEvent carrying an error event definition", () => {
        const errorDef = businessObject(["bpmn:ErrorEventDefinition"]);
        const el = element(["bpmn:StartEvent", "bpmn:Event", "bpmn:FlowElement"], {
            eventDefinitions: [errorDef],
        });

        const groups = groupsFor(el);

        expect(ids(groups)).toContain("error");
        const error = groups.find((g) => g.id === "error");
        expect(ids(error.entries)).toEqual(["errorRef"]);
    });

    it("uses the stable neutral group ids so engine providers can splice in", () => {
        // A plain task yields only general + documentation, but the id set the
        // provider is capable of emitting is the upstream-compatible one.
        const groups = groupsFor(element(["bpmn:Task", "bpmn:Activity", "bpmn:FlowElement"]));
        expect(ids(groups)).toEqual(["general", "documentation"]);
    });

    it("resolves the documentation moddle path to its entry id", () => {
        const panel = { registerProvider: vi.fn() };
        const provider = new NeutralPropertiesProvider(panel as any, injectorStub());
        expect(provider.getEntryId(element(["bpmn:Task"]), ["documentation"])).toBe(
            "documentation",
        );
        expect(provider.getEntryId(element(["bpmn:Task"]), ["name"])).toBeNull();
    });
});

// The readonly derivation, proven at the entry-component level (the bpmn-js
// canvas cannot lay out in jsdom — see createViewer.spec.ts — so we render the
// fork's entry directly with the vendored preact runtime).
describe("neutral entry disabled forwarding", () => {
    function renderName(overrides: { modeling: any; disabled: boolean }): HTMLElement {
        const container = document.createElement("div");
        document.body.appendChild(container);

        const services: Record<string, any> = {
            modeling: overrides.modeling,
            debounceInput: (fn: any) => fn,
            canvas: {},
            bpmnFactory: {},
            translate: (text: string) => text,
        };
        const ctx = {
            selectedElement: null,
            injector: null,
            getService: (type: string) => services[type],
        };

        const [{ component: Name }] = NameProps({
            element: element(["bpmn:Task", "bpmn:Activity", "bpmn:FlowElement"], { name: "T" }),
        });
        const Provider = PropertiesPanelContext.Provider;

        render(
            <Provider value={ctx}>
                <Name
                    element={element(["bpmn:Task", "bpmn:Activity"], { name: "T" })}
                    disabled={overrides.disabled}
                    id="name"
                />
            </Provider>,
            container,
        );

        return container;
    }

    it("renders a disabled textarea when readonly (no modeling, disabled entry)", () => {
        const container = renderName({ modeling: undefined, disabled: true });
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        expect(textarea).not.toBeNull();
        expect(textarea.disabled).toBe(true);
    });

    it("renders an editable textarea when not readonly (modeling present, enabled entry)", () => {
        const modeling = { updateProperties: vi.fn() };
        const container = renderName({ modeling, disabled: false });
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        expect(textarea).not.toBeNull();
        expect(textarea.disabled).toBe(false);
    });
});
