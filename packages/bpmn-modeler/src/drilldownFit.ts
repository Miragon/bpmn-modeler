import { CanvasViewportManager, type ViewportManager } from "./viewport";

const AFTER_DRILLDOWN_CENTERING = 500;

interface BusinessObject {
    $instanceOf(type: string): boolean;
}

interface RootElement {
    id: string;
    businessObject?: BusinessObject;
}

interface RootSetEvent {
    element?: RootElement;
}

interface EventBus {
    on(
        event: string,
        priorityOrCallback: number | (() => void),
        callback?: (event: RootSetEvent) => void,
    ): void;
}

interface Injector {
    get<T>(name: string): T;
}

export class DrilldownFit {
    static $inject = ["eventBus", "injector"];

    private readonly seen = new Set<string>();

    private readonly viewport: ViewportManager;

    constructor(eventBus: EventBus, injector: Injector) {
        this.viewport = new CanvasViewportManager(<T>(name: string) => injector.get<T>(name));

        // Run after drilldown centering but before callers restore a saved viewbox.
        eventBus.on("root.set", AFTER_DRILLDOWN_CENTERING, (event) => this.onRootSet(event));
        eventBus.on("diagram.clear", () => this.seen.clear());
    }

    private onRootSet(event: RootSetEvent): void {
        const root = event.element;
        if (!root || !isSubProcessPlane(root)) {
            return;
        }
        const firstVisit = !this.seen.has(root.id);
        this.seen.add(root.id);
        if (firstVisit) {
            this.viewport.fitViewport();
        }
    }
}

function isSubProcessPlane(root: RootElement): boolean {
    const businessObject = root.businessObject;
    return (
        typeof businessObject?.$instanceOf === "function" &&
        businessObject.$instanceOf("bpmn:SubProcess")
    );
}

export const DrilldownFitModule = {
    __init__: ["drilldownFit"],
    drilldownFit: ["type", DrilldownFit],
};
