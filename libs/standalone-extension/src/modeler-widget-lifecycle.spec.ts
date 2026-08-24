import type { Widget } from "@theia/core/lib/browser";
import { describe, expect, it, vi } from "vitest";
import {
    quiesceModelerWidget,
    runModelerWidgetTransition,
    runModelerWidgetTransitions,
} from "./modeler-widget-lifecycle";

function widget(inert = false): Widget {
    return {
        isDisposed: false,
        node: { inert },
    } as unknown as Widget;
}

describe("modeler widget lifecycle", () => {
    it("serializes transitions for the same widget", async () => {
        let finishFirst: () => void = () => undefined;
        const candidate = widget();
        const secondTransition = vi.fn().mockResolvedValue("second");

        const first = runModelerWidgetTransition(
            candidate,
            () =>
                new Promise<string>((resolve) => {
                    finishFirst = () => resolve("first");
                }),
        );
        const second = runModelerWidgetTransition(candidate, secondTransition);
        await Promise.resolve();

        expect(secondTransition).not.toHaveBeenCalled();
        finishFirst();
        await expect(first).resolves.toBe("first");
        await expect(second).resolves.toBe("second");
    });

    it("uses one lock order for overlapping widget sets", async () => {
        let finishFirst: () => void = () => undefined;
        const firstWidget = widget();
        const secondWidget = widget();
        const secondTransition = vi.fn().mockResolvedValue("second");

        const first = runModelerWidgetTransitions(
            [firstWidget, secondWidget],
            () =>
                new Promise<string>((resolve) => {
                    finishFirst = () => resolve("first");
                }),
        );
        const second = runModelerWidgetTransitions([secondWidget, firstWidget], secondTransition);
        await Promise.resolve();
        await Promise.resolve();

        expect(secondTransition).not.toHaveBeenCalled();
        finishFirst();
        await expect(first).resolves.toBe("first");
        await expect(second).resolves.toBe("second");
    });

    it("restores interaction only after every overlapping lease is released", () => {
        const candidate = widget();

        const releaseFirst = quiesceModelerWidget(candidate);
        const releaseSecond = quiesceModelerWidget(candidate);
        releaseFirst();

        expect(candidate.node.inert).toBe(true);
        releaseSecond();
        expect(candidate.node.inert).toBe(false);
    });

    it("preserves a widget that was already inert", () => {
        const candidate = widget(true);

        quiesceModelerWidget(candidate)();

        expect(candidate.node.inert).toBe(true);
    });
});
