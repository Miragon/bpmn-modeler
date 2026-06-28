import { describe, expect, it } from "vitest";

import { VariableDef } from "@miragon/bpmn-modeler-shared";

import { ScriptUri } from "./ScriptUri";
import { ScriptVariableStore } from "./ScriptVariableStore";

const EDITOR = "file:///work/diagram.bpmn";
const HASH = ScriptUri.hashEditorId(EDITOR);

function extracted(name: string): VariableDef {
    return { name, origin: "extracted", confidence: "declared" };
}

function authored(name: string, typeHint?: string): VariableDef {
    return { name, origin: "manifest", typeHint, confidence: "authored" };
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

    it("replaces only the extracted source on setExtracted", () => {
        const store = new ScriptVariableStore();
        store.setManifest(EDITOR, [authored("m")]);
        store.setExtracted(EDITOR, [extracted("a")]);
        store.setExtracted(EDITOR, [extracted("b")]);
        expect(
            store
                .getByEditorHash(HASH)
                .map((v) => v.name)
                .sort(),
        ).toEqual(["b", "m"]);
    });

    it("merges manifest and extracted sources", () => {
        const store = new ScriptVariableStore();
        store.setExtracted(EDITOR, [extracted("a")]);
        store.setManifest(EDITOR, [authored("b")]);
        expect(
            store
                .getByEditorHash(HASH)
                .map((v) => v.name)
                .sort(),
        ).toEqual(["a", "b"]);
    });

    it("lets a manifest entry win a name clash with an extracted one", () => {
        const store = new ScriptVariableStore();
        store.setExtracted(EDITOR, [extracted("shared")]);
        store.setManifest(EDITOR, [authored("shared", "Boolean")]);
        const result = store.getByEditorHash(HASH);
        expect(result).toHaveLength(1);
        expect(result[0].typeHint).toBe("Boolean");
        expect(result[0].confidence).toBe("authored");
    });

    it("clears both sources", () => {
        const store = new ScriptVariableStore();
        store.setExtracted(EDITOR, [extracted("a")]);
        store.setManifest(EDITOR, [authored("b")]);
        store.clear(EDITOR);
        expect(store.getByEditorHash(HASH)).toEqual([]);
    });
});
