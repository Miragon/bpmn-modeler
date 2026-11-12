import { describe, expect, expectTypeOf, it } from "vitest";

import type { ApplyDmnDiffHighlightsQuery, DmnDiffView } from "@miragon/bpmn-modeler-shared";
import type { DmnDiffResult } from "@miragon/dmn-modeler-diff";

import { createTestHost, FakeDiffPaneHandle } from "../../testing";
import { DiffPaneStore } from "./DiffPaneStore";
import { DmnDiffService } from "./DmnDiffService";

const DMN = (inputs: string, shapes: string) => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" id="Definitions_1" name="Shipping" namespace="http://camunda.org/schema/1.0/dmn">
  ${inputs}
  <dmndi:DMNDI><dmndi:DMNDiagram id="DRD_1">${shapes}</dmndi:DMNDiagram></dmndi:DMNDI>
</definitions>`;
const shape = (id: string, x: number) =>
    `<dmndi:DMNShape id="Shape_${id}" dmnElementRef="${id}"><dc:Bounds height="45" width="125" x="${x}" y="100" /></dmndi:DMNShape>`;

// "Weight" is removed and "Insured" added.
const BEFORE_DMN = DMN(
    '<inputData id="Input_Country" name="Country" /><inputData id="Input_Weight" name="Weight" />',
    shape("Input_Country", 100) + shape("Input_Weight", 300),
);
const AFTER_DMN = DMN(
    '<inputData id="Input_Country" name="Country" /><inputData id="Input_Insured" name="Insured" />',
    shape("Input_Country", 100) + shape("Input_Insured", 300),
);

const LEFT = "file:///repo/shipping-v1.dmn";
const RIGHT = "file:///repo/shipping-v2.dmn";

function createService() {
    const { notifier, settings } = createTestHost();
    const store = new DiffPaneStore();
    return { service: new DmnDiffService(notifier, settings, store), notifier, store };
}

function attachedPair(store: DiffPaneStore, beforeText = BEFORE_DMN, afterText = AFTER_DMN) {
    const session = store.registerCompareFiles(LEFT, RIGHT);
    const before = new FakeDiffPaneHandle(LEFT, beforeText);
    const after = new FakeDiffPaneHandle(RIGHT, afterText);
    session.attachPane(before);
    session.attachPane(after);
    return { before, after };
}

const typesOf = (pane: FakeDiffPaneHandle) =>
    pane.posted.map((message) => (message as { type: string }).type);

const highlightsOf = (pane: FakeDiffPaneHandle) =>
    pane.posted.find(
        (message): message is ApplyDmnDiffHighlightsQuery =>
            (message as { type: string }).type === "ApplyDmnDiffHighlightsQuery",
    );

describe("DmnDiffService", () => {
    it("carries exactly the side view the data layer computes", () => {
        expectTypeOf<DmnDiffView>().toEqualTypeOf<DmnDiffResult>();
    });

    it("answers a pane's file request with its DMN", async () => {
        const { service } = createService();
        const pane = new FakeDiffPaneHandle(RIGHT, AFTER_DMN);

        await service.sendViewerFile(pane);

        expect(pane.posted).toStrictEqual([
            expect.objectContaining({ type: "DmnFileQuery", content: AFTER_DMN }),
        ]);
    });

    it("sends the language but no highlights while only one pane is ready", async () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store);

        await service.markReady(before);

        expect(typesOf(before)).toStrictEqual(["LanguageQuery"]);
        expect(after.posted).toStrictEqual([]);
    });

    it("sends each pane the changes its own version contains once both are ready", async () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store);

        await service.markReady(before);
        await service.markReady(after);

        expect(highlightsOf(before)).toMatchObject({
            side: "before",
            view: { added: [], removed: ["Input_Weight"], counts: { added: 1, removed: 1 } },
            origin: "compare-files",
            paneFilename: "shipping-v1.dmn",
        });
        expect(highlightsOf(after)).toMatchObject({
            side: "after",
            view: {
                added: ["Input_Insured"],
                removed: [],
                navigationOrder: ["Input_Insured", "Input_Weight"],
            },
            paneFilename: "shipping-v2.dmn",
        });
    });

    it("logs a version it cannot compare and highlights nothing", async () => {
        const { service, store, notifier } = createService();
        const { before, after } = attachedPair(store, "not a DMN file");

        await service.markReady(before);
        await service.markReady(after);

        expect(notifier.logged("error")).toHaveLength(1);
        expect(highlightsOf(before)).toBeUndefined();
        expect(highlightsOf(after)).toBeUndefined();
    });

    it("opens the view the partner pane opened", async () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store);

        await service.forwardView(before, "Decision_Shipping");
        await service.forwardView(after, null);

        expect(after.posted).toStrictEqual([
            expect.objectContaining({
                type: "SyncDmnDiffViewQuery",
                elementId: "Decision_Shipping",
            }),
        ]);
        expect(before.posted).toStrictEqual([
            expect.objectContaining({ type: "SyncDmnDiffViewQuery", elementId: null }),
        ]);
    });

    it("scrolls the partner pane's table to the same rule", async () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store);
        const scroll = { rule: "Rule_3", offset: 12, left: 300 };

        await service.forwardScroll(after, scroll);

        expect(before.posted).toStrictEqual([
            expect.objectContaining({ type: "SyncDmnDiffScrollQuery", scroll }),
        ]);
    });

    it("keeps the partner's viewport and stepper in step", async () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store);
        const viewport = { x: 1, y: 2, width: 3, height: 4 };

        await service.forwardViewport(before, viewport);
        await service.forwardCursor(before, 2);

        expect(after.posted).toStrictEqual([
            expect.objectContaining({ type: "SyncViewportQuery", viewport }),
            expect.objectContaining({ type: "SyncCursorQuery", index: 2 }),
        ]);
    });

    it("re-sends the language to the panes that are ready", () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store);
        before.setReady();

        service.rebroadcastLanguage();

        expect(typesOf(before)).toStrictEqual(["LanguageQuery"]);
        expect(after.posted).toStrictEqual([]);
    });
});
