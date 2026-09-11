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
 * Formatting and cleanup themselves: the services, the engine and the command
 * handlers, with no opinion about how a user reaches them.
 *
 * Separate from {@link createBpmnLayoutUiModule} so a consumer with its own
 * chrome — a host that drives `bpmnLayouter` from a menu, or an embedder with
 * no palette at all — can take the capability without also inheriting our
 * palette entry and our choice of keybinding.
 *
 * @param engine Replaces the layout implementation. The default wraps
 *   `bpmn-auto-layout`; anything satisfying {@link LayoutEngine} works, and
 *   nothing above the port needs to change.
 */
export function createBpmnLayoutServiceModule(engine?: LayoutEngine) {
    return {
        __init__: ["bpmnLayoutCommands"],
        bpmnLayoutCommands: ["type", LayoutCommandInitializer],
        bpmnLayouter: ["type", Layouter],
        bpmnCleanup: ["type", CleanupService],
        layoutEngine: ["value", engine ?? new BpmnAutoLayoutEngine()],
    };
}

/**
 * The in-canvas triggers: the palette entry and the keyboard binding.
 *
 * Requires {@link createBpmnLayoutServiceModule} — both resolve `bpmnLayouter`
 * lazily, so registering this alone leaves them inert rather than throwing.
 */
export function createBpmnLayoutUiModule() {
    return {
        __init__: ["layoutKeyboard", "layoutPaletteProvider"],
        layoutKeyboard: ["type", LayoutKeyboard],
        layoutPaletteProvider: ["type", LayoutPaletteProvider],
    };
}

/**
 * Formatting and cleanup with the standard in-canvas triggers — what the
 * modeler registers, and the right default for a consumer that has no reason
 * to compose the two halves itself.
 */
export function createBpmnLayoutModule(engine?: LayoutEngine) {
    return {
        ...createBpmnLayoutServiceModule(engine),
        ...createBpmnLayoutUiModule(),
        __init__: ["bpmnLayoutCommands", "layoutKeyboard", "layoutPaletteProvider"],
    };
}
