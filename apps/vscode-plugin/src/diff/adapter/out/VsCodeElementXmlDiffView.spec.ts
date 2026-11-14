import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeTextDiffGroupsFake"));

import { commands, ExtensionContext } from "vscode";

import { ElementXmlDiff } from "@miragon/bpmn-modeler-core";
import { describeElementXmlDiffViewContract, holdNext } from "@miragon/bpmn-modeler-core/testing";

import {
    closeTabByUser,
    failCommand,
    keepEmptyGroups,
    moveTabByUser,
    pinTabByUser,
    renderedGroups,
    reopenClosedTabByUser,
    resetVscodeTextDiffGroups,
    restoreTabFromLastSession,
} from "../../../__fixtures__/vscodeTextDiffGroupsFake";
import { ELEMENT_XML_SCHEME, VsCodeElementXmlDiffView } from "./VsCodeElementXmlDiffView";

const DIAGRAM_DIFF = { label: "a.bpmn ↔ b.bpmn" };
const DIFF_KEY = "file:///repo/a.bpmn|file:///repo/b.bpmn";

const elementDiff = (elementId: string, diffKey = DIFF_KEY): ElementXmlDiff => ({
    diffKey,
    elementId,
    title: `${elementId} (XML): a.bpmn ↔ b.bpmn`,
    before: `<task id="${elementId}" name="old" />`,
    after: `<task id="${elementId}" name="new" />`,
});

const xmlTab = (elementId: string) => ({
    label: `${elementId} (XML): a.bpmn ↔ b.bpmn`,
    before: `<task id="${elementId}" name="old" />`,
    after: `<task id="${elementId}" name="new" />`,
});

function registeredView(
    onClosedByUser: (diffKey: string) => void = () => undefined,
): VsCodeElementXmlDiffView {
    const view = new VsCodeElementXmlDiffView(onClosedByUser);
    view.register({ subscriptions: [] } as unknown as ExtensionContext);
    return view;
}

beforeEach(() => resetVscodeTextDiffGroups());

describeElementXmlDiffViewContract("VsCodeElementXmlDiffView", (onClosedByUser) => ({
    view: registeredView(onClosedByUser),
    shown: () =>
        renderedGroups()
            .flatMap((group) => group.tabs)
            .flatMap(({ label, before, after }) =>
                before === undefined || after === undefined ? [] : [{ title: label, before, after }],
            ),
    closeByUser: (diff) => closeTabByUser(diff.title),
}));

