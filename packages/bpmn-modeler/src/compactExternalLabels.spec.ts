import { describe, expect, it, vi } from "vitest";

import { CompactExternalLabelRenderer, CompactExternalLabelsModule } from "./compactExternalLabels";

/** bpmn-js's own default external-label width; the cap this feature applies. */
const DEFAULT_WIDTH = 90;

function label(width: number, overrides: Record<string, unknown> = {}) {
    return {
        type: "label",
        width,
        labelTarget: { id: "Gateway_1" },
        businessObject: { name: "Confirmation method?" },
        ...overrides,
    };
}

function build() {
    let handler!: (event: unknown) => SVGElement | undefined;
    let priority = 0;

    const eventBus = {
        on: vi.fn((_event: string, p: number, callback: typeof handler) => {
            priority = p;
            handler = callback;
        }),
    };

    const drawn = { setAttribute: vi.fn() } as unknown as SVGElement;
    const bpmnRenderer = {
        drawShape: vi.fn((_parentGfx: SVGElement, _element: unknown, _attrs?: unknown) => drawn),
    };

    const renderer = new CompactExternalLabelRenderer(eventBus, bpmnRenderer);
    const parentGfx = {} as SVGElement;

    return {
        renderer,
        bpmnRenderer,
        drawn,
        priority,
        render: (element: unknown, attrs?: unknown) =>
            handler({ context: { element, gfx: parentGfx, attrs } }),
    };
}

describe("CompactExternalLabelRenderer", () => {
    it("renders before BpmnRenderer", () => {
        const { priority } = build();

        expect(priority).toBeGreaterThan(1000);
    });

    it("does nothing while the setting is off", () => {
        const { render, bpmnRenderer } = build();

        expect(render(label(200))).toBeUndefined();
        expect(bpmnRenderer.drawShape).not.toHaveBeenCalled();
    });

    it("caps the wrap width of a label wider than the bpmn-js default", () => {
        const { renderer, render, bpmnRenderer } = build();
        renderer.setEnabled(true);

        render(label(200));

        const [, narrowed] = bpmnRenderer.drawShape.mock.calls[0];
        expect((narrowed as { width: number }).width).toBe(DEFAULT_WIDTH);
    });

    it("re-centres the narrower block over the label's own bounds", () => {
        const { renderer, render, drawn } = build();
        renderer.setEnabled(true);

        render(label(200));

        expect(drawn.setAttribute).toHaveBeenCalledWith("transform", "translate(55, 0)");
    });

    it("leaves every other property readable off the real element", () => {
        const { renderer, render, bpmnRenderer } = build();
        renderer.setEnabled(true);

        render(label(200, { x: 12, y: 34 }));

        const [, narrowed] = bpmnRenderer.drawShape.mock.calls[0];
        const view = narrowed as { x: number; y: number; businessObject: { name: string } };
        expect(view.x).toBe(12);
        expect(view.y).toBe(34);
        expect(view.businessObject.name).toBe("Confirmation method?");
    });

    it("forwards the render attrs so colour overrides survive", () => {
        const { renderer, render, bpmnRenderer } = build();
        renderer.setEnabled(true);

        render(label(200), { stroke: "red" });

        expect(bpmnRenderer.drawShape).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
            stroke: "red",
        });
    });

    it("leaves a label that is already narrow enough to the stock renderer", () => {
        const { renderer, render, bpmnRenderer } = build();
        renderer.setEnabled(true);

        expect(render(label(DEFAULT_WIDTH))).toBeUndefined();
        expect(render(label(40))).toBeUndefined();
        expect(bpmnRenderer.drawShape).not.toHaveBeenCalled();
    });

    it("ignores anything that is not an external label", () => {
        const { renderer, render, bpmnRenderer } = build();
        renderer.setEnabled(true);

        expect(render({ type: "bpmn:Task", width: 200 })).toBeUndefined();
        expect(render(label(200, { labelTarget: undefined }))).toBeUndefined();
        expect(render(undefined)).toBeUndefined();
        expect(bpmnRenderer.drawShape).not.toHaveBeenCalled();
    });

    it("registers the renderer under a stable DI name", () => {
        expect(CompactExternalLabelsModule).toEqual({
            __init__: ["compactExternalLabelRenderer"],
            compactExternalLabelRenderer: ["type", CompactExternalLabelRenderer],
        });
    });
});
