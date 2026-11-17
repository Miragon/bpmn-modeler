import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeGitFake"));

import { commandCalls, resetVscodeGit } from "../../../__fixtures__/vscodeGitFake";
import { VsCodeMergeCommandAvailability } from "./VsCodeMergeCommandAvailability";

beforeEach(() => resetVscodeGit());

const contextOf = () =>
    commandCalls.map(([command, key, value]) => [
        command,
        key,
        Array.isArray(value) ? value.map(String) : value,
    ]);

describe("VsCodeMergeCommandAvailability", () => {
    it("sets the list and the boolean key from one list", () => {
        new VsCodeMergeCommandAvailability().setResolvable([
            "file:///repo/order.bpmn",
            "file:///repo/invoice.bpmn",
        ]);

        expect(contextOf()).toStrictEqual([
            [
                "setContext",
                "bpmn-modeler.resolvableBpmnConflicts",
                ["file:///repo/order.bpmn", "file:///repo/invoice.bpmn"],
            ],
            ["setContext", "bpmn-modeler.hasResolvableBpmnConflicts", true],
        ]);
    });

    it("clears both keys once no conflict is left", () => {
        new VsCodeMergeCommandAvailability().setResolvable([]);

        expect(contextOf()).toStrictEqual([
            ["setContext", "bpmn-modeler.resolvableBpmnConflicts", []],
            ["setContext", "bpmn-modeler.hasResolvableBpmnConflicts", false],
        ]);
    });
});
