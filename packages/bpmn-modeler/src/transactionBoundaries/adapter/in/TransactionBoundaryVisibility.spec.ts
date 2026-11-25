import { describe, expect, it } from "vitest";

import {
    TransactionBoundaryVisibility,
    TransactionBoundaryVisibilityModule,
} from "./TransactionBoundaryVisibility";

type ImportDone = { error: unknown };

function harness() {
    const calls: string[] = [];
    const listeners: Array<{ event: string; priority: number; listener: (e: ImportDone) => void }> =
        [];
    const transactionBoundaries = {
        active: false,
        show(): void {
            this.active = true;
            calls.push("show");
        },
        hide(): void {
            this.active = false;
            calls.push("hide");
        },
    };
    const eventBus = {
        on: (event: string, priority: number, listener: (e: ImportDone) => void) => {
            listeners.push({ event, priority, listener });
        },
    };
    const visibility = new TransactionBoundaryVisibility(eventBus, transactionBoundaries);
    const importDone = (error: unknown = null): void => {
        listeners
            .filter(({ event }) => event === "import.done")
            .forEach(({ listener }) => listener({ error }));
    };
    return { visibility, transactionBoundaries, calls, listeners, importDone };
}

describe("TransactionBoundaryVisibility", () => {
    it("re-shows the marks after every successful import", () => {
        const { calls, importDone } = harness();

        importDone();
        importDone();

        expect(calls).toEqual(["show", "show"]);
    });

    it("ignores a failed import", () => {
        const { calls, importDone } = harness();

        importDone(new Error("unparsable"));

        expect(calls).toEqual([]);
    });

    it("shows nothing on import while hidden", () => {
        const { visibility, calls, importDone } = harness();
        visibility.setVisible(false);

        importDone();

        expect(calls).toEqual([]);
    });

    it("toggles a shown diagram only when the setting changes what is shown", () => {
        const { visibility, calls, importDone } = harness();
        importDone();
        calls.length = 0;

        visibility.setVisible(true);
        visibility.setVisible(false);
        visibility.setVisible(false);
        visibility.setVisible(true);

        expect(calls).toEqual(["hide", "show"]);
    });

    it("keeps a setting given before the first import for that import", () => {
        const { visibility, calls, importDone } = harness();

        visibility.setVisible(true);
        expect(calls).toEqual([]);

        importDone();
        expect(calls).toEqual(["show"]);
    });

    it("runs below every default-priority import.done listener and bpmnlint's 500", () => {
        const { listeners } = harness();

        expect(listeners.map(({ event }) => event)).toEqual(["import.done"]);
        expect(listeners[0].priority).toBeLessThan(500);
    });

    it("registers under its DI name and builds at init", () => {
        expect(TransactionBoundaryVisibilityModule).toEqual({
            __init__: ["transactionBoundaryVisibility"],
            transactionBoundaryVisibility: ["type", TransactionBoundaryVisibility],
        });
    });
});
