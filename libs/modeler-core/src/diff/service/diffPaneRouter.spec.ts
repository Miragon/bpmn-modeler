import { describe, expect, it } from "vitest";

import {
    CursorChangedCommand,
    DIFF_PANE_COMMAND_TYPES,
    DiffReadyCommand,
    GetBpmnFileCommand,
    LogErrorCommand,
    SwapCompareSidesCommand,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";

import { createTestHost, RecordingNotifier } from "../../testing";
import { DiffPaneHandle } from "../domain/DiffSession";
import { BpmnDiffService } from "./BpmnDiffService";
import { DiffPaneHostExtensions, createDiffPaneRouter } from "./diffPaneRouter";
import { DiffPaneStore } from "./DiffPaneStore";

const BEFORE = "git:/repo/order.bpmn?ref=HEAD";
const AFTER = "file:///repo/order.bpmn";
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false" />
</bpmn:definitions>`;

function fakePane(uri: string, text = ""): DiffPaneHandle & { posted: { type: string }[] } {
    let ready = false;
    const posted: { type: string }[] = [];
    return {
        uri,
        posted,
        isReady: () => ready,
        setReady: () => {
            ready = true;
        },
        getText: () => text,
        postMessage: async (message) => {
            posted.push(message as { type: string });
            return true;
        },
        dispose: () => undefined,
    };
}

function diffPanes(extensions: DiffPaneHostExtensions = {}) {
    const { notifier, settings } = createTestHost();
    const store = new DiffPaneStore();
    const session = store.registerCompareFiles(BEFORE, AFTER);
    const before = fakePane(BEFORE, XML);
    const after = fakePane(AFTER, XML);
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
                DiffReadyCommand: "handled",
                ViewportChangedCommand: "handled",
                CursorChangedCommand: "handled",
                SwapCompareSidesCommand: "handled",
                LogErrorCommand: "handled",
            },
        ],
        [
            "a bare host",
            {},
            {
                DiffReadyCommand: "handled",
                ViewportChangedCommand: "handled",
                CursorChangedCommand: "handled",
                SwapCompareSidesCommand: "ignored",
                LogErrorCommand: "ignored",
            },
        ],
    ])("routes every diff-pane command for %s", (_host, extensions, expected) => {
        const { router } = diffPanes(extensions);

        const routes = Object.fromEntries(
            DIFF_PANE_COMMAND_TYPES.map((type) => [type, router.routeOf(type).kind]),
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
        expect(after.posted.map((message) => message.type)).toStrictEqual(["LanguageQuery"]);
    });

    it("forwards a pane's viewport and cursor to its partner", async () => {
        const { router, before, after } = diffPanes();
        const viewport = { x: 1, y: 2, width: 3, height: 4 };

        await router.dispatch(new ViewportChangedCommand(viewport), before);
        await router.dispatch(new CursorChangedCommand(5), before);

        expect(before.posted).toStrictEqual([]);
        expect(after.posted).toStrictEqual([
            expect.objectContaining({ type: "SyncViewportQuery", viewport }),
            expect.objectContaining({ type: "SyncCursorQuery", index: 5 }),
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
