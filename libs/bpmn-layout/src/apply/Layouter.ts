import type { LayoutDiagnostic, LayoutErrorCode, LayoutStatus } from "@miragon/bpmn-modeler-types";

import { computeLayoutPlan } from "../plan";
import { analyzeLayoutability } from "../preflight";
import type { LayoutEngine } from "../port";
import type { DiagramSnapshot, ElementSnapshot } from "../types";

export interface LayoutOutcome {
    status: LayoutStatus;
    code?: LayoutErrorCode;
    message?: string;
    diagnostics: LayoutDiagnostic[];
}

interface DiagramElement {
    id: string;
    type: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    parent?: { id: string };
    waypoints?: { x: number; y: number }[];
    labelTarget?: { id: string };
    businessObject?: { $type?: string };
}

interface CanvasLike {
    getRootElement(): DiagramElement;
}

interface ElementRegistryLike {
    getAll(): DiagramElement[];
}

interface CommandStackLike {
    execute(command: string, context: unknown): void;
}

interface InjectorLike {
    get<T>(name: string, strict: false): T | null;
}

interface EventBusLike {
    fire(event: string, payload: unknown): void;
    on(event: string, listener: () => void): void;
}

interface BpmnJsLike {
    saveXML(options?: { format?: boolean }): Promise<{ xml?: string }>;
}

/**
 * Events after which the geometry this service captured no longer describes
 * the open document. `commandStack.changed` covers every edit, including the
 * undo of a previous format; the other two cover a document swapped underneath
 * an in-flight run.
 */
const INVALIDATING_EVENTS = ["commandStack.changed", "import.done", "diagram.clear"];

export const LAYOUT_APPLY_COMMAND = "layout.apply";

/**
 * Fired after every format attempt, successful or not.
 *
 * Exists so the keyboard shortcut and a host-triggered command report through
 * one path: the host adapter subscribes once instead of threading the outcome
 * back from two call sites.
 */
export const LAYOUT_FORMATTED_EVENT = "layout.formatted";

const STALE_OUTCOME: LayoutOutcome = {
    status: "failed",
    code: "DIAGRAM_CHANGED",
    diagnostics: [],
};

/**
 * Formats the diagram: pre-flight, export, snapshot, engine, plan, apply.
 *
 * The order is the invariant, not an implementation detail — every failure and
 * staleness path returns before `commandStack.execute` is reached, so a
 * refusal, an engine crash or a concurrent edit leaves the model as it was.
 */
export class Layouter {
    static $inject = [
        "injector",
        "canvas",
        "elementRegistry",
        "commandStack",
        "eventBus",
        "layoutEngine",
        "bpmnjs",
    ];

    /**
     * Bumped by every event that invalidates captured geometry. A run compares
     * it across each await; the plan is a set of *relative* movements, so
     * applying one computed against superseded geometry displaces every shape
     * by the drift rather than failing visibly.
     */
    private revision = 0;

    private destroyed = false;

    /** The run in flight, if any. See {@link format}. */
    private inFlight?: Promise<LayoutOutcome>;

    constructor(
        private readonly injector: InjectorLike,
        private readonly canvas: CanvasLike,
        private readonly elementRegistry: ElementRegistryLike,
        private readonly commandStack: CommandStackLike,
        private readonly eventBus: EventBusLike,
        private readonly layoutEngine: LayoutEngine,
        private readonly bpmnjs: BpmnJsLike,
    ) {
        for (const event of INVALIDATING_EVENTS) {
            this.eventBus.on(event, () => {
                this.revision++;
            });
        }
        this.eventBus.on("diagram.destroy", () => {
            this.destroyed = true;
        });
    }

