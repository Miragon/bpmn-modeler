import { describe, expect, it } from "vitest";

import { VariableDef } from "@miragon/bpmn-modeler-shared";

import { ScriptUri } from "./ScriptUri";
import { ScriptVariableStore } from "./ScriptVariableStore";

const EDITOR = "file:///work/diagram.bpmn";
const OTHER_EDITOR = "file:///work/other.bpmn";
const HASH = ScriptUri.hashEditorId(EDITOR);

function extracted(name: string): VariableDef {
    return { name, origin: "extracted", confidence: "declared" };
}

describe("ScriptVariableStore", () => {
    it("returns extracted variables keyed by the editor hash", () => {
        const store = new ScriptVariableStore();
        store.setExtracted(EDITOR, [extracted("a")]);
        expect(store.getByEditorHash(HASH).map((v) => v.name)).toEqual(["a"]);
    });

    it("returns an empty array for an unknown editor hash", () => {
        expect(new ScriptVariableStore().getByEditorHash("unknown")).toEqual([]);
    });

    it("replaces the editor's variables on setExtracted", () => {
        const store = new ScriptVariableStore();
        store.setExtracted(EDITOR, [extracted("a")]);
        store.setExtracted(EDITOR, [extracted("b")]);
        expect(store.getByEditorHash(HASH).map((v) => v.name)).toEqual(["b"]);
    });

    it("keeps editors apart", () => {
        const store = new ScriptVariableStore();
        store.setExtracted(EDITOR, [extracted("a")]);
        store.setExtracted(OTHER_EDITOR, [extracted("b")]);
        expect(store.getByEditorHash(HASH).map((v) => v.name)).toEqual(["a"]);
    });

    it("variablesFor(editorId) returns the extracted variables of that editor", () => {
        const store = new ScriptVariableStore();
        store.setExtracted(EDITOR, [extracted("a")]);
        store.setExtracted(OTHER_EDITOR, [extracted("b")]);
        expect(store.variablesFor(EDITOR).map((v) => v.name)).toEqual(["a"]);
        expect(store.variablesFor(OTHER_EDITOR).map((v) => v.name)).toEqual(["b"]);
    });

    it.each([
        { situation: "never extracted", setUp: () => {} },
        {
            situation: "cleared",
            setUp: (store: ScriptVariableStore) => {
                store.setExtracted(EDITOR, [extracted("a")]);
                store.clear(EDITOR);
            },
        },
    ])("variablesFor(editorId) returns no variables for an editor $situation", ({ setUp }) => {
        const store = new ScriptVariableStore();
        setUp(store);
        expect(store.variablesFor(EDITOR)).toEqual([]);
    });

    it("clears the editor's variables", () => {
        const store = new ScriptVariableStore();
        store.setExtracted(EDITOR, [extracted("a")]);
        store.clear(EDITOR);
        expect(store.getByEditorHash(HASH)).toEqual([]);
    });
});
