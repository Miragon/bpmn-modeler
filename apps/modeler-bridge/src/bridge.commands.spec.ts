/**
 * End-to-end coverage for the portable modeler-command RPC paths on the bridge
 * (change engine version, migrate all, format, clean up). Same harness as
 * `bridge.marketplace.spec.ts`: the real bridge (`createBridge`) runs against a
 * fake transport over a real temp filesystem, so the core services it constructs
 * do genuine document reads, fs globs and fs writes.
 *
 * The copy of every layout toast is pinned by the core's
 * `BpmnLayoutService.spec.ts`; these tests only prove the RPC and webview-message
 * wiring reaches it.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FOCUS_BPMN_DIAGRAM_MESSAGE } from "@miragon/bpmn-modeler-core";

import {
    hostNotification,
    hostReply,
    isStatusSlotUpdate,
    registerParams,
    settle,
    waitForFrame,
} from "./__fixtures__/bridgeHarness";
import { createBridge } from "./bridge";
import { Rpc } from "./rpc";

const C7_VERSION = "7.20.0";
const BPMN_C7_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="${C7_VERSION}">
  <bpmn:process id="Process_1" isExecutable="true" camunda:historyTimeToLive="180" />
</bpmn:definitions>`;

const VERSION_NOT_CHANGED =
    "The diagram changed while you picked a version, so its engine version was not changed. Try again.";

const isPickerShow = (f: any) => f.method === "picker/show" && f.id != null;
const isConfirmRequest = (f: any) => f.method === "confirm/show" && f.id != null;
const isShowInfo = (message: string) => (f: any) =>
    f.method === "notifier/showInfo" && f.params.message === message;
const postedQueries = (frames: any[], type: string) =>
    frames.filter((f) => f.method === "editor/postMessage" && f.params.message?.type === type);

function otherVersionIndex(picker: any): number {
    return picker.params.items.findIndex((item: any) => item.label !== C7_VERSION);
}

describe("bridge modeler commands (real core over a fake transport)", () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
        for (const cleanup of cleanups.splice(0)) {
            await cleanup();
        }
    });

    async function setup(): Promise<{
        rpc: Rpc;
        frames: any[];
        editorId: string;
        workspaceRoot: string;
        sourcePath: string;
        tmp: string;
    }> {
        const tmp = await fs.mkdtemp(join(tmpdir(), "modeler-bridge-cmd-"));
        const workspaceRoot = join(tmp, "workspace");
        await fs.mkdir(workspaceRoot, { recursive: true });
        const sourcePath = join(workspaceRoot, "process.bpmn");
        await fs.writeFile(sourcePath, BPMN_C7_XML, "utf8");

        const frames: any[] = [];
        const { rpc } = createBridge(
            (line) => frames.push(JSON.parse(line)),
            () => {},
            {
                homeDir: tmp,
            },
        );
        const editorId = `file://${sourcePath}`;

        cleanups.push(() => fs.rm(tmp, { recursive: true, force: true }));
        return { rpc, frames, editorId, workspaceRoot, sourcePath, tmp };
    }

    async function setupWithOpenEditor() {
        const context = await setup();
        await context.rpc.handleLine(
            hostNotification(
                "session/register",
                registerParams(
                    context.editorId,
                    context.workspaceRoot,
                    context.sourcePath,
                    BPMN_C7_XML,
                ),
            ),
        );
        return context;
    }

    describe("change engine version", () => {
        it("opens the version picker for the registered editor", async () => {
            const { rpc, frames, editorId } = await setupWithOpenEditor();

            // Not awaited: the handler awaits the picker reply that never comes here (as
            // in production, `server.ts` fire-and-forgets each line, so a blocked handler
            // never stalls the reader). Awaiting handleLine would deadlock the test.
            void rpc.handleLine(hostNotification("modeler/changeEngineVersion", { editorId }));

            const picker = await waitForFrame(frames, isPickerShow);
            expect(Array.isArray(picker.params.items)).toBe(true);
            expect(picker.params.items.length).toBeGreaterThan(0);
        });

        it("writes the picked version into the open document", async () => {
            const { rpc, frames, editorId } = await setupWithOpenEditor();

            void rpc.handleLine(hostNotification("modeler/changeEngineVersion", { editorId }));
            const picker = await waitForFrame(frames, isPickerShow);
            const pickedIndex = otherVersionIndex(picker);
            const pickedVersion = picker.params.items[pickedIndex].label;
            await rpc.handleLine(hostReply(picker.id, { selected: [pickedIndex] }));

            const write = await waitForFrame(frames, (f) => f.method === "document/write");
            expect(write.params.editorId).toBe(editorId);
            expect(write.params.content).toContain(
                `modeler:executionPlatformVersion="${pickedVersion}"`,
            );

            await rpc.handleLine(hostReply(write.id, { changed: true, accepted: true }));

            const status = await waitForFrame(frames, isStatusSlotUpdate("engineVersion"));
            expect(status.params.view).toMatchObject({ text: `Camunda 7 (${pickedVersion})` });
        });

        it("writes and reports nothing when the user dismisses the version picker", async () => {
            const { rpc, frames, editorId } = await setupWithOpenEditor();

            const command = rpc.handleLine(
                hostNotification("modeler/changeEngineVersion", { editorId }),
            );
            const picker = await waitForFrame(frames, isPickerShow);
            const afterPicker = frames.length;
            await rpc.handleLine(hostReply(picker.id, { selected: null }));
            // A stray document/write never gets its reply here, so it fails as a timeout.
            await command;

            expect(frames.slice(afterPicker)).toEqual([]);
        });

        it("keeps the status bar and the editor on the old version when the host rejects the write", async () => {
            const { rpc, frames, editorId } = await setupWithOpenEditor();

            const command = rpc.handleLine(
                hostNotification("modeler/changeEngineVersion", { editorId }),
            );
            const picker = await waitForFrame(frames, isPickerShow);
            await rpc.handleLine(hostReply(picker.id, { selected: [otherVersionIndex(picker)] }));
            const write = await waitForFrame(frames, (f) => f.method === "document/write");
            const afterWrite = frames.length;
            await rpc.handleLine(hostReply(write.id, { changed: false, accepted: false }));
            await command;

            const afterRejection = frames.slice(afterWrite);
            expect(afterRejection.filter(isShowInfo(VERSION_NOT_CHANGED))).toHaveLength(1);
            expect(afterRejection.filter(isStatusSlotUpdate("engineVersion"))).toEqual([]);
            expect(postedQueries(afterRejection, "BpmnFileQuery")).toEqual([]);

            const beforeReload = frames.length;
            await rpc.handleLine(
                hostNotification("webview/message", {
                    editorId,
                    message: { type: "GetBpmnFileCommand" },
                }),
            );
            const reload = await waitForFrame(
                frames,
                (f) =>
                    f.method === "editor/postMessage" && f.params.message?.type === "BpmnFileQuery",
                { fromIndex: beforeReload },
            );
            expect(reload.params.message.content).toBe(BPMN_C7_XML);
        });
    });

    describe("migrate all", () => {
        it("globs the workspace root and opens the version picker", async () => {
            const { rpc, frames, workspaceRoot } = await setup();

            // No session/register first — migrate must register the root itself, so the
            // fs glob finds the .bpmn written under it. Not awaited (see above).
            void rpc.handleLine(hostNotification("migration/migrateAll", { workspaceRoot }));

            const picker = await waitForFrame(frames, isPickerShow);
            expect(Array.isArray(picker.params.items)).toBe(true);
            expect(picker.params.items.length).toBeGreaterThan(0);
        });

        it("rewrites closed diagrams on disk, then stops scanning the migrated root", async () => {
            const { rpc, frames, workspaceRoot, sourcePath, tmp } = await setup();

            const migration = rpc.handleLine(
                hostNotification("migration/migrateAll", { workspaceRoot }),
            );
            const picker = await waitForFrame(frames, isPickerShow);
            const pickedIndex = otherVersionIndex(picker);
            const pickedVersion = picker.params.items[pickedIndex].label;
            await rpc.handleLine(hostReply(picker.id, { selected: [pickedIndex] }));
            await migration;

            expect(
                frames.some(isShowInfo(`Updated 1 diagram(s) to Camunda 7 (${pickedVersion}).`)),
            ).toBe(true);
            expect(await fs.readFile(sourcePath, "utf8")).toContain(
                `modeler:executionPlatformVersion="${pickedVersion}"`,
            );

            // A leaked root would still be globbed and surface its diagram again.
            const emptyRoot = join(tmp, "empty");
            await fs.mkdir(emptyRoot);
            void rpc.handleLine(
                hostNotification("migration/migrateAll", { workspaceRoot: emptyRoot }),
            );

            await waitForFrame(frames, isShowInfo("No BPMN files found in the workspace."));
            expect(frames.filter(isPickerShow)).toHaveLength(1);
        });

        it("migrates an open diagram from its unsaved editor content, not from disk", async () => {
            const { rpc, frames, editorId, workspaceRoot, sourcePath } = await setup();
            const unsavedXml = BPMN_C7_XML.replace(
                "</bpmn:definitions>",
                `  <bpmn:process id="Unsaved_Edit" />\n</bpmn:definitions>`,
            );
            await rpc.handleLine(
                hostNotification(
                    "session/register",
                    registerParams(editorId, workspaceRoot, sourcePath, unsavedXml),
                ),
            );

            const migration = rpc.handleLine(
                hostNotification("migration/migrateAll", { workspaceRoot }),
            );
            const picker = await waitForFrame(frames, isPickerShow);
            const pickedIndex = otherVersionIndex(picker);
            const pickedVersion = picker.params.items[pickedIndex].label;
            await rpc.handleLine(hostReply(picker.id, { selected: [pickedIndex] }));

            const write = await waitForFrame(frames, (f) => f.method === "document/write");
            expect(write.params.editorId).toBe(editorId);
            expect(write.params.content).toContain('id="Unsaved_Edit"');
            expect(write.params.content).toContain(
                `modeler:executionPlatformVersion="${pickedVersion}"`,
            );

            await rpc.handleLine(hostReply(write.id, { changed: true, accepted: true }));
            await migration;

            expect(await fs.readFile(sourcePath, "utf8")).toBe(BPMN_C7_XML);
        });

        it("shows the migrated content in the open diagram at the host's revision once the host accepts the write", async () => {
            const { rpc, frames, editorId, workspaceRoot, sourcePath } = await setup();
            const hostRevision = 3;
            await rpc.handleLine(
                hostNotification(
                    "session/register",
                    registerParams(editorId, workspaceRoot, sourcePath, BPMN_C7_XML, {
                        sessionId: 1,
                        documentRevision: hostRevision,
                    }),
                ),
            );

            const migration = rpc.handleLine(
                hostNotification("migration/migrateAll", { workspaceRoot }),
            );
            const picker = await waitForFrame(frames, isPickerShow);
            const pickedIndex = otherVersionIndex(picker);
            const pickedVersion = picker.params.items[pickedIndex].label;
            await rpc.handleLine(hostReply(picker.id, { selected: [pickedIndex] }));
            const write = await waitForFrame(frames, (f) => f.method === "document/write");
            const afterWrite = frames.length;
            await rpc.handleLine(hostReply(write.id, { changed: true, accepted: true }));
            await migration;
            await settle();

            const renders = postedQueries(frames.slice(afterWrite), "BpmnFileQuery");
            expect(renders).toHaveLength(1);
            expect(renders[0].params.message).toMatchObject({
                content: write.params.content,
                documentRevision: hostRevision,
            });
            expect(write.params.content).toContain(
                `modeler:executionPlatformVersion="${pickedVersion}"`,
            );
        });

        it("writes and reports nothing when the user dismisses the version picker", async () => {
            const { rpc, frames, workspaceRoot, sourcePath } = await setup();

            const migration = rpc.handleLine(
                hostNotification("migration/migrateAll", { workspaceRoot }),
            );
            const picker = await waitForFrame(frames, isPickerShow);
            const afterPicker = frames.length;
            await rpc.handleLine(hostReply(picker.id, { selected: null }));
            await migration;

            expect(frames.slice(afterPicker)).toEqual([]);
            expect(await fs.readFile(sourcePath, "utf8")).toBe(BPMN_C7_XML);
        });

        it("counts an open diagram whose editor rejects the update as skipped and leaves its file alone", async () => {
            const { rpc, frames, workspaceRoot, sourcePath } = await setupWithOpenEditor();

            const migration = rpc.handleLine(
                hostNotification("migration/migrateAll", { workspaceRoot }),
            );
            const picker = await waitForFrame(frames, isPickerShow);
            await rpc.handleLine(hostReply(picker.id, { selected: [otherVersionIndex(picker)] }));
            const write = await waitForFrame(frames, (f) => f.method === "document/write");
            const afterWrite = frames.length;
            await rpc.handleLine(hostReply(write.id, { changed: false, accepted: false }));
            await migration;

            expect(postedQueries(frames.slice(afterWrite), "BpmnFileQuery")).toEqual([]);
            expect(frames).toContainEqual({
                method: "notifier/log",
                params: {
                    level: "warn",
                    message: `Skipped a diagram whose editor rejected the update: ${sourcePath}`,
                },
            });
            expect(
                frames.some(
                    isShowInfo(
                        "No diagrams were updated. Skipped 1 diagram(s); see the log for details.",
                    ),
                ),
            ).toBe(true);
            expect(await fs.readFile(sourcePath, "utf8")).toBe(BPMN_C7_XML);
        });
    });

    describe("format and clean up", () => {
        it("asks the focused editor to format", async () => {
            const { rpc, frames, editorId } = await setupWithOpenEditor();

            await rpc.handleLine(hostNotification("layout/format", {}));

            const formatQueries = postedQueries(frames, "FormatDiagramQuery");
            expect(formatQueries.map((f) => f.params.editorId)).toEqual([editorId]);
        });

        it("formats the tab the host registered last, as it opened that tab", async () => {
            const { rpc, frames, workspaceRoot } = await setupWithOpenEditor();
            const openedPath = join(workspaceRoot, "opened.bpmn");
            await fs.writeFile(openedPath, BPMN_C7_XML, "utf8");
            const openedId = `file://${openedPath}`;
            await rpc.handleLine(
                hostNotification(
                    "session/register",
                    registerParams(openedId, workspaceRoot, openedPath, BPMN_C7_XML),
                ),
            );

            await rpc.handleLine(hostNotification("layout/format", {}));

            const formatQueries = postedQueries(frames, "FormatDiagramQuery");
            expect(formatQueries.map((f) => f.params.editorId)).toEqual([openedId]);
        });

        it("reports the webview's format outcome to the user", async () => {
            const { rpc, frames, editorId } = await setupWithOpenEditor();

            await rpc.handleLine(
                hostNotification("webview/message", {
                    editorId,
                    message: {
                        type: "DiagramFormattedCommand",
                        status: "unchanged",
                        diagnostics: [],
                    },
                }),
            );

            await waitForFrame(frames, isShowInfo("The diagram is already formatted."));
        });

        const shapeIds = (count: number) =>
            Array.from({ length: count }, (_, i) => `Shape_${i + 1}`);

        async function reportLeftovers(
            rpc: Rpc,
            editorId: string,
            ids = ["Shape_1"],
        ): Promise<void> {
            await rpc.handleLine(
                hostNotification("webview/message", {
                    editorId,
                    message: {
                        type: "CleanupReportCommand",
                        outcome: {
                            status: "reported",
                            items: ids.map((id) => ({ kind: "orphan-di", id, label: id })),
                        },
                        applied: false,
                    },
                }),
            );
        }

        it("asks for a cleanup report, then applies it once the user confirms", async () => {
            const { rpc, frames, editorId } = await setupWithOpenEditor();

            await rpc.handleLine(hostNotification("layout/cleanup", {}));
            const inspections = postedQueries(frames, "CleanupDiagramQuery");
            expect(inspections.map((f) => f.params.editorId)).toEqual([editorId]);
            expect(inspections[0].params.message.apply).toBe(false);

            await reportLeftovers(rpc, editorId);
            const confirm = await waitForFrame(frames, isConfirmRequest);
            expect(confirm.params.details).toEqual(["Shape_1"]);
            await rpc.handleLine(hostReply(confirm.id, { confirmed: true }));

            await waitForFrame(
                frames,
                (f) =>
                    f.method === "editor/postMessage" &&
                    f.params.message?.type === "CleanupDiagramQuery" &&
                    f.params.message.apply === true,
            );
        });

        it("sends the host a cleanup list that says how many more items go", async () => {
            const { rpc, frames, editorId } = await setupWithOpenEditor();

            await reportLeftovers(rpc, editorId, shapeIds(14));
            const confirm = await waitForFrame(frames, isConfirmRequest);

            expect(confirm.params.details).toEqual([...shapeIds(12), "…and 2 more"]);
        });

        it("removes nothing when the user declines the cleanup", async () => {
            const { rpc, frames, editorId } = await setupWithOpenEditor();

            await reportLeftovers(rpc, editorId);
            const confirm = await waitForFrame(frames, isConfirmRequest);
            await rpc.handleLine(hostReply(confirm.id, { confirmed: false }));
            await settle();

            expect(postedQueries(frames, "CleanupDiagramQuery")).toHaveLength(0);
        });

        it("asks the user to focus a diagram when no editor is open", async () => {
            const { rpc, frames } = await setup();

            await rpc.handleLine(hostNotification("layout/format", {}));

            expect(frames).toContainEqual({
                method: "notifier/log",
                params: {
                    level: "error",
                    message: expect.stringMatching(/^Error: No active editor\.\n\s+at /),
                },
            });
            expect(frames.some(isShowInfo(FOCUS_BPMN_DIAGRAM_MESSAGE))).toBe(true);
            expect(frames.some((f) => f.method === "editor/postMessage")).toBe(false);
        });
    });
});
