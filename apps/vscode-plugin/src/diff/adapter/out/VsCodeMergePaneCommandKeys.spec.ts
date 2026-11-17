import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeGitFake"));

import { commandCalls, resetVscodeGit } from "../../../__fixtures__/vscodeGitFake";
import { VsCodeMergePaneCommandKeys } from "./VsCodeMergePaneCommandKeys";

beforeEach(() => resetVscodeGit());

const contextOf = () => Object.fromEntries(commandCalls.map(([, key, value]) => [key, value]));

describe("VsCodeMergePaneCommandKeys", () => {
    it("sets the focus key for the keys, the target key for the palette and one key per command", () => {
        new VsCodeMergePaneCommandKeys().show({
            focused: true,
            targeted: true,
            available: ["keep", "undo", "next", "previous", "build"],
        });

        expect(commandCalls.every(([command]) => command === "setContext")).toBe(true);
        expect(contextOf()).toStrictEqual({
            "bpmn-modeler.mergePaneFocused": true,
            "bpmn-modeler.mergePaneTargeted": true,
            "bpmn-modeler.mergePane.canKeep": true,
            "bpmn-modeler.mergePane.canKeepInside": false,
            "bpmn-modeler.mergePane.canLeaveOut": false,
            "bpmn-modeler.mergePane.canKeepRemovedFlows": false,
            "bpmn-modeler.mergePane.canUndo": true,
            "bpmn-modeler.mergePane.canStep": true,
            "bpmn-modeler.mergePane.offersBuild": true,
        });
    });

    it("keeps the target key for the palette while the palette has the focus", () => {
        new VsCodeMergePaneCommandKeys().show({
            focused: false,
            targeted: true,
            available: ["undo", "build"],
        });

        expect(contextOf()).toMatchObject({
            "bpmn-modeler.mergePaneFocused": false,
            "bpmn-modeler.mergePaneTargeted": true,
            "bpmn-modeler.mergePane.canUndo": true,
        });
    });

    it("clears every key without a target", () => {
        const keys = new VsCodeMergePaneCommandKeys();
        keys.show({ focused: true, targeted: true, available: ["keepInside", "build"] });
        commandCalls.length = 0;

        keys.show({ focused: false, targeted: false, available: [] });

        expect(Object.values(contextOf()).every((value) => value === false)).toBe(true);
        expect(Object.keys(contextOf())).toHaveLength(9);
    });
});