    /**
     * Formats the diagram, announcing the outcome on {@link LAYOUT_FORMATTED_EVENT}.
     *
     * Never rejects: the palette and the keyboard binding cannot await it, so a
     * throw would be an unhandled rejection *and* a trigger that silently
     * reports nothing. Every failure becomes a {@link LayoutOutcome} instead.
     *
     * A call made while a run is in flight joins that run rather than starting
     * a second one. Two concurrent layouts of the same diagram cannot both be
     * applied — the later one is computed against geometry the earlier one is
     * about to invalidate.
     */
    async format(): Promise<LayoutOutcome> {
        if (this.inFlight) return this.inFlight;

        this.inFlight = this.runAndAnnounce();
        try {
            return await this.inFlight;
        } finally {
            this.inFlight = undefined;
        }
    }

    private async runAndAnnounce(): Promise<LayoutOutcome> {
        let outcome: LayoutOutcome;
        try {
            outcome = await this.runFormat();
        } catch (error) {
            outcome = {
                status: "failed",
                code: "APPLY_FAILED",
                message: messageOf(error),
                diagnostics: [],
            };
        }

        // A destroyed diagram has no host listening; firing would reach a bus
        // whose subscribers are gone.
        if (!this.destroyed) this.eventBus.fire(LAYOUT_FORMATTED_EVENT, outcome);
        return outcome;
    }

    private async runFormat(): Promise<LayoutOutcome> {
        const refusal = analyzeLayoutability(this.describeSurface());
        if (refusal) return { status: "failed", code: refusal, diagnostics: [] };

        const startedAt = this.revision;
        let xml: string;
        try {
            const exported = await this.bpmnjs.saveXML({ format: false });
            if (!exported.xml) throw new Error("the modeler produced no XML");
            xml = exported.xml;
        } catch (error) {
            return {
                status: "failed",
                code: "ENGINE_FAILED",
                message: messageOf(error),
                diagnostics: [],
            };
        }

        if (this.isStale(startedAt)) return STALE_OUTCOME;

        // Taken before the engine runs, so the plan is a diff against exactly
        // the state the engine was given.
        const snapshot = this.snapshot();

        let target;
        try {
            target = await this.layoutEngine.computeLayout(xml);
        } catch (error) {
            return {
                status: "failed",
                code: "ENGINE_FAILED",
                message: messageOf(error),
                diagnostics: [],
            };
        }

        // The one check that matters: `snapshot` and `target` are both stale
        // now, and the plan derived from them would move live shapes by a
        // delta measured against geometry that no longer exists.
        if (this.isStale(startedAt)) return STALE_OUTCOME;

        const operations = computeLayoutPlan(snapshot, target);
        // An empty plan must not reach the command stack: `_executedAction`
        // runs unconditionally, so it would leave a no-op entry behind for the
        // user to undo.
        if (operations.length === 0) {
            return { status: "unchanged", diagnostics: target.diagnostics };
        }

        this.commandStack.execute(LAYOUT_APPLY_COMMAND, { operations });
        return { status: "formatted", diagnostics: target.diagnostics };
    }

    /** Whether the document moved on, or went away, since `startedAt`. */
    private isStale(startedAt: number): boolean {
        return this.destroyed || this.revision !== startedAt;
    }

    /**
     * Which plane is open does not appear here.
     *
     * The element registry holds every element of every plane regardless of
     * where the user has drilled to — only `canvas.getRootElement()` changes —
     * so a snapshot taken while inside a subprocess is just as complete, and
     * refusing there would have been a limit of the check rather than of the
     * operation.
     */
    private describeSurface() {
        return {
            editable: Boolean(
                this.injector.get("modeling", false) && this.injector.get("commandStack", false),
            ),
            // Plane roots have no parent; they are containers, not content.
            elementCount: this.elementRegistry
                .getAll()
                .filter((element) => element.type !== "label" && element.parent).length,
        };
    }

    private snapshot(): DiagramSnapshot {
        return this.elementRegistry.getAll().map((element): ElementSnapshot => ({
            id: element.id,
            type: element.type,
            x: element.x ?? 0,
            y: element.y ?? 0,
            width: element.width ?? 0,
            height: element.height ?? 0,
            parentId: element.parent?.id,
            waypoints: element.waypoints?.map((point) => ({ x: point.x, y: point.y })),
            labelTargetId: element.labelTarget?.id,
        }));
    }
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
