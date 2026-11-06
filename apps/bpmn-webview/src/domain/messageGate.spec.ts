import { describe, expect, it, vi } from "vitest";

import { MessageGate } from "./messageGate";

describe("MessageGate", () => {
    it("holds messages until opened, then replays them in arrival order", () => {
        const deliver = vi.fn();
        const gate = new MessageGate<string>(deliver);

        expect(gate.hold("first")).toBe(true);
        expect(gate.hold("second")).toBe(true);
        expect(deliver).not.toHaveBeenCalled();

        gate.open();

        expect(deliver.mock.calls).toEqual([["first"], ["second"]]);
    });

    it("lets messages through once open", () => {
        const deliver = vi.fn();
        const gate = new MessageGate<string>(deliver);
        gate.open();

        expect(gate.hold("late")).toBe(false);
        expect(deliver).not.toHaveBeenCalled();
    });

    it("drops held messages on discard and lets later ones through", () => {
        const deliver = vi.fn();
        const gate = new MessageGate<string>(deliver);
        gate.hold("held");

        gate.discard();
        gate.open();

        expect(gate.hold("later")).toBe(false);
        expect(deliver).not.toHaveBeenCalled();
    });

    it("never replays a message twice", () => {
        const deliver = vi.fn();
        const gate = new MessageGate<string>(deliver);
        gate.hold("once");

        gate.open();
        gate.open();

        expect(deliver).toHaveBeenCalledTimes(1);
    });
});