describe("VsCodeElementXmlDiffView", () => {

    it("opens the XML diff in a group below the diagram diff, which keeps focus", async () => {
        const view = registeredView();

        await view.show(elementDiff("Task_1"));

        expect(renderedGroups()).toStrictEqual([
            { focused: true, tabs: [DIAGRAM_DIFF] },
            { focused: false, tabs: [xmlTab("Task_1")] },
        ]);
    });

    it("replaces the open XML diff in its tab, renamed for the new element", async () => {
        const view = registeredView();
        await view.show(elementDiff("Task_1"));

        await view.refresh(elementDiff("Gateway_1"));
        await view.show(elementDiff("Event_1"));

        expect(renderedGroups()).toStrictEqual([
            { focused: true, tabs: [DIAGRAM_DIFF] },
            { focused: false, tabs: [xmlTab("Event_1")] },
        ]);
    });

    it("opens nothing on a refresh while no XML diff is open", async () => {
        const view = registeredView();

        await view.refresh(elementDiff("Task_1"));

        expect(renderedGroups()).toStrictEqual([{ focused: true, tabs: [DIAGRAM_DIFF] }]);
    });

    it("opens nothing on a refresh after the user closed the XML diff", async () => {
        const view = registeredView();
        await view.show(elementDiff("Task_1"));
        closeTabByUser(xmlTab("Task_1").label);

        await view.refresh(elementDiff("Gateway_1"));

        expect(renderedGroups()).toStrictEqual([{ focused: true, tabs: [DIAGRAM_DIFF] }]);
    });

    it("opens it again below after the user closed it", async () => {
        const view = registeredView();
        await view.show(elementDiff("Task_1"));
        closeTabByUser(xmlTab("Task_1").label);

        await view.show(elementDiff("Gateway_1"));

        expect(renderedGroups()).toStrictEqual([
            { focused: true, tabs: [DIAGRAM_DIFF] },
            { focused: false, tabs: [xmlTab("Gateway_1")] },
        ]);
    });

    it("opens it again in the group the user's close left empty", async () => {
        keepEmptyGroups();
        const view = registeredView();
        await view.show(elementDiff("Task_1"));
        closeTabByUser(xmlTab("Task_1").label);

        await view.show(elementDiff("Gateway_1"));

        expect(renderedGroups()).toStrictEqual([
            { focused: true, tabs: [DIAGRAM_DIFF] },
            { focused: false, tabs: [xmlTab("Gateway_1")] },
        ]);
    });

    it("keeps following the XML diff the user moved to another group", async () => {
        const closedByUser: string[] = [];
        const view = registeredView((diffKey) => closedByUser.push(diffKey));
        await view.show(elementDiff("Task_1"));
        moveTabByUser(xmlTab("Task_1").label, 0);

        expect(closedByUser).toStrictEqual([]);

        await view.refresh(elementDiff("Gateway_1"));

        expect(renderedGroups()).toStrictEqual([
            { focused: true, tabs: [DIAGRAM_DIFF, xmlTab("Gateway_1")] },
        ]);

        await view.close(DIFF_KEY);

        expect(renderedGroups()).toStrictEqual([{ focused: true, tabs: [DIAGRAM_DIFF] }]);
    });

    it("replaces the tab the user pinned instead of opening a second one", async () => {
        const closedByUser: string[] = [];
        const view = registeredView((diffKey) => closedByUser.push(diffKey));
        await view.show(elementDiff("Task_1"));
        pinTabByUser(xmlTab("Task_1").label);

        await view.refresh(elementDiff("Gateway_1"));

        expect(renderedGroups()).toStrictEqual([
            { focused: true, tabs: [DIAGRAM_DIFF] },
            { focused: false, tabs: [xmlTab("Gateway_1")] },
        ]);
        expect(closedByUser).toStrictEqual([]);
    });

    it("ends on the later of two selections when VS Code opens the earlier one late", async () => {
        const view = registeredView();
        await view.show(elementDiff("Task_1"));
        const slowOpen = holdNext(commands, "executeCommand");

        const earlier = view.refresh(elementDiff("Gateway_1"));
        await slowOpen.reached;
        const later = view.refresh(elementDiff("Event_1"));
        slowOpen.release();
        await Promise.all([earlier, later]);

        expect(renderedGroups()).toStrictEqual([
            { focused: true, tabs: [DIAGRAM_DIFF] },
            { focused: false, tabs: [xmlTab("Event_1")] },
        ]);
    });

    it("closes the XML diff with its diagram diff and leaves another diagram diff's open", async () => {
        const view = registeredView();
        await view.show(elementDiff("Task_1"));
        await view.show(elementDiff("Other_1", "file:///repo/c.bpmn|file:///repo/d.bpmn"));

        await view.close(DIFF_KEY);

        expect(renderedGroups()).toStrictEqual([
            { focused: true, tabs: [DIAGRAM_DIFF] },
            { focused: false, tabs: [xmlTab("Other_1")] },
        ]);
    });

    it("closes nothing for a diagram diff without an XML diff", async () => {
        const view = registeredView();

        await view.close(DIFF_KEY);

        expect(renderedGroups()).toStrictEqual([{ focused: true, tabs: [DIAGRAM_DIFF] }]);
    });

    it("closes the XML diffs a window reload brought back without content", () => {
        restoreTabFromLastSession(ELEMENT_XML_SCHEME, "Task_1 (XML): a.bpmn ↔ b.bpmn");
        restoreTabFromLastSession("git", "order.bpmn (Working Tree)");

        registeredView();

        expect(renderedGroups()).toStrictEqual([
            {
                focused: true,
                tabs: [DIAGRAM_DIFF, { label: "order.bpmn (Working Tree)", before: "", after: "" }],
            },
        ]);
    });

    it("closes an XML diff the user reopened after closing it, as its content is gone", async () => {
        const closedByUser: string[] = [];
        const view = registeredView((diffKey) => closedByUser.push(diffKey));
        await view.show(elementDiff("Task_1"));
        closeTabByUser(xmlTab("Task_1").label);

        reopenClosedTabByUser();
        await Promise.resolve();

        expect(renderedGroups()).toStrictEqual([{ focused: true, tabs: [DIAGRAM_DIFF] }]);
        expect(closedByUser).toStrictEqual([DIFF_KEY]);
    });

    it("closes an XML diff the user reopened after the selection replaced it", async () => {
        keepEmptyGroups();
        const view = registeredView();
        await view.show(elementDiff("Task_1"));
        pinTabByUser(xmlTab("Task_1").label);
        await view.refresh(elementDiff("Gateway_1"));

        reopenClosedTabByUser();
        await Promise.resolve();

        expect(renderedGroups()).toStrictEqual([
            { focused: true, tabs: [DIAGRAM_DIFF] },
            { focused: false, tabs: [xmlTab("Gateway_1")] },
        ]);
    });

    it("opens the XML diff beside the diagram diff where no group can be added below", async () => {
        failCommand("workbench.action.newGroupBelow");
        const view = registeredView();

        await view.show(elementDiff("Task_1"));

        expect(renderedGroups()).toStrictEqual([
            { focused: true, tabs: [DIAGRAM_DIFF] },
            { focused: false, tabs: [xmlTab("Task_1")] },
        ]);
    });
});
