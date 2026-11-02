import { describe, expect, it } from "vitest";

import { fileChoice, fileChoicesInWorkspaceOrder } from "./fileChoices";

describe("fileChoice", () => {
    it.each([
        { path: "/work/processes/order.bpmn", label: "order.bpmn" },
        { path: "/work/.camunda/payloads/vars.json", label: "vars.json" },
    ])("offers $path by its file name", ({ path, label }) => {
        expect(fileChoice(path)).toStrictEqual({ label, path, value: path });
    });
});

describe("fileChoicesInWorkspaceOrder", () => {
    it.each([
        {
            behaviour: "orders the files of one folder by their path below it",
            paths: ["/work/processes/order.bpmn", "/work/decisions/discount.dmn"],
            workspaceFolders: ["/work"],
            ordered: ["/work/decisions/discount.dmn", "/work/processes/order.bpmn"],
        },
        {
            behaviour: "orders the files of several folders by the folder name VS Code leads with",
            paths: ["/work/order.bpmn", "/archive/zeta/legacy.bpmn"],
            workspaceFolders: ["/work", "/archive/zeta"],
            ordered: ["/work/order.bpmn", "/archive/zeta/legacy.bpmn"],
        },
        {
            behaviour: "orders a file outside every folder by its full path",
            paths: ["/work/order.bpmn", "/elsewhere/loose.bpmn"],
            workspaceFolders: ["/work"],
            ordered: ["/elsewhere/loose.bpmn", "/work/order.bpmn"],
        },
        { behaviour: "offers nothing for no files", paths: [], workspaceFolders: [], ordered: [] },
    ])("$behaviour", ({ paths, workspaceFolders, ordered }) => {
        expect(fileChoicesInWorkspaceOrder(paths, workspaceFolders)).toStrictEqual(
            ordered.map(fileChoiceOf),
        );
    });
});

function fileChoiceOf(path: string) {
    return { label: path.slice(path.lastIndexOf("/") + 1), path, value: path };
}
