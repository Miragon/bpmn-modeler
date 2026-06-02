import { beforeEach, describe, expect, it, vi } from "vitest";

const executeCommandMock = vi.fn();

vi.mock("vscode", () => ({
    commands: {
        executeCommand: (...args: unknown[]) => executeCommandMock(...args),
    },
}));

import type { Uri } from "vscode";

import { CompareSelectionStore } from "./CompareSelectionStore";

// Matches the literal in the production source; the `when` clause depends on it.
const CONTEXT_KEY = "bpmn-modeler.compareSelectionActive";

// A stand-in URI; the store only stores and returns it by reference.
const URI = { fsPath: "/work/a.bpmn" } as unknown as Uri;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("CompareSelectionStore", () => {
    it("starts with nothing selected", () => {
        expect(new CompareSelectionStore().get()).toBeUndefined();
    });

    it("set records the uri and flips the context key on", async () => {
        const store = new CompareSelectionStore();

        await store.set(URI);

        expect(store.get()).toBe(URI);
        expect(executeCommandMock).toHaveBeenCalledWith("setContext", CONTEXT_KEY, true);
    });

    it("clear drops the selection and flips the context key off", async () => {
        const store = new CompareSelectionStore();
        await store.set(URI);

        await store.clear();

        expect(store.get()).toBeUndefined();
        expect(executeCommandMock).toHaveBeenLastCalledWith("setContext", CONTEXT_KEY, false);
    });
});
