import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFlushableDebounceInput } from "./flushableDebounceInput";

const INPUT_DELAY_MS = 600;

function nameEntry() {
    const debounceInput = createFlushableDebounceInput(INPUT_DELAY_MS);
    const appliedNames: string[] = [];
    const setName = debounceInput((name: string) => {
        appliedNames.push(name);
    });
    return { debounceInput, setName, appliedNames };
}

describe("flushable debounceInput", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("runs a pending call when flushed", () => {
        const { debounceInput, setName, appliedNames } = nameEntry();

        setName("Approve invoice");
        debounceInput.flush();

        expect(appliedNames).toEqual(["Approve invoice"]);
        expect(debounceInput.hasPending()).toBe(false);
    });

    it("reports a call as pending until its debounce runs it", () => {
        const { debounceInput, setName, appliedNames } = nameEntry();

        setName("Approve invoice");
        expect(debounceInput.hasPending()).toBe(true);

        vi.advanceTimersByTime(INPUT_DELAY_MS);

        expect(appliedNames).toEqual(["Approve invoice"]);
        expect(debounceInput.hasPending()).toBe(false);
    });

    it("applies input once the given delay has passed", () => {
        const { setName, appliedNames } = nameEntry();

        setName("Approve invoice");
        vi.advanceTimersByTime(INPUT_DELAY_MS - 1);
        expect(appliedNames).toEqual([]);

        vi.advanceTimersByTime(1);
        expect(appliedNames).toEqual(["Approve invoice"]);
    });

    it("applies only the last value typed into an entry", () => {
        const { debounceInput, setName, appliedNames } = nameEntry();

        setName("Approve");
        setName("Approve invoice");
        debounceInput.flush();

        expect(appliedNames).toEqual(["Approve invoice"]);
    });

    it("runs the pending call of every entry when flushed", () => {
        const { debounceInput, setName, appliedNames } = nameEntry();
        const appliedDocumentation: string[] = [];
        const setDocumentation = debounceInput((text: string) => {
            appliedDocumentation.push(text);
        });

        setName("Approve invoice");
        setDocumentation("Checks the amount");
        debounceInput.flush();

        expect(appliedNames).toEqual(["Approve invoice"]);
        expect(appliedDocumentation).toEqual(["Checks the amount"]);
    });

    it("applies input that a flushed call debounces again", () => {
        const debounceInput = createFlushableDebounceInput(INPUT_DELAY_MS);
        const appliedPriorities: number[] = [];
        const commitPriority = debounceInput((priority: number) => {
            appliedPriorities.push(priority);
        });
        const numberFieldInput = debounceInput((priority: number) => commitPriority(priority));

        numberFieldInput(5);
        debounceInput.flush();

        expect(appliedPriorities).toEqual([5]);
        expect(debounceInput.hasPending()).toBe(false);
    });

    it("stops draining entries that keep scheduling each other", () => {
        const debounceInput = createFlushableDebounceInput(INPUT_DELAY_MS);
        let runs = 0;
        // Bounded so a flush without a pass limit fails here instead of hanging.
        const scheduleWhileBounded = (next: () => void): void => {
            runs++;
            if (runs < 1000) {
                next();
            }
        };
        const sourceField = debounceInput(() => scheduleWhileBounded(() => mirrorField()));
        const mirrorField = debounceInput(() => scheduleWhileBounded(() => sourceField()));

        sourceField();
        debounceInput.flush();

        expect(runs).toBeGreaterThan(1);
        expect(runs).toBeLessThan(1000);
        expect(debounceInput.hasPending()).toBe(true);
    });

    it("stops reporting a call its entry cancelled", () => {
        const { debounceInput, setName, appliedNames } = nameEntry();

        setName("Approve invoice");
        setName.cancel();
        debounceInput.flush();
        vi.advanceTimersByTime(INPUT_DELAY_MS);

        expect(debounceInput.hasPending()).toBe(false);
        expect(appliedNames).toEqual([]);
    });

    it("stops reporting a call its entry flushed itself", () => {
        const { debounceInput, setName, appliedNames } = nameEntry();

        setName("Approve invoice");
        setName.flush();

        expect(debounceInput.hasPending()).toBe(false);
        expect(appliedNames).toEqual(["Approve invoice"]);
    });

    it("keeps the pending calls of separate panels apart", () => {
        const first = nameEntry();
        const second = nameEntry();

        first.setName("Approve invoice");
        second.setName("Reject invoice");
        first.debounceInput.flush();

        expect(first.appliedNames).toEqual(["Approve invoice"]);
        expect(second.appliedNames).toEqual([]);
        expect(second.debounceInput.hasPending()).toBe(true);
    });
});
