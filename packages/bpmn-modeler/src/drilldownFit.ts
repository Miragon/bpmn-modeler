/**
 * Fits a sub-process plane to the viewport the first time it is opened.
 *
 * bpmn-js's `DrilldownCentering` remembers a position per plane, but for a
 * plane it has never seen it falls back to `{ x: 0, y: 0, zoom: 1 }` — the
 * diagram origin at 100%. A sub-process laid out a few hundred units away from
 * that origin therefore opens off-screen, and the modeller has to hunt for it
 * with the scrollbars before the drill-down is of any use.
 *
 * On a first visit this fits the plane instead, reusing the modeler's own
 * {@link ViewportManager.fitViewport} so the palette and canvas-chrome insets
 * are respected. A revisit is left alone: the remembered position is where the
 * user last put it, and overriding that would undo their panning every time
 * they step out and back in.
 *
 * Off by default (`miragon.bpmnModeler.fitOnDrilldown`) — where a drill-down
 * lands is a navigation habit, so the stock behaviour stays available.
 *
 * @internal Registered by {@link BpmnModeler}; driven by the setting.
 */
import { ViewportManager } from "./viewport";

/**
 * Priority below diagram-js's default (1000) so bpmn-js's `DrilldownCentering`
 * has already applied its own scroll/zoom for this `root.set` — the fit then
 * replaces it rather than being replaced by it.
 */
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
    on(event: string, priority: number, callback: (event: RootSetEvent) => void): void;
}

interface Injector {
    get<T>(name: string): T;
}

export class DrilldownFit {
    static $inject = ["eventBus", "injector"];

    private enabled = false;

    private readonly seen = new Set<string>();

    private readonly viewport: ViewportManager;

    constructor(eventBus: EventBus, injector: Injector) {
        // ViewportManager is a plain collaborator over the DI container rather
        // than a registered service, so build one over this instance's injector
        // instead of duplicating the inset-aware fit maths here.
        this.viewport = new ViewportManager((name) => injector.get(name));

        // Synchronous on purpose. The webview restores a persisted plane and
        // *then* the persisted viewbox, so a fit deferred to the next frame
        // would land after the restore and throw the saved position away.
        // Inline, the fit happens first, the restore still wins, and the plane
        // is already marked seen — so stepping out and back in never re-fits.
        eventBus.on("root.set", AFTER_DRILLDOWN_CENTERING, (event) => this.onRootSet(event));
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    private onRootSet(event: RootSetEvent): void {
        const root = event.element;
        if (!root || !isSubProcessPlane(root)) {
            return;
        }
        // Mark before the enabled check: a plane opened while the setting was
        // off has a position the user chose, and turning the setting on later
        // must not yank it away underneath them.
        const firstVisit = !this.seen.has(root.id);
        this.seen.add(root.id);
        if (firstVisit && this.enabled) {
            this.viewport.fitViewport();
        }
    }
}

/**
 * Only sub-process planes are fitted. The top-level root is excluded because
 * the host already decides its viewport on import — restoring a persisted box
 * or fitting a fresh file — and a second opinion here would fight it.
 */
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
