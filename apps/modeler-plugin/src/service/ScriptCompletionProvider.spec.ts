import { beansFor } from "../domain/scriptApi";
import {
    matchMemberAccess,
    parseKindFromUri,
} from "./scriptCompletionHelpers";

/**
 * Pure-function tests for the helpers behind the script completion provider.
 *
 * The provider class itself depends on the `vscode` module, which is
 * unavailable in the jest environment, so we exercise only the pure helpers
 * that drive its behaviour: URI → kind parsing, member-access detection, and
 * the kind → bean-set lookup.
 */
describe("parseKindFromUri", () => {
    it("recognises a script-task slug", () => {
        expect(
            parseKindFromUri("/abc/Task_1/script-task/Task_1.groovy"),
        ).toBe("script-task");
    });

    it("recognises an execution-listener slug with index and event", () => {
        expect(
            parseKindFromUri(
                "/abc/Task_1/execution-listener-0-start/Task_1.execution-start.groovy",
            ),
        ).toBe("execution-listener");
    });

    it("recognises a task-listener slug", () => {
        expect(
            parseKindFromUri(
                "/abc/UserTask_1/task-listener-2-create/UserTask_1.task-create-2.groovy",
            ),
        ).toBe("task-listener");
    });

    it("returns undefined for an unknown slug", () => {
        expect(
            parseKindFromUri("/abc/Task_1/unknown-kind/Task_1.groovy"),
        ).toBeUndefined();
    });

    it("returns undefined when the path is too shallow", () => {
        expect(parseKindFromUri("/Task_1.groovy")).toBeUndefined();
    });
});

describe("matchMemberAccess", () => {
    it("matches the bean name preceding a trailing dot", () => {
        expect(matchMemberAccess("execution.")).toBe("execution");
    });

    it("ignores leading whitespace", () => {
        expect(matchMemberAccess("    task.")).toBe("task");
    });

    it("returns the deepest identifier when nested", () => {
        expect(matchMemberAccess("foo.bar.")).toBe("bar");
    });

    it("returns undefined without a trailing dot", () => {
        expect(matchMemberAccess("execution")).toBeUndefined();
    });

    it("returns undefined on an empty line", () => {
        expect(matchMemberAccess("")).toBeUndefined();
    });
});

describe("beansFor", () => {
    it("exposes only execution in a script task", () => {
        expect(beansFor("script-task").map((b) => b.name)).toEqual([
            "execution",
        ]);
    });

    it("adds eventName for execution listeners", () => {
        expect(beansFor("execution-listener").map((b) => b.name)).toEqual([
            "execution",
            "eventName",
        ]);
    });

    it("adds task and eventName for task listeners", () => {
        expect(beansFor("task-listener").map((b) => b.name)).toEqual([
            "execution",
            "task",
            "eventName",
        ]);
    });
});
