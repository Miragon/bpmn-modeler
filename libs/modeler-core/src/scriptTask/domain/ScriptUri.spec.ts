import { describe, expect, it } from "vitest";

import { ScriptUri } from "./ScriptUri";
import { parseKindFromUri } from "./scriptCompletion";

/**
 * Pure-function tests for the URI builder. The provider's parser
 * (`parseKindFromUri`) is the reverse direction, so we round-trip a few
 * representative cases to keep the two in lockstep.
 */
describe("ScriptUri.slug", () => {
    it("returns 'script-task' for a script task", () => {
        const uri = new ScriptUri("e", "Task_1", "script-task", undefined, undefined, "js");
        expect(uri.slug).toBe("script-task");
    });

    it("encodes execution-listener index and event", () => {
        const uri = new ScriptUri("e", "Task_1", "execution-listener", 0, "start", "groovy");
        expect(uri.slug).toBe("execution-listener-0-start");
    });

    it("defaults a missing listener index to 0", () => {
        const uri = new ScriptUri("e", "Task_1", "execution-listener", undefined, "start", "js");
        expect(uri.slug).toBe("execution-listener-0-start");
    });

    it("omits the event suffix when none is given", () => {
        const uri = new ScriptUri("e", "Task_1", "task-listener", 2, undefined, "js");
        expect(uri.slug).toBe("task-listener-2");
    });
});

describe("ScriptUri.filename", () => {
    it("uses the bare element id for a script task", () => {
        const uri = new ScriptUri("e", "Task_1", "script-task", undefined, undefined, "js");
        expect(uri.filename).toBe("Task_1.js");
    });

    it("appends event for execution listeners at index 0", () => {
        const uri = new ScriptUri("e", "Task_1", "execution-listener", 0, "start", "js");
        expect(uri.filename).toBe("Task_1.execution-start.js");
    });

    it("appends the index when greater than 0", () => {
        const uri = new ScriptUri("e", "Task_1", "execution-listener", 1, "start", "js");
        expect(uri.filename).toBe("Task_1.execution-start-1.js");
    });

    it("sanitises element ids with characters outside the POSIX-clean subset", () => {
        const uri = new ScriptUri("e", "Task#1", "script-task", undefined, undefined, "groovy");
        expect(uri.filename).toBe("Task_1.groovy");
    });
});

describe("ScriptUri.hashEditorId", () => {
    it("is deterministic for the same editor id", () => {
        expect(ScriptUri.hashEditorId("file:///a.bpmn")).toBe(
            ScriptUri.hashEditorId("file:///a.bpmn"),
        );
    });

    it("differs for different editor ids", () => {
        expect(ScriptUri.hashEditorId("file:///a.bpmn")).not.toBe(
            ScriptUri.hashEditorId("file:///b.bpmn"),
        );
    });
});

describe("ScriptUri.relativePath round-trip with parseKindFromUri", () => {
    // The parsers anchor on the on-disk `tmp/scripting/` marker, so the
    // round-trip goes through a realistic absolute path.
    const onDisk = (uri: ScriptUri) => `/ws/.camunda/tmp/scripting/${uri.relativePath()}`;

    it("round-trips a script-task path", () => {
        const uri = new ScriptUri("e", "Task_1", "script-task", undefined, undefined, "js");
        expect(parseKindFromUri(onDisk(uri))).toBe("script-task");
    });

    it("round-trips an execution-listener path", () => {
        const uri = new ScriptUri("e", "Task_1", "execution-listener", 0, "start", "groovy");
        expect(parseKindFromUri(onDisk(uri))).toBe("execution-listener");
    });

    it("round-trips a task-listener path", () => {
        const uri = new ScriptUri("e", "UserTask_1", "task-listener", 2, "create", "groovy");
        expect(parseKindFromUri(onDisk(uri))).toBe("task-listener");
    });

    it("equals toString — the segments are the script's identity", () => {
        const uri = new ScriptUri("e", "Task_1", "script-task", undefined, undefined, "js");
        expect(uri.toString()).toBe(uri.relativePath());
        expect(uri.relativePath()).toBe(`${uri.editorHash}/Task_1/script-task/Task_1.js`);
    });
});
