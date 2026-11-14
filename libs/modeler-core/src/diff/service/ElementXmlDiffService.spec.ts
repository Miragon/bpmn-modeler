import { describe, expect, it, vi } from "vitest";

import { elementXml } from "@miragon/bpmn-modeler-diff";

import {
    createTestHost,
    FakeDiffPaneHandle,
    holdNext,
    RecordingElementXmlDiffView,
} from "../../testing";
import { DiffPaneStore } from "./DiffPaneStore";
import { DiffSession } from "./DiffSession";
import { ElementXmlDiffService } from "./ElementXmlDiffService";

const BEFORE_URI = "file:///repo/a.bpmn";
const AFTER_URI = "file:///repo/b.bpmn";
const DIFF_KEY = "element-xml-1";

const bpmn = (elements: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
${elements}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Start_di" bpmnElement="Start">
        <dc:Bounds x="100" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const BEFORE_XML = bpmn(`
    <bpmn:startEvent id="Start" />
    <bpmn:task id="Review" name="Review" />
    <bpmn:task id="Archive" name="Archive" />`);
const AFTER_XML = bpmn(`
    <bpmn:startEvent id="Start" />
    <bpmn:task id="Review" name="Review order" />
    <bpmn:task id="Ship" name="Ship" />`);

/** A diagram diff of two armed panes and the service that shows its element XML. */
function diagramDiff(beforeXml = BEFORE_XML, afterXml = AFTER_XML) {
    const { notifier } = createTestHost();
    const store = new DiffPaneStore();
    const session = store.registerCompareFiles(BEFORE_URI, AFTER_URI);
    const before = new FakeDiffPaneHandle(BEFORE_URI, beforeXml);
    const after = new FakeDiffPaneHandle(AFTER_URI, afterXml);
    for (const pane of [before, after]) {
        session.attachPane(pane);
        pane.setReady();
    }
    const parsedElements: string[] = [];
    const parser = {
        elementXml: (xml: string, elementId: string, prefixSources: readonly string[]) => {
            parsedElements.push(elementId);
            return elementXml(xml, elementId, prefixSources);
        },
    };
    const service = elementXmlDiffService(store, notifier, (xml, elementId, prefixSources) =>
        parser.elementXml(xml, elementId, prefixSources),
    );
    store.dispose();
    const closeDiagramDiff = () => {
        store.detach(before);
        store.detach(after);
    };
    return { ...service, notifier, store, before, after, parser, parsedElements, closeDiagramDiff };
}

/** The service with a view that tells it when the user closes an XML diff, as the hosts wire it. */
function elementXmlDiffService(
    store: DiffPaneStore,
    notifier = createTestHost().notifier,
    extractElementXml?: ConstructorParameters<typeof ElementXmlDiffService>[3],
) {
    let service: ElementXmlDiffService | undefined = undefined;
    const view = new RecordingElementXmlDiffView((diffKey) => service?.closedByUser(diffKey));
    service = new ElementXmlDiffService(store, view, notifier, extractElementXml);
    return { service, view };
}

describe("ElementXmlDiffService", () => {
    it("opens the element's XML from both sides under a title naming it and both files", async () => {
        const { service, view, after } = diagramDiff();

        await service.show(after, "Review");

        const shown = view.shown(DIFF_KEY);
        expect(shown).toMatchObject({
            diffKey: DIFF_KEY,
            elementId: "Review",
            title: "Review (XML): a.bpmn ↔ b.bpmn",
        });
        expect(shown?.before).toContain('name="Review"');
        expect(shown?.after).toContain('name="Review order"');
    });

    it("leaves out the diagram interchange", async () => {
        const { service, view, before } = diagramDiff();

        await service.show(before, "Start");

        expect(view.shown(DIFF_KEY)?.before).not.toContain("bpmndi");
        expect(view.shown(DIFF_KEY)?.after).not.toContain("BPMNShape");
    });

    it.each([
        ["an added element", "Ship", { before: "" }, "after"],
        ["a removed element", "Archive", { after: "" }, "before"],
    ] as const)("shows an empty side for %s", async (_case, elementId, empty, filled) => {
        const { service, view, after } = diagramDiff();

        await service.show(after, elementId);

        expect(view.shown(DIFF_KEY)).toMatchObject(empty);
        expect(view.shown(DIFF_KEY)?.[filled]).toContain(`id="${elementId}"`);
    });

    it("shows two equal texts for an unchanged element", async () => {
        const { service, view, after } = diagramDiff();

        await service.show(after, "Start");

        const shown = view.shown(DIFF_KEY);
        expect(shown?.before).not.toBe("");
        expect(shown?.before).toBe(shown?.after);
    });

    it("writes a namespace with one prefix on both sides when the versions declare it under different prefixes", async () => {
        const declaringZeebeAs = (prefix: string) =>
            bpmn(`
    <bpmn:serviceTask id="Charge">
      <bpmn:extensionElements><${prefix}:taskDefinition type="charge" /></bpmn:extensionElements>
    </bpmn:serviceTask>`).replace(
                "<bpmn:definitions",
                `<bpmn:definitions xmlns:${prefix}="http://camunda.org/schema/zeebe/1.0"`,
            );
        const { service, view, after } = diagramDiff(
            declaringZeebeAs("zeebe"),
            declaringZeebeAs("z"),
        );

        await service.show(after, "Charge");

        const shown = view.shown(DIFF_KEY);
        expect(shown?.before).toContain("<zeebe:taskDefinition");
        expect(shown?.after).toBe(shown?.before);
    });

    it("follows a selection in either pane into the open XML diff", async () => {
        const { service, view, before, after } = diagramDiff();

        await service.show(after, "Review");
        await service.follow(before, "Archive");

        expect(view.shown(DIFF_KEY)?.elementId).toBe("Archive");
        expect(view.openedCount).toBe(1);

        await service.follow(after, "Ship");

        expect(view.shown(DIFF_KEY)?.elementId).toBe("Ship");
        expect(view.openedCount).toBe(1);
    });

    it("opens nothing on a selection when no XML diff is open", async () => {
        const { service, view, after } = diagramDiff();

        await service.follow(after, "Review");

        expect(view.shown(DIFF_KEY)).toBeUndefined();
    });

    it("parses nothing on a selection before an XML diff was asked for", async () => {
        const { service, after, parsedElements } = diagramDiff();

        await service.follow(after, "Review");

        expect(parsedElements).toStrictEqual([]);
    });

    it("retries an element whose XML could not be parsed when it is selected again", async () => {
        const { service, view, after, parser } = diagramDiff();
        await service.show(after, "Start");
        const parse = parser.elementXml;
        parser.elementXml = async () => {
            throw new Error("document busy");
        };
        await service.follow(after, "Review");
        parser.elementXml = parse;

        await service.follow(after, "Review");

        expect(view.shown(DIFF_KEY)?.elementId).toBe("Review");
    });

    it("opens nothing on a selection after the user closed the XML diff", async () => {
        const { service, view, after } = diagramDiff();
        await service.show(after, "Review");
        view.closeByUser(DIFF_KEY);

        await service.follow(after, "Ship");

        expect(view.shown(DIFF_KEY)).toBeUndefined();
    });

    it("reopens it from the context pad after the user closed it", async () => {
        const { service, view, after } = diagramDiff();
        await service.show(after, "Review");
        view.closeByUser(DIFF_KEY);

        await service.show(after, "Review");

        expect(view.shown(DIFF_KEY)?.elementId).toBe("Review");
    });

    it("parses nothing when the partner pane mirrors the selection back", async () => {
        const { service, after, before, parsedElements } = diagramDiff();
        await service.show(after, "Review");
        parsedElements.length = 0;

        await service.follow(before, "Review");

        expect(parsedElements).toStrictEqual([]);
    });

    it("keeps the content when the selection is cleared", async () => {
        const { service, view, after } = diagramDiff();
        await service.show(after, "Review");

        await service.follow(after, "");
        await service.show(after, "");

        expect(view.shown(DIFF_KEY)?.elementId).toBe("Review");
    });

    it("does not let a slow element overwrite the one selected after it", async () => {
        const { service, view, after, parser } = diagramDiff();
        await service.show(after, "Start");
        const slowParse = holdNext(parser, "elementXml");

        const slow = service.follow(after, "Review");
        await slowParse.reached;
        await service.follow(after, "Ship");
        slowParse.release();
        await slow;

        expect(view.shown(DIFF_KEY)?.elementId).toBe("Ship");
    });

    it("still opens the XML diff when a selection overtakes the request to show it", async () => {
        const { service, view, after, parser } = diagramDiff();
        const slowParse = holdNext(parser, "elementXml");

        const showing = service.show(after, "Review");
        await slowParse.reached;
        await service.follow(after, "Ship");
        slowParse.release();
        await showing;

        expect(view.shown(DIFF_KEY)?.elementId).toBe("Ship");
        expect(view.openedCount).toBe(1);
    });

    it("opens nothing for an element that arrives after its diagram diff closed", async () => {
        const { service, view, after, parser, closeDiagramDiff } = diagramDiff();
        const slowParse = holdNext(parser, "elementXml");

        const showing = service.show(after, "Review");
        await slowParse.reached;
        closeDiagramDiff();
        slowParse.release();
        await showing;

        expect(view.shown(DIFF_KEY)).toBeUndefined();
    });

    it("closes the XML diff with its diagram diff", async () => {
        const { service, view, after, closeDiagramDiff } = diagramDiff();
        await service.show(after, "Review");

        closeDiagramDiff();

        expect(view.shown(DIFF_KEY)).toBeUndefined();
    });

    it("keeps the XML diff open while one pane of its diagram diff is still attached", async () => {
        const { service, view, store, before, after } = diagramDiff();
        await service.show(after, "Review");

        store.detach(before);

        expect(view.shown(DIFF_KEY)?.elementId).toBe("Review");
    });

    it("parses nothing on a selection after the user closed the XML diff", async () => {
        const { service, view, after, parsedElements } = diagramDiff();
        await service.show(after, "Review");
        view.closeByUser(DIFF_KEY);
        parsedElements.length = 0;

        await service.follow(after, "Ship");

        expect(parsedElements).toStrictEqual([]);
    });

    it("follows the selection again once the user reopened the XML diff", async () => {
        const { service, view, after } = diagramDiff();
        await service.show(after, "Review");
        view.closeByUser(DIFF_KEY);

        await service.show(after, "Start");
        await service.follow(after, "Ship");

        expect(view.shown(DIFF_KEY)?.elementId).toBe("Ship");
    });

    it("ignores the user closing an XML diff the service does not know", () => {
        const { service, view } = diagramDiff();

        service.closedByUser("element-xml-99");

        expect(view.openedCount).toBe(0);
    });

    it("names the file and both versions an SCM diff compares", async () => {
        const store = new DiffPaneStore();
        const before = new FakeDiffPaneHandle("git:/repo/order.bpmn?ref=HEAD~1", BEFORE_XML, {
            kind: "ref",
            ref: "HEAD~1",
        });
        const after = new FakeDiffPaneHandle("file:///repo/order.bpmn", AFTER_XML, {
            kind: "working-tree",
        });
        const session = DiffSession.forScm(before, after);
        session.attachPane(before);
        session.attachPane(after);
        store.index(session);
        const { service, view } = elementXmlDiffService(store);

        await service.show(after, "Review");

        expect(view.shown(DIFF_KEY)?.title).toBe(
            "Review (XML): order.bpmn (HEAD~1) ↔ order.bpmn (Working Tree)",
        );
    });

    it("keeps one XML diff per diff tab when two tabs compare the same files", async () => {
        const { notifier } = createTestHost();
        const store = new DiffPaneStore();
        const tabs = [0, 1].map(() => {
            const session = store.registerCompareFiles(BEFORE_URI, AFTER_URI);
            const before = new FakeDiffPaneHandle(BEFORE_URI, BEFORE_XML);
            const after = new FakeDiffPaneHandle(AFTER_URI, AFTER_XML);
            for (const pane of [before, after]) {
                session.attachPane(pane);
                pane.setReady();
            }
            return { session, after };
        });
        store.dispose();
        const { service, view } = elementXmlDiffService(store, notifier);

        await service.show(tabs[0].after, "Review");
        await service.show(tabs[1].after, "Ship");
        tabs[0].session.attachedPanes().forEach((pane) => store.detach(pane));

        expect(view.shown("element-xml-1")).toBeUndefined();
        expect(view.shown("element-xml-2")?.elementId).toBe("Ship");
    });

    it("logs an element it cannot parse and shows nothing", async () => {
        const { service, view, notifier, after, parser } = diagramDiff();
        const failure = new Error("unparsable content");
        parser.elementXml = async () => {
            throw failure;
        };

        await service.show(after, "Review");

        expect(notifier.loggedErrors).toStrictEqual([failure]);
        expect(view.shown(DIFF_KEY)).toBeUndefined();
    });

    it("logs a host that fails to show or close the XML diff", async () => {
        const { service, view, notifier, after, closeDiagramDiff } = diagramDiff();
        const failure = new Error("no editor group");
        view.show = async () => {
            throw failure;
        };
        view.close = async () => {
            throw failure;
        };

        await service.show(after, "Review");
        closeDiagramDiff();

        await vi.waitFor(() => expect(notifier.loggedErrors).toStrictEqual([failure, failure]));
    });

    it("shows nothing for a pane whose partner has not attached", async () => {
        const { notifier } = createTestHost();
        const store = new DiffPaneStore();
        const session = store.registerCompareFiles(BEFORE_URI, AFTER_URI);
        const lonePane = new FakeDiffPaneHandle(AFTER_URI, AFTER_XML);
        session.attachPane(lonePane);
        store.dispose();
        const { service, view } = elementXmlDiffService(store, notifier);

        await service.show(lonePane, "Review");

        expect(view.shown(DIFF_KEY)).toBeUndefined();
    });
});
