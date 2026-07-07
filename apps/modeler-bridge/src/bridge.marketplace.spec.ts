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

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Polls for a frame matching `predicate`, or rejects after `timeoutMs`. */
async function waitForFrame(
    frames: any[],
    predicate: (frame: any) => boolean,
    timeoutMs = 2000,
): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const match = frames.find(predicate);
        if (match) return match;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("waitForFrame timed out");
}

function registerParams(editorId: string, root: string, fsPath: string, content: string) {
    return {
        editorId,
        uriString: editorId,
        path: editorId.replace(/^file:\/\//, ""),
        fsPath,
        scheme: "file",
        workspaceRoot: root,
        content,
        settings: {},
    };
}

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
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, workspaceRoot, sourcePath, BPMN_XML),
            }),
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
            JSON.stringify({
                method: "marketplace/add",
                params: { location: folder, settings: {} },
            }),
        );

        // The persist is an acknowledged request: it must surface as a frame with
        // both a method and an id, carrying the added location.
        const save = await waitForFrame(
            frames,
            (f) => f.method === "marketplaceState/save" && f.id != null,
        );
        expect(save.params.location).toBe(folder);
        // An add that carried no scope must not invent one — the host defaults it.
        expect(save.params.scope).toBeUndefined();

        // Ack it so the flow proceeds to the refresh + success toast.
        await rpc.handleLine(JSON.stringify({ id: save.id, result: null }));

        // The refresh re-pushes templates; the cached marketplace template must be
        // present in the merged set the editor receives.
        await waitForFrame(frames, isTemplatesQuery(TEMPLATE_NAME));
        await waitForFrame(
            frames,
            (f) => f.method === "notifier/showInfo" && f.params.message === "Marketplace added.",
        );

        // The template actually landed on disk under the injected cache root.
        const marketplaceDirs = await fs.readdir(cacheRoot);
        expect(marketplaceDirs.length).toBe(1);
    });

    it("echoes the add's scope back on the persist request", async () => {
        const { rpc, frames, tmp } = await setup();
        const folder = await writeLocalMarketplace(tmp);

        await rpc.handleLine(
            JSON.stringify({
                method: "marketplace/add",
                params: { location: folder, settings: {}, scope: "application" },
            }),
        );

        // The bridge treats scope as opaque: whatever the add carried must ride the
        // round trip back to the host, which alone knows what it means.
        const save = await waitForFrame(
            frames,
            (f) => f.method === "marketplaceState/save" && f.id != null,
        );
        expect(save.params.scope).toBe("application");
    });

    it("does not persist when the marketplace.json is missing", async () => {
        const { rpc, frames, tmp } = await setup();
        // A folder with no marketplace.json — the fetch throws before any persist.
        const folder = join(tmp, "empty");
        await fs.mkdir(folder, { recursive: true });

        await rpc.handleLine(
            JSON.stringify({
                method: "marketplace/add",
                params: { location: folder, settings: {} },
            }),
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
            JSON.stringify({
                method: "marketplace/update",
                params: { settings: { marketplaces: [folder] } },
            }),
        );

        await waitForFrame(
            frames,
            (f) =>
                f.method === "notifier/showInfo" &&
                f.params.message === "Updated 1 marketplace(s).",
        );
        // Update never persists — the list already lives in settings.
        expect(frames.find((f) => f.method === "marketplaceState/save")).toBeUndefined();
        // The cached template reached the open editor.
        await waitForFrame(frames, isTemplatesQuery(TEMPLATE_NAME));
    });
});
