import type { Widget } from "@theia/core/lib/browser";

const transitions = new WeakMap<Widget, Promise<void>>();
// A stable order prevents opposite multi-widget acquisitions from deadlocking.
const transitionOrder = new WeakMap<Widget, number>();
const inertStates = new WeakMap<Widget, { count: number; wasInert: boolean }>();
const ownershipRestorers = new WeakMap<Widget, (secondaryWindow: Window) => void>();
let nextTransitionOrder = 0;

export function runModelerWidgetTransition<T>(
    widget: Widget,
    transition: () => Promise<T>,
): Promise<T> {
    const previous = transitions.get(widget) ?? Promise.resolve();
    const result = previous.then(transition);
    const settled = result.then(
        () => undefined,
        () => undefined,
    );
    transitions.set(widget, settled);
    void settled.then(() => {
        if (transitions.get(widget) === settled) {
            transitions.delete(widget);
        }
    });
    return result;
}

export function runModelerWidgetTransitions<T>(
    widgets: Iterable<Widget>,
    transition: () => Promise<T>,
): Promise<T> {
    const orderedWidgets = [...new Set(widgets)].sort(
        (left, right) => orderFor(left) - orderFor(right),
    );
    const run = (index: number): Promise<T> => {
        const widget = orderedWidgets[index];
        return widget ? runModelerWidgetTransition(widget, () => run(index + 1)) : transition();
    };
    return run(0);
}

export function quiesceModelerWidget(widget: Widget): () => void {
    const existing = inertStates.get(widget);
    if (existing) {
        existing.count += 1;
    } else {
        inertStates.set(widget, { count: 1, wasInert: widget.node.inert });
        widget.node.inert = true;
    }

    let released = false;
    return () => {
        if (released) {
            return;
        }
        released = true;

        const state = inertStates.get(widget);
        if (!state || --state.count > 0) {
            return;
        }
        inertStates.delete(widget);
        if (!widget.isDisposed) {
            widget.node.inert = state.wasInert;
        }
    };
}

export function registerModelerWidgetOwnershipRestorer(
    widget: Widget,
    restore: (secondaryWindow: Window) => void,
): void {
    ownershipRestorers.set(widget, restore);
}

export function restoreModelerWidgetOwnership(widget: Widget, secondaryWindow: Window): void {
    ownershipRestorers.get(widget)?.(secondaryWindow);
}

function orderFor(widget: Widget): number {
    let order = transitionOrder.get(widget);
    if (order === undefined) {
        order = nextTransitionOrder++;
        transitionOrder.set(widget, order);
    }
    return order;
}
