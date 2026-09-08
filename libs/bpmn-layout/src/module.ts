import { CleanupApplyHandler, CleanupModdleHandler } from "./apply/CleanupHandlers";
import { CLEANUP_COMMAND, CLEANUP_MODDLE_COMMAND } from "./apply/CleanupHandlers";
import { CleanupService } from "./apply/CleanupService";
import { LayoutApplyHandler } from "./apply/LayoutApplyHandler";
import { LayoutKeyboard } from "./apply/LayoutKeyboard";
import { LayoutPaletteProvider } from "./apply/LayoutPaletteProvider";
import { LAYOUT_APPLY_COMMAND, Layouter } from "./apply/Layouter";
import { BpmnAutoLayoutEngine } from "./engine/autoLayoutEngine";
import type { LayoutEngine } from "./port";

const HANDLERS: Record<string, unknown> = {
    [LAYOUT_APPLY_COMMAND]: LayoutApplyHandler,
    [CLEANUP_COMMAND]: CleanupApplyHandler,
    [CLEANUP_MODDLE_COMMAND]: CleanupModdleHandler,
};

interface EventBusLike {
    on(event: string, listener: () => void): void;
}

interface InjectorLike {
    get<T>(name: string, strict: false): T | null;
}

interface CommandStackLike {
    registerHandler(command: string, handler: unknown): void;
}

/**
 * Registers the layout commands once the diagram is up.
 *
 * `commandStack` is resolved optionally rather than injected, so the module
 * loads inert on a surface that has none instead of throwing during
 * construction.
 */
function LayoutCommandInitializer(eventBus: EventBusLike, injector: InjectorLike): void {
    const commandStack = injector.get<CommandStackLike>("commandStack", false);
    if (!commandStack) return;

    eventBus.on("diagram.init", () => {
        for (const [command, handler] of Object.entries(HANDLERS)) {
            commandStack.registerHandler(command, handler);
        }
    });
}

(LayoutCommandInitializer as unknown as { $inject: string[] }).$inject = ["eventBus", "injector"];

/**
 * The bpmn-js module for diagram formatting and cleanup.
 *
 * @param engine Replaces the layout implementation. The default wraps
 *   `bpmn-auto-layout`; anything satisfying {@link LayoutEngine} works, and
 *   nothing above the port needs to change.
 */
export function createBpmnLayoutModule(engine?: LayoutEngine) {
    return {
        __init__: ["bpmnLayoutCommands", "layoutKeyboard", "layoutPaletteProvider"],
        bpmnLayoutCommands: ["type", LayoutCommandInitializer],
        layoutKeyboard: ["type", LayoutKeyboard],
        layoutPaletteProvider: ["type", LayoutPaletteProvider],
        bpmnLayouter: ["type", Layouter],
        bpmnCleanup: ["type", CleanupService],
        layoutEngine: ["value", engine ?? new BpmnAutoLayoutEngine()],
    };
}
