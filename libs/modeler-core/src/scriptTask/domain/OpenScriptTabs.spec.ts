import { describe, expect, it } from "vitest";

import { OpenScriptTab, OpenScriptTabs } from "./OpenScriptTabs";

const EDITOR = "file:///work/diagram.bpmn";
const OTHER_EDITOR = "file:///work/other.bpmn";

const scriptTaskTab: OpenScriptTab = {
    editorId: EDITOR,
    elementId: "Task_1",
    kind: "script-task",
    listenerIndex: undefined,
};
const firstListenerTab: OpenScriptTab = {
    editorId: EDITOR,
    elementId: "Task_1",
    kind: "execution-listener",
    listenerIndex: undefined,
};
const otherEditorTab: OpenScriptTab = { ...scriptTaskTab, editorId: OTHER_EDITOR };

const SCRIPT_TASK_PATH = "/base/abc/Task_1/script-task/Task_1.groovy";
const LISTENER_PATH = "/base/abc/Task_1/execution-listener-0-start/Task_1.execution-start.js";
const OTHER_EDITOR_PATH = "/base/def/Task_1/script-task/Task_1.groovy";

function tabsWithAll(): OpenScriptTabs {
    const tabs = new OpenScriptTabs();
    tabs.track(SCRIPT_TASK_PATH, scriptTaskTab);
    tabs.track(LISTENER_PATH, firstListenerTab);
    tabs.track(OTHER_EDITOR_PATH, otherEditorTab);
    return tabs;
}

describe("OpenScriptTabs", () => {
    it("lists an editor's open scripts with the last path segment as the tab's file name", () => {
        expect(tabsWithAll().openScriptsOf(EDITOR)).toEqual([
            {
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
                fileName: "Task_1.groovy",
            },
            {
                elementId: "Task_1",
                kind: "execution-listener",
                listenerIndex: undefined,
                fileName: "Task_1.execution-start.js",
            },
        ]);
    });

    it("names the tab after the whole key when the key has no path separator", () => {
        const tabs = new OpenScriptTabs();
        tabs.track("script-1", scriptTaskTab);
        expect(tabs.openScriptsOf(EDITOR).map((script) => script.fileName)).toEqual(["script-1"]);
    });

    it.each([
        ["an absent listener index as index 0", "execution-listener", 0, LISTENER_PATH],
        ["the script task", "script-task", undefined, SCRIPT_TASK_PATH],
        ["no other listener", "execution-listener", 1, undefined],
        ["no task listener for an execution listener", "task-listener", undefined, undefined],
    ] as const)("finds %s", (_case, kind, listenerIndex, expectedPath) => {
        const found = tabsWithAll().find(EDITOR, { elementId: "Task_1", kind, listenerIndex });
        expect(found?.[0]).toBe(expectedPath);
    });

    it("finds the tab that opened first when two show the same script", () => {
        const tabs = new OpenScriptTabs();
        tabs.track(SCRIPT_TASK_PATH, scriptTaskTab);
        tabs.track("/base/abc/Task_1/script-task/Task_1.js", scriptTaskTab);
        expect(tabs.find(EDITOR, scriptTaskTab)?.[0]).toBe(SCRIPT_TASK_PATH);
    });

    it("finds a script only among its own editor's tabs", () => {
        const tabs = new OpenScriptTabs();
        tabs.track(OTHER_EDITOR_PATH, otherEditorTab);
        expect(tabs.find(EDITOR, scriptTaskTab)).toBeUndefined();
    });

    it("lists an editor's tabs with their paths", () => {
        expect(tabsWithAll().ofEditor(OTHER_EDITOR)).toEqual([[OTHER_EDITOR_PATH, otherEditorTab]]);
    });

    it("forgets an untracked tab and hands it back", () => {
        const tabs = tabsWithAll();
        expect(tabs.untrack(SCRIPT_TASK_PATH)).toEqual(scriptTaskTab);
        expect(tabs.isOpen(SCRIPT_TASK_PATH)).toBe(false);
        expect(tabs.get(SCRIPT_TASK_PATH)).toBeUndefined();
        expect(tabs.untrack(SCRIPT_TASK_PATH)).toBeUndefined();
    });

    it.each([
        ["leaves a script an open tab owns untouched", SCRIPT_TASK_PATH, { kind: "alreadyOpen" }],
        [
            "writes a script no tab owns",
            "/base/abc/Task_2/script-task/Task_2.groovy",
            { kind: "write" },
        ],
    ])("%s", (_case, tabPath, plan) => {
        expect(tabsWithAll().materializationOf(tabPath)).toEqual(plan);
    });

    it("keeps the host's extra tab fields", () => {
        const tabs = new OpenScriptTabs<OpenScriptTab & { readonly uri: string }>();
        tabs.track(SCRIPT_TASK_PATH, { ...scriptTaskTab, uri: "file://x" });
        expect(tabs.get(SCRIPT_TASK_PATH)?.uri).toBe("file://x");
    });
});
