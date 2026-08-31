/**
 * Keeps undo/redo on the plane the user is looking at.
 *
 * diagram-js ships `RootElementsBehavior`, which stamps every command with the
 * root element that was active when it ran and forces the canvas back to that
 * root on both execute and revert. The command stack is global — one stack for
 * the whole diagram rather than one per plane — so editing at top level,
 * drilling into a collapsed sub-process and pressing Ctrl+Z yanks the canvas
 * back out to the top level before the change is even visible. The user then
 * has to drill in again to see what the undo did.
 *
 * This module replaces that service under the same DI name
 * (`rootElementsBehavior`, so diagram-js's own `__init__` still constructs it)
 * with one that keeps recording the root — other behaviors read
 * `context.rootElement` — but only *applies* it when the plane the user is on
 * has ceased to exist. That happens when the undone command was the creation of
 * the sub-process whose plane is open: staying put would leave a blank canvas,
 * so the recorded root is the only sensible destination.
 *
 * @internal Registered by {@link BpmnModeler}; not part of the public API.
 */

/** The slice of diagram-js's `Canvas` this behavior needs. */
interface Canvas {
    getRootElement(): RootElement | undefined;
    getRootElements(): RootElement[];
    setRootElement(rootElement: RootElement): void;
}

interface RootElement {
    id: string;
}

interface CommandEvent {
    context?: { rootElement?: RootElement };
}

interface EventBus {
    on(event: string, callback: (event: CommandEvent) => void): void;
}

export class StayOnPlaneBehavior {
    static $inject = ["eventBus", "canvas"];

    constructor(
        eventBus: EventBus,
        private readonly canvas: Canvas,
    ) {
        // `commandStack.executed` / `.reverted` without a command name are the
        // generic hooks diagram-js's own CommandInterceptor uses for
        // `executed(fn)` / `revert(fn)`, so this observes exactly the commands
        // RootElementsBehavior did.
        eventBus.on("commandStack.executed", (event) => this.record(event));
        eventBus.on("commandStack.reverted", (event) => this.restoreIfPlaneIsGone(event));
    }

    /**
     * Stamps the command with the active root the first time it runs, matching
     * diagram-js's contract so anything reading `context.rootElement` still
     * works. A redo re-enters this hook with the stamp already present; unlike
     * diagram-js we do not switch the canvas back to it.
     */
    private record(event: CommandEvent): void {
        const context = event.context;
        if (!context) {
            return;
        }
        if (context.rootElement) {
            this.restoreIfPlaneIsGone(event);
            return;
        }
        context.rootElement = this.canvas.getRootElement();
    }

    /**
     * Switches to the command's recorded root only when the current plane is no
     * longer registered on the canvas — i.e. the reverted command removed it.
     */
    private restoreIfPlaneIsGone(event: CommandEvent): void {
        const recorded = event.context?.rootElement;
        if (!recorded) {
            return;
        }
        const current = this.canvas.getRootElement();
        if (current && this.canvas.getRootElements().some((root) => root.id === current.id)) {
            return;
        }
        this.canvas.setRootElement(recorded);
    }
}

/**
 * Overrides diagram-js's `rootElementsBehavior`. Registered as an
 * `additionalModule`, so it is applied after the core modules and wins the name.
 */
export const StayOnPlaneModule = {
    rootElementsBehavior: ["type", StayOnPlaneBehavior],
};
