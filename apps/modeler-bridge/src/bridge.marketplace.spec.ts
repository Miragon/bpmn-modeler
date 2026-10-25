/**
 * End-to-end coverage for the template-marketplace RPC paths on the bridge.
 *
 * Same harness as `bridge.codeLink.spec.ts`: the real bridge (`createBridge`)
 * runs against a fake transport (a frames array) over a real temp filesystem, so
 * the `TemplateMarketplaceService` + `MarketplaceCache` + `LocalFileSource` it
 * constructs do genuine fs reads/writes. A local-folder marketplace is the one
 * source needing no network, so the happy path is fully deterministic here; the
 * token round-trip stays covered by the core's `TemplateMarketplaceService.spec.ts`.
 *
 * Covered: `marketplace/add` requesting `marketplaceState/save`, then (once acked)
 * refreshing the open editor with the freshly cached template and toasting
 * success; the missing-manifest failure path toasting an error and NOT persisting;
 * and `marketplace/update` folding a piggybacked marketplace list into a summary.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
    hostErrorReply,
    hostNotification,
    hostReply,
    registerParams,
    settle,
    waitForFrame,
} from "./__fixtures__/bridgeHarness";
import { createBridge } from "./bridge";
import { Rpc } from "./rpc";

const BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

const TEMPLATE_NAME = "Marketplace Template";
const TEMPLATE_JSON = JSON.stringify({
    name: TEMPLATE_NAME,
    id: "io.miragon.marketplace.tmpl",
    appliesTo: ["bpmn:Task"],
    properties: [],
});

const isSaveRequest = (f: any) => f.method === "marketplaceState/save" && f.id != null;
const isShowInfo = (message: string) => (f: any) =>
    f.method === "notifier/showInfo" && f.params.message === message;

const isTemplatesQuery = (name: string) => (f: any) =>
    f.method === "editor/postMessage" &&
    f.params.message?.type === "ElementTemplatesQuery" &&
    (f.params.message.elementTemplates ?? []).some((t: any) => t?.name === name);

describe("bridge template marketplace (real core + cache over a fake transport)", () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
        for (const cleanup of cleanups.splice(0)) {
            await cleanup();
        }
    });

    /**
     * Sets up a registered BPMN editor plus a distinct cache root. The marketplace
     * folder is created per-test so the missing-manifest case can omit it.
     */
    async function setup(): Promise<{
        rpc: Rpc;
        frames: any[];
        editorId: string;
        cacheRoot: string;
        tmp: string;
    }> {
        const tmp = await fs.mkdtemp(join(tmpdir(), "modeler-bridge-mkt-"));
        const workspaceRoot = join(tmp, "workspace");
        const cacheRoot = join(tmp, "cache");
        await fs.mkdir(workspaceRoot, { recursive: true });
        const sourcePath = join(workspaceRoot, "process.bpmn");
        await fs.writeFile(sourcePath, BPMN_XML, "utf8");

        const frames: any[] = [];
        const { rpc } = createBridge(
            (line) => frames.push(JSON.parse(line)),
            () => {},
            {
                marketplaceCacheRoot: cacheRoot,
                homeDir: tmp,
            },
        );
        const editorId = `file://${sourcePath}`;
        await rpc.handleLine(
            hostNotification(
                "session/register",
                registerParams(editorId, workspaceRoot, sourcePath, BPMN_XML),
            ),
        );
        // A marketplace change refreshes only editors whose modeler asked for templates.
        await rpc.handleLine(
            hostNotification("webview/message", {
                editorId,
                message: { type: "GetElementTemplatesCommand" },
            }),
        );
        await waitForFrame(
            frames,
            (f) =>
                f.method === "editor/postMessage" &&
                f.params.message?.type === "ElementTemplatesQuery",
        );

        cleanups.push(() => fs.rm(tmp, { recursive: true, force: true }));
        return { rpc, frames, editorId, cacheRoot, tmp };
    }

    /** Writes a valid local-folder marketplace with one element template. */
    async function writeLocalMarketplace(tmp: string): Promise<string> {
        const folder = join(tmp, "marketplace");
        await fs.mkdir(join(folder, "element-templates"), { recursive: true });
        await fs.writeFile(
            join(folder, "marketplace.json"),
            JSON.stringify({ sources: [{ path: "element-templates" }] }),
            "utf8",
        );
        await fs.writeFile(
            join(folder, "element-templates", "template.json"),
            TEMPLATE_JSON,
            "utf8",
        );
        return folder;
    }

    it("adds a local marketplace: persists, then refreshes the editor with the cached template", async () => {
        const { rpc, frames, tmp, cacheRoot } = await setup();
        const folder = await writeLocalMarketplace(tmp);

        await rpc.handleLine(
            hostNotification("marketplace/add", { location: folder, settings: {} }),
        );

        // The persist is an acknowledged request: it must surface as a frame with
        // both a method and an id, carrying the added location.
        const save = await waitForFrame(frames, isSaveRequest);
        expect(save.params.location).toBe(folder);
        // An add that carried no scope must not invent one — the host defaults it.
        expect(save.params.scope).toBeUndefined();

        // Ack it so the flow proceeds to the refresh + success toast.
        await rpc.handleLine(hostReply(save.id, null));

        // The refresh re-pushes templates; the cached marketplace template must be
        // present in the merged set the editor receives.
        await waitForFrame(frames, isTemplatesQuery(TEMPLATE_NAME));
        await waitForFrame(frames, isShowInfo("Marketplace added."));

        // The template actually landed on disk under the injected cache root.
        const marketplaceDirs = await fs.readdir(cacheRoot);
        expect(marketplaceDirs.length).toBe(1);
    });

    it("echoes the add's scope back on the persist request", async () => {
        const { rpc, frames, tmp } = await setup();
        const folder = await writeLocalMarketplace(tmp);

        await rpc.handleLine(
            hostNotification("marketplace/add", {
                location: folder,
                settings: {},
                scope: "application",
            }),
        );

        // The bridge treats scope as opaque: whatever the add carried must ride the
        // round trip back to the host, which alone knows what it means.
        const save = await waitForFrame(frames, isSaveRequest);
        expect(save.params.scope).toBe("application");
    });

    it("does not persist when the marketplace.json is missing", async () => {
        const { rpc, frames, tmp } = await setup();
        // A folder with no marketplace.json — the fetch throws before any persist.
        const folder = join(tmp, "empty");
        await fs.mkdir(folder, { recursive: true });

        await rpc.handleLine(
            hostNotification("marketplace/add", { location: folder, settings: {} }),
        );

        await waitForFrame(frames, (f) => f.method === "notifier/notifyError");
        await settle();
        expect(frames.find((f) => f.method === "marketplaceState/save")).toBeUndefined();
        expect(frames.find((f) => f.method === "notifier/showInfo")).toBeUndefined();
    });

    it("updates from the piggybacked marketplace list and reports a summary", async () => {
        const { rpc, frames, tmp } = await setup();
        const folder = await writeLocalMarketplace(tmp);

        await rpc.handleLine(
            hostNotification("marketplace/update", { settings: { marketplaces: [folder] } }),
        );

        await waitForFrame(frames, isShowInfo("Updated 1 marketplace(s)."));
        // Update never persists — the list already lives in settings.
        expect(frames.find((f) => f.method === "marketplaceState/save")).toBeUndefined();
        // The cached template reached the open editor.
        await waitForFrame(frames, isTemplatesQuery(TEMPLATE_NAME));
    });

    it("removes a marketplace: prunes its cache slot without re-fetching and reports the selection count", async () => {
        const { rpc, frames, tmp, cacheRoot } = await setup();
        const folder = await writeLocalMarketplace(tmp);

        // Cache the marketplace first, then confirm its slot is on disk.
        await rpc.handleLine(
            hostNotification("marketplace/update", { settings: { marketplaces: [folder] } }),
        );
        await waitForFrame(frames, isTemplatesQuery(TEMPLATE_NAME));
        expect((await fs.readdir(cacheRoot)).length).toBe(1);

        // Remove it: the host already dropped it from settings, so the post-removal
        // snapshot is empty and the prune sweeps the orphaned slot.
        await rpc.handleLine(
            hostNotification("marketplace/remove", {
                settings: { marketplaces: [] },
                removedCount: 1,
            }),
        );

        await waitForFrame(frames, isShowInfo("Removed 1 marketplace(s)."));
        // Remove never persists — the host already unregistered the entries.
        expect(frames.find((f) => f.method === "marketplaceState/save")).toBeUndefined();
        // The orphaned cache slot is gone.
        expect((await fs.readdir(cacheRoot)).length).toBe(0);
    });

    it("expands a leading ~ against the home dir before fetching and persisting", async () => {
        const { rpc, frames, tmp } = await setup();
        const folder = await writeLocalMarketplace(tmp);

        await rpc.handleLine(
            hostNotification("marketplace/add", { location: "  ~/marketplace  ", settings: {} }),
        );

        const save = await waitForFrame(frames, isSaveRequest);
        expect(save.params.location).toBe(folder);
    });

    it("still refreshes editors and confirms the add when persisting it fails", async () => {
        const { rpc, frames, tmp } = await setup();
        const folder = await writeLocalMarketplace(tmp);

        await rpc.handleLine(
            hostNotification("marketplace/add", { location: folder, settings: {} }),
        );
        const save = await waitForFrame(frames, isSaveRequest);
        await rpc.handleLine(hostErrorReply(save.id, "disk full"));

        await waitForFrame(frames, isShowInfo("Marketplace added."));
        expect(frames).toContainEqual({
            method: "notifier/log",
            params: {
                level: "error",
                message: "Failed to persist marketplace registration: disk full",
            },
        });
        expect(frames.some(isTemplatesQuery(TEMPLATE_NAME))).toBe(true);
    });

    it("says so when no marketplace is configured to update", async () => {
        const { rpc, frames } = await setup();

        await rpc.handleLine(
            hostNotification("marketplace/update", { settings: { marketplaces: [] } }),
        );

        await waitForFrame(frames, isShowInfo("No marketplaces configured to update."));
    });

    it("names every marketplace that failed to update", async () => {
        const { rpc, frames, tmp } = await setup();
        const folder = await writeLocalMarketplace(tmp);
        const missingFolder = join(tmp, "missing");

        await rpc.handleLine(
            hostNotification("marketplace/update", {
                settings: { marketplaces: [folder, missingFolder] },
            }),
        );

        const error = await waitForFrame(frames, (f) => f.method === "notifier/showError");
        const [summary, ...failedLines] = error.params.message.split("\n");
        expect(summary).toBe("Updated 1 of 2 marketplaces. Failed:");
        expect(failedLines).toHaveLength(1);
        expect(failedLines[0]).toContain(missingFolder);
    });
});
