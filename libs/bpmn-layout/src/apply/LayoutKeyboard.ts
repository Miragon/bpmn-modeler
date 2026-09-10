import type { Layouter } from "./Layouter";

interface KeyboardLike {
    addListener(listener: (context: { keyEvent: KeyboardEvent }) => boolean | void): void;
}

interface InjectorLike {
    get<T>(name: string, strict: false): T | null;
}

/**
 * The key that formats the diagram.
 *
 * A bare letter, matching the modeler's existing canvas bindings (`u`, `g`,
 * `m`, `o`); `l` was the free one. The binding only fires while the canvas SVG
 * has focus, and formatting is a single undo step, so a mistaken press costs
 * one Ctrl+Z.
 */
const FORMAT_KEY = "l";

export class LayoutKeyboard {
    static $inject = ["keyboard", "injector"];

    constructor(
        keyboard: KeyboardLike,
        private readonly injector: InjectorLike,
    ) {
        // Resolved lazily rather than injected: `Layouter` needs `modeling` and
        // `commandStack`, so constructing it eagerly would throw on a surface
        // that has neither.
        if (!this.injector.get("commandStack", false)) return;

        keyboard.addListener(({ keyEvent }) => this.handle(keyEvent));
    }

    private handle(event: KeyboardEvent): boolean | void {
        if (event.key !== FORMAT_KEY) return;
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;

        const layouter = this.injector.get<Layouter>("bpmnLayouter", false);
        if (!layouter) return;

        // The outcome is reported through `layout.formatted` on the event bus,
        // so nothing is awaited here.
        void layouter.format();
        return true;
    }
}
