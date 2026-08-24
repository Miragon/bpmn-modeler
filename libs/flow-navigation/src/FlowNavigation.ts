/**
 * bpmn-js service that wires Tab / Shift+Tab / Enter keyboard shortcuts
 * to sequence-flow-based diagram traversal.
 *
 * Registered via `FlowNavigationModule` as an `additionalModule` on the
 * bpmn-js modeler — the keyboard listener fires only while the canvas
 * SVG has focus, so properties-panel Tab and OS-level Ctrl+Tab are
 * unaffected.
 */
import {
    resolveEntry,
    resolveFollow,
    resolveStep,
    type Direction,
    type NavElement,
} from "./traversal";

// ---------------------------------------------------------------------------
// Structural service interfaces — satisfied by diagram-js at runtime,
// mocked with plain objects in tests.
// ---------------------------------------------------------------------------

interface Keyboard {
    addListener(listener: (ctx: { keyEvent: KeyboardEvent }) => boolean | undefined): void;
    isCmd(event: KeyboardEvent): boolean;
    isShift(event: KeyboardEvent): boolean;
}

interface Selection {
    get(): NavElement[];
    select(element: NavElement): void;
}

interface Canvas {
    getRootElement(): NavElement & { children: NavElement[] };
    scrollToElement(element: NavElement): void;
}

interface Injector {
    get(name: string, strict: false): unknown;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FlowNavigation {
    static $inject = ["keyboard", "selection", "canvas", "injector"];

    private readonly keyboard: Keyboard;
    private readonly selection: Selection;
    private readonly canvas: Canvas;
    private readonly injector: Injector;

    constructor(keyboard: Keyboard, selection: Selection, canvas: Canvas, injector: Injector) {
        this.keyboard = keyboard;
        this.selection = selection;
        this.canvas = canvas;
        this.injector = injector;

        keyboard.addListener((ctx) => this.handleKeyDown(ctx.keyEvent));
    }

    private handleKeyDown(event: KeyboardEvent): boolean | undefined {
        if (event.key !== "Tab" && event.key !== "Enter") return undefined;

        // Ctrl/Cmd+Tab must keep bubbling to VS Code / OS.
        if (this.keyboard.isCmd(event) || event.altKey) return undefined;

        // Belt-and-braces: don't hijack keys while inline editing or a menu is open.
        const directEditing = this.injector.get("directEditing", false) as {
            isActive(): boolean;
        } | null;
        if (directEditing?.isActive()) return undefined;
        const popupMenu = this.injector.get("popupMenu", false) as { isOpen(): boolean } | null;
        if (popupMenu?.isOpen()) return undefined;

        const direction: Direction = this.keyboard.isShift(event) ? "backward" : "forward";
        const selected = this.selection.get();
        const root = this.canvas.getRootElement();

        if (selected.length === 0) {
            return this.handleEmpty(root, direction, event.key);
        }

        const anchor = selected[selected.length - 1];

        // Stale-selection guard: if the anchor belongs to a different root
        // plane (e.g. user drilled into a subprocess), treat as empty.
        if (anchor.parent) {
            let anchorRoot: NavElement = anchor;
            while (anchorRoot.parent) {
                anchorRoot = anchorRoot.parent;
            }
            if (anchorRoot.id !== root.id) {
                return this.handleEmpty(root, direction, event.key);
            }
        }

        if (event.key === "Tab") {
            return this.handleTab(anchor, direction);
        }

        return this.handleEnter(anchor, direction);
    }

    private handleEmpty(root: NavElement, direction: Direction, key: string): boolean | undefined {
        const entry = resolveEntry(root.children ?? [], direction);
        if (entry) this.applySelection(entry);
        // Tab is always consumed so focus never leaves the canvas.
        return key === "Tab" ? true : undefined;
    }

    private handleTab(anchor: NavElement, direction: Direction): true {
        const next = resolveStep(anchor, direction);
        if (next) this.applySelection(next);
        return true;
    }

    private handleEnter(anchor: NavElement, direction: Direction): boolean | undefined {
        const next = resolveFollow(anchor, direction);
        if (!next) return undefined;
        this.applySelection(next);
        return true;
    }

    private applySelection(element: NavElement): void {
        this.selection.select(element);
        this.canvas.scrollToElement(element);
    }
}
