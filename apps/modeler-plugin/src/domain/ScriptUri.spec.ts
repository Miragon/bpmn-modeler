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

describe("ScriptUri.toString round-trip with parseKindFromUri", () => {
    it("round-trips a script-task URI", () => {
        const uri = new ScriptUri("e", "Task_1", "script-task", undefined, undefined, "js");
        const path = uri.toString().replace(/^bpmn-script:/, "");
        expect(parseKindFromUri(path)).toBe("script-task");
    });

    it("round-trips an execution-listener URI", () => {
        const uri = new ScriptUri("e", "Task_1", "execution-listener", 0, "start", "groovy");
        const path = uri.toString().replace(/^bpmn-script:/, "");
        expect(parseKindFromUri(path)).toBe("execution-listener");
    });

    it("round-trips a task-listener URI", () => {
        const uri = new ScriptUri("e", "UserTask_1", "task-listener", 2, "create", "groovy");
        const path = uri.toString().replace(/^bpmn-script:/, "");
        expect(parseKindFromUri(path)).toBe("task-listener");
    });
});
