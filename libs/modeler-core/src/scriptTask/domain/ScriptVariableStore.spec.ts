import { describe, expect, it } from "vitest";

import { VariableDef } from "@miragon/bpmn-modeler-shared";

import { ScriptUri } from "./ScriptUri";
import { ScriptVariableStore } from "./ScriptVariableStore";

const EDITOR = "file:///work/diagram.bpmn";
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
        store.setExtracted("file:///work/other.bpmn", [extracted("b")]);
        expect(store.getByEditorHash(HASH).map((v) => v.name)).toEqual(["a"]);
    });

    it("clears the editor's variables", () => {
        const store = new ScriptVariableStore();
        store.setExtracted(EDITOR, [extracted("a")]);
        store.clear(EDITOR);
        expect(store.getByEditorHash(HASH)).toEqual([]);
    });
});
