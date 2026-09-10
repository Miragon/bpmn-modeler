/** @jsxImportSource @bpmn-io/properties-panel/preact */
import { describe, it, expect } from "vitest";
import { render } from "@bpmn-io/properties-panel/preact";

import { PanelHeaderProvider } from "./PanelHeaderProvider";
import iconsByType from "./icons";

// A moddle-ish business object whose `$instanceOf` is driven by an explicit type
// list — enough for is()/isExpanded()/… without standing up bpmn-moddle.
function businessObject(types: string[], props: Record<string, any> = {}): any {
    const store: Record<string, any> = { ...props };
    return {
        ...store,
        $instanceOf: (t: string) => types.includes(t),
        get: (key: string) => store[key],
    };
}

function element(types: string[], props: Record<string, any> = {}): any {
    const { di, source, ...boProps } = props;
    return {
        id: props.id ?? "el",
        type: types[0],
        di,
        source,
        businessObject: businessObject(types, boProps),
    };
}

function plane(): any {
    return { $instanceOf: (t: string) => t === "bpmndi:BPMNPlane" };
}

function subProcessDi(isExpanded: boolean): any {
    return { $instanceOf: () => false, isExpanded };
}

function iconFor(el: any) {
    return PanelHeaderProvider().getElementIcon(el);
}

describe("PanelHeaderProvider.getElementIcon", () => {
    it("resolves a plain task/gateway to its direct type icon", () => {
        expect(iconFor(element(["bpmn:UserTask", "bpmn:Activity"]))).toBe(iconsByType.UserTask);
        expect(iconFor(element(["bpmn:ServiceTask", "bpmn:Activity"]))).toBe(
            iconsByType.ServiceTask,
        );
        expect(iconFor(element(["bpmn:ExclusiveGateway", "bpmn:Gateway"]))).toBe(
            iconsByType.ExclusiveGateway,
        );
    });

    it("prefixes the event-definition kind for a message start event", () => {
        const el = element(["bpmn:StartEvent", "bpmn:Event"], {
            eventDefinitions: [businessObject(["bpmn:MessageEventDefinition"], {})],
        });
        (el.businessObject.eventDefinitions[0] as any).$type = "bpmn:MessageEventDefinition";

        expect(iconFor(el)).toBe(iconsByType.MessageStartEvent);
    });

    it("marks a non-interrupting timer boundary event and shares its catch icon", () => {
        const el = element(["bpmn:BoundaryEvent", "bpmn:Event"], {
            cancelActivity: false,
            eventDefinitions: [businessObject(["bpmn:TimerEventDefinition"], {})],
        });
        (el.businessObject.eventDefinitions[0] as any).$type = "bpmn:TimerEventDefinition";

        expect(iconFor(el)).toBe(iconsByType.TimerBoundaryEventNonInterrupting);
        // shared component: boundary + intermediate-catch keys point at one icon
        expect(iconsByType.TimerBoundaryEventNonInterrupting).toBe(
            iconsByType.TimerIntermediateCatchEventNonInterrupting,
        );
    });

    it("distinguishes sub-process variants", () => {
        expect(iconFor(element(["bpmn:SubProcess"], { triggeredByEvent: true }))).toBe(
            iconsByType.EventSubProcess,
        );
        expect(iconFor(element(["bpmn:SubProcess"], { di: subProcessDi(true) }))).toBe(
            iconsByType.ExpandedSubProcess,
        );
        expect(iconFor(element(["bpmn:SubProcess"], { di: subProcessDi(false) }))).toBe(
            iconsByType.CollapsedSubProcess,
        );
        expect(iconFor(element(["bpmn:Transaction", "bpmn:SubProcess"]))).toBe(
            iconsByType.Transaction,
        );
    });

    it("collapses conditional and default sequence flows", () => {
        const source = element(["bpmn:ExclusiveGateway", "bpmn:Gateway"]);
        const flow = element(["bpmn:SequenceFlow"], { source });
        source.businessObject.default = flow.businessObject;
        expect(iconFor(flow)).toBe(iconsByType.DefaultFlow);

        const activitySource = element(["bpmn:Task", "bpmn:Activity"]);
        const conditional = element(["bpmn:SequenceFlow"], {
            source: activitySource,
            conditionExpression: {},
        });
        expect(iconFor(conditional)).toBe(iconsByType.ConditionalFlow);
    });

    it("returns undefined for unmapped or label elements without throwing", () => {
        expect(iconFor(element(["bpmn:UnknownThing"]))).toBeUndefined();
        expect(iconFor({ id: "l", type: "label", businessObject: businessObject([], {}) })).toBe(
            undefined,
        );
    });

    it("treats a drill-down-root sub-process (BPMNPlane di) as collapsed", () => {
        // The `isPlane` guard cancels the expanded classification, matching upstream.
        expect(iconFor(element(["bpmn:SubProcess"], { di: plane() }))).toBe(
            iconsByType.CollapsedSubProcess,
        );
    });
});

describe("vendored icon set", () => {
    it("renders every mapped icon as an <svg>", () => {
        const container = document.createElement("div");
        document.body.appendChild(container);

        for (const [type, Icon] of Object.entries(iconsByType)) {
            render(<Icon />, container);
            const svg = container.querySelector("svg");
            expect(svg, `expected <svg> for ${type}`).not.toBeNull();
            render(null, container);
        }
    });

    it("lets Header props override the built-in width/height (spread order)", () => {
        const container = document.createElement("div");
        document.body.appendChild(container);

        const Icon = iconsByType.UserTask;
        render(<Icon width="16" height="16" viewBox="0 0 32 32" />, container);

        const svg = container.querySelector("svg") as SVGSVGElement;
        expect(svg.getAttribute("width")).toBe("16");
        expect(svg.getAttribute("height")).toBe("16");
        expect(svg.getAttribute("viewBox")).toBe("0 0 32 32");
    });
});
