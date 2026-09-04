/**
 * Wraps a wide external label instead of letting it run onto one long line.
 *
 * bpmn-js wraps an external label to the width of its own DI bounds. A label
 * bpmn-js created itself is 90px wide, so it wraps compactly — but a diagram
 * authored elsewhere (Camunda Modeler, a generator, a hand-edited `.bpmn`)
 * often carries much wider `BPMNLabel` bounds, and the same gateway question or
 * event title then renders as a single line wide enough to overlap the shapes
 * beside it.
 *
 * This caps the wrap width at bpmn-js's own default label width and re-centres
 * the narrower block over the label's bounds, so an imported diagram reads like
 * a natively authored one. Nothing is written back: the DI bounds are left
 * exactly as they were, so opening a file and closing it does not change it.
 *
 * Off by default (`miragon.bpmnModeler.compactExternalLabels`), because it
 * changes how existing diagrams look.
 *
 * @internal Registered by {@link BpmnModeler}; driven by the setting.
 */
import { DEFAULT_LABEL_SIZE } from "bpmn-js/lib/util/LabelUtil";

/**
 * Priority above BpmnRenderer's default (1000), so this sees the label first
 * and can hand a narrowed view of it back to that same renderer.
 */
const RENDER_PRIORITY = 1500;

interface LabelElement {
    type?: string;
    width?: number;
    labelTarget?: unknown;
}

interface RenderEvent {
    context?: {
        element?: LabelElement;
        gfx?: SVGElement;
        attrs?: unknown;
    };
}

interface EventBus {
    on(event: string, priority: number, callback: (event: RenderEvent) => unknown): void;
}

/** The slice of bpmn-js's `BpmnRenderer` this needs. */
interface BpmnRenderer {
    drawShape(parentGfx: SVGElement, element: unknown, attrs?: unknown): SVGElement;
}

export class CompactExternalLabelRenderer {
    static $inject = ["eventBus", "bpmnRenderer"];

    private enabled = false;

    constructor(
        eventBus: EventBus,
        private readonly bpmnRenderer: BpmnRenderer,
    ) {
        eventBus.on("render.shape", RENDER_PRIORITY, (event) => this.render(event));
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Returning the drawn element claims the render; returning `undefined`
     * lets it fall through to BpmnRenderer unchanged, which is the path every
     * label that is already narrow enough takes.
     */
    private render(event: RenderEvent): SVGElement | undefined {
        const element = event.context?.element;
        const parentGfx = event.context?.gfx;
        if (!this.enabled || !parentGfx || !isWideExternalLabel(element)) {
            return undefined;
        }

        // A prototype-delegating view of the label with only `width` replaced.
        // Everything else — text, colour, label target, position — still reads
        // straight off the real element, so bpmn-js keeps deciding all of it
        // and this file never duplicates its label logic.
        const narrowed = Object.create(element) as LabelElement;
        narrowed.width = DEFAULT_LABEL_SIZE.width;

        const gfx = this.bpmnRenderer.drawShape(parentGfx, narrowed, event.context?.attrs);

        // diagram-js centres each line inside the box width it was given, and
        // the group is already translated to the label's position — so the
        // narrower block would sit left of centre. Shift it back by half the
        // width that was taken away.
        const offset = ((element.width ?? 0) - DEFAULT_LABEL_SIZE.width) / 2;
        gfx.setAttribute("transform", `translate(${offset}, 0)`);

        return gfx;
    }
}

/**
 * An external label — a `label` shape attached to a target — whose authored
 * bounds are wider than bpmn-js's own default. A label at or below that width
 * already wraps compactly, so it is left to the stock renderer rather than
 * round-tripped through a clone for no change.
 */
function isWideExternalLabel(element: LabelElement | undefined): element is LabelElement {
    return (
        !!element &&
        element.type === "label" &&
        element.labelTarget !== undefined &&
        (element.width ?? 0) > DEFAULT_LABEL_SIZE.width
    );
}

export const CompactExternalLabelsModule = {
    __init__: ["compactExternalLabelRenderer"],
    compactExternalLabelRenderer: ["type", CompactExternalLabelRenderer],
};
