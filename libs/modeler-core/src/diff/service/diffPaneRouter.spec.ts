import { describe, expect, it } from "vitest";

import {
    BPMN_DIFF_PANE_COMMAND_TYPES,
    CursorChangedCommand,
    DiffPlaneChangedCommand,
    DIFF_PANE_HANDSHAKE_COMMAND_TYPES,
    DMN_DIFF_PANE_COMMAND_TYPES,
    DiffReadyCommand,
    DmnDiffScrollChangedCommand,
    DmnDiffViewChangedCommand,
    GetBpmnFileCommand,
    GetDmnFileCommand,
    LogErrorCommand,
    SwapCompareSidesCommand,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";

import { createTestHost, FakeDiffPaneHandle, RecordingNotifier } from "../../testing";
import { BpmnDiffService } from "./BpmnDiffService";
import {
    DiffPaneHostExtensions,
    createDiffPaneRouter,
    createDmnDiffPaneRouter,
} from "./diffPaneRouter";
import { DmnDiffService } from "./DmnDiffService";
import { DiffPaneStore } from "./DiffPaneStore";

const BEFORE = "git:/repo/order.bpmn?ref=HEAD";
const AFTER = "file:///repo/order.bpmn";
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false" />
</bpmn:definitions>`;

function diffPanes(extensions: DiffPaneHostExtensions = {}) {
    const { notifier, settings } = createTestHost();
    const store = new DiffPaneStore();
    const session = store.registerCompareFiles(BEFORE, AFTER);
    const before = new FakeDiffPaneHandle(BEFORE, XML);
    const after = new FakeDiffPaneHandle(AFTER, XML);
    session.attachPane(before);
    session.attachPane(after);
    const router = createDiffPaneRouter(new BpmnDiffService(notifier, settings, store), extensions);
    return { router, before, after };
}

describe("createDiffPaneRouter", () => {
    it.each<[string, DiffPaneHostExtensions, Record<string, string>]>([
        [
            "a host with every extension",
            { swapSides: async () => undefined, paneLog: new RecordingNotifier() },
            {
                GetBpmnFileCommand: "handled",
                GetBpmnModelerSettingCommand: "ignored",
                GetPropertiesPanelStateCommand: "ignored",
                DiffReadyCommand: "handled",
                ViewportChangedCommand: "handled",
                CursorChangedCommand: "handled",
                DiffPlaneChangedCommand: "handled",
                SwapCompareSidesCommand: "handled",
                LogErrorCommand: "handled",
            },
        ],
        [
            "a bare host",
            {},
            {
                GetBpmnFileCommand: "handled",
                GetBpmnModelerSettingCommand: "ignored",
                GetPropertiesPanelStateCommand: "ignored",
                DiffReadyCommand: "handled",
                ViewportChangedCommand: "handled",
                CursorChangedCommand: "handled",
                DiffPlaneChangedCommand: "handled",
                SwapCompareSidesCommand: "ignored",
                LogErrorCommand: "ignored",
            },
        ],
    ])("routes every command a diff pane posts for %s", (_host, extensions, expected) => {
        const { router } = diffPanes(extensions);

        const routes = Object.fromEntries(
            [...DIFF_PANE_HANDSHAKE_COMMAND_TYPES, ...BPMN_DIFF_PANE_COMMAND_TYPES].map((type) => [
                type,
                router.routeOf(type).kind,
            ]),
        );

        expect(routes).toStrictEqual(expected);
    });

    it("answers the file request a pane sends before it knows it is a diff pane", async () => {
        const { router, after } = diffPanes();

        await router.dispatch(new GetBpmnFileCommand(), after);

        expect(after.posted).toStrictEqual([
            expect.objectContaining({ type: "BpmnFileQuery", content: XML, viewerMode: "viewer" }),
        ]);
    });

    it("marks the pane ready and sends it the language", async () => {
        const { router, after } = diffPanes();

        await router.dispatch(new DiffReadyCommand(), after);

        expect(after.isReady()).toBe(true);
        expect(after.posted).toStrictEqual([expect.objectContaining({ type: "LanguageQuery" })]);
    });

    it("forwards a pane's viewport, cursor and plane to its partner", async () => {
        const { router, before, after } = diffPanes();
        const viewport = { x: 1, y: 2, width: 3, height: 4 };

        await router.dispatch(new ViewportChangedCommand(viewport), before);
        await router.dispatch(new CursorChangedCommand(5), before);
        await router.dispatch(new DiffPlaneChangedCommand("Sub_1"), before);

        expect(before.posted).toStrictEqual([]);
        expect(after.posted).toStrictEqual([
            expect.objectContaining({ type: "SyncViewportQuery", viewport }),
            expect.objectContaining({ type: "SyncCursorQuery", index: 5 }),
            expect.objectContaining({ type: "SyncDiffPlaneQuery", planeId: "Sub_1" }),
        ]);
    });

    it("forwards to the partner in the pane's own diff when one file is open in two", async () => {
        const { notifier, settings } = createTestHost();
        const store = new DiffPaneStore();
        const pair = () => {
            const session = store.registerCompareFiles(BEFORE, AFTER);
            const before = new FakeDiffPaneHandle(BEFORE, XML);
            const after = new FakeDiffPaneHandle(AFTER, XML);
            session.attachPane(before);
            session.attachPane(after);
            return { before, after };
        };
        const first = pair();
        const second = pair();
        const router = createDiffPaneRouter(new BpmnDiffService(notifier, settings, store), {});

        await router.dispatch(new CursorChangedCommand(1), second.before);

        expect(first.after.posted).toStrictEqual([]);
        expect(second.after.posted).toStrictEqual([
            expect.objectContaining({ type: "SyncCursorQuery", index: 1 }),
        ]);
    });

    it("swaps the sides of the pane's diff through the host", async () => {
        const swapped: string[] = [];
        const { router, before } = diffPanes({
            swapSides: async (pane) => {
                swapped.push(pane.uri);
            },
        });

        await router.dispatch(new SwapCompareSidesCommand(), before);

        expect(swapped).toStrictEqual([BEFORE]);
    });

    it("logs a pane's error under the pane's file name", async () => {
        const paneLog = new RecordingNotifier();
        const { router, after } = diffPanes({ paneLog });

        await router.dispatch(new LogErrorCommand("import failed", "at line 1"), after);

        expect(paneLog.logged("error")).toStrictEqual([
            "[webview:order.bpmn] import failed\nat line 1",
        ]);
    });
});

const DMN_BEFORE = "git:/repo/shipping.dmn?ref=HEAD";
const DMN_AFTER = "file:///repo/shipping.dmn";
const DMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="Definitions_1" name="Shipping" namespace="http://camunda.org/schema/1.0/dmn" />`;

function dmnDiffPanes(extensions: DiffPaneHostExtensions = {}) {
    const { notifier, settings } = createTestHost();
    const store = new DiffPaneStore();
    const session = store.registerCompareFiles(DMN_BEFORE, DMN_AFTER);
    const before = new FakeDiffPaneHandle(DMN_BEFORE, DMN_XML);
    const after = new FakeDiffPaneHandle(DMN_AFTER, DMN_XML);
    session.attachPane(before);
    session.attachPane(after);
    const router = createDmnDiffPaneRouter(
        new DmnDiffService(notifier, settings, store),
        extensions,
    );
    return { router, before, after };
}

describe("createDmnDiffPaneRouter", () => {
    it.each<[string, DiffPaneHostExtensions, Record<string, string>]>([
        [
            "a host with every extension",
            { swapSides: async () => undefined, paneLog: new RecordingNotifier() },
            {
                GetDmnFileCommand: "handled",
                DiffReadyCommand: "handled",
                ViewportChangedCommand: "handled",
                CursorChangedCommand: "handled",
                DmnDiffViewChangedCommand: "handled",
                DmnDiffScrollChangedCommand: "handled",
                SwapCompareSidesCommand: "handled",
                LogErrorCommand: "handled",
            },
        ],
        [
            "a bare host",
            {},
            {
                GetDmnFileCommand: "handled",
                DiffReadyCommand: "handled",
                ViewportChangedCommand: "handled",
                CursorChangedCommand: "handled",
                DmnDiffViewChangedCommand: "handled",
                DmnDiffScrollChangedCommand: "handled",
                SwapCompareSidesCommand: "ignored",
                LogErrorCommand: "ignored",
            },
        ],
    ])("routes every command a DMN diff pane posts for %s", (_host, extensions, expected) => {
        const { router } = dmnDiffPanes(extensions);

        const routes = Object.fromEntries(
            DMN_DIFF_PANE_COMMAND_TYPES.map((type) => [type, router.routeOf(type).kind]),
        );

        expect(routes).toStrictEqual(expected);
    });

    it("answers the pane's file request with its DMN", async () => {
        const { router, after } = dmnDiffPanes();

        await router.dispatch(new GetDmnFileCommand(), after);

        expect(after.posted).toStrictEqual([
            expect.objectContaining({ type: "DmnFileQuery", content: DMN_XML }),
        ]);
    });

    it("forwards the opened view and the table scroll to the partner pane", async () => {
        const { router, before, after } = dmnDiffPanes();
        const scroll = { rule: "Rule_1", offset: 0, left: 0 };

        await router.dispatch(new DmnDiffViewChangedCommand("Decision_1"), before);
        await router.dispatch(new DmnDiffScrollChangedCommand(scroll), before);

        expect(after.posted).toStrictEqual([
            expect.objectContaining({ type: "SyncDmnDiffViewQuery", elementId: "Decision_1" }),
            expect.objectContaining({ type: "SyncDmnDiffScrollQuery", scroll }),
        ]);
    });

    it("forwards a pane's viewport and cursor and marks it ready", async () => {
        const { router, before, after } = dmnDiffPanes();
        const viewport = { x: 1, y: 2, width: 3, height: 4 };

        await router.dispatch(new ViewportChangedCommand(viewport), before);
        await router.dispatch(new CursorChangedCommand(1), before);
        await router.dispatch(new DiffReadyCommand(), before);

        expect(before.isReady()).toBe(true);
        expect(after.posted).toStrictEqual([
            expect.objectContaining({ type: "SyncViewportQuery", viewport }),
            expect.objectContaining({ type: "SyncCursorQuery", index: 1 }),
        ]);
    });

    it("swaps the sides through the host and logs under the pane's file name", async () => {
        const swapped: string[] = [];
        const paneLog = new RecordingNotifier();
        const { router, before } = dmnDiffPanes({
            swapSides: async (pane) => {
                swapped.push(pane.uri);
            },
            paneLog,
        });

        await router.dispatch(new SwapCompareSidesCommand(), before);
        await router.dispatch(new LogErrorCommand("import failed"), before);

        expect(swapped).toStrictEqual([DMN_BEFORE]);
        expect(paneLog.logged("error")).toStrictEqual(["[webview:shipping.dmn] import failed"]);
    });
});
