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
}

interface BpmnJsLike {
    saveXML(options?: { format?: boolean }): Promise<{ xml?: string }>;
}

/** Root plane types. Anything else means the user has drilled into a subprocess. */
const TOP_LEVEL_ROOTS = new Set(["bpmn:Process", "bpmn:Collaboration"]);

export const LAYOUT_APPLY_COMMAND = "layout.apply";

/**
 * Fired after every format attempt, successful or not.
 *
 * Exists so the keyboard shortcut and a host-triggered command report through
 * one path: the host adapter subscribes once instead of threading the outcome
 * back from two call sites.
 */
export const LAYOUT_FORMATTED_EVENT = "layout.formatted";

/**
 * Formats the diagram: snapshot, pre-flight, engine, plan, apply.
 *
 * The order is the invariant, not an implementation detail — every failure
 * path returns before `commandStack.execute` is reached, so a refusal or an
 * engine crash leaves the model exactly as it was.
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

    constructor(
        private readonly injector: InjectorLike,
        private readonly canvas: CanvasLike,
        private readonly elementRegistry: ElementRegistryLike,
        private readonly commandStack: CommandStackLike,
        private readonly eventBus: EventBusLike,
        private readonly layoutEngine: LayoutEngine,
        private readonly bpmnjs: BpmnJsLike,
    ) {}

    async format(): Promise<LayoutOutcome> {
        const outcome = await this.runFormat();
        this.eventBus.fire(LAYOUT_FORMATTED_EVENT, outcome);
        return outcome;
    }

    private async runFormat(): Promise<LayoutOutcome> {
        const refusal = analyzeLayoutability(this.describeSurface());
        if (refusal) return { status: "failed", code: refusal, diagnostics: [] };

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

    private describeSurface() {
        const root = this.canvas.getRootElement();
        const rootType = root?.businessObject?.$type;

        return {
            editable: Boolean(
                this.injector.get("modeling", false) && this.injector.get("commandStack", false),
            ),
            topLevelPlane: Boolean(rootType && TOP_LEVEL_ROOTS.has(rootType)),
            elementCount: this.elementRegistry
                .getAll()
                .filter((element) => element.type !== "label" && element.id !== root?.id).length,
        };
    }

    private snapshot(): DiagramSnapshot {
        return this.elementRegistry.getAll().map(
            (element): ElementSnapshot => ({
                id: element.id,
                type: element.type,
                x: element.x ?? 0,
                y: element.y ?? 0,
                width: element.width ?? 0,
                height: element.height ?? 0,
                parentId: element.parent?.id,
                waypoints: element.waypoints?.map((point) => ({ x: point.x, y: point.y })),
                labelTargetId: element.labelTarget?.id,
            }),
        );
    }
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
