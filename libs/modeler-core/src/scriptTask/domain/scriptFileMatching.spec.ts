import { describe, expect, it } from "vitest";

import { matchScriptFile } from "./scriptFileMatching";
import { ScriptUri } from "./ScriptUri";

/**
 * Round-trips paths built by {@link ScriptUri} through the matcher both hosts'
 * adoption flows share, so the builder and the matcher stay in lockstep.
 */
describe("matchScriptFile", () => {
    const editorId = "file:///work/process.bpmn";
    const base = `/work/.config/tmp/scripting`;

    function pathFor(uri: ScriptUri): string {
        return `${base}/${uri.relativePath()}`;
    }

    it("matches a script-task file back to its editor and element", () => {
        const uri = new ScriptUri(editorId, "Task_1", "script-task", undefined, undefined, "js");
        const match = matchScriptFile(pathFor(uri), [editorId]);
        expect(match).toMatchObject({
            editorId,
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            filename: uri.filename,
            scriptId: uri.toString(),
        });
        expect(match?.language.languageId).toBe("javascript");
    });

    it("recovers listener kind, index, and language from the slug", () => {
        const uri = new ScriptUri(editorId, "Task_1", "execution-listener", 1, "start", "groovy");
        const match = matchScriptFile(pathFor(uri), [editorId]);
        expect(match).toMatchObject({
            kind: "execution-listener",
            listenerIndex: 1,
            scriptId: uri.toString(),
        });
        expect(match?.language.languageId).toBe("groovy");
    });

    it("rejects ambient siblings whose extension is no script language", () => {
        const hash = ScriptUri.hashEditorId(editorId);
        for (const ambient of ["camunda.d.ts", "jsconfig.json"]) {
            const path = `${base}/${hash}/Task_1/script-task/${ambient}`;
            expect(matchScriptFile(path, [editorId])).toBeUndefined();
        }
    });

    it("rejects a path whose editor hash reverses to no live editor", () => {
        const uri = new ScriptUri(editorId, "Task_1", "script-task", undefined, undefined, "js");
        expect(matchScriptFile(pathFor(uri), ["file:///other.bpmn"])).toBeUndefined();
    });

    it("rejects paths outside the tmp/scripting layout and malformed slugs", () => {
        const hash = ScriptUri.hashEditorId(editorId);
        expect(matchScriptFile("/work/src/Task_1.js", [editorId])).toBeUndefined();
        expect(
            matchScriptFile(`${base}/${hash}/Task_1/not-a-slug/Task_1.js`, [editorId]),
        ).toBeUndefined();
    });
});
