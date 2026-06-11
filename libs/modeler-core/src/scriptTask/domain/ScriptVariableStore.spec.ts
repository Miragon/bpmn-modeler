import { describe, expect, it } from "vitest";

import { VariableDef } from "@miragon/bpmn-modeler-shared";

import { ScriptUri } from "./ScriptUri";
import { ScriptVariableStore } from "./ScriptVariableStore";

const EDITOR = "file:///work/diagram.bpmn";
const HASH = ScriptUri.hashEditorId(EDITOR);

function variable(name: string): VariableDef {
    return { name, origin: "test", confidence: "declared" };
}

describe("ScriptVariableStore", () => {
    it("stores variables keyed by the editor hash", () => {
        const store = new ScriptVariableStore();
        store.set(EDITOR, [variable("a")]);
        expect(store.getByEditorHash(HASH).map((v) => v.name)).toEqual(["a"]);
    });

    it("returns an empty array for an unknown editor hash", () => {
        expect(new ScriptVariableStore().getByEditorHash("unknown")).toEqual([]);
    });

    it("replaces the previous model on set", () => {
        const store = new ScriptVariableStore();
        store.set(EDITOR, [variable("a")]);
        store.set(EDITOR, [variable("b")]);
        expect(store.getByEditorHash(HASH).map((v) => v.name)).toEqual(["b"]);
    });

    it("clears an editor's variables", () => {
        const store = new ScriptVariableStore();
        store.set(EDITOR, [variable("a")]);
        store.clear(EDITOR);
        expect(store.getByEditorHash(HASH)).toEqual([]);
    });
});
