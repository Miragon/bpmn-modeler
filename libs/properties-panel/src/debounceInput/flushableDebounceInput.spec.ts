import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlushableDebounceInput } from "@miragon/bpmn-modeler-types";

import { FlushableDebounceInputModule } from "./flushableDebounceInput";

function panelDebounceInput(): FlushableDebounceInput {
    const [, createService] = FlushableDebounceInputModule.debounceInput;
    return (createService as () => FlushableDebounceInput)();
}

describe("FlushableDebounceInputModule", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("keeps the panel's 600 ms input delay and reports the input waiting in it", () => {
        const debounceInput = panelDebounceInput();
        const appliedNames: string[] = [];
        const setName = debounceInput((name: string) => {
            appliedNames.push(name);
        });

        setName("Approve invoice");
        vi.advanceTimersByTime(599);
        expect(debounceInput.hasPending()).toBe(true);

        vi.advanceTimersByTime(1);
        expect(appliedNames).toEqual(["Approve invoice"]);
        expect(debounceInput.hasPending()).toBe(false);
    });

    it("gives each modeler its own service", () => {
        expect(panelDebounceInput()).not.toBe(panelDebounceInput());
    });
});
