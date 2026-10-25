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

import {
    hostNotification,
    hostReply,
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

            const status = await waitForFrame(
                frames,
                (f) => f.method === "statusBar/showEngineVersion",
            );
            expect(status.params).toEqual({ platform: "c7", version: pickedVersion });
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
    });

    describe("format and clean up", () => {
        it("asks the focused editor to format", async () => {
            const { rpc, frames, editorId } = await setupWithOpenEditor();

            await rpc.handleLine(hostNotification("layout/format", {}));

            const formatQueries = postedQueries(frames, "FormatDiagramQuery");
            expect(formatQueries.map((f) => f.params.editorId)).toEqual([editorId]);
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

        async function reportLeftovers(rpc: Rpc, editorId: string): Promise<void> {
            await rpc.handleLine(
                hostNotification("webview/message", {
                    editorId,
                    message: {
                        type: "CleanupReportCommand",
                        outcome: {
                            status: "reported",
                            items: [{ kind: "orphan-di", id: "Shape_1", label: "Shape_1" }],
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
                params: { level: "error", message: "No active editor." },
            });
            expect(
                frames.some(isShowInfo("Focus a BPMN diagram tab, then run the command again.")),
            ).toBe(true);
            expect(frames.some((f) => f.method === "editor/postMessage")).toBe(false);
        });
    });
});
