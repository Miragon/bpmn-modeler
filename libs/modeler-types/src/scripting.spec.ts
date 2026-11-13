import { describe, expect, it } from "vitest";

import {
    isSameScript,
    listenerPosition,
    type ScriptIdentity,
    scriptIdentityKey,
} from "./scripting";

function script(
    elementId: string,
    kind: ScriptIdentity["kind"],
    listenerIndex: number | undefined,
): ScriptIdentity {
    return { elementId, kind, listenerIndex };
}

describe("script identity", () => {
    it.each([
        [undefined, 0],
        [0, 0],
        [2, 2],
    ])("places listener index %s at position %i", (listenerIndex, position) => {
        expect(listenerPosition(listenerIndex)).toBe(position);
    });

    it.each([
        [
            "no listener index and index 0",
            script("Task_1", "execution-listener", undefined),
            script("Task_1", "execution-listener", 0),
            true,
        ],
        [
            "the same listener",
            script("Task_1", "task-listener", 1),
            script("Task_1", "task-listener", 1),
            true,
        ],
        [
            "another element",
            script("Task_1", "script-task", undefined),
            script("Task_2", "script-task", undefined),
            false,
        ],
        [
            "another kind",
            script("Task_1", "script-task", undefined),
            script("Task_1", "execution-listener", undefined),
            false,
        ],
        [
            "another listener",
            script("Task_1", "execution-listener", 0),
            script("Task_1", "execution-listener", 1),
            false,
        ],
    ])("compares %s", (_case, first, second, same) => {
        expect(isSameScript(first, second)).toBe(same);
        expect(scriptIdentityKey(first) === scriptIdentityKey(second)).toBe(same);
    });

    it("spells the key from the element, the kind and the listener position", () => {
        expect(scriptIdentityKey(script("Task_1", "execution-listener", undefined))).toBe(
            "Task_1::execution-listener::0",
        );
    });
});
